/**
 * Inspeção estrutural (sem PII) dos arquivos gerados por um job.
 * Imprime só nº de linhas e de colunas — nenhuma célula de dado.
 *
 *   tsx scripts/inspect-out.ts out/job_daily
 */
import { readFile } from "node:fs/promises";
import { glob } from "node:fs/promises";
import { tsvToRows } from "../src/convert/tsv.js";

const root = process.argv[2] ?? "out/job_daily";
for await (const path of glob(`${root}/**/*.xls`)) {
  const buf = await readFile(path);
  const rows = tsvToRows(buf);
  const name = path.split(/[\\/]/).pop();
  console.log(`${name?.padEnd(42)} linhas=${String(rows.length).padStart(5)}  colunas=${rows[0]?.length ?? 0}`);
}
