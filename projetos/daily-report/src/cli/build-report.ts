import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { ITAIM } from "../config.js";
import { abrirDb } from "../db/conn.js";
import { upsertRelatorioDiario } from "../db/repos.js";
import { computeUnidade } from "../kpis/computeUnidade.js";

/**
 * Rotina de DAILY REPORT: consulta o banco (não os arquivos), calcula os KPIs,
 * valida contra o schema e grava o payload. Com --persist, grava também na
 * camada de serving (`relatorios_diarios`), fonte do forecast.
 *
 * Uso:
 *   npm run report                         (janela padrão da amostra)
 *   npm run report -- --ref <D-1> --hoje <D-0> [--persist] [--db <arquivo>]
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(__dirname, "../..");

function opt(args: string[], nome: string): string | undefined {
  const i = args.indexOf(nome);
  return i >= 0 ? args[i + 1] : undefined;
}

const args = process.argv.slice(2);
const persistir = args.includes("--persist");
const dbPath = opt(args, "--db") ?? path.join(RAIZ, "data", "db", "daily_report.sqlite");

// Amostra JSON: extração de 22/07 (D-0), realizados de 21/07 (D-1).
const janela = {
  refIso: opt(args, "--ref") ?? "2026-07-21",
  extracaoHoje: opt(args, "--hoje") ?? "2026-07-22",
};

const db = abrirDb(dbPath);
const { report, diagnostics } = computeUnidade(db, ITAIM, janela);

console.log("=".repeat(60));
console.log(`REPORT — ${report.unidade} (id ${report.id_unidade})`);
console.log(`janela: realizados=${janela.refIso} | extração=${janela.extracaoHoje}`);
console.log("=".repeat(60));
console.log(JSON.stringify(report, null, 2));
console.log("\n" + "-".repeat(60));
console.log("DIAGNÓSTICOS");
console.log("-".repeat(60));
console.log(JSON.stringify(diagnostics, null, 2));

// I/O: grava o payload do dia (entrada do POST ao Power Automate).
const saidaDir = path.join(RAIZ, "data", "out");
fs.mkdirSync(saidaDir, { recursive: true });
const saida = path.join(saidaDir, `report_${janela.refIso}_u${report.id_unidade}.json`);
fs.writeFileSync(saida, JSON.stringify(report, null, 2), "utf8");
console.log(`\n[out] payload gravado em ${path.relative(RAIZ, saida)}`);

if (persistir) {
  const { acao } = upsertRelatorioDiario(db, janela.refIso, report);
  console.log(`[store] relatorios_diarios: registro ${acao} (${janela.refIso}, u${report.id_unidade})`);
}

db.close();
