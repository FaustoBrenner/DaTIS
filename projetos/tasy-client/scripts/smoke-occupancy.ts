/**
 * Smoke test de OCUPAÇÃO HOSPITALAR contra o servidor real.
 * Exige rede corporativa e TASY_USER / TASY_PASS.
 *
 *   tsx scripts/smoke-occupancy.ts [cdEstab]
 *
 * Dado agregado por setor, SEM PII. Ainda assim, imprime somente estrutura
 * (nº de linhas, nº de colunas, cabeçalho) + o percentual de ocupação total do
 * agregado — nenhuma informação de paciente.
 */
import { TasyClient } from "../src/index.js";
import { consoleLogger } from "../src/cli/logger.js";

async function main(): Promise<void> {
  const cdEstab = Number(process.argv[2] ?? 14); // 14 = Morumbi

  const tasy = new TasyClient({
    baseUrl: process.env.TASY_BASE_URL ?? "http://hismorumbi.rededor.corp",
    username: process.env.TASY_USER!,
    password: process.env.TASY_PASS!,
    logger: consoleLogger,
  });

  console.log(`Consultando ocupação do estabelecimento ${cdEstab} ...`);
  const result = await tasy.occupancy.getOccupancy(cdEstab);

  const primeira = result.rows[0];
  const colunas = primeira ? Object.keys(primeira) : [];
  console.log(`  linhas=${result.rows.length} totalRegistros=${result.totalRegistros} colunas=${colunas.length}`);
  console.log(`  cabeçalho: ${JSON.stringify(colunas)}`);

  // Linha agregada (sem PII) — sanidade rápida do número de ocupação.
  const agregado = result.rows.find((r) => r.DS_CLASSIFICATION === "Agrupamento");
  if (agregado) {
    console.log(
      `  agregado: setor="${String(agregado.DS_SETOR_ATENDIMENTO).trim()}" ` +
        `ocupadas=${agregado.NR_UNIDADES_OCUPADAS}/${agregado.NR_UNIDADES_SETOR} ` +
        `PR_OCUPACAO_TOTAL=${agregado.PR_OCUPACAO_TOTAL}`,
    );
  }

  console.log("\nOK — pipeline getOccupancy validado.");
}

main().catch((e) => {
  console.error("FALHOU:", e);
  process.exit(1);
});
