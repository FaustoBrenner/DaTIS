/**
 * Logger de console simples para o CLI. A biblioteca não impõe logger algum;
 * este é apenas o que o consumidor de referência (CLI) pluga na sessão.
 */
import type { Logger } from "../core/types.js";

function ts(): string {
  return new Date().toISOString();
}

function fmt(meta?: unknown): string {
  if (meta === undefined) return "";
  try {
    return " " + JSON.stringify(meta);
  } catch {
    return " " + String(meta);
  }
}

export const consoleLogger: Logger = {
  debug: (m, meta) => process.env.TASY_DEBUG && console.error(`${ts()} [DEBUG] ${m}${fmt(meta)}`),
  info: (m, meta) => console.error(`${ts()} [INFO] ${m}${fmt(meta)}`),
  warn: (m, meta) => console.error(`${ts()} [WARN] ${m}${fmt(meta)}`),
  error: (m, meta) => console.error(`${ts()} [ERROR] ${m}${fmt(meta)}`),
};
