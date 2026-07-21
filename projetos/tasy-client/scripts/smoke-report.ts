/**
 * Smoke test de GERAÇÃO DE RELATÓRIO contra o servidor real.
 * Exige rede corporativa e TASY_USER / TASY_PASS.
 *
 *   tsx scripts/smoke-report.ts [report_key]
 *
 * LGPD: imprime SOMENTE estrutura (nº de arquivos, bytes, nº de linhas e o
 * cabeçalho de colunas). NÃO imprime nenhuma linha de dados de paciente.
 */
import { readFile } from "node:fs/promises";
import { TasyClient } from "../src/index.js";
import { buildSpecs, type CatalogFile } from "../src/services/reports.js";
import { parseDateRef } from "../src/services/params.js";
import { consoleLogger } from "../src/cli/logger.js";

async function main(): Promise<void> {
  const catalog = JSON.parse(await readFile("conf/reports_catalog.json", "utf8")) as CatalogFile;
  const specs = buildSpecs(catalog);
  const key = process.argv[2] ?? "cate_3142";
  const spec = specs[key];
  if (!spec) throw new Error(`spec ${key} não encontrado no catálogo`);

  const tasy = new TasyClient({
    baseUrl: process.env.TASY_BASE_URL ?? "http://hismorumbi.rededor.corp",
    username: process.env.TASY_USER!,
    password: process.env.TASY_PASS!,
    logger: consoleLogger,
  });

  const dateRef = parseDateRef(null); // D-1
  // cate_3142 (Desfecho Internação PA) usa CD_ESTAB explícito -> não depende de troca de estabelecimento.
  const args: Record<string, unknown> = {
    fileExportType: "XLS",
    CD_ESTAB: 14,
    DT_INICIAL: "@date_ref_T00Z",
    DT_FINAL: "@date_ref_T00Z",
  };

  console.log(`Gerando ${key} para ${dateRef.toISOString().slice(0, 10)} ...`);
  // Formato padrão: linhas JSON já parseadas (f.rows).
  const result = await tasy.reports.generate(spec, args, dateRef);
  console.log("Arquivos retornados:", result.fileNames.length);
  for (const f of result.files) {
    const colunas = f.rows[0] ? Object.keys(f.rows[0]) : [];
    console.log(`  linhas=${f.rows.length} colunas=${colunas.length}`);
    console.log(`  cabeçalho: ${JSON.stringify(colunas)}`);
  }
  console.log("\nOK — pipeline generateReports + download + parse JSON validado.");
}

main().catch((e) => {
  console.error("FALHOU:", e);
  process.exit(1);
});
