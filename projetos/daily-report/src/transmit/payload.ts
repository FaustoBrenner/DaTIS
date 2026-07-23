import type { UnidadeConfig } from "../config.js";
import type { Db } from "../db/conn.js";
import { diaSemanaDe, relatorioDoDia } from "../db/repos.js";
import { contextoCalendario, nomeDiaSemana, type ContextoCalendario } from "../io/calendario.js";
import {
  calcularComparacoes,
  type Comparacao,
  type Destaque,
  type ItemMes,
  type ItemRadar,
} from "../kpis/comparacoes.js";
import { CAMPOS_COMPARADOS, CAMPOS_TAXA } from "../ref/pesos.js";
import { unidadeReportSchema, type UnidadeReport } from "../types.js";
import { z } from "zod";

/**
 * Envelope transmitido ao endpoint HTTP do Power Automate, que o entrega ao
 * agente de síntese (Copilot Studio). Escopo: UMA unidade — há um agente por
 * unidade; o agente do VP Regional é generalização futura sobre este mesmo
 * envelope (`unidades: []` + `regional: {}`).
 *
 * O payload é o contexto COMPLETO do agente: ele não consulta o SharePoint nem
 * calcula nada. Contrato em `payload_schema.json`.
 *
 * Os KPIs são lidos de volta de `relatorios_diarios`, NÃO do objeto em memória
 * do `computeUnidade`: realizado e histórico precisam vir da mesma tabela e do
 * mesmo método, senão todo delta compara métodos diferentes (ver README.md
 * sobre censo × snapshot).
 */

export const SCHEMA_VERSION = "1.0.0";

/** Não rastreamos o método de ocupação por linha ainda (ver ARQUITETURA.md). */
const METODO_OCUPACAO = "nao_rastreado";

/** Acima disto, o desvio contra o esperado é candidato a falha de extração. */
const LIMIAR_SUSPEITA_PCT = 0.6;

export interface PayloadUnidade {
  schema_version: string;
  tipo: "daily_report_unidade";
  gerado_em: string;
  periodo: {
    data_ref: string;
    data_hoje: string;
    dia_semana: number;
    dia_semana_nome: string;
  };
  unidade: { unidade: string; id_unidade: number };
  calendario: ContextoCalendario;
  kpis: UnidadeReport;
  comparacoes: Record<string, Comparacao>;
  destaques: Destaque[];
  mes: Record<string, ItemMes | number>;
  radar_hoje: Record<string, ItemRadar>;
  qualidade: {
    campos_null_relevantes: string[];
    suspeitas: string[];
    capturado_em: string;
    metodo_ocupacao: string;
  };
}

/**
 * Validação do envelope antes de sair pela rede. Mesmo padrão do pipeline de
 * KPIs (`computeUnidade.ts:135`): o zod é o contrato executável; o
 * `payload_schema.json` é a documentação legível para quem monta o fluxo do
 * Power Automate e o agente no Copilot Studio.
 */
const numOuNull = z.number().nullable();
const dia = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const comparacaoSchema = z.object({
  valor: numOuNull,
  esperado: numOuNull,
  esperado_origem: z
    .enum(["previstos", "frcst_d-1", "mediana_calculada", "derivado_leitos"])
    .nullable(),
  delta: numOuNull,
  delta_pct: numOuNull,
  delta_pp: numOuNull,
  d1: numOuNull,
  delta_d1: numOuNull,
  delta_d1_pp: numOuNull,
  faixa10: z.object({
    mediana: numOuNull,
    min: numOuNull,
    max: numOuNull,
    n: z.number().int().nonnegative(),
  }),
  posicao: z
    .enum(["abaixo_da_faixa", "dentro_da_faixa", "acima_da_faixa"])
    .nullable(),
  z_robusto: numOuNull,
  tendencia_14d: z.object({
    direcao: z.enum(["alta", "queda"]).nullable(),
    pontos_consecutivos: z.number().int().nonnegative(),
  }),
  serie_14d: z.array(z.number()),
  peso: z.number(),
  score: numOuNull,
  grupo: z.enum(["cirurgia", "uti", "internacao", "ps", "cemed", "exames"]),
});

