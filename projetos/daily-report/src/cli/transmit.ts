import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ITAIM } from "../config.js";
import { carregarEnv } from "../io/env.js";
import { abrirDb } from "../db/conn.js";
import { DiaNaoComputadoError, montarPayload } from "../transmit/payload.js";
import { enviar } from "../transmit/post.js";

/**
 * Rotina de TRANSMISSÃO: banco → comparações/tendências → POST no endpoint.
 *
 * Uso:
 *   npm run transmit -- --ref 2026-07-21 --hoje 2026-07-22
 *   npm run transmit -- --ref 2026-07-21 --hoje 2026-07-22 --dry-run
 *   npm run transmit -- ... --out data/out/exemplo.json
 *
 * `--dry-run` monta e grava o payload sem tentar o POST. Sem a env var
 * `DAILY_REPORT_ENDPOINT_URL`, o envio vira no-op logado e o exit code é 0 —
 * a rotina roda de ponta a ponta antes do endpoint existir.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(__dirname, "../..");

// Carrega o .env do projeto (endpoint/segredo). O ambiente do SO tem precedência.
const { carregadas } = carregarEnv(path.join(RAIZ, "environment.env"));
if (carregadas.length) console.log(`[env] environment.env: ${carregadas.join(", ")}`);

function opt(args: string[], nome: string): string | undefined {
  const i = args.indexOf(nome);
  return i >= 0 ? args[i + 1] : undefined;
}

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const dbPath = opt(args, "--db") ?? path.join(RAIZ, "data", "db", "daily_report.sqlite");
const refIso = opt(args, "--ref") ?? "2026-07-21";
const hojeIso = opt(args, "--hoje") ?? "2026-07-22";

const db = abrirDb(dbPath);

let payload;
try {
  payload = montarPayload(db, ITAIM, { refIso, hojeIso });
} catch (e) {
  if (e instanceof DiaNaoComputadoError) {
    console.error(`[transmit] ${e.message}`);
    db.close();
    process.exit(1);
  }
  throw e;
}
db.close();

const saidaDir = path.join(RAIZ, "data", "out");
fs.mkdirSync(saidaDir, { recursive: true });
const saida =
  opt(args, "--out") ??
  path.join(saidaDir, `payload_${refIso}_u${ITAIM.id_unidade}.json`);
fs.writeFileSync(saida, JSON.stringify(payload, null, 2), "utf8");

const bytes = fs.statSync(saida).size;
console.log("=".repeat(62));
console.log(`PAYLOAD — ${payload.unidade.unidade} | ref ${refIso} (${payload.periodo.dia_semana_nome})`);
console.log("=".repeat(62));
console.log(`calendário : ${payload.calendario.ref_descricao}`);
console.log(`hoje       : ${payload.calendario.hoje_descricao}`);
console.log(`destaques  :`);
for (const d of payload.destaques) {
  const c = payload.comparacoes[d.kpi]!;
  console.log(
    `  ${d.rank}. ${d.kpi.padEnd(32)} ${String(c.valor).padStart(8)}` +
      ` | esperado ${String(c.esperado ?? "—").padStart(8)}` +
      ` | faixa10 ${c.faixa10.min}–${c.faixa10.max} (med ${c.faixa10.mediana})` +
      ` | ${c.posicao} | score ${d.score}`,
  );
}
if (payload.qualidade.suspeitas.length) {
  console.log(`suspeitas  :`);
  for (const s of payload.qualidade.suspeitas) console.log(`  ! ${s}`);
}
if (payload.qualidade.campos_null_relevantes.length) {
  console.log(`nulos      : ${payload.qualidade.campos_null_relevantes.join(", ")}`);
}
console.log(`\n[out] ${path.relative(RAIZ, saida)} (${(bytes / 1024).toFixed(1)} KB)`);

if (dryRun) {
  console.log("[transmit] --dry-run: envio não tentado.");
  process.exit(0);
}

const resultado = await enviar(payload);
switch (resultado.status) {
  case "nao_configurado":
    console.log(
      "[transmit] endpoint não configurado (DAILY_REPORT_ENDPOINT_URL ausente) — payload só em disco.",
    );
    break;
  case "enviado":
    console.log(
      `[transmit] enviado: HTTP ${resultado.httpStatus} em ${resultado.tentativas} tentativa(s).`,
    );
    break;
  case "falhou":
    console.error(
      `[transmit] FALHOU após ${resultado.tentativas} tentativa(s): ${resultado.erro}`,
    );
    // Saída graciosa (não `process.exit`): evita a corrida com o teardown dos
    // sockets do fetch, que dispara assertion do libuv no Windows.
    process.exitCode = 2;
    break;
}
