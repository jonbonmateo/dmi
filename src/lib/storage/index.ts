import { env } from "@/lib/env";
import { LocalStore } from "./local";
import type { Store } from "./types";

let cached: Store | null = null;

/** Supabase when credentials exist, otherwise the file-backed store. */
export function getStore(): Store {
  if (cached) return cached;
  if (env.storageDriver === "supabase") {
    // Required lazily so the Supabase client is never loaded in local mode.
    const { SupabaseStore } = require("./supabase") as typeof import("./supabase");
    cached = new SupabaseStore();
  } else {
    cached = new LocalStore();
  }
  return cached;
}

export type { Store };
