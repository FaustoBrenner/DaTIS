import fs from "node:fs";

/**
 * Leitura dos relatórios do TASY no **novo padrão JSON** (a partir de 2026-07).
 *
 * O `tasy-client` deixou de transmitir o buffer binário `.xls`/TSV UTF-16 e
 * passou a serializar cada relatório como um array JSON de registros, com os
 * tipos nativos preservados (números como número, vazios como `null`, datas em
 * ISO 8601). Isso elimina a etapa de decode/parse de TSV — basta `JSON.parse`.
 */

/**
 * Uma linha (registro) de um relatório. Os valores mantêm o tipo nativo do
 * JSON: `string` (ids, textos, datas ISO), `number`, `boolean` ou `null`.
 * Cada parser de fonte é responsável por coagir/normalizar o que consome.
 */
export type LinhaTasy = Record<string, unknown>;

/**
 * Lê um relatório do TASY em JSON e devolve a lista de registros.
 *
 * Aceita tanto o array no topo (`[ {...}, ... ]`, formato das amostras) quanto
 * um envelope `{ dados|registros|rows: [...] }`, por robustez a variações do
 * emissor. Lança se o conteúdo não contiver um array de registros.
 */
export function parseTasyJson(caminho: string): LinhaTasy[] {
  const doc = JSON.parse(fs.readFileSync(caminho, "utf8"));
  if (Array.isArray(doc)) return doc as LinhaTasy[];
  const arr = doc?.dados ?? doc?.registros ?? doc?.rows;
  if (Array.isArray(arr)) return arr as LinhaTasy[];
  throw new Error(
    `Relatório JSON inesperado em ${caminho}: esperava um array de registros ` +
      `(ou envelope { dados: [...] }).`,
  );
}

/**
 * Coage um campo a `string` aparada. Cobre ids que podem vir como número e
 * células vazias que agora chegam como `null` (antes eram `""` no TSV).
 */
export function txt(valor: unknown): string {
  if (valor == null) return "";
  return String(valor).trim();
}
