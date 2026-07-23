import { txt, type LinhaTasy } from "../io/json.js";
import { dataIso } from "../io/dates.js";
import { bucketCarater } from "./cirurgias.js";

/**
 * Relatório 2070 — "RDSL - Relatório Sintético Agenda Cirúrgica".
 * Substitui o 4718 (Mapa Cirúrgico) como fonte das cirurgias projetadas para o
 * dia (decisão com o líder, 2026-07-23). 1 linha por reserva agendada.
 *
 * Regra de negócio: cirurgias projetadas = contagem de reservas DISTINTAS
 * (`Nº Reserva`) com `Carater Cirurgia` = Eletiva na data-alvo (`Data`). Não se
 * filtra por `Status` — é uma agenda/forecast, todas as eletivas contam.
 *
 * Modelo temporal (herdado do fluxo do mapa): o 2070 é extraído no dia corrente
 * (D-0) e lista a agenda de D-0. Esse número é o forecast de cirurgias de hoje
 * (`cirurgias_frcst`). No relatório do dia seguinte, o mesmo número — persistido
 * no histórico — reaparece como `cirurgias_previstas` de D-1, e
 * `tx_confirmacao_agenda_cirurgica` = eletivas realizadas(D-1) ÷ esse previsto.
 *
 * A interface espelha `KpisMapaCir` (`cirurgias_previstas`) para drop-in em
 * `computeUnidade`.
 */

const COL_RESERVA = "Nº Reserva";
const COL_DATA = "Data";
const COL_CARATER = "Carater Cirurgia";

export interface KpisAgendaCir {
  cirurgias_previstas: number;
  _diag: {
    linhas_brutas: number;
    no_dia_alvo: number;
    por_carater: Record<string, number>;
    datas: Record<string, number>;
  };
}

export function calcularKpisAgendaCir(linhas: LinhaTasy[], alvoIso: string): KpisAgendaCir {
  const datas: Record<string, number> = {};
  const porCarater: Record<string, number> = {};
  const eletivas = new Set<string>();

  for (const l of linhas) {
    const dia = dataIso(l[COL_DATA]);
    datas[dia ?? "(sem data)"] = (datas[dia ?? "(sem data)"] ?? 0) + 1;
    if (dia !== alvoIso) continue;

    const carater = txt(l[COL_CARATER]) || "(sem carater)";
    porCarater[carater] = (porCarater[carater] ?? 0) + 1;

    if (bucketCarater(carater) !== "eletiva") continue;
    const nr = txt(l[COL_RESERVA]);
    // Sem número de reserva, cai numa chave por linha para não subcontar.
    eletivas.add(nr || `linha:${JSON.stringify(l).slice(0, 20)}`);
  }

  return {
    cirurgias_previstas: eletivas.size,
    _diag: {
      linhas_brutas: linhas.length,
      no_dia_alvo: eletivas.size,
      por_carater: porCarater,
      datas,
    },
  };
}