export const payloadUnidadeSchema = z.object({
  schema_version: z.string(),
  tipo: z.literal("daily_report_unidade"),
  gerado_em: z.string(),
  periodo: z.object({
    data_ref: dia,
    data_hoje: dia,
    dia_semana: z.number().int().min(0).max(6),
    dia_semana_nome: z.string(),
  }),
  unidade: z.object({ unidade: z.string(), id_unidade: z.number().int() }),
  calendario: z.object({
    ref_atipico: z.boolean(),
    ref_descricao: z.string(),
    hoje_descricao: z.string(),
    proximos_7d: z.array(
      z.object({ data: dia, nome: z.string(), tipo: z.string() }),
    ),
    emenda_a_frente: z
      .object({ data: dia, descricao: z.string() })
      .nullable(),
  }),
  kpis: unidadeReportSchema,
  comparacoes: z.record(comparacaoSchema),
  destaques: z.array(
    z.object({
      rank: z.number().int().positive(),
      kpi: z.string(),
      grupo: z.string(),
      direcao: z.enum(["positiva", "negativa"]),
      score: z.number(),
    }),
  ),
  mes: z.record(
    z.union([
      z.number(),
      z.object({
        acumulado: numOuNull,
        esperado: numOuNull,
        delta_pct: numOuNull,
      }),
    ]),
  ),
  radar_hoje: z.record(
    z.object({
      esperado: numOuNull,
      base: z.string(),
      mediana_mesmo_dia_semana: numOuNull.optional(),
    }),
  ),
  qualidade: z.object({
    campos_null_relevantes: z.array(z.string()),
    suspeitas: z.array(z.string()),
    capturado_em: z.string(),
    metodo_ocupacao: z.string(),
  }),
});

export class DiaNaoComputadoError extends Error {
  constructor(refIso: string, idUnidade: number) {
    super(
      `Sem linha em relatorios_diarios para ${refIso} / unidade ${idUnidade}. ` +
        `Rode 'npm run report -- --ref ${refIso} --persist' (ou o backfill) antes de transmitir.`,
    );
    this.name = "DiaNaoComputadoError";
  }
}

export function montarPayload(
  db: Db,
  unidade: UnidadeConfig,
  janela: { refIso: string; hojeIso: string },
): PayloadUnidade {
  const { refIso, hojeIso } = janela;
  const linha = relatorioDoDia(db, unidade.id_unidade, refIso);
  if (!linha) throw new DiaNaoComputadoError(refIso, unidade.id_unidade);

  const bloco = calcularComparacoes(db, unidade.id_unidade, refIso, hojeIso, linha);
  const calendario = contextoCalendario(refIso, hojeIso, unidade.id_unidade);

  const payload: PayloadUnidade = {
    schema_version: SCHEMA_VERSION,
    tipo: "daily_report_unidade",
    gerado_em: new Date().toISOString(),
    periodo: {
      data_ref: refIso,
      data_hoje: hojeIso,
      dia_semana: diaSemanaDe(refIso),
      dia_semana_nome: nomeDiaSemana(refIso),
    },
    unidade: { unidade: unidade.unidade, id_unidade: unidade.id_unidade },
    calendario,
    kpis: linha.kpis,
    comparacoes: bloco.comparacoes,
    destaques: bloco.destaques,
    mes: bloco.mes,
    radar_hoje: bloco.radar_hoje,
    qualidade: {
      ...avaliarQualidade(linha.kpis, bloco.comparacoes, calendario.ref_atipico),
      capturado_em: linha.capturado_em,
      metodo_ocupacao: METODO_OCUPACAO,
    },
  };

  payloadUnidadeSchema.parse(payload);
  return payload;
}

/**
 * Sinaliza o que o agente NÃO deve tratar como fato operacional. `null` nunca é
 * zero — é "não foi possível derivar" — e desvio absurdo é mais provavelmente
 * falha de extração do que colapso da operação.
 *
 * Em dia atípico (`refAtipico`) o teste de desvio percentual é DESLIGADO: num
 * feriado o forecast — mediana de dias-da-semana comuns — superestima por
 * construção, e CEMED caindo 99% é o feriado, não a extração. Manter o alarme
 * ligado geraria suspeita falsa em todo feriado, e alarme que sempre dispara é
 * alarme que ninguém lê. Os testes estruturais (taxa impossível, leitos
 * ausentes) continuam valendo — esses não dependem de sazonalidade.
 */
function avaliarQualidade(
  kpis: UnidadeReport,
  comparacoes: Record<string, Comparacao>,
  refAtipico: boolean,
): { campos_null_relevantes: string[]; suspeitas: string[] } {
  const nulos: string[] = [];
  const suspeitas: string[] = [];

  for (const campo of CAMPOS_COMPARADOS) {
    const c = comparacoes[campo]!;
    if (c.valor == null) {
      nulos.push(campo);
      continue;
    }
    if (
      !refAtipico &&
      c.delta_pct != null &&
      Math.abs(c.delta_pct) > LIMIAR_SUSPEITA_PCT
    ) {
      suspeitas.push(
        `${campo}: ${(c.delta_pct * 100).toFixed(0)}% de desvio contra o esperado — ` +
          `verificar a extração antes de tratar como fato operacional`,
      );
    }
    if (CAMPOS_TAXA.has(campo) && (c.valor < 0 || c.valor > 1.5)) {
      suspeitas.push(`${campo}: taxa fora da faixa plausível (${c.valor})`);
    }
  }

  if (kpis.leitos_uni == null || kpis.leitos_uti == null) {
    suspeitas.push("leitos ausentes — taxas de ocupação não são confiáveis");
  }

  return { campos_null_relevantes: nulos, suspeitas };
}
