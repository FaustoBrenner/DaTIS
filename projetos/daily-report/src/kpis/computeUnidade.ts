import type { UnidadeConfig } from "../config.js";
import type { Db } from "../db/conn.js";
import { registrosDaExtracao } from "../db/repos.js";
import { unidadeReportSchema, taxa, type UnidadeReport } from "../types.js";
import { calcularKpisPs } from "../sources/trackingPs.js";
import { calcularKpisCirurgias } from "../sources/cirurgias.js";
import { calcularKpisCemed } from "../sources/trackingCemed.js";
import { calcularKpisMapaCir } from "../sources/mapaCir.js";
import { calcularKpisExames } from "../sources/exames.js";
import { calcularKpisOcupacao } from "../sources/ocupacao.js";
import { calcularForecasts } from "./forecast.js";

/** Códigos de relatório no banco (convenção do TASY). */
export const RELATORIOS = {
  ps: "2432",
  cirurgias: "3136",
  cemed: "3523",
  exames: "4317",
  mapaCir: "4718",
  ocupacao: "OCUPACAO",
} as const;

export interface JanelaReport {
  /** Dia dos dados realizados (D-1), formato `aaaa-mm-dd`. */
  refIso: string;
  /**
   * Dia da extração corrente (D-0, hoje). As extrações de "realizados" e a
   * ocupação são lidas por esta data; o mapa cirúrgico de D-0 dá `cirurgias_frcst`.
   */
  extracaoHoje: string;
}

export interface ResultadoUnidade {
  report: UnidadeReport;
  diagnostics: Record<string, unknown>;
}

/**
 * Calcula os KPIs de uma unidade CONSULTANDO O BANCO (não arquivos).
 *
 * Modelo temporal (ver ARQUITETURA.md):
 *  - Realizados (PS, cirurgias, CEMED, exames) e ocupação vêm da extração de
 *    HOJE (D-0), que traz os eventos de ONTEM (D-1) — filtrados por `refIso`.
 *  - `cirurgias_previstas` (D-1) vem do MAPA extraído em D-1 (persistido ontem).
 *  - `cirurgias_frcst` (D-0) vem do MAPA extraído hoje (contagem total).
 *  - demais `*_frcst`: mediana do mesmo dia-da-semana (últimas 10 semanas).
 *
 * Campos deixados em `null` (não deriváveis das extrações atuais):
 *  - atendimentos_cemed_previstos / tx_confirmacao_agenda_cemed: sem agenda ambulatorial.
 *  - exames_*_previstos: sem agenda de exames.
 */
export function computeUnidade(
  db: Db,
  unidade: UnidadeConfig,
  janela: JanelaReport,
): ResultadoUnidade {
  const { refIso, extracaoHoje } = janela;
  const id = unidade.id_unidade;
  const reg = (relatorio: string, dataExtracao: string) =>
    registrosDaExtracao(db, relatorio, id, dataExtracao);

  // Realizados (D-1) + ocupação: extração de hoje (D-0).
  const ps = calcularKpisPs(reg(RELATORIOS.ps, extracaoHoje), refIso);
  const cir = calcularKpisCirurgias(reg(RELATORIOS.cirurgias, extracaoHoje), refIso);
  const cemed = calcularKpisCemed(reg(RELATORIOS.cemed, extracaoHoje), refIso);
  const exames = calcularKpisExames(reg(RELATORIOS.exames, extracaoHoje), refIso);
  const ocup = calcularKpisOcupacao(reg(RELATORIOS.ocupacao, extracaoHoje));

  // Mapa cirúrgico: previstas de D-1 (mapa de ontem) e frcst de D-0 (mapa de hoje).
  const mapaOntem = calcularKpisMapaCir(reg(RELATORIOS.mapaCir, refIso), refIso);
  const mapaHoje = calcularKpisMapaCir(reg(RELATORIOS.mapaCir, extracaoHoje), extracaoHoje);
  const previstasOntem = mapaOntem._diag.linhas_brutas > 0 ? mapaOntem.cirurgias_previstas : null;

  // Forecasts por mediana do dia-da-semana. O alvo é HOJE (D-0 = extracaoHoje):
  // os campos *_frcst são "previsão para hoje", então usamos o dia-da-semana de
  // D-0 e o histórico anterior a D-0.
  const frcst = calcularForecasts(db, id, extracaoHoje);

  // "Previstos" de CEMED e exames: sem agenda ambulatorial/de exames, usamos a
  // mediana do mesmo dia-da-semana (alvo = D-1, o dia reportado) como baseline
  // esperado — decisão de 2026-07-22, "por enquanto", até haver agenda real.
  const prev = calcularForecasts(db, id, refIso);

  const report: UnidadeReport = {
    unidade: unidade.unidade,
    id_unidade: id,

    cirurgias: cir.cirurgias,
    cirurgias_eletivas: cir.cirurgias_eletivas,
    cirurgias_urgencia: cir.cirurgias_urgencia,
    cirurgias_previstas: previstasOntem,
    tx_confirmacao_agenda_cirurgica: taxa(cir.cirurgias_eletivas, previstasOntem),

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
    atendimentos_cemed_previstos: prev.valores.atendimentos_cemed,
    tx_confirmacao_agenda_cemed: taxa(cemed.atendimentos_cemed, prev.valores.atendimentos_cemed),

    exames_eda: exames.exames_eda,
    exames_usg: exames.exames_usg,
    exames_cardio: exames.exames_cardio,
    exames_tc: exames.exames_tc,
    exames_rm: exames.exames_rm,

    exames_eda_previstos: prev.valores.exames_eda,
    exames_usg_previstos: prev.valores.exames_usg,
    exames_cardio_previstos: prev.valores.exames_cardio,
    exames_tc_previstos: prev.valores.exames_tc,
    exames_rm_previstos: prev.valores.exames_rm,

    cirurgias_frcst: mapaHoje._diag.linhas_brutas > 0 ? mapaHoje.cirurgias_previstas : null,
    pac_dia_uni_frcst: frcst.valores.pac_dia_uni,
    pac_dia_uti_frcst: frcst.valores.pac_dia_uti,
    atendimentos_ps_frcst: frcst.valores.atendimentos_ps,
    atendimentos_cemed_frcst: frcst.valores.atendimentos_cemed,

    exames_eda_frcst: frcst.valores.exames_eda,
    exames_usg_frcst: frcst.valores.exames_usg,
    exames_cardio_frcst: frcst.valores.exames_cardio,
    exames_tc_frcst: frcst.valores.exames_tc,
    exames_rm_frcst: frcst.valores.exames_rm,
  };

  const validado = unidadeReportSchema.parse(report);

  return {
    report: validado,
    diagnostics: {
      janela,
      ps: ps._diag,
      cirurgias: cir._diag,
      cemed: cemed._diag,
      exames: exames._diag,
      mapa_cir_previstas: mapaOntem._diag,
      mapa_cir_frcst: mapaHoje._diag,
      ocupacao: ocup._diag,
      forecast: frcst._diag,
    },
  };
}
