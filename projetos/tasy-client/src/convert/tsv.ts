/**
 * Conversão do "xls" do TASY (na prática TSV em UTF-16-BE) para linhas ou CSV.
 * Funções puras, sem I/O — o consumidor decide o que fazer com o resultado.
 * Portado da lógica de _read_text/_tsv_to_csv_text de src/uploading.py.
 */

/**
 * Decodifica o buffer bruto para texto, detectando o encoding do TASY.
 * Nunca muta o buffer de entrada — `swap16()` altera in-place, então copiamos antes.
 */
export function decodeTasyText(buf: Buffer): string {
  // UTF-16-BE com ou sem BOM (padrão observado nas exportações do TASY).
  // swap16() exige comprimento par; um buffer ímpar (ex.: download truncado)
  // não é UTF-16 válido — cai no fallback UTF-8 em vez de estourar RangeError.
  if (buf.length >= 2 && buf[0] === 0xfe && buf[1] === 0xff && buf.length % 2 === 0) {
    return Buffer.from(buf.subarray(2)).swap16().toString("utf16le");
  }
  // Heurística: muitos bytes 0x00 em posições pares indicam UTF-16-BE sem BOM.
  if (buf.length % 2 === 0 && looksLikeUtf16Be(buf)) {
    return Buffer.from(buf).swap16().toString("utf16le");
  }
  // Fallback: UTF-8 (com BOM tolerado).
  return buf.toString("utf8").replace(/^﻿/, "");
}

function looksLikeUtf16Be(buf: Buffer): boolean {
  const sample = Math.min(buf.length, 200);
  let zerosHigh = 0;
  for (let i = 0; i + 1 < sample; i += 2) {
    if (buf[i] === 0x00) zerosHigh++;
  }
  return zerosHigh > sample / 8;
}

/** Converte o buffer TSV do TASY em matriz de linhas/células. */
export function tsvToRows(buf: Buffer): string[][] {
  const text = decodeTasyText(buf);
  return text
    .split(/\r?\n/)
    .filter((line, idx, arr) => !(line === "" && idx === arr.length - 1)) // ignora última linha vazia
    .map((line) => line.split("\t"));
}

/** Tipos de coluna suportados na tipagem de saída (columns_schema do catálogo). */
export type ColumnType = "string" | "int" | "date" | "instant" | "duration";

/** Schema de uma coluna de saída. */
export interface ColumnSchema {
  type: ColumnType;
}

/** Mapa nome-da-coluna -> schema. Colunas ausentes assumem `string`. */
export type ColumnsSchema = Record<string, ColumnSchema>;

/** Valor de célula após coerção: string crua, número, ou null (vazio tipado). */
export type TsvValue = string | number | null;

/** Uma linha do relatório como objeto indexado pelo cabeçalho. */
export type TsvRecord = Record<string, TsvValue>;

// São Paulo é UTC-3 fixo (sem horário de verão desde 2019). Mesma convenção de params.ts.
const SP_UTC_OFFSET_MS = 3 * 60 * 60 * 1000;

const RE_INT = /^-?\d+$/;
const RE_DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/;
const RE_DATETIME = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})(?::(\d{2}))?$/;
const RE_DURATION = /^(\d+):(\d{2})(?::(\d{2}))?$/;

/**
 * Aplica o tipo declarado a uma célula crua (já trimada). Coerção **leniente**:
 * se o valor não casar com o formato esperado, devolve a string crua (não lança).
 * Vazio -> null para tipos não-string; "" para `string`.
 *
 *   int      -> number
 *   date     -> "YYYY-MM-DD"
 *   instant  -> ISO 8601 UTC ("...Z"), assumindo hora local São Paulo (UTC-3)
 *   duration -> minutos totais (h*60 + m + s/60)
 */
export function coerceCell(raw: string, type: ColumnType): TsvValue {
  if (type === "string") return raw;
  if (raw === "") return null;

  switch (type) {
    case "int": {
      if (!RE_INT.test(raw)) return raw;
      const n = Number(raw);
      return Number.isFinite(n) ? n : raw;
    }
    case "date": {
      const m = RE_DATE.exec(raw);
      if (!m) return raw;
      const [, dd, mo, yyyy] = m;
      return `${yyyy}-${mo}-${dd}`;
    }
    case "instant": {
      const m = RE_DATETIME.exec(raw);
      if (!m) return raw;
      const [, dd, mo, yyyy, hh, mi, ss] = m;
      const utcMs =
        Date.UTC(+yyyy!, +mo! - 1, +dd!, +hh!, +mi!, ss ? +ss : 0) + SP_UTC_OFFSET_MS;
      const d = new Date(utcMs);
      return Number.isNaN(d.getTime()) ? raw : d.toISOString();
    }
    case "duration": {
      const m = RE_DURATION.exec(raw);
      if (!m) return raw;
      const [, hh, mi, ss] = m;
      return +hh! * 60 + +mi! + (ss ? +ss / 60 : 0);
    }
    default:
      return raw;
  }
}

/**
 * Converte o buffer TSV do TASY em lista de objetos (formato JSON padrão da lib),
 * usando a 1ª linha como cabeçalho.
 *
 * Sem `schema`: valores permanecem string crua (com trim). Com `schema`: cada
 * célula é coagida ao tipo declarado (`coerceCell`); coluna ausente do schema
 * assume `string`. A tipagem é leniente — valores fora do formato viram string.
 *
 * Observação: o parser é tabular e assume que o "xls" do TASY é de fato TSV. Para
 * exportações não tabulares (ex.: PDF/binário), use o retorno bruto (opção `raw`).
 */
export function tsvToRecords(buf: Buffer, schema?: ColumnsSchema): TsvRecord[] {
  const rows = tsvToRows(buf);
  if (rows.length === 0) return [];
  const header = rows[0]!.map((h) => h.trim());
  return rows.slice(1).map((cells) => {
    const record: TsvRecord = {};
    header.forEach((col, i) => {
      const raw = (cells[i] ?? "").trim();
      record[col] = schema ? coerceCell(raw, schema[col]?.type ?? "string") : raw;
    });
    return record;
  });
}

/** Escapa um campo para CSV conforme RFC 4180 quando necessário. */
function csvField(value: string, delimiter: string): string {
  if (value.includes(delimiter) || value.includes('"') || value.includes("\n") || value.includes("\r")) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

/**
 * Converte o buffer TSV do TASY em texto CSV.
 * Default: separador ';' e BOM UTF-8 (compatível com Excel pt-BR), como no legado.
 */
export function tsvToCsv(buf: Buffer, opts: { delimiter?: string; bom?: boolean } = {}): string {
  const delimiter = opts.delimiter ?? ";";
  const bom = opts.bom ?? true;
  const rows = tsvToRows(buf);
  const body = rows.map((cells) => cells.map((c) => csvField(c, delimiter)).join(delimiter)).join("\n");
  return (bom ? "﻿" : "") + body;
}
