import { txt, type LinhaTasy } from "../io/json.js";
import { dataIso } from "../io/dates.js";

/**
 * Relatório 4718 — Mapa Cirúrgico (agenda de cirurgias).
 * 1 linha por cirurgia AGENDADA. Conta cirurgias agendadas para o dia-alvo,
 * por `Dt cirurgia`.
 *
 * Modelo temporal (decisão de 2026-07-20): o mapa é extraído no dia corrente
 * (D-0) e lista as cirurgias agendadas para D-0. Esse número é o forecast de
 * cirurgias de hoje (`cirurgias_frcst`). No relatório do dia seguinte, o mesmo
 * número — persistido no histórico — reaparece como `cirurgias_previstas` de
 * D-1, e `tx_confirmacao_agenda_cirurgica` = realizadas(D-1) ÷ esse previsto.
 * Logo `cirurgias_previstas` vem do STORE (frcst de ontem), não desta extração.
 */

const COL_RESERVA = "Nr reserva";
const COL_DT_CIRURGIA = "Dt cirurgia";

export interface KpisMapaCir {
  cirurgias_previstas: number;
  _diag: { linhas_brutas: number; no_dia_alvo: number; datas: Record<string, number> };
}

export function calcularKpisMapaCir(linhas: LinhaTasy[], alvoIso: string): KpisMapaCir {
  const datas: Record<string, number> = {};
  const distintas = new Set<string>();

  for (const l of linhas) {
    const dia = dataIso(l[COL_DT_CIRURGIA]);
    datas[dia ?? "(sem data)"] = (datas[dia ?? "(sem data)"] ?? 0) + 1;
    if (dia !== alvoIso) continue;
    const nr = txt(l[COL_RESERVA]);
    if (nr) distintas.add(nr);
  }

  return {
    cirurgias_previstas: distintas.size,
    _diag: { linhas_brutas: linhas.length, no_dia_alvo: distintas.size, datas },
  };
}
