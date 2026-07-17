import path from "node:path";
import type { UnidadeConfig } from "../config.js";
import { unidadeReportSchema, taxa, type UnidadeReport } from "../types.js";
import { calcularKpisPs } from "../sources/trackingPs.js";
import { calcularKpisCirurgias } from "../sources/cirurgias.js";
import { calcularKpisCemed } from "../sources/trackingCemed.js";
import { calcularKpisMapaCir } from "../sources/mapaCir.js";
import { calcularKpisExames } from "../sources/exames.js";
import { calcularKpisOcupacao } from "../sources/ocupacao.js";

/** Nomes dos artefatos na pasta de extração (convenção do TASY). */
export const ARQUIVOS = {
  ps: "2432_TRACKING_PS.xls",
  cirurgias: "3136_CIRURGIAS_REALIZADAS.xls",
  cemed: "3523_TRACKING_CEMED.xls",
  exames: "4317_GESTAO_EXAMES.xls",
  mapaCir: "4718_MAPA_CIR.xls",
  ocupacao: "OCUPACAO.json",
} as const;

export interface JanelaReport {
  /** Dia dos dados realizados (D-1), formato `aaaa-mm-dd`. */
  refIso: string;
  /** Dia-alvo do mapa cirúrgico (D+1), formato `aaaa-mm-dd`. */
  mapaAlvoIso: string;
}

export interface ResultadoUnidade {
  report: UnidadeReport;
  diagnostics: Record<string, unknown>;
}

/**
 * Calcula os KPIs de uma unidade a partir da pasta de extração.
 *
 * Campos deixados em `null` de propósito (não deriváveis da extração atual):
 *  - tx_confirmacao_agenda_cirurgica : precisa de mapa e realizadas do MESMO dia.
 *  - atendimentos_cemed_previstos / tx_confirmacao_agenda_cemed : precisa da
 *    agenda ambulatorial (não presente na amostra).
 *  - *_frcst : forecast, depende de histórico (fase posterior).
 */
export function computeUnidade(
  pastaDados: string,
  unidade: UnidadeConfig,
  janela: JanelaReport,
): ResultadoUnidade {
  const p = (arq: string) => path.join(pastaDados, arq);

  const ps = calcularKpisPs(p(ARQUIVOS.ps), janela.refIso);
  const cir = calcularKpisCirurgias(p(ARQUIVOS.cirurgias), janela.refIso);
  const cemed = calcularKpisCemed(p(ARQUIVOS.cemed), janela.refIso);
  const mapa = calcularKpisMapaCir(p(ARQUIVOS.mapaCir), janela.mapaAlvoIso);
  const exames = calcularKpisExames(p(ARQUIVOS.exames), janela.refIso);
  const ocup = calcularKpisOcupacao(p(ARQUIVOS.ocupacao));

  const report: UnidadeReport = {
    unidade: unidade.unidade,
    id_unidade: unidade.id_unidade,

    cirurgias: cir.cirurgias,
    cirurgias_previstas: mapa.cirurgias_previstas,
    tx_confirmacao_agenda_cirurgica: null, // dias distintos na amostra

    pac_dia_uni: ocup.pac_dia_uni,
    leitos_uni: ocup.leitos_uni,
    tx_ocupacao_uni: ocup.tx_ocupacao_uni,

    pac_dia_uti: ocup.pac_dia_uti,
    leitos_uti: ocup.leitos_uti,
    tx_ocupacao_uti: ocup.tx_ocupacao_uti,

    atendimentos_ps: ps.atendimentos_ps,
    internacoes_ps: ps.internacoes_ps,
    tx_internacao: taxa(ps.internacoes_ps, ps.atendimentos_ps),

    atendimentos_cemed: cemed.atendimentos_cemed,
    atendimentos_cemed_previstos: null, // sem agenda ambulatorial na amostra
    tx_confirmacao_agenda_cemed: null,

    cirurgias_frcst: null,
    pac_dia_uni_frcst: null,
    pac_dia_uti_frcst: null,
    atendimentos_ps_frcst: null,
    atendimentos_cemed_frcst: null,
  };

  // Garante aderência ao contrato do schema.
  const validado = unidadeReportSchema.parse(report);

  return {
    report: validado,
    diagnostics: {
      janela,
      ps: ps._diag,
      cirurgias: cir._diag,
      cemed: cemed._diag,
      mapa_cir: mapa._diag,
      exames: exames._diag,
      ocupacao: ocup._diag,
    },
  };
}
