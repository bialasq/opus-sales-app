type LogLevel = "debug" | "info" | "warn" | "error";

function emit(level: LogLevel, module: string, message: string, detail?: unknown): void {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    level,
    module,
    message,
    ...(detail !== undefined ? { detail: serializeDetail(detail) } : {}),
  });
  if (level === "error") {
    process.stderr.write(`${line}\n`);
  } else {
    process.stdout.write(`${line}\n`);
  }
}

function serializeDetail(detail: unknown): unknown {
  if (detail instanceof Error) {
    return { name: detail.name, message: detail.message, stack: detail.stack };
  }
  return detail;
}

export function createLogger(module: string) {
  return {
    debug: (message: string, detail?: unknown) => emit("debug", module, message, detail),
    info: (message: string, detail?: unknown) => emit("info", module, message, detail),
    warn: (message: string, detail?: unknown) => emit("warn", module, message, detail),
    error: (message: string, detail?: unknown) => emit("error", module, message, detail),
  };
}

export const rootLogger = createLogger("app");
