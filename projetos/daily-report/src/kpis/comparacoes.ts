import type { Db } from "../db/conn.js";
import {
  diaSemanaDe,
  diasDoMesAte,
  historicoMesmoDiaSemana,
  relatorioDoDia,
  ultimosNDias,
  type RegistroDiario,
} from "../db/repos.js";
import { calcularForecasts } from "./forecast.js";
import {
  CAMPOS_COMPARADOS,
  CAMPOS_TAXA,
  PESOS,
  type CampoComparado,
  type Grupo,
} from "../ref/pesos.js";
import { taxa, type UnidadeReport } from "../types.js";

/**
 * Comparações e tendências determinísticas do payload (ARQUITETURA.md, decisão
 * #6: a IA não calcula nem projeta — só redige sobre números prontos).
 *
 * ARMADILHA DE DATAS (verificada no banco, ver backfill.ts:19-29): na linha
 * `data = D`, os `*_previstos` são o esperado de **D**, mas os `*_frcst` são o
 * esperado de **D+1**. Comparar o realizado de D contra o `*_frcst` da própria
 * linha D compara com o dia seguinte — erro silencioso e grande. Por isso:
 *   - campos com `*_previstos` no schema  → lê da própria linha D;
 *   - pac_dia_uni/uti e atendimentos_ps   → lê o `*_frcst` da linha D−1
 *                                           (fallback: mediana recalculada);
 *   - taxas de ocupação                   → derivadas do pac-dia esperado.
 * E o `*_frcst` da linha D vira o bloco `radar_hoje` (esperado de D-0) de graça.
 */

const JANELA_SEMANAS = 10;
const JANELA_DIAS = 14;
/** Mínimo de pontos consecutivos para chamar de tendência (e não oscilação). */
const MIN_PONTOS_TENDENCIA = 3;

export type EsperadoOrigem =
  | "previstos"
  | "frcst_d-1"
  | "mediana_calculada"
  | "derivado_leitos";

export interface Faixa10 {
  mediana: number | null;
  min: number | null;
  max: number | null;
  n: number;
}

export interface Tendencia {
  direcao: "alta" | "queda" | null;
  pontos_consecutivos: number;
}

export interface Comparacao {
  valor: number | null;
  esperado: number | null;
  esperado_origem: EsperadoOrigem | null;
  delta: number | null;
  delta_pct: number | null;
  delta_pp: number | null;
  d1: number | null;
  delta_d1: number | null;
  delta_d1_pp: number | null;
  faixa10: Faixa10;
  posicao: "abaixo_da_faixa" | "dentro_da_faixa" | "acima_da_faixa" | null;
  z_robusto: number | null;
  tendencia_14d: Tendencia;
  serie_14d: number[];
  peso: number;
  score: number | null;
  grupo: Grupo;
}

export interface Destaque {
  rank: number;
  kpi: CampoComparado;
  grupo: Grupo;
  direcao: "positiva" | "negativa";
  score: number;
}

export interface ItemMes {
  acumulado: number | null;
  esperado: number | null;
  delta_pct: number | null;
}

export interface ItemRadar {
  esperado: number | null;
  base: string;
  mediana_mesmo_dia_semana?: number | null;
}

/** Campo `*_previstos` correspondente (esperado do PRÓPRIO dia). */
const PREVISTOS: Partial<Record<CampoComparado, keyof UnidadeReport>> = {
  cirurgias: "cirurgias_previstas",
  cirurgias_eletivas: "cirurgias_previstas",
  atendimentos_cemed: "atendimentos_cemed_previstos",
  exames_eda: "exames_eda_previstos",
  exames_usg: "exames_usg_previstos",
  exames_cardio: "exames_cardio_previstos",
  exames_tc: "exames_tc_previstos",
  exames_rm: "exames_rm_previstos",
};

