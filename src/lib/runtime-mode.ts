/**
 * The mock/live switch, scoped to whatever is currently running.
 *
 * Providers need to know the mode, but threading a flag through every call
 * signature would touch a hundred lines and be forgotten in one of them. An
 * AsyncLocalStorage keeps it implicit but reliable: whatever `withMode()`
 * wraps — including everything it awaits — sees that mode, and concurrent
 * requests in different modes never bleed into each other.
 */
import { AsyncLocalStorage } from "node:async_hooks";
import { env } from "./env";
import type { RunMode } from "./auth/types";

const storage = new AsyncLocalStorage<RunMode>();

export function withMode<T>(mode: RunMode, fn: () => Promise<T>): Promise<T> {
  return storage.run(mode, fn);
}

/**
 * The mode in force right now. Falls back to the DMI_FORCE_MOCK environment
 * variable so CLI scripts and tests behave, then to live.
 */
export function currentMode(): RunMode {
  return storage.getStore() ?? (env.forceMock ? "mock" : "live");
}

export function isMock(): boolean {
  return currentMode() === "mock";
}

export type { RunMode };
