import { parseTasyTsv } from "../io/tsv.js";
import { dataIsoBr } from "../io/dates.js";

/**
 * Relatório 4718 — Mapa Cirúrgico (agenda de cirurgias).
 * 1 linha por cirurgia AGENDADA. KPI: `cirurgias_previstas` = cirurgias
 * agendadas para o dia-alvo, por `Dt cirurgia`.
 *
 * Atenção temporal: na amostra o mapa é de D+1 (18/07), enquanto as cirurgias
 * realizadas são de D-1 (16/07). Logo `tx_confirmacao_agenda_cirurgica`
 * (realizadas ÷ previstas do MESMO dia) NÃO é calculável com esta amostra —
 * exige mapa e realizadas do mesmo dia de referência.
 */

const COL_RESERVA = "Nr reserva";
const COL_DT_CIRURGIA = "Dt cirurgia";

export interface KpisMapaCir {
  cirurgias_previstas: number;
  _diag: { linhas_brutas: number; no_dia_alvo: number; datas: Record<string, number> };
}

export function calcularKpisMapaCir(caminho: string, alvoIso: string): KpisMapaCir {
  const linhas = parseTasyTsv(caminho);
  const datas: Record<string, number> = {};
  const distintas = new Set<string>();

  for (const l of linhas) {
    const dia = dataIsoBr(l[COL_DT_CIRURGIA]);
    datas[dia ?? "(sem data)"] = (datas[dia ?? "(sem data)"] ?? 0) + 1;
    if (dia !== alvoIso) continue;
    const nr = (l[COL_RESERVA] ?? "").trim();
    if (nr) distintas.add(nr);
  }

  return {
    cirurgias_previstas: distintas.size,
    _diag: { linhas_brutas: linhas.length, no_dia_alvo: distintas.size, datas },
  };
}
