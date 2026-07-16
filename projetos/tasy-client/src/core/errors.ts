/**
 * Erros do tasy-client e utilidades de tratamento das respostas de erro do TASY.
 *
 * O TASY responde erros como { code?, message } — ex.:
 *   400 {"code":1100,"message":"O usuário e as credenciais enviadas não coincidem."}
 *   401 {"message":"request not allowed (XSRF)"}
 * Alguns corpos vêm com mojibake (UTF-8 relido como Latin-1): "cabeÃ§alho".
 */

/** Corrige mojibake do tipo "cabeÃ§alho" -> "cabeçalho" (UTF-8 interpretado como Latin-1). */
export function fixMojibake(text: string): string {
  if (!/[Â-Ã][-¿]/.test(text)) return text;
  try {
    return Buffer.from(text, "latin1").toString("utf8");
  } catch {
    return text;
  }
}

export interface TasyErrorDetails {
  status: number;
  url: string;
  /** Código de negócio do TASY (ex.: 1100), quando presente. */
  tasyCode?: number;
  /** Corpo bruto da resposta, para diagnóstico. */
  body?: unknown;
}

/** Erro genérico de uma operação contra o TASY. */
export class TasyError extends Error {
  readonly status: number;
  readonly url: string;
  readonly tasyCode?: number;
  readonly body?: unknown;

  constructor(message: string, details: TasyErrorDetails) {
    super(fixMojibake(message));
    this.name = "TasyError";
    this.status = details.status;
    this.url = details.url;
    this.tasyCode = details.tasyCode;
    this.body = details.body;
  }
}

/** Falha de autenticação (login ou refresh recusados pelo servidor). */
export class TasyAuthError extends TasyError {
  constructor(message: string, details: TasyErrorDetails) {
    super(message, details);
    this.name = "TasyAuthError";
  }
}

/**
 * Extrai { code, message } de um corpo de erro do TASY (aceita objeto ou string JSON).
 * Retorna message já sem mojibake.
 */
export function parseTasyError(body: unknown): { code?: number; message?: string } {
  let obj: unknown = body;
  if (typeof body === "string") {
    try {
      obj = JSON.parse(body);
    } catch {
      return { message: fixMojibake(body) };
    }
  }
  if (obj && typeof obj === "object") {
    const rec = obj as Record<string, unknown>;
    const code = typeof rec.code === "number" ? rec.code : undefined;
    const message = typeof rec.message === "string" ? fixMojibake(rec.message) : undefined;
    return { code, message };
  }
  return {};
}
