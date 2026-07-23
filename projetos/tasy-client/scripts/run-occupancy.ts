/**
 * Extração de OCUPAÇÃO HOSPITALAR e gravação em disco (JSON).
 * Exige rede corporativa e TASY_USER / TASY_PASS.
 *
 *   tsx scripts/run-occupancy.ts [cdEstab] [--out <dir>]
 *
 * Ocupação é dado agregado por setor, SEM PII. Grava o resultado em
 *   <out>/ocupacao/<ano>/<mes>/OCUPACAO_ESTAB<cd>_<data>.json
 * (default de --out: out/job_daily_report).
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseArgs } from "node:util";

import { TasyClient } from "../src/index.js";
import { consoleLogger } from "../src/cli/logger.js";

async function main(): Promise<void> {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: { out: { type: "string", default: "out/job_daily_report" } },
  });
  const cdEstab = Number(positionals[0] ?? 14); // 14 = Morumbi

  const tasy = new TasyClient({
    baseUrl: process.env.TASY_BASE_URL ?? "http://hismorumbi.rededor.corp",
    username: process.env.TASY_USER!,
    password: process.env.TASY_PASS!,
    logger: consoleLogger,
  });

  consoleLogger.info("Extraindo ocupação", { cdEstab });
  const result = await tasy.occupancy.getOccupancy(cdEstab);

  // Snapshot do momento — a ocupação não tem parâmetro de data; usamos a data atual (UTC).
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const day = String(now.getUTCDate()).padStart(2, "0");

  const dir = join(values.out!, "ocupacao", year, month);
  await mkdir(dir, { recursive: true });
  const path = join(dir, `OCUPACAO_ESTAB${cdEstab}_${year}-${month}-${day}.json`);
  await writeFile(path, JSON.stringify(result, null, 2), "utf8");

  consoleLogger.info("Ocupação salva", {
    cdEstab,
    linhas: result.rows.length,
    totalRegistros: result.totalRegistros,
    path,
  });
}

main().catch((e) => {
  console.error("FALHOU:", e);
  process.exit(1);
});
