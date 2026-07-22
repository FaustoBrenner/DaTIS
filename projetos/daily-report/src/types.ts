import { z } from "zod";

/**
 * Contrato de KPIs de UMA unidade — espelha `daily_report_schema.json`.
 * Campos numéricos são nullable: `null` significa "não foi possível derivar
 * com os dados disponíveis" (ex.: forecast sem histórico, taxa sem agenda).
 */
export const numOuNull = z.number().nullable();

export const unidadeReportSchema = z.object({
  unidade: z.string(),
  id_unidade: z.number().int(),

  cirurgias: numOuNull,
  cirurgias_eletivas: numOuNull,
  cirurgias_urgencia: numOuNull,
  cirurgias_previstas: numOuNull,
  tx_confirmacao_agenda_cirurgica: numOuNull,

  pac_dia_uni: numOuNull,
  leitos_uni: numOuNull,
  tx_ocupacao_uni: numOuNull,

  pac_dia_uti: numOuNull,
  leitos_uti: numOuNull,
  tx_ocupacao_uti: numOuNull,

  atendimentos_ps: numOuNull,
  internacoes_ps: numOuNull,
  tx_internacao: numOuNull,

  atendimentos_cemed: numOuNull,
  atendimentos_cemed_previstos: numOuNull,
  tx_confirmacao_agenda_cemed: numOuNull,

  exames_eda: numOuNull,
  exames_usg: numOuNull,
  exames_cardio: numOuNull,
  exames_tc: numOuNull,
  exames_rm: numOuNull,

  exames_eda_previstos: numOuNull,
  exames_usg_previstos: numOuNull,
  exames_cardio_previstos: numOuNull,
  exames_tc_previstos: numOuNull,
  exames_rm_previstos: numOuNull,

  cirurgias_frcst: numOuNull,
  pac_dia_uni_frcst: numOuNull,
  pac_dia_uti_frcst: numOuNull,
  atendimentos_ps_frcst: numOuNull,
  atendimentos_cemed_frcst: numOuNull,

  exames_eda_frcst: numOuNull,
  exames_usg_frcst: numOuNull,
  exames_cardio_frcst: numOuNull,
  exames_tc_frcst: numOuNull,
  exames_rm_frcst: numOuNull,
});

export type UnidadeReport = z.infer<typeof unidadeReportSchema>;

/** Razão segura: null quando o denominador é 0/null. Arredonda a `casas`. */
export function taxa(
  numerador: number | null,
  denominador: number | null,
  casas = 4,
): number | null {
  if (numerador == null || !denominador) return null;
  const f = 10 ** casas;
  return Math.round((numerador / denominador) * f) / f;
}
