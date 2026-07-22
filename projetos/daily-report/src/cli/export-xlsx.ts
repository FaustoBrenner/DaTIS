import path from "node:path";
import { fileURLToPath } from "node:url";
import ExcelJS from "exceljs";
import { abrirDb } from "../db/conn.js";
import type { UnidadeReport } from "../types.js";

/**
 * Exporta a tabela `relatorios_diarios` (histórico de KPIs, 1 linha por
 * unidade-dia) para um arquivo .xlsx — visão tabular para input em outra
 * ferramenta. Só KPIs agregados, sem PHI.
 *
 * Uso:
 *   npm run export                       (data/out/indicadores_diarios.xlsx)
 *   npm run export -- --out <arquivo> [--db <arquivo>]
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(__dirname, "../..");

function opt(args: string[], nome: string): string | undefined {
  const i = args.indexOf(nome);
  return i >= 0 ? args[i + 1] : undefined;
}

const DOW = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

const args = process.argv.slice(2);
const dbPath = opt(args, "--db") ?? path.join(RAIZ, "data", "db", "daily_report.sqlite");
const outPath = opt(args, "--out") ?? path.join(RAIZ, "data", "out", "indicadores_diarios.xlsx");

const db = abrirDb(dbPath);
const linhas = db
  .prepare("SELECT data, dia_semana, kpis, capturado_em FROM relatorios_diarios ORDER BY data, id_unidade")
  .all() as { data: string; dia_semana: number; kpis: string; capturado_em: string }[];

if (linhas.length === 0) {
  console.error("[export] relatorios_diarios está vazia — rode o backfill/report primeiro.");
  process.exit(1);
}

// Ordem de colunas = ordem dos campos do schema (como gravado em kpis).
const camposKpi = Object.keys(JSON.parse(linhas[0]!.kpis) as UnidadeReport);

const wb = new ExcelJS.Workbook();
wb.creator = "DTIS · daily-report";
wb.created = new Date();
const ws = wb.addWorksheet("indicadores", { views: [{ state: "frozen", xSplit: 1, ySplit: 1 }] });

ws.columns = [
  { header: "data", key: "data", width: 12 },
  { header: "dia_semana", key: "dia_semana", width: 6 },
  { header: "dia_semana_nome", key: "dia_semana_nome", width: 12 },
  ...camposKpi.map((k) => ({
    header: k,
    key: k,
    width: Math.max(12, k.length + 2),
    style: k.startsWith("tx_") ? { numFmt: "0.0%" } : {},
  })),
  { header: "capturado_em", key: "capturado_em", width: 22 },
];

for (const l of linhas) {
  const kpis = JSON.parse(l.kpis) as Record<string, unknown>;
  ws.addRow({
    data: l.data,
    dia_semana: l.dia_semana,
    dia_semana_nome: DOW[l.dia_semana] ?? "",
    ...kpis,
    capturado_em: l.capturado_em,
  });
}

// Cabeçalho em negrito.
ws.getRow(1).font = { bold: true };
ws.getRow(1).alignment = { vertical: "middle" };

await wb.xlsx.writeFile(outPath);
db.close();

console.log(`[export] ${linhas.length} linhas × ${ws.columnCount} colunas`);
console.log(`[export] arquivo: ${path.relative(RAIZ, outPath)}`);
