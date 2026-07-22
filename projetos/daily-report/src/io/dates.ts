/**
 * Datas do TASY no **novo padrão JSON**: ISO 8601, seja com tempo e zona
 * (`2026-07-21T10:36:05.000Z`) ou apenas o dia (`2026-07-21`). Também toleramos
 * o formato brasileiro `dd/mm/aaaa` das extrações `.xls` legadas, como fallback.
 *
 * Para agrupar por DIA, extraímos os componentes de "parede" da string (os 10
 * primeiros caracteres `aaaa-mm-dd`), SEM conversão de fuso. Os relatórios já
 * vêm no horário local da unidade; converter o `Z` como UTC de verdade jogaria
 * eventos da madrugada para o dia anterior (erro de ±1 dia perto da meia-noite).
 *
 * RISCO A VALIDAR com o `tasy-client`: se a serialização gravou o horário local
 * e apenas anexou o sufixo `Z` (wall-clock local rotulado como UTC), ler os
 * dígitos literais é o correto. Se o `Z` for UTC genuíno, será preciso somar o
 * offset da unidade (BRT −03:00) antes de fatiar o dia. Confirmar na integração.
 */

/** Extrai o dia `aaaa-mm-dd` de um valor de data do TASY, ou null se não houver. */
export function dataIso(valor: unknown): string | null {
  if (valor == null) return null;
  const s = String(valor).trim();
  if (s === "") return null;
  // ISO 8601 (com ou sem tempo/zona): pega o prefixo aaaa-mm-dd.
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  // Fallback: formato brasileiro dd/mm/aaaa das extrações .xls legadas.
  return dataIsoBr(s);
}

/** True se o valor cai no dia de referência (`aaaa-mm-dd`). */
export function noDia(valor: unknown, refIso: string): boolean {
  return dataIso(valor) === refIso;
}

/** Converte `dd/mm/aaaa[ HH:MM[:SS]]` em Date local, ou null. (Legado .xls.) */
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

/** Dia `aaaa-mm-dd` de uma data no formato brasileiro, ou null. (Legado .xls.) */
export function dataIsoBr(valor: string | undefined | null): string | null {
  const d = parseDataHoraBr(valor);
  if (!d) return null;
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
