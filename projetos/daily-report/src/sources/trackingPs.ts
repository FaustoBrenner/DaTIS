import { txt, type LinhaTasy } from "../io/json.js";
import { dataIso } from "../io/dates.js";

/**
 * Relatório 2432 — Tracking PS (Pronto Socorro).
 * 1 linha por atendimento de PS, com tempos de cada etapa do fluxo.
 *
 * KPIs (spec do líder):
 *  - atendimentos_ps : contagem de atendimentos distintos com entrada no dia-ref.
 *                      Sem filtro de outlier por ora — todas as linhas com
 *                      `Nr atendimento` numérico contam (decisão de 2026-07-20).
 *  - internacoes_ps  : atendimentos com data de alocação em leito (`Dt aloc leito`).
 *  - tx_internacao   : internacoes_ps / atendimentos_ps.
 */

const COL_ATEND = "Nr atendimento";
const COL_ENTRADA = "Dt entrada";
const COL_ALOC_LEITO = "Dt aloc leito";

export interface KpisPs {
  atendimentos_ps: number;
  internacoes_ps: number;
  /** Diagnóstico da filtragem — para calibrar a regra de outlier com a operação. */
  _diag: {
    linhas_brutas: number;
    atendimentos_distintos: number;
    sem_nr_atendimento: number;
    fora_do_dia_ref: number;
    considerados: number;
    internacoes: number;
    datas_entrada: Record<string, number>;
  };
}

/**
 * @param refIso dia de referência (`aaaa-mm-dd`), tipicamente D-1.
 *
 * Regra de contagem (transparente; sem filtro de outlier por ora):
 *  - descarta linhas sem `Nr atendimento` numérico;
 *  - deduplica por `Nr atendimento`;
 *  - mantém apenas atendimentos cuja `Dt entrada` cai no dia de referência.
 * O bloco `_diag` reporta o descartado, para a operação decidir depois se
 * algum filtro de outlier (ex.: tempos absurdos) será adotado.
 */
export function calcularKpisPs(linhas: LinhaTasy[], refIso: string): KpisPs {
  const datasEntrada: Record<string, number> = {};
  const distintos = new Set<string>();
  const internados = new Set<string>();
  let semNr = 0;
  let foraDoDia = 0;

  for (const l of linhas) {
    const nr = txt(l[COL_ATEND]);
    if (!/^\d+$/.test(nr)) {
      semNr++;
      continue;
    }

    const diaEntrada = dataIso(l[COL_ENTRADA]);
    datasEntrada[diaEntrada ?? "(sem data)"] =
      (datasEntrada[diaEntrada ?? "(sem data)"] ?? 0) + 1;

    if (diaEntrada !== refIso) {
      foraDoDia++;
      continue;
    }

    distintos.add(nr);
    if (txt(l[COL_ALOC_LEITO]) !== "") internados.add(nr);
  }

  return {
    atendimentos_ps: distintos.size,
    internacoes_ps: internados.size,
    _diag: {
      linhas_brutas: linhas.length,
      atendimentos_distintos: distintos.size,
      sem_nr_atendimento: semNr,
      fora_do_dia_ref: foraDoDia,
      considerados: distintos.size,
      internacoes: internados.size,
      datas_entrada: datasEntrada,
    },
  };
}
