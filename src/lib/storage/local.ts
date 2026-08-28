/**
 * File-backed store used whenever Supabase credentials are absent.
 *
 * It exists so the whole pipeline — including tracking rows and budget cards —
 * can be demonstrated end to end on a laptop with no accounts at all. The
 * table shapes mirror supabase/schema.sql exactly.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { env } from "@/lib/env";
import type {
  AdsBudgetCard,
  DmiRun,
  Prospect,
  ReviewItem,
  TrackingRow,
} from "@/lib/types";
import type { Store } from "./types";

type Tables = {
  prospects: Prospect[];
  runs: DmiRun[];
  review_items: ReviewItem[];
  tracking_rows: TrackingRow[];
  budget_cards: AdsBudgetCard[];
};

const EMPTY: Tables = {
  prospects: [],
  runs: [],
  review_items: [],
  tracking_rows: [],
  budget_cards: [],
};

/** Serialises writes so concurrent API requests cannot clobber each other. */
let chain: Promise<unknown> = Promise.resolve();
function serial<T>(fn: () => Promise<T>): Promise<T> {
  const next = chain.then(fn, fn);
  chain = next.catch(() => undefined);
  return next;
}

export class LocalStore implements Store {
  driver = "local" as const;
  private file = path.resolve(process.cwd(), env.dataDir, "dmi.json");

  private async read(): Promise<Tables> {
    try {
      const raw = await fs.readFile(this.file, "utf8");
      return { ...EMPTY, ...(JSON.parse(raw) as Partial<Tables>) };
    } catch {
      return structuredClone(EMPTY);
    }
  }

  private async write(t: Tables): Promise<void> {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(t, null, 2));
    await fs.rename(tmp, this.file);
  }

  private mutate<T>(fn: (t: Tables) => T | Promise<T>): Promise<T> {
    return serial(async () => {
      const t = await this.read();
      const result = await fn(t);
      await this.write(t);
      return result;
    });
  }

  async upsertProspect(p: Prospect) {
    return this.mutate((t) => {
      const i = t.prospects.findIndex((x) => x.id === p.id);
      if (i >= 0) t.prospects[i] = p;
      else t.prospects.push(p);
      return p;
    });
  }
  async getProspect(id: string) {
    return (await this.read()).prospects.find((p) => p.id === id) ?? null;
  }
  async findProspectByEmail(email: string) {
    const e = email.toLowerCase();
    return (
      (await this.read()).prospects.find((p) => p.email?.toLowerCase() === e) ??
      null
    );
  }

  async createRun(run: DmiRun) {
    return this.mutate((t) => {
      t.runs.push(run);
      return run;
    });
  }
  async saveRun(run: DmiRun) {
    return this.mutate((t) => {
      const i = t.runs.findIndex((r) => r.id === run.id);
      run.updatedAt = new Date().toISOString();
      if (i >= 0) t.runs[i] = run;
      else t.runs.push(run);
      return run;
    });
  }
  async getRun(id: string) {
    return (await this.read()).runs.find((r) => r.id === id) ?? null;
  }
  async findRunByIdempotencyKey(key: string) {
    return (
      (await this.read()).runs.find((r) => r.idempotencyKey === key) ?? null
    );
  }
  async listRuns(limit = 100) {
    const runs = (await this.read()).runs.slice();
    runs.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return runs.slice(0, limit);
  }
  async claimableRuns(staleMs: number) {
    const cutoff = Date.now() - staleMs;
    return (await this.read()).runs.filter(
      (r) =>
        r.state === "queued" ||
        (r.state === "running" && Date.parse(r.updatedAt) < cutoff) ||
        (r.state === "failed" &&
          r.errors.filter((e) => e.fatal).length < 3 &&
          Date.parse(r.updatedAt) < cutoff),
    );
  }

  async addReviewItems(items: ReviewItem[]) {
    if (items.length === 0) return;
    await this.mutate((t) => {
      for (const item of items) {
        const i = t.review_items.findIndex((x) => x.id === item.id);
        // Never clobber a resolution a human already recorded.
        if (i >= 0) {
          if (t.review_items[i].status === "open") t.review_items[i] = item;
        } else t.review_items.push(item);
      }
    });
  }
  async listReviewItems(filter?: { runId?: string; status?: string }) {
    let items = (await this.read()).review_items;
    if (filter?.runId) items = items.filter((i) => i.runId === filter.runId);
    if (filter?.status) items = items.filter((i) => i.status === filter.status);
    return items;
  }
  async updateReviewItem(id: string, patch: Partial<ReviewItem>) {
    return this.mutate((t) => {
      const i = t.review_items.findIndex((x) => x.id === id);
      if (i < 0) return null;
      t.review_items[i] = { ...t.review_items[i], ...patch };
      return t.review_items[i];
    });
  }

  async upsertTrackingRow(row: TrackingRow) {
    return this.mutate((t) => {
      const i = t.tracking_rows.findIndex((r) => r.runId === row.runId);
      if (i >= 0) t.tracking_rows[i] = { ...t.tracking_rows[i], ...row };
      else t.tracking_rows.push(row);
      return row;
    });
  }
  async getTrackingRowByRun(runId: string) {
    return (
      (await this.read()).tracking_rows.find((r) => r.runId === runId) ?? null
    );
  }
  async listTrackingRows() {
    return (await this.read()).tracking_rows;
  }

  async upsertBudgetCard(card: AdsBudgetCard) {
    return this.mutate((t) => {
      const i = t.budget_cards.findIndex((c) => c.runId === card.runId);
      if (i >= 0) t.budget_cards[i] = card;
      else t.budget_cards.push(card);
      return card;
    });
  }
  async getBudgetCardByRun(runId: string) {
    return (
      (await this.read()).budget_cards.find((c) => c.runId === runId) ?? null
    );
  }
}