/** Campos cujo esperado vem do `*_frcst` da linha D−1. */
const FRCST_D1: Partial<Record<CampoComparado, keyof UnidadeReport>> = {
  pac_dia_uni: "pac_dia_uni_frcst",
  pac_dia_uti: "pac_dia_uti_frcst",
  atendimentos_ps: "atendimentos_ps_frcst",
};

const arred = (v: number | null, casas = 4): number | null =>
  v == null || !Number.isFinite(v)
    ? null
    : Math.round(v * 10 ** casas) / 10 ** casas;

function mediana(valores: number[]): number | null {
  if (valores.length === 0) return null;
  const o = [...valores].sort((a, b) => a - b);
  const m = o.length >> 1;
  return o.length % 2 === 0 ? (o[m - 1]! + o[m]!) / 2 : o[m]!;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

/**
 * Desvio robusto em unidades de MAD (mediana dos desvios absolutos, escalada
 * por 1.4826 para equivaler ao sigma numa normal).
 *
 * MAD em vez de desvio-padrão porque a série tem outliers ESTRUTURAIS — domingo
 * com `atendimentos_cemed = 1` infla o sigma e esconde desvio real nos dias
 * úteis. Com MAD = 0 (série constante) não há dispersão para normalizar: cai
 * para o desvio percentual, que ao menos preserva a ordenação.
 */
function zRobusto(valor: number, historico: number[]): number | null {
  const med = mediana(historico);
  if (med == null) return null;
  const mad = mediana(historico.map((v) => Math.abs(v - med)));
  if (mad != null && mad > 0) return (valor - med) / (mad * 1.4826);
  if (med !== 0) return (valor - med) / Math.abs(med);
  return null;
}

/**
 * Direção do fim da série: quantos movimentos consecutivos no mesmo sentido
 * terminam no último ponto. Abaixo de `MIN_PONTOS_TENDENCIA` a direção fica
 * `null` — um ou dois dias no mesmo sentido é oscilação, não tendência, e o
 * relatório perde credibilidade quando chama qualquer oscilação de tendência.
 */
function tendencia(serie: number[]): Tendencia {
  let dir = 0;
  let run = 0;
  for (let i = serie.length - 1; i > 0; i--) {
    const d = Math.sign(serie[i]! - serie[i - 1]!);
    if (d === 0) break;
    if (run === 0) {
      dir = d;
      run = 1;
    } else if (d === dir) {
      run++;
    } else break;
  }
  return {
    direcao:
      run >= MIN_PONTOS_TENDENCIA ? (dir > 0 ? "alta" : "queda") : null,
    pontos_consecutivos: run,
  };
}

/** Esperado do dia por campo, com a origem que o produziu (auditável). */
function esperadoDe(
  campo: CampoComparado,
  hoje: UnidadeReport,
  ontem: UnidadeReport | null,
  medianaFallback: (c: string) => number | null,
): { valor: number | null; origem: EsperadoOrigem | null } {
  const prev = PREVISTOS[campo];
  if (prev) return { valor: num(hoje[prev]), origem: "previstos" };

  const frcst = FRCST_D1[campo];
  if (frcst) {
    const v = ontem ? num(ontem[frcst]) : null;
    if (v != null) return { valor: v, origem: "frcst_d-1" };
    return {
      valor: medianaFallback(campo),
      origem: "mediana_calculada",
    };
  }

  // Taxas de ocupação: derivadas do pac-dia esperado sobre os leitos do dia.
  if (campo === "tx_ocupacao_uni" || campo === "tx_ocupacao_uti") {
    const base = campo === "tx_ocupacao_uni" ? "pac_dia_uni" : "pac_dia_uti";
    const leitos = campo === "tx_ocupacao_uni" ? hoje.leitos_uni : hoje.leitos_uti;
    const e = esperadoDe(base as CampoComparado, hoje, ontem, medianaFallback);
    return { valor: taxa(e.valor, leitos), origem: "derivado_leitos" };
  }

  return { valor: null, origem: null };
}

export interface BlocoComparacoes {
  comparacoes: Record<string, Comparacao>;
  destaques: Destaque[];
  mes: Record<string, ItemMes | number>;
  radar_hoje: Record<string, ItemRadar>;
}

export function calcularComparacoes(
  db: Db,
  idUnidade: number,
  refIso: string,
  hojeIso: string,
  linhaRef: RegistroDiario,
): BlocoComparacoes {
  const hoje = linhaRef.kpis;
  const ontem = relatorioDoDia(db, idUnidade, anterior(refIso))?.kpis ?? null;

  const diaSemana = diaSemanaDe(refIso);
  const mesmoDia = historicoMesmoDiaSemana(
    db,
    idUnidade,
    diaSemana,
    refIso,
    JANELA_SEMANAS,
  );
  const corridos = ultimosNDias(db, idUnidade, refIso, JANELA_DIAS);

  const forecastRef = calcularForecasts(db, idUnidade, refIso, JANELA_SEMANAS);
  const medianaFallback = (c: string): number | null =>
    (forecastRef.valores as Record<string, number | null>)[c] ?? null;

  const comparacoes: Record<string, Comparacao> = {};

  for (const campo of CAMPOS_COMPARADOS) {
    const { peso, grupo } = PESOS[campo];
    const valor = num(hoje[campo]);
    const historico = mesmoDia
      .map((h) => num(h[campo]))
      .filter((v): v is number => v != null);
    const serie = corridos
      .map((r) => num(r.kpis[campo]))
      .filter((v): v is number => v != null);

    const med = mediana(historico);
    const min = historico.length ? Math.min(...historico) : null;
    const max = historico.length ? Math.max(...historico) : null;

    const { valor: esperado, origem } = esperadoDe(
      campo,
      hoje,
      ontem,
      medianaFallback,
    );
    const d1 = ontem ? num(ontem[campo]) : null;
    const ehTaxa = CAMPOS_TAXA.has(campo);
    const z = valor != null && historico.length ? zRobusto(valor, historico) : null;

    comparacoes[campo] = {
      valor: arred(valor),
      esperado: arred(esperado),
      esperado_origem: esperado == null ? null : origem,
      delta: valor != null && esperado != null && !ehTaxa ? arred(valor - esperado, 2) : null,
      delta_pct:
        valor != null && esperado != null && esperado !== 0 && !ehTaxa
          ? arred((valor - esperado) / esperado, 4)
          : null,
      delta_pp:
        valor != null && esperado != null && ehTaxa
          ? arred((valor - esperado) * 100, 2)
          : null,
      d1: arred(d1),
      delta_d1: valor != null && d1 != null && !ehTaxa ? arred(valor - d1, 2) : null,
      delta_d1_pp:
        valor != null && d1 != null && ehTaxa ? arred((valor - d1) * 100, 2) : null,
      faixa10: { mediana: arred(med), min: arred(min), max: arred(max), n: historico.length },
      posicao:
        valor == null || min == null || max == null
          ? null
          : valor < min
            ? "abaixo_da_faixa"
            : valor > max
              ? "acima_da_faixa"
              : "dentro_da_faixa",
      z_robusto: arred(z, 2),
      tendencia_14d: tendencia(serie),
      serie_14d: serie.map((v) => arred(v)!),
      peso,
      score: z == null ? null : arred(peso * Math.min(Math.abs(z) / 2, 1.5), 2),
      grupo,
    };
  }

  return {
    comparacoes,
    destaques: ranquear(comparacoes),
    mes: acumuladoMes(db, idUnidade, refIso),
    radar_hoje: radarHoje(db, idUnidade, hoje, hojeIso),
  };
}

/**
 * Top 5 desvios, com no máximo UM representante por grupo — sem a dedução por
 * grupo, `cirurgias` e `cirurgias_eletivas` ocupariam dois lugares do pódio
 * contando exatamente a mesma história.
 */
function ranquear(comparacoes: Record<string, Comparacao>): Destaque[] {
  const melhorPorGrupo = new Map<Grupo, { kpi: CampoComparado; c: Comparacao }>();

  for (const [kpi, c] of Object.entries(comparacoes) as [CampoComparado, Comparacao][]) {
    if (c.score == null) continue;
    const atual = melhorPorGrupo.get(c.grupo);
    if (!atual || c.score > atual.c.score!) melhorPorGrupo.set(c.grupo, { kpi, c });
  }

  return [...melhorPorGrupo.values()]
    .sort((a, b) => b.c.score! - a.c.score!)
    .slice(0, 5)
    .map((x, i) => ({
      rank: i + 1,
      kpi: x.kpi,
      grupo: x.c.grupo,
      direcao: (x.c.z_robusto ?? 0) < 0 ? ("negativa" as const) : ("positiva" as const),
      score: x.c.score!,
    }));
}

/** Acumulado do mês até o dia-ref, contra a soma dos `*_previstos` do período. */
function acumuladoMes(
  db: Db,
  idUnidade: number,
  refIso: string,
): Record<string, ItemMes | number> {
  const dias = diasDoMesAte(db, idUnidade, refIso);
  const out: Record<string, ItemMes | number> = { dias_computados: dias.length };

  for (const campo of CAMPOS_COMPARADOS) {
    if (CAMPOS_TAXA.has(campo)) continue; // taxa não soma
    const prev = PREVISTOS[campo];
    const acumulado = dias.reduce((s, d) => s + (num(d.kpis[campo]) ?? 0), 0);
    const esperado = prev
      ? dias.reduce((s, d) => s + (num(d.kpis[prev]) ?? 0), 0)
      : null;
    out[campo] = {
      acumulado: arred(acumulado, 2),
      esperado: esperado ? arred(esperado, 2) : null,
      delta_pct: esperado ? arred((acumulado - esperado) / esperado, 4) : null,
    };
  }
  return out;
}

/**
 * Esperado de HOJE (D-0). Os `*_frcst` da linha do dia-ref já SÃO a previsão de
 * D+1 (ver o aviso no topo do arquivo), então este bloco é leitura direta —
 * nenhum cálculo novo. `cirurgias` é o caso especial: vem da contagem do mapa
 * cirúrgico extraído hoje, não de mediana; comparamos com a mediana das reservas
 * do mesmo dia-da-semana para dar escala à agenda montada.
 */
function radarHoje(
  db: Db,
  idUnidade: number,
  ref: UnidadeReport,
  hojeIso: string,
): Record<string, ItemRadar> {
  const diaHoje = diaSemanaDe(hojeIso);
  const nomeBase = `mediana_${JANELA_SEMANAS}_mesmo_dia_semana`;
  const histHoje = historicoMesmoDiaSemana(
    db,
    idUnidade,
    diaHoje,
    hojeIso,
    JANELA_SEMANAS,
  );
  const medPrevistas = mediana(
    histHoje
      .map((h) => num(h.cirurgias_previstas))
      .filter((v): v is number => v != null),
  );

  const out: Record<string, ItemRadar> = {
    cirurgias: {
      esperado: arred(num(ref.cirurgias_frcst)),
      base: "mapa_cirurgico_d0",
      mediana_mesmo_dia_semana: arred(medPrevistas),
    },
  };

  const campos = [
    "pac_dia_uni",
    "pac_dia_uti",
    "atendimentos_ps",
    "atendimentos_cemed",
    "exames_eda",
    "exames_usg",
    "exames_cardio",
    "exames_tc",
    "exames_rm",
  ] as const;

  for (const c of campos) {
    out[c] = {
      esperado: arred(num(ref[`${c}_frcst` as keyof UnidadeReport])),
      base: nomeBase,
    };
  }
  return out;
}

function anterior(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y!, m! - 1, d! - 1, 12, 0, 0);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}
