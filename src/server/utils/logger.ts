/**
 * @file Logger utility
 *
 * Same shape as expo-passkey's logger so the two plugins emit
 * comparable output. Tagged `[ExpoPasskeyLiveness]` to keep them
 * distinguishable in shared log streams.
 */

export interface LoggerOptions {
  enabled?: boolean;
  level?: "debug" | "info" | "warn" | "error";
}

export type LoggerLevel = "debug" | "info" | "warn" | "error";

export const createLogger = (options: LoggerOptions = {}) => {
  const enabled =
    options.enabled !== undefined
      ? options.enabled
      : process.env.NODE_ENV === "development";

  const opts = {
    enabled,
    level: options.level ?? "info",
  };

  const logLevels: Record<LoggerLevel, number> = {
    debug: 0,
    info: 1,
    warn: 2,
    error: 3,
  };

  const shouldLog = (level: LoggerLevel): boolean => {
    return opts.enabled && logLevels[level] >= logLevels[opts.level];
  };

  return {
    debug: (...args: unknown[]) => {
      if (shouldLog("debug")) {
        console.debug("[ExpoPasskeyLiveness]", ...args);
      }
    },
    info: (...args: unknown[]) => {
      if (shouldLog("info")) {
        console.info("[ExpoPasskeyLiveness]", ...args);
      }
    },
    warn: (...args: unknown[]) => {
      if (shouldLog("warn")) {
        console.warn("[ExpoPasskeyLiveness]", ...args);
      }
    },
    error: (...args: unknown[]) => {
      if (shouldLog("error")) {
        console.error("[ExpoPasskeyLiveness]", ...args);
      }
    },
  };
};

export type Logger = ReturnType<typeof createLogger>;
