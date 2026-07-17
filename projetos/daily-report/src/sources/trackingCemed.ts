import { parseTasyTsv } from "../io/tsv.js";
import { dataIsoBr } from "../io/dates.js";

/**
 * Relatório 3523 — Tracking CEMED (ambulatório/centro médico).
 * 1 linha por atendimento. KPI: `atendimentos_cemed` = atendimentos distintos
 * no dia de referência (D-1), por `Data Entrada`.
 */

const COL_ATEND = "Atendimento";
const COL_DATA = "Data Entrada";

export interface KpisCemed {
  atendimentos_cemed: number;
  _diag: { linhas_brutas: number; distintos: number; datas: Record<string, number> };
}

export function calcularKpisCemed(caminho: string, refIso: string): KpisCemed {
  const linhas = parseTasyTsv(caminho);
  const datas: Record<string, number> = {};
  const distintos = new Set<string>();

  for (const l of linhas) {
    const dia = dataIsoBr(l[COL_DATA]);
    datas[dia ?? "(sem data)"] = (datas[dia ?? "(sem data)"] ?? 0) + 1;
    if (dia !== refIso) continue;
    const nr = (l[COL_ATEND] ?? "").trim();
    if (nr) distintos.add(nr);
  }

  return {
    atendimentos_cemed: distintos.size,
    _diag: { linhas_brutas: linhas.length, distintos: distintos.size, datas },
  };
}
