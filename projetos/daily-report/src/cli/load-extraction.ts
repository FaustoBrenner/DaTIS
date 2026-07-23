import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { abrirDb } from "../db/conn.js";
import { carregarExtracao } from "../db/load.js";
import { parseTasyJson, type LinhaTasy } from "../io/json.js";
import { ITAIM } from "../config.js";
import { RELATORIOS } from "../kpis/computeUnidade.js";

/**
 * Rotina de CARGA (rotina de extração agendada): lê os JSON de uma pasta de
 * extração e carrega no banco, preservando todas as colunas. Idempotente por
 * (relatorio, unidade, data_extracao).
 *
 * Uso:
 *   npm run load -- <pasta> [--data-extracao aaaa-mm-dd] [--unidade 14] [--db <arquivo>]
 * Sem --data-extracao, usa a data de hoje.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(__dirname, "../..");

/**
 * Arquivo de cada relatório na pasta de extração (padrão da nova extração,
 * 2026-07-23). A ocupação tem sufixo variável (estab + data), então é resolvida
 * por PREFIXO em `resolverArquivo`, não por nome fixo.
 */
const ARQUIVOS: Record<string, string> = {
  [RELATORIOS.ps]: "2432_PS.json",
  [RELATORIOS.cirurgias]: "3136_CIR_REALIZADAS.json",
  [RELATORIOS.cemed]: "3523_CEMED.json",
  [RELATORIOS.exames]: "4317_GESTAO_EXAMES.json",
  [RELATORIOS.agendaCir]: "2070_AGENDA_CIR.json",
  [RELATORIOS.ocupacao]: "OCUPACAO",
};

/**
 * Resolve o caminho do arquivo de um relatório na pasta. Ocupação vem com nome
 * variável (`OCUPACAO_ESTAB14_<data>.json`), então casa por prefixo `OCUPACAO`;
 * os demais têm nome fixo.
 */
function resolverArquivo(pasta: string, relatorio: string, nome: string): string | undefined {
  if (relatorio === RELATORIOS.ocupacao) {
    const achado = fs
      .readdirSync(pasta)
      .find((f) => f.startsWith("OCUPACAO") && f.toLowerCase().endsWith(".json"));
    return achado ? path.join(pasta, achado) : undefined;
  }
  const caminho = path.join(pasta, nome);
  return fs.existsSync(caminho) ? caminho : undefined;
}

function opt(args: string[], nome: string): string | undefined {
  const i = args.indexOf(nome);
  return i >= 0 ? args[i + 1] : undefined;
}

function hojeIso(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Lê os registros de um relatório. Ocupação tem estrutura aninhada própria. */
function lerRegistros(relatorio: string, caminho: string): LinhaTasy[] {
  if (relatorio === RELATORIOS.ocupacao) {
    const doc = JSON.parse(fs.readFileSync(caminho, "utf8"));
    // Envelope novo: `doc.rows`; legado: `doc.dados.linhasResultSet`.
    return (doc?.rows ?? doc?.dados?.linhasResultSet ?? []) as LinhaTasy[];
  }
  return parseTasyJson(caminho);
}

const args = process.argv.slice(2);
const pastaArg = args.filter((a) => !a.startsWith("--"))[0];
if (!pastaArg) {
  console.error("Uso: npm run load -- <pasta> [--data-extracao aaaa-mm-dd] [--unidade 14]");
  process.exit(1);
}

const pasta = path.resolve(process.cwd(), pastaArg);
const dataExtracao = opt(args, "--data-extracao") ?? hojeIso();
const idUnidade = Number(opt(args, "--unidade") ?? ITAIM.id_unidade);
const dbPath = opt(args, "--db") ?? path.join(RAIZ, "data", "db", "daily_report.sqlite");

const db = abrirDb(dbPath);

console.log(`[load] pasta=${pasta}`);
console.log(`[load] data_extracao=${dataExtracao} | unidade=${idUnidade} | db=${path.relative(RAIZ, dbPath)}`);
console.log("-".repeat(60));

let total = 0;
for (const [relatorio, arquivo] of Object.entries(ARQUIVOS)) {
  const caminho = resolverArquivo(pasta, relatorio, arquivo);
  if (!caminho) {
    console.warn(`  [skip] ${arquivo} — não encontrado`);
    continue;
  }
  const registros = lerRegistros(relatorio, caminho);
  const r = carregarExtracao(db, {
    relatorio,
    idUnidade,
    dataExtracao,
    arquivo: path.basename(caminho),
    registros,
  });
  total += r.linhas;
  console.log(
    `  [${r.substituiu ? "substituído" : "inserido"}] ${relatorio} (${arquivo}): ${r.linhas} registros`,
  );
}

console.log("-".repeat(60));
console.log(`[load] concluído: ${total} registros carregados.`);
db.close();
