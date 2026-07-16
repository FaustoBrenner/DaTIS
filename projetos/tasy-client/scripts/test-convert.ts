/**
 * Teste offline (sem rede, sem PII) da conversão TSV UTF-16-BE -> linhas/CSV.
 * Constrói um buffer sintético no mesmo encoding do TASY e valida o decode.
 *
 *   tsx scripts/test-convert.ts
 */
import assert from "node:assert/strict";
import { decodeTasyText, tsvToRows, tsvToCsv } from "../src/convert/tsv.js";

/** Codifica string em UTF-16-BE com BOM, imitando a exportação do TASY. */
function toUtf16BeWithBom(s: string): Buffer {
  const le = Buffer.from(s, "utf16le");
  const be = Buffer.from(le).swap16();
  return Buffer.concat([Buffer.from([0xfe, 0xff]), be]);
}

const sample = "Nome\tConvênio\tValor\nAna Áç\tParticular\t1.234,56\nJoão\tSUS\t0,00\n";
const buf = toUtf16BeWithBom(sample);

// decode preserva acentos
const decoded = decodeTasyText(buf);
assert.ok(decoded.includes("Convênio") && decoded.includes("Ana Áç"), "decode deve preservar acentos");

// linhas: 3 (última linha vazia ignorada), 3 colunas
const rows = tsvToRows(buf);
assert.equal(rows.length, 3, `esperado 3 linhas, veio ${rows.length}`);
assert.deepEqual(rows[0], ["Nome", "Convênio", "Valor"]);
assert.deepEqual(rows[2], ["João", "SUS", "0,00"]);

// CSV: separador ';', BOM, campos com ';' internos seriam escapados
const csv = tsvToCsv(buf);
assert.ok(csv.startsWith("﻿"), "CSV deve ter BOM UTF-8");
assert.ok(csv.includes("Nome;Convênio;Valor"), "CSV deve usar ';' como separador");

// escaping: valor com ';' vira campo entre aspas
const withDelim = toUtf16BeWithBom("A;B\tC\n");
const csv2 = tsvToCsv(withDelim);
assert.ok(csv2.includes('"A;B";C'), `campo com ';' deve ser aspeado; veio: ${JSON.stringify(csv2)}`);

console.log("test-convert OK — decode UTF-16-BE, linhas e CSV validados sem PII.");
