import { parseTasyTsv } from "../io/tsv.js";
import { dataIsoBr } from "../io/dates.js";

/**
 * Relatório 4317 — Gestão de Exames.
 * 1 linha por exame. NÃO há campo correspondente no `daily_report_schema.json`
 * atual — mantido como fonte suplementar/diagnóstica (volume de exames por dia,
 * por tipo de atendimento). Útil quando o schema evoluir para incluir SADT.
 */

const COL_DT_EXEC = "Dt execucao";
const COL_TIPO = "Tipo de atendimento";

export interface KpisExames {
  exames_no_dia: number;
  _diag: {
    linhas_brutas: number;
    por_tipo_atendimento: Record<string, number>;
    datas: Record<string, number>;
  };
}

export function calcularKpisExames(caminho: string, refIso: string): KpisExames {
  const linhas = parseTasyTsv(caminho);
  const datas: Record<string, number> = {};
  const porTipo: Record<string, number> = {};
  let noDia = 0;

  for (const l of linhas) {
    const dia = dataIsoBr(l[COL_DT_EXEC]);
    datas[dia ?? "(sem data)"] = (datas[dia ?? "(sem data)"] ?? 0) + 1;
    if (dia !== refIso) continue;
    noDia++;
    const tipo = (l[COL_TIPO] ?? "(sem tipo)").trim() || "(sem tipo)";
    porTipo[tipo] = (porTipo[tipo] ?? 0) + 1;
  }

  return {
    exames_no_dia: noDia,
    _diag: { linhas_brutas: linhas.length, por_tipo_atendimento: porTipo, datas },
  };
}
