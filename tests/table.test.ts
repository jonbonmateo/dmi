/** Sorting and filtering behaviour for every table in the app. */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  compareValues,
  facetOptions,
  matchesFacets,
  matchesQuery,
  nextSort,
  sortRows,
} from "../src/lib/table";

interface Row {
  shop: string;
  score: number | null;
  band: string | null;
  date: string;
}

const ROWS: Row[] = [
  { shop: "Shop 10", score: 16, band: "green", date: "2026-08-28" },
  { shop: "Shop 2", score: 3, band: "red", date: "2026-08-30" },
  { shop: "Álvarez Auto", score: null, band: null, date: "2026-08-29" },
  { shop: "shop 1", score: 11, band: "yellow", date: "2026-08-27" },
];
const get = (r: Row, k: string) => (r as unknown as Record<string, string | number | null>)[k];

test("numbers sort numerically, not as text", () => {
  const asc = sortRows(ROWS, { key: "score", direction: "asc" }, get).map((r) => r.score);
  assert.deepEqual(asc, [3, 11, 16, null]);
});

test("empty values sort last in both directions", () => {
  const asc = sortRows(ROWS, { key: "score", direction: "asc" }, get).map((r) => r.score);
  const desc = sortRows(ROWS, { key: "score", direction: "desc" }, get).map((r) => r.score);
  assert.equal(asc.at(-1), null, "an absent score is not 'smallest' — it is absent");
  assert.equal(desc.at(-1), null);
});

test("text sorts naturally and case-insensitively", () => {
  const asc = sortRows(ROWS, { key: "shop", direction: "asc" }, get).map((r) => r.shop);
  // "Shop 2" must come before "Shop 10", and case must not split the group.
  assert.deepEqual(asc, ["Álvarez Auto", "shop 1", "Shop 2", "Shop 10"]);
});

test("ISO dates sort correctly as strings", () => {
  const desc = sortRows(ROWS, { key: "date", direction: "desc" }, get).map((r) => r.date);
  assert.deepEqual(desc, ["2026-08-30", "2026-08-29", "2026-08-28", "2026-08-27"]);
});

test("sorting does not mutate the caller's array", () => {
  const before = ROWS.map((r) => r.shop);
  sortRows(ROWS, { key: "shop", direction: "asc" }, get);
  assert.deepEqual(ROWS.map((r) => r.shop), before);
});

test("no sort state leaves the order untouched", () => {
  assert.deepEqual(sortRows(ROWS, null, get), ROWS);
});

test("clicking a column cycles asc → desc → off", () => {
  const a = nextSort(null, "score");
  assert.deepEqual(a, { key: "score", direction: "asc" });
  const b = nextSort(a, "score");
  assert.deepEqual(b, { key: "score", direction: "desc" });
  assert.equal(nextSort(b, "score"), null, "a third click clears the sort");
  assert.deepEqual(nextSort(b, "shop"), { key: "shop", direction: "asc" }, "a different column starts fresh");
});

test("compareValues handles mixed emptiness", () => {
  assert.equal(compareValues(null, null, "asc"), 0);
  assert.equal(compareValues("", 5, "asc"), 1);
  assert.equal(compareValues(5, undefined, "asc"), -1);
});

test("search requires every term to match somewhere", () => {
  assert.equal(matchesQuery(["Miller's Garage", "yellow"], "miller"), true);
  assert.equal(matchesQuery(["Miller's Garage", "yellow"], "miller yellow"), true);
  assert.equal(matchesQuery(["Miller's Garage", "yellow"], "miller green"), false, "terms narrow, they do not widen");
  assert.equal(matchesQuery(["Miller's Garage"], "   "), true, "an empty query matches everything");
  assert.equal(matchesQuery([null, undefined, "ok"], "ok"), true);
});

test("facets filter exactly, and 'all' is a no-op", () => {
  const row = ROWS[0];
  assert.equal(matchesFacets(row, { band: "green" }, get), true);
  assert.equal(matchesFacets(row, { band: "red" }, get), false);
  assert.equal(matchesFacets(row, { band: "all" }, get), true);
  assert.equal(matchesFacets(row, {}, get), true);
  assert.equal(
    matchesFacets(ROWS[2], { band: "green" }, get),
    false,
    "a row with no value never matches a specific facet",
  );
});

test("facet options are distinct, sorted and skip empties", () => {
  assert.deepEqual(facetOptions(ROWS, "band", get), ["green", "red", "yellow"]);
});
