import { parseTasyTsv } from "../io/tsv.js";
import { dataIsoBr } from "../io/dates.js";

/**
 * Relatório 3136 — Cirurgias Realizadas.
 * 1 linha por cirurgia realizada. KPI: `cirurgias` = contagem de cirurgias
 * realizadas no dia de referência (D-1), por `Dt cirurgia`.
 *
 * Nota: uma cirurgia pode ter procedimentos adicionais (coluna própria); a
 * contagem é por evento cirúrgico (`Nr cirurgia`), não por procedimento.
 */

const COL_NR_CIRURGIA = "Nr cirurgia";
const COL_DT_CIRURGIA = "Dt cirurgia";

export interface KpisCirurgias {
  cirurgias: number;
  _diag: { linhas_brutas: number; no_dia_ref: number; datas: Record<string, number> };
}

export function calcularKpisCirurgias(caminho: string, refIso: string): KpisCirurgias {
  const linhas = parseTasyTsv(caminho);
  const datas: Record<string, number> = {};
  const distintas = new Set<string>();

  for (const l of linhas) {
    const dia = dataIsoBr(l[COL_DT_CIRURGIA]);
    datas[dia ?? "(sem data)"] = (datas[dia ?? "(sem data)"] ?? 0) + 1;
    if (dia !== refIso) continue;
    const nr = (l[COL_NR_CIRURGIA] ?? "").trim();
    distintas.add(nr || `linha:${JSON.stringify(l).slice(0, 20)}`);
  }

  return {
    cirurgias: distintas.size,
    _diag: { linhas_brutas: linhas.length, no_dia_ref: distintas.size, datas },
  };
}
