import { txt, type LinhaTasy } from "../io/json.js";
import { parseDataHoraBr } from "../io/dates.js";
import {
  LEITOS_INTERNACAO,
  LEITOS_UTI,
  GRUPO_INTERNACAO,
  GRUPO_UTI,
  grupoDoSetor,
} from "../ref/setores.js";
import { taxa } from "../types.js";

/**
 * Relatório 5079 — Censo Retroativo. 1 linha por SEGMENTO de ocupação de leito
 * (um paciente pode ter vários segmentos ao longo da internação), com entrada e
 * saída do leito. Usado no BACKFILL para reconstruir a ocupação histórica —
 * substitui o snapshot OCUPACAO, que só existe para o dia da extração.
 *
 * Ocupação de um dia D (decisão com o líder, 2026-07-22): **corte às 06:00**.
 * Um segmento conta se ocupava o leito nesse instante:
 *   entrada_no_leito ≤ D06:00  E  (saída_do_leito vazia OU saída_do_leito > D06:00).
 * Assim, quem teve alta às 07:00 ainda conta como ocupação daquele dia.
 *
 * Datas do censo vêm em formato BR (`dd/mm/aaaa HH:MM:SS`) → `parseDataHoraBr`.
 * Classificação UNI/UTI pela tabela curada de setores (`grupoDoSetor`); setores
 * fora da tabela (outra unidade/descontinuados) são ignorados. Deduplica por
 * `Atendimento` dentro de cada grupo (pac-dia = pacientes, não segmentos).
 */

const COL_ATENDIMENTO = "Atendimento";
const COL_SETOR = "Setor";
const COL_ENTRADA_LEITO = "Entrada no leito";
const COL_SAIDA_LEITO = "Saída do leito";

export interface KpisOcupacaoCenso {
  pac_dia_uni: number | null;
  leitos_uni: number;
  tx_ocupacao_uni: number | null;
  pac_dia_uti: number | null;
  leitos_uti: number;
  tx_ocupacao_uti: number | null;
  _diag: {
    segmentos_ativos: number;
    setores_ignorados: Record<string, number>;
  };
}

/** Corte às 06:00 (hora local) do dia `aaaa-mm-dd`. */
function corte6h(diaIso: string): Date {
  const [y, m, d] = diaIso.split("-").map(Number);
  return new Date(y!, m! - 1, d!, 6, 0, 0);
}

export function calcularOcupacaoCenso(
  registros: LinhaTasy[],
  diaIso: string,
): KpisOcupacaoCenso {
  const corte = corte6h(diaIso).getTime();
  const uni = new Set<string>();
  const uti = new Set<string>();
  const ignorados: Record<string, number> = {};
  let ativos = 0;

  for (const r of registros) {
    const entrada = parseDataHoraBr(txt(r[COL_ENTRADA_LEITO]));
    if (!entrada || entrada.getTime() > corte) continue;

    const saidaRaw = txt(r[COL_SAIDA_LEITO]);
    if (saidaRaw !== "") {
      const saida = parseDataHoraBr(saidaRaw);
      // saída válida e ≤ corte → já havia deixado o leito às 6h.
      if (saida && saida.getTime() <= corte) continue;
    }

    ativos++;
    const grupo = grupoDoSetor(txt(r[COL_SETOR]));
    const atend = txt(r[COL_ATENDIMENTO]);
    if (grupo === GRUPO_INTERNACAO) uni.add(atend);
    else if (grupo === GRUPO_UTI) uti.add(atend);
    else {
      const setor = txt(r[COL_SETOR]) || "(sem setor)";
      ignorados[setor] = (ignorados[setor] ?? 0) + 1;
    }
  }

  return {
    pac_dia_uni: uni.size,
    leitos_uni: LEITOS_INTERNACAO,
    tx_ocupacao_uni: taxa(uni.size, LEITOS_INTERNACAO),
    pac_dia_uti: uti.size,
    leitos_uti: LEITOS_UTI,
    tx_ocupacao_uti: taxa(uti.size, LEITOS_UTI),
    _diag: { segmentos_ativos: ativos, setores_ignorados: ignorados },
  };
}
