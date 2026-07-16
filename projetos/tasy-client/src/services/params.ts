/**
 * Resolução de tokens de data e codificação de parâmetros de relatório.
 * Portado de src/utils.py do cliente legado, preservando o comportamento validado
 * em produção.
 */

/** Schema de um parâmetro no catálogo. */
export interface ParamSchema {
  type?: "string" | "int" | "bool" | "boolean" | "instant" | "json";
  required?: boolean;
  allowed?: unknown[];
}

const TOKEN_RE = /^@date_ref(?<off>[+-]\d+d)?(?<t00z>_T00Z)?$/;

/**
 * Resolve tokens de data relativos ao date_ref:
 *   @date_ref           -> "YYYY-MM-DD"
 *   @date_ref-1d        -> data - 1 dia
 *   @date_ref+2d        -> data + 2 dias
 *   @date_ref_T00Z      -> "YYYY-MM-DDT03:00:00.000Z" (meia-noite em America/Sao_Paulo)
 *   @date_ref-1d_T00Z   -> idem, deslocado
 * Qualquer outro valor retorna inalterado.
 */
export function resolveToken(value: unknown, dateRef: Date): unknown {
  if (typeof value !== "string" || !value.startsWith("@")) return value;
  const m = TOKEN_RE.exec(value);
  if (!m || !m.groups) return value;

  const offGroup = m.groups.off; // ex.: "+1d" | "-2d" | undefined
  const off = offGroup ? parseInt(offGroup.slice(0, -1), 10) : 0;
  const t00z = Boolean(m.groups.t00z);

  const d = new Date(Date.UTC(dateRef.getUTCFullYear(), dateRef.getUTCMonth(), dateRef.getUTCDate() + off));

  if (t00z) {
    // 03:00Z == meia-noite local em America/Sao_Paulo (UTC-3).
    const iso = `${isoDate(d)}T03:00:00.000Z`;
    return iso;
  }
  return isoDate(d);
}

/** "YYYY-MM-DD" a partir dos componentes UTC. */
function isoDate(d: Date): string {
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

/** Wrapper de instante do TASY. */
export interface TasyInstant {
  "@class": "java.time.Instant";
  type: "INSTANT";
  value: string;
}

/**
 * Codifica um valor conforme o schema do catálogo:
 *   instant -> objeto java.time.Instant
 *   int     -> number
 *   bool    -> boolean
 *   json    -> in natura
 *   default -> string
 * Valida domínio via `allowed`.
 */
export function encodeParam(name: string, value: unknown, schema: ParamSchema = {}): unknown {
  const type = schema.type ?? "string";

  if (schema.allowed && !schema.allowed.includes(value)) {
    throw new Error(`Param ${name}: valor '${String(value)}' fora do domínio ${JSON.stringify(schema.allowed)}`);
  }

  switch (type) {
    case "instant": {
      if (typeof value !== "string" || !value.endsWith("Z")) {
        throw new Error(`Param ${name}: esperado ISO UTC terminado em 'Z' para 'instant'`);
      }
      const instant: TasyInstant = { "@class": "java.time.Instant", type: "INSTANT", value };
      return instant;
    }
    case "int": {
      const n = typeof value === "number" ? value : parseInt(String(value), 10);
      if (Number.isNaN(n)) {
        throw new Error(`Param ${name}: valor '${String(value)}' não é um inteiro válido`);
      }
      return n;
    }
    case "bool":
    case "boolean":
      if (typeof value === "boolean") return value;
      if (typeof value === "string") return ["1", "true", "t", "yes", "y", "sim"].includes(value.trim().toLowerCase());
      return Boolean(value);
    case "json":
      return value;
    default:
      return String(value);
  }
}

/** date_ref padrão: D-1 (ontem, em UTC). Aceita string ISO. */
export function parseDateRef(s?: string | null): Date {
  if (!s) {
    const now = new Date();
    return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - 1));
  }
  const [y, mo, da] = s.split("-").map((n) => parseInt(n, 10));
  const d = new Date(Date.UTC(y!, (mo ?? 1) - 1, da ?? 1));
  if (Number.isNaN(d.getTime())) {
    throw new Error(`date_ref inválido: '${s}' (esperado YYYY-MM-DD)`);
  }
  return d;
}
