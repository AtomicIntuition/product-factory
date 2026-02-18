type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  timestamp: string;
}

function log(level: LogLevel, message: string, context?: Record<string, unknown>): void {
  const entry: LogEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    ...(context && { context }),
  };

  const output = JSON.stringify(entry);

  if (level === "error" || level === "warn") {
    console.error(output);
  } else {
    console.log(output);
  }
}

export const logger = {
  debug: (message: string, context?: Record<string, unknown>): void => log("debug", message, context),
  info: (message: string, context?: Record<string, unknown>): void => log("info", message, context),
  warn: (message: string, context?: Record<string, unknown>): void => log("warn", message, context),
  error: (message: string, context?: Record<string, unknown>): void => log("error", message, context),
};
