import type { UnidadeConfig } from "../config.js";
import type { Db } from "../db/conn.js";
import type { LinhaTasy } from "../io/json.js";
import { unidadeReportSchema, taxa, type UnidadeReport } from "../types.js";
import { calcularKpisPs } from "../sources/trackingPs.js";
import { calcularKpisCirurgias } from "../sources/cirurgias.js";
import { calcularKpisCemed } from "../sources/trackingCemed.js";
import { calcularKpisMapaCir } from "../sources/mapaCir.js";
import { calcularKpisExames } from "../sources/exames.js";
import { calcularOcupacaoCenso } from "../sources/censo.js";
import { calcularForecasts } from "./forecast.js";
import { proximoDia } from "../io/dates.js";

/**
 * Cálculo dos KPIs de UM dia histórico para o backfill de `relatorios_diarios`.
 * Reaproveita os sources puros; a ocupação vem do censo (5079) e as cirurgias
 * previstas da soma (ver abaixo).
 *
 * Diferenças de método em relação ao pipeline diário (`computeUnidade`):
 *  - Ocupação: censo com corte às 06:00 (não o snapshot OCUPACAO).
 *  - `cirurgias_previstas`(D) = eletivas realizadas(D) + reservas não-realizadas
 *    do mapa(D). O mapa 4718 passou a representar a diferença agendado−realizado.
 *  - `*_previstos` de CEMED/exames = mediana do mesmo dia-da-semana até D (lê o
 *    histórico já gravado; por isso o backfill roda em ordem cronológica).
 *  - `*_frcst`(D) = a previsão para o DIA SEGUINTE (D+1), pela identidade
 *    "frcst de ontem = previsto de hoje": os campos por mediana usam
 *    `calcularForecasts(D+1)` e `cirurgias_frcst` = `cirurgias_previstas`(D+1).
 *    A mediana de D+1 só depende de dias do mesmo dia-da-semana (todos < D), então
 *    é calculável mesmo antes de D+1 ser processado.
 */

export interface FontesBackfill {
  ps: LinhaTasy[];
  cirurgias: LinhaTasy[];
  cemed: LinhaTasy[];
  exames: LinhaTasy[];
  mapaCir: LinhaTasy[];
  censo: LinhaTasy[];
}

export interface ResultadoDia {
  report: UnidadeReport;
  diagnostics: Record<string, unknown>;
}

export function computeUnidadeDia(
  db: Db,
  fontes: FontesBackfill,
  unidade: UnidadeConfig,
  diaIso: string,
): ResultadoDia {
  const ps = calcularKpisPs(fontes.ps, diaIso);
  const cir = calcularKpisCirurgias(fontes.cirurgias, diaIso);
  const cemed = calcularKpisCemed(fontes.cemed, diaIso);
  const exames = calcularKpisExames(fontes.exames, diaIso);
  const ocup = calcularOcupacaoCenso(fontes.censo, diaIso);

  // Mapa 4718 = reservas NÃO realizadas; a contagem do dia entra na soma.
  const mapaDia = calcularKpisMapaCir(fontes.mapaCir, diaIso);
  const naoRealizadas = mapaDia.cirurgias_previstas;
  const previstas = cir.cirurgias_eletivas + naoRealizadas;

  // Baseline "previsto" de CEMED/exames = mediana do dia-da-semana até D.
  const prev = calcularForecasts(db, unidade.id_unidade, diaIso);

  // `*_frcst`(D) = previsão para D+1 (identidade frcst[D] = previsto[D+1]).
  const proximoIso = proximoDia(diaIso);
  const fcProx = calcularForecasts(db, unidade.id_unidade, proximoIso);
  const cirProx = calcularKpisCirurgias(fontes.cirurgias, proximoIso);
  const mapaProx = calcularKpisMapaCir(fontes.mapaCir, proximoIso);
  const cirurgiasPrevistasProx = cirProx.cirurgias_eletivas + mapaProx.cirurgias_previstas;

  const report: UnidadeReport = {
    unidade: unidade.unidade,
    id_unidade: unidade.id_unidade,

    cirurgias: cir.cirurgias,
    cirurgias_eletivas: cir.cirurgias_eletivas,
    cirurgias_urgencia: cir.cirurgias_urgencia,
    cirurgias_previstas: previstas,
    tx_confirmacao_agenda_cirurgica: taxa(cir.cirurgias_eletivas, previstas),

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

    // Previsão para D+1 (frcst[D] = previsto[D+1]).
    cirurgias_frcst: cirurgiasPrevistasProx,
    pac_dia_uni_frcst: fcProx.valores.pac_dia_uni,
    pac_dia_uti_frcst: fcProx.valores.pac_dia_uti,
    atendimentos_ps_frcst: fcProx.valores.atendimentos_ps,
    atendimentos_cemed_frcst: fcProx.valores.atendimentos_cemed,

    exames_eda_frcst: fcProx.valores.exames_eda,
    exames_usg_frcst: fcProx.valores.exames_usg,
    exames_cardio_frcst: fcProx.valores.exames_cardio,
    exames_tc_frcst: fcProx.valores.exames_tc,
    exames_rm_frcst: fcProx.valores.exames_rm,
  };

  const validado = unidadeReportSchema.parse(report);

  return {
    report: validado,
    diagnostics: {
      dia: diaIso,
      ps: ps._diag,
      cirurgias: cir._diag,
      cemed: cemed._diag,
      exames: exames._diag,
      cirurgias_nao_realizadas: naoRealizadas,
      ocupacao: ocup._diag,
    },
  };
}
