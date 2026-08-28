type Level = "debug" | "info" | "warn" | "error";

const order: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };
const threshold = order[(process.env.DMI_LOG_LEVEL as Level) ?? "info"] ?? 20;

function emit(level: Level, msg: string, meta?: Record<string, unknown>) {
  if (order[level] < threshold) return;
  const line = { t: new Date().toISOString(), level, msg, ...meta };
  const out = level === "error" || level === "warn" ? console.error : console.log;
  out(JSON.stringify(line));
}

export const log = {
  debug: (m: string, meta?: Record<string, unknown>) => emit("debug", m, meta),
  info: (m: string, meta?: Record<string, unknown>) => emit("info", m, meta),
  warn: (m: string, meta?: Record<string, unknown>) => emit("warn", m, meta),
  error: (m: string, meta?: Record<string, unknown>) => emit("error", m, meta),
};
