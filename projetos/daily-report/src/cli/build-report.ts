import path from "node:path";
import { fileURLToPath } from "node:url";
import { ITAIM } from "../config.js";
import { computeUnidade } from "../kpis/computeUnidade.js";
import { upsertRegistro } from "../store/history.js";

/**
 * CLI de teste: roda o pipeline sobre a pasta de amostras e imprime o objeto
 * do schema + diagnósticos. Uso:
 *   npm run report                 (usa data/sample_data e as datas da amostra)
 *   npm run report -- <pasta> <refIso> <mapaAlvoIso>
 *   npm run report -- --persist    (também grava no histórico JSONL)
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(__dirname, "../..");

const args = process.argv.slice(2);
const persistir = args.includes("--persist");
const [pastaArg, refArg, alvoArg] = args.filter((a) => !a.startsWith("--"));

const pastaDados = pastaArg
  ? path.resolve(process.cwd(), pastaArg)
  : path.join(RAIZ, "data", "sample_data");

// Amostra: extração feita em 17/07; realizados = D-1 (16/07); mapa = D+1 (18/07).
const janela = {
  refIso: refArg ?? "2026-07-16",
  mapaAlvoIso: alvoArg ?? "2026-07-18",
};

const { report, diagnostics } = computeUnidade(pastaDados, ITAIM, janela);

console.log("=".repeat(60));
console.log(`REPORT — ${report.unidade} (id ${report.id_unidade})`);
console.log(`janela: realizados=${janela.refIso} | mapa=${janela.mapaAlvoIso}`);
console.log("=".repeat(60));
console.log(JSON.stringify(report, null, 2));
console.log("\n" + "-".repeat(60));
console.log("DIAGNÓSTICOS");
console.log("-".repeat(60));
console.log(JSON.stringify(diagnostics, null, 2));

if (persistir) {
  const arquivo = path.join(RAIZ, "data", "history", "daily_report.jsonl");
  const { acao, total } = upsertRegistro(arquivo, janela.refIso, report);
  console.log(
    `\n[store] registro ${acao} em ${path.relative(RAIZ, arquivo)} (total: ${total} unidade-dia)`,
  );
}
