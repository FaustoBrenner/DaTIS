import { txt, type LinhaTasy } from "../io/json.js";
import { dataIso } from "../io/dates.js";

/**
 * Relatório 3136 — Cirurgias Realizadas.
 * 1 linha por cirurgia realizada. Conta cirurgias realizadas no dia de
 * referência (D-1), por `Dt cirurgia`, com quebra por `Carater Cirurgia`.
 *
 * Agrupamento (decisão com o líder, 2026-07-22):
 *  - cirurgias_eletivas = "Eletiva".
 *  - cirurgias_urgencia = "Urgência" + "Emergência".
 *  - cirurgias (total)  = eletivas + urgencia (= toda cirurgia realizada no dia).
 *
 * A contagem é por evento cirúrgico (`Nr cirurgia`); procedimentos adicionais
 * têm coluna própria e não multiplicam a contagem.
 */

const COL_NR_CIRURGIA = "Nr cirurgia";
const COL_DT_CIRURGIA = "Dt cirurgia";
const COL_CARATER = "Carater Cirurgia";

export interface KpisCirurgias {
  cirurgias: number;
  cirurgias_eletivas: number;
  cirurgias_urgencia: number;
  _diag: {
    linhas_brutas: number;
    no_dia_ref: number;
    por_carater: Record<string, number>;
    datas: Record<string, number>;
  };
}

/** Normaliza o caráter para o bucket do schema (eletiva | urgencia | outro). */
export function bucketCarater(valor: string): "eletiva" | "urgencia" | "outro" {
  const c = valor
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
  if (c === "eletiva") return "eletiva";
  if (c === "urgencia" || c === "emergencia") return "urgencia";
  return "outro";
}

export function calcularKpisCirurgias(
  linhas: LinhaTasy[],
  refIso: string,
): KpisCirurgias {
  const datas: Record<string, number> = {};
  const porCarater: Record<string, number> = {};
  const eletivas = new Set<string>();
  const urgencia = new Set<string>();

  for (const l of linhas) {
    const dia = dataIso(l[COL_DT_CIRURGIA]);
    datas[dia ?? "(sem data)"] = (datas[dia ?? "(sem data)"] ?? 0) + 1;
    if (dia !== refIso) continue;

    const nr = txt(l[COL_NR_CIRURGIA]);
    const chave = nr || `linha:${JSON.stringify(l).slice(0, 20)}`;

    const carater = txt(l[COL_CARATER]) || "(sem carater)";
    porCarater[carater] = (porCarater[carater] ?? 0) + 1;

    const bucket = bucketCarater(carater);
    if (bucket === "eletiva") eletivas.add(chave);
    else if (bucket === "urgencia") urgencia.add(chave);
    // "outro" (carater inesperado/vazio) não entra em nenhum bucket, mas
    // aparece em `por_carater` para calibração.
  }

  const cirurgias = eletivas.size + urgencia.size;
  return {
    cirurgias,
    cirurgias_eletivas: eletivas.size,
    cirurgias_urgencia: urgencia.size,
    _diag: {
      linhas_brutas: linhas.length,
      no_dia_ref: cirurgias,
      por_carater: porCarater,
      datas,
    },
  };
}
