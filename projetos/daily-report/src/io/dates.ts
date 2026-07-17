/**
 * Parsing das datas do TASY, sempre no formato brasileiro `dd/mm/aaaa` com
 * hora opcional (`HH:MM` ou `HH:MM:SS`). Trabalhamos com os componentes locais
 * — não aplicamos fuso, pois os relatórios já vêm no horário local da unidade.
 */

/** Converte `dd/mm/aaaa[ HH:MM[:SS]]` em Date local, ou null se inválido. */
export function parseDataHoraBr(valor: string | undefined | null): Date | null {
  if (!valor) return null;
  const m = valor
    .trim()
    .match(/^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) return null;
  const [, dd, mm, aaaa, hh = "0", min = "0", ss = "0"] = m;
  const d = new Date(
    Number(aaaa),
    Number(mm) - 1,
    Number(dd),
    Number(hh),
    Number(min),
    Number(ss),
  );
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Retorna a data (sem hora) no formato ISO `aaaa-mm-dd`, ou null. */
export function dataIsoBr(valor: string | undefined | null): string | null {
  const d = parseDataHoraBr(valor);
  if (!d) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** True se `valor` cai no dia de referência (`aaaa-mm-dd`). */
export function noDia(valor: string | undefined | null, refIso: string): boolean {
  return dataIsoBr(valor) === refIso;
}
