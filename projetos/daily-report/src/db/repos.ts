import type { Db } from "./conn.js";
import type { LinhaTasy } from "../io/json.js";
import type { UnidadeReport } from "../types.js";

/**
 * Consultas ao banco. É a única camada que fala SQL — os sources recebem os
 * registros já materializados (funções puras) e o forecast lê o histórico
 * computado. Volume diário é pequeno, então buscamos os registros de uma
 * extração inteira e filtramos por data em JS (mantém a lógica dos sources).
 */

/**
 * Registros brutos de uma extração específica (relatório × unidade × dia de
 * extração). Vazio se a extração não existe (ex.: mapa de D-1 ainda não carregado).
 */
export function registrosDaExtracao(
  db: Db,
  relatorio: string,
  idUnidade: number,
  dataExtracao: string,
): LinhaTasy[] {
  const linhas = db
    .prepare(
      `SELECT dados FROM registros
        WHERE relatorio = ? AND id_unidade = ? AND data_extracao = ?`,
    )
    .all(relatorio, idUnidade, dataExtracao) as { dados: string }[];
  return linhas.map((r) => JSON.parse(r.dados) as LinhaTasy);
}

/** 0=domingo .. 6=sábado. Componentes locais, sem conversão de fuso. */
export function diaSemanaDe(dataIso: string): number {
  return new Date(`${dataIso}T00:00:00`).getDay();
}

export interface RegistroDiario {
  data: string;
  id_unidade: number;
  dia_semana: number;
  kpis: UnidadeReport;
  capturado_em: string;
}

/**
 * Insere ou atualiza os KPIs de uma unidade-dia (camada de serving / fonte do
 * forecast). Idempotente por (data, id_unidade).
 */
export function upsertRelatorioDiario(
  db: Db,
  data: string,
  report: UnidadeReport,
): { acao: "inserido" | "atualizado" } {
  const existe = db
    .prepare(`SELECT 1 FROM relatorios_diarios WHERE data = ? AND id_unidade = ?`)
    .get(data, report.id_unidade);

  db.prepare(
    `INSERT INTO relatorios_diarios (data, id_unidade, dia_semana, kpis, capturado_em)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (data, id_unidade) DO UPDATE SET
       dia_semana = excluded.dia_semana,
       kpis = excluded.kpis,
       capturado_em = excluded.capturado_em`,
  ).run(
    data,
    report.id_unidade,
    diaSemanaDe(data),
    JSON.stringify(report),
    new Date().toISOString(),
  );

  return { acao: existe ? "atualizado" : "inserido" };
}

/**
 * Últimas `limite` ocorrências do MESMO dia-da-semana, anteriores a `antesDe`,
 * para uma unidade. Base da mediana do forecast. Mais recente primeiro.
 */
export function historicoMesmoDiaSemana(
  db: Db,
  idUnidade: number,
  diaSemana: number,
  antesDe: string,
  limite: number,
): UnidadeReport[] {
  const linhas = db
    .prepare(
      `SELECT kpis FROM relatorios_diarios
        WHERE id_unidade = ? AND dia_semana = ? AND data < ?
        ORDER BY data DESC
        LIMIT ?`,
    )
    .all(idUnidade, diaSemana, antesDe, limite) as { kpis: string }[];
  return linhas.map((r) => JSON.parse(r.kpis) as UnidadeReport);
}
