#!/usr/bin/env node
/**
 * CLI de execução de jobs — consumidor de referência da biblioteca.
 * Mantém paridade com o cliente legado: lê os mesmos conf/reports_catalog.json e
 * conf/job_*.json e grava os arquivos gerados em disco.
 *
 * Diferenças em relação ao legado:
 *   - autenticação 100% XHR (sem navegador);
 *   - troca de estabelecimento por código (`estabelecimento_cd`) ou por nome
 *     (`estabelecimento_nome` / flag --estab), resolvido via /user/data;
 *   - conversão TSV->CSV/SharePoint saiu do escopo: aqui só gravamos o bruto,
 *     opcionalmente convertido para CSV via --csv.
 *
 * Uso:
 *   TASY_USER=... TASY_PASS=... tsx src/cli/run-job.ts --job conf/job_daily.json
 *   Flags: --catalog <path> --out <dir> --csv --date-ref YYYY-MM-DD --estab <nome>
 */
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { TasyClient } from "../index.js";
import { buildSpecs, type CatalogFile, type ReportSpec } from "../services/reports.js";
import { parseDateRef } from "../services/params.js";
import { tsvToCsv } from "../convert/tsv.js";
import { consoleLogger } from "./logger.js";

interface JobFile {
  job_name: string;
  date_ref?: string | null;
  /** Nome do estabelecimento (resolvido para código via /user/data). Convenção do legado. */
  estabelecimento?: string;
  /** Código do estabelecimento para troca via performAction (alternativa direta ao nome). */
  estabelecimento_cd?: number;
  common_args?: Record<string, unknown>;
  reports: Array<{ key: string; args?: Record<string, unknown> }>;
}

function envOrThrow(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Variável de ambiente ${name} não definida.`);
  return v;
}

async function loadJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function main(): Promise<number> {
  const { values } = parseArgs({
    options: {
      catalog: { type: "string", default: "conf/reports_catalog.json" },
      job: { type: "string" },
      out: { type: "string", default: "out" },
      csv: { type: "boolean", default: false },
      "date-ref": { type: "string" },
      estab: { type: "string" },
    },
  });

  if (!values.job) throw new Error("--job é obrigatório (ex.: --job conf/job_daily.json)");

  const user = envOrThrow("TASY_USER");
  const password = envOrThrow("TASY_PASS");

  const catalog = await loadJson<CatalogFile>(values.catalog);
  const job = await loadJson<JobFile>(values.job);
  const baseUrl = process.env.TASY_BASE_URL ?? catalog.base_url;

  const specs = buildSpecs(catalog);
  const dateRef = parseDateRef(values["date-ref"] ?? job.date_ref ?? null);
  const commonArgs = job.common_args ?? {};

  const tasy = new TasyClient({ baseUrl, username: user, password, logger: consoleLogger });
  await tasy.session.ensureAuth();

  // Troca de estabelecimento: nome (flag > job) tem precedência sobre código.
  const estabNome = values.estab ?? job.estabelecimento;
  if (estabNome) {
    const estab = await tasy.establishment.changeByName(estabNome);
    consoleLogger.info("Estabelecimento alterado por nome", { nome: estab.name, cd: estab.code });
  } else if (typeof job.estabelecimento_cd === "number") {
    await tasy.establishment.change(job.estabelecimento_cd);
    consoleLogger.info("Estabelecimento alterado", { cd: job.estabelecimento_cd });
  }

  let exitCode = 0;
  for (const jr of job.reports) {
    const spec = specs[jr.key];
    if (!spec) {
      consoleLogger.error("Relatório não encontrado no catálogo", { key: jr.key });
      exitCode = 1;
      continue;
    }
    const args = { ...commonArgs, ...(jr.args ?? {}) };

    let ok = false;
    let lastErr: unknown;
    for (let attempt = 1; attempt <= 3 && !ok; attempt++) {
      try {
        const result = await tasy.reports.generate(spec, args, dateRef);
        for (const file of result.files) {
          const paths = await writeOutput(values.out!, job.job_name, spec, dateRef, file.content, values.csv!);
          consoleLogger.info("Relatório salvo", { key: jr.key, attempt, paths });
        }
        ok = true;
      } catch (err) {
        lastErr = err;
        consoleLogger.warn("Falha ao gerar relatório", { key: jr.key, attempt, error: String(err) });
        if (attempt < 3) await sleep(2 ** (attempt - 1) * 1000);
      }
    }
    if (!ok) {
      consoleLogger.error("Máximo de tentativas atingido", { key: jr.key, error: String(lastErr) });
      exitCode = 1;
    }
  }
  return exitCode;
}

/** Grava o arquivo em out/<job>/<key>/<ano>/<mes>/<prefixo>_<data>.<ext>. */
async function writeOutput(
  outRoot: string,
  jobName: string,
  spec: ReportSpec,
  dateRef: Date,
  content: Buffer,
  csv: boolean,
): Promise<string[]> {
  const year = String(dateRef.getUTCFullYear());
  const month = String(dateRef.getUTCMonth() + 1).padStart(2, "0");
  const day = String(dateRef.getUTCDate()).padStart(2, "0");
  const dir = join(outRoot, jobName, spec.key, year, month);
  await mkdir(dir, { recursive: true });
  const base = `${spec.filePrefix}_${year}-${month}-${day}`;

  const written: string[] = [];
  const rawPath = join(dir, `${base}.${spec.ext}`);
  await writeFile(rawPath, content);
  written.push(rawPath);

  if (csv) {
    const csvPath = join(dir, `${base}.csv`);
    await writeFile(csvPath, tsvToCsv(content), "utf8");
    written.push(csvPath);
  }
  return written;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    consoleLogger.error("Erro fatal no job", { error: String(err) });
    process.exit(1);
  });
