import type { Db } from "../db/conn.js";
import { historicoMesmoDiaSemana, diaSemanaDe } from "../db/repos.js";
import type { UnidadeReport } from "../types.js";

/**
 * Forecast determinístico (ARQUITETURA.md, decisão #6/#9): a IA não projeta —
 * o forecast é a **mediana do mesmo dia-da-semana nas últimas N semanas** (N=10,
 * decisão de 2026-07-22, que substitui a nota antiga de "SMA 10 semanas").
 *
 * Campos com forecast por mediana: pac_dia_uni/uti, atendimentos_ps/cemed e os
 * cinco exames_*. `cirurgias_frcst` NÃO usa mediana — vem da contagem do mapa
 * cirúrgico extraído hoje (tratado em computeUnidade).
 */

/** Campos do report projetados por mediana do dia-da-semana. */
export const CAMPOS_FRCST = [
  "pac_dia_uni",
  "pac_dia_uti",
  "atendimentos_ps",
  "atendimentos_cemed",
  "exames_eda",
  "exames_usg",
  "exames_cardio",
  "exames_tc",
  "exames_rm",
] as const satisfies readonly (keyof UnidadeReport)[];

export type CampoFrcst = (typeof CAMPOS_FRCST)[number];

/** Mediana de uma lista de números (já sem nulls). Vazio → null. */
function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const ord = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ord.length / 2);
  const m =
    ord.length % 2 === 0 ? (ord[meio - 1]! + ord[meio]!) / 2 : ord[meio]!;
  return Math.round(m * 100) / 100;
}

export interface Forecasts {
  valores: Record<CampoFrcst, number | null>;
  /** Nº de pontos históricos usados por campo (para diagnóstico/transparência). */
  _diag: { dia_semana: number; n_por_campo: Record<CampoFrcst, number> };
}

/**
 * Calcula os forecasts por mediana para `refIso` (o dia previsto), lendo o
 * histórico de `relatorios_diarios`. Retorna null por campo enquanto não houver
 * histórico suficiente (ex.: antes do backfill) — comportamento esperado.
 *
 * @param refIso dia a projetar (aaaa-mm-dd); usa as ocorrências ANTERIORES do
 *               mesmo dia-da-semana.
 * @param janelas quantas semanas olhar para trás (default 10).
 */
export function calcularForecasts(
  db: Db,
  idUnidade: number,
  refIso: string,
  janelas = 10,
): Forecasts {
  const diaSemana = diaSemanaDe(refIso);
  const historico = historicoMesmoDiaSemana(db, idUnidade, diaSemana, refIso, janelas);

  const valores = {} as Record<CampoFrcst, number | null>;
  const nPorCampo = {} as Record<CampoFrcst, number>;

  for (const campo of CAMPOS_FRCST) {
    const pontos = historico
      .map((h) => h[campo])
      .filter((v): v is number => typeof v === "number");
    valores[campo] = mediana(pontos);
    nPorCampo[campo] = pontos.length;
  }

  return { valores, _diag: { dia_semana: diaSemana, n_por_campo: nPorCampo } };
}
