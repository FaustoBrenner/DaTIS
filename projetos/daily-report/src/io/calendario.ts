import { createRequire } from "node:module";
import { diaSemanaDe } from "../db/repos.js";
import { proximoDia } from "./dates.js";

/**
 * Contexto de calendário do payload.
 *
 * Existe porque o forecast é mediana de dias-da-semana COMUNS: num feriado ele
 * superestima o esperado, e sem esse aviso o agente lê queda sazonal como
 * colapso de produção. A avaliação é 100% determinística aqui — o agente nunca
 * decide se um dia é feriado (LLM alucina calendário com confiança).
 *
 * Fonte: `ref/feriados.json` (curadoria manual, versionada).
 */

const require = createRequire(import.meta.url);
const TABELA = require("../ref/feriados.json") as {
  feriados: {
    data: string;
    nome: string;
    tipo: "nacional" | "estadual" | "municipal";
    unidades: "TODAS" | number[];
  }[];
};

const NOMES_DIA = [
  "domingo",
  "segunda-feira",
  "terça-feira",
  "quarta-feira",
  "quinta-feira",
  "sexta-feira",
  "sábado",
];

export interface Feriado {
  data: string;
  nome: string;
  tipo: string;
}

export interface ContextoCalendario {
  /** True se o dia NÃO é um dia útil comum (feriado, fim de semana ou emenda). */
  ref_atipico: boolean;
  ref_descricao: string;
  hoje_descricao: string;
  proximos_7d: Feriado[];
  /** Dia útil espremido entre feriado e fim de semana nos próximos 10 dias. */
  emenda_a_frente: { data: string; descricao: string } | null;
}

export function nomeDiaSemana(iso: string): string {
  return NOMES_DIA[diaSemanaDe(iso)]!;
}

function ehFimDeSemana(iso: string): boolean {
  const d = diaSemanaDe(iso);
  return d === 0 || d === 6;
}

/** Feriado que vale para a unidade naquele dia, ou null. */
export function feriadoEm(iso: string, idUnidade: number): Feriado | null {
  const f = TABELA.feriados.find(
    (x) =>
      x.data === iso &&
      (x.unidades === "TODAS" || x.unidades.includes(idUnidade)),
  );
  return f ? { data: f.data, nome: f.nome, tipo: f.tipo } : null;
}

function diaAnterior(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y!, m! - 1, d! - 1, 12, 0, 0);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}

/** Dia útil "espremido": não é feriado nem fim de semana, mas os dois vizinhos são. */
function ehEmenda(iso: string, idUnidade: number): boolean {
  if (ehFimDeSemana(iso) || feriadoEm(iso, idUnidade)) return false;
  const bloqueado = (d: string) => ehFimDeSemana(d) || feriadoEm(d, idUnidade) !== null;
  return bloqueado(diaAnterior(iso)) && bloqueado(proximoDia(iso));
}

function descrever(iso: string, idUnidade: number): string {
  const dia = nomeDiaSemana(iso);
  const f = feriadoEm(iso, idUnidade);
  if (f) return `${dia}, feriado ${f.tipo} (${f.nome})`;
  if (ehEmenda(iso, idUnidade)) return `${dia}, emenda entre feriado e fim de semana`;
  if (ehFimDeSemana(iso)) return `${dia}, fim de semana`;
  return `${dia}, dia útil comum`;
}

/**
 * Monta o bloco `calendario` do payload.
 *
 * `ref_atipico` marca fim de semana também: o agente precisa saber que a
 * comparação com o mesmo dia-da-semana continua válida, mas a leitura contra
 * a média corrida da semana não é.
 */
export function contextoCalendario(
  refIso: string,
  hojeIso: string,
  idUnidade: number,
): ContextoCalendario {
  const proximos: Feriado[] = [];
  let cursor = hojeIso;
  for (let i = 0; i < 7; i++) {
    const f = feriadoEm(cursor, idUnidade);
    if (f) proximos.push(f);
    cursor = proximoDia(cursor);
  }

  let emenda: ContextoCalendario["emenda_a_frente"] = null;
  cursor = hojeIso;
  for (let i = 0; i < 10 && !emenda; i++) {
    if (ehEmenda(cursor, idUnidade)) {
      emenda = {
        data: cursor,
        descricao: `${nomeDiaSemana(cursor)} de emenda — agenda e escala tendem a cair`,
      };
    }
    cursor = proximoDia(cursor);
  }

  const feriadoRef = feriadoEm(refIso, idUnidade);
  return {
    ref_atipico:
      feriadoRef !== null || ehFimDeSemana(refIso) || ehEmenda(refIso, idUnidade),
    ref_descricao: descrever(refIso, idUnidade),
    hoje_descricao: descrever(hojeIso, idUnidade),
    proximos_7d: proximos,
    emenda_a_frente: emenda,
  };
}
