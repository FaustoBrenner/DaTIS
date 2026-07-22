import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { abrirDb } from "../db/conn.js";
import { upsertRelatorioDiario } from "../db/repos.js";
import { parseTasyJson } from "../io/json.js";
import { iterarDias } from "../io/dates.js";
import { ITAIM } from "../config.js";
import { computeUnidadeDia, type FontesBackfill } from "../kpis/backfill.js";

/**
 * BACKFILL do histórico de KPIs: computa cada dia da janela a partir da extração
 * em massa (data/sample_data/load_history) e faz upsert em `relatorios_diarios`.
 * Habilita o forecast por mediana do dia-da-semana, que ficava null sem histórico.
 *
 * Uso:
 *   npm run backfill -- [pasta] [--inicio aaaa-mm-dd] [--fim aaaa-mm-dd] [--unidade 14] [--db <arquivo>]
 * Default: pasta load_history, janela 2026-05-01 → 2026-07-21, unidade Itaim.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(__dirname, "../..");

function opt(args: string[], nome: string): string | undefined {
  const i = args.indexOf(nome);
  return i >= 0 ? args[i + 1] : undefined;
}

const args = process.argv.slice(2);
const pastaArg = args.filter((a) => !a.startsWith("--"))[0];
const pasta = pastaArg
  ? path.resolve(process.cwd(), pastaArg)
  : path.join(RAIZ, "data", "sample_data", "load_history");

const inicio = opt(args, "--inicio") ?? "2026-05-01";
const fim = opt(args, "--fim") ?? "2026-07-21";
const unidade = ITAIM; // futuro: resolver por --unidade quando houver regional
const dbPath = opt(args, "--db") ?? path.join(RAIZ, "data", "db", "daily_report.sqlite");

/** Carrega um relatório da pasta; erro claro se faltar. */
function carregar(arquivo: string) {
  const caminho = path.join(pasta, arquivo);
  if (!fs.existsSync(caminho)) {
    console.error(`[backfill] arquivo não encontrado: ${caminho}`);
    process.exit(1);
  }
  return parseTasyJson(caminho);
}

console.log(`[backfill] pasta=${pasta}`);
console.log(`[backfill] janela=${inicio} → ${fim} | unidade=${unidade.unidade} | db=${path.relative(RAIZ, dbPath)}`);
console.log("[backfill] lendo relatórios...");

const fontes: FontesBackfill = {
  ps: carregar("2432_TRACKING_PS.json"),
  cirurgias: carregar("3136_CIRURGIAS_REALIZADAS.json"),
  cemed: carregar("3523_TRACKING_CEMED.json"),
  exames: carregar("4317_GESTAO_EXAMES.json"),
  mapaCir: carregar("4718_MAPA_CIR.json"),
  censo: carregar("5079_CENSO_RETROATIVO.json"),
};
console.log(
  `[backfill] registros: ps=${fontes.ps.length} cir=${fontes.cirurgias.length} ` +
    `cemed=${fontes.cemed.length} exames=${fontes.exames.length} ` +
    `mapa=${fontes.mapaCir.length} censo=${fontes.censo.length}`,
);

const dias = iterarDias(inicio, fim);
if (dias.length === 0) {
  console.error(`[backfill] janela inválida: ${inicio} → ${fim}`);
  process.exit(1);
}

const db = abrirDb(dbPath);
console.log("-".repeat(60));

let inseridos = 0;
let atualizados = 0;
for (const dia of dias) {
  const { report } = computeUnidadeDia(fontes, unidade, dia);
  const { acao } = upsertRelatorioDiario(db, dia, report);
  if (acao === "inserido") inseridos++;
  else atualizados++;
  console.log(
    `  ${dia}  ocup=${report.pac_dia_uni}/${report.pac_dia_uti} ` +
      `cir=${report.cirurgias}(el ${report.cirurgias_eletivas}/ur ${report.cirurgias_urgencia}) ` +
      `prev=${report.cirurgias_previstas} ps=${report.atendimentos_ps} cemed=${report.atendimentos_cemed}`,
  );
}

console.log("-".repeat(60));
console.log(`[backfill] concluído: ${dias.length} dias (${inseridos} inseridos, ${atualizados} atualizados).`);
db.close();
