import type { UnidadeReport } from "../types.js";

/**
 * Peso e agrupamento de cada KPI para o ranking de `destaques` do payload.
 *
 * A ordenação veio da liderança do DTIS (2026-07-22):
 *   cirurgias > ocupação UTI > RM+EDA > ocupação UNI > PS > CEMED > resto.
 *
 * O `grupo` existe para deduplicar o ranking: `cirurgias` e `cirurgias_eletivas`
 * contam a MESMA história, então só o de maior score representa o grupo. Sem
 * isso, o topo do relatório vira quatro variações do mesmo assunto.
 */

export type CampoComparado = Extract<
  keyof UnidadeReport,
  | "cirurgias"
  | "cirurgias_eletivas"
  | "cirurgias_urgencia"
  | "tx_confirmacao_agenda_cirurgica"
  | "pac_dia_uni"
  | "tx_ocupacao_uni"
  | "pac_dia_uti"
  | "tx_ocupacao_uti"
  | "atendimentos_ps"
  | "internacoes_ps"
  | "tx_internacao"
  | "atendimentos_cemed"
  | "tx_confirmacao_agenda_cemed"
  | "exames_eda"
  | "exames_usg"
  | "exames_cardio"
  | "exames_tc"
  | "exames_rm"
>;

export type Grupo = "cirurgia" | "uti" | "internacao" | "ps" | "cemed" | "exames";

export interface PesoKpi {
  peso: number;
  grupo: Grupo;
}

export const PESOS: Record<CampoComparado, PesoKpi> = {
  cirurgias: { peso: 10, grupo: "cirurgia" },
  cirurgias_eletivas: { peso: 10, grupo: "cirurgia" },
  tx_confirmacao_agenda_cirurgica: { peso: 9, grupo: "cirurgia" },
  cirurgias_urgencia: { peso: 8, grupo: "cirurgia" },

  tx_ocupacao_uti: { peso: 9, grupo: "uti" },
  pac_dia_uti: { peso: 9, grupo: "uti" },

  exames_rm: { peso: 8, grupo: "exames" },
  exames_eda: { peso: 8, grupo: "exames" },

  tx_ocupacao_uni: { peso: 7, grupo: "internacao" },
  pac_dia_uni: { peso: 7, grupo: "internacao" },

  atendimentos_ps: { peso: 6, grupo: "ps" },
  internacoes_ps: { peso: 6, grupo: "ps" },
  tx_internacao: { peso: 6, grupo: "ps" },

  atendimentos_cemed: { peso: 5, grupo: "cemed" },
  tx_confirmacao_agenda_cemed: { peso: 5, grupo: "cemed" },

  exames_tc: { peso: 3, grupo: "exames" },
  exames_usg: { peso: 3, grupo: "exames" },
  exames_cardio: { peso: 3, grupo: "exames" },
};

export const CAMPOS_COMPARADOS = Object.keys(PESOS) as CampoComparado[];

/** Campos que são fração decimal (0.87 = 87%) — delta em p.p., nunca em %. */
export const CAMPOS_TAXA = new Set<CampoComparado>([
  "tx_ocupacao_uni",
  "tx_ocupacao_uti",
  "tx_internacao",
  "tx_confirmacao_agenda_cirurgica",
  "tx_confirmacao_agenda_cemed",
]);
