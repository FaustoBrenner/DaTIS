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
