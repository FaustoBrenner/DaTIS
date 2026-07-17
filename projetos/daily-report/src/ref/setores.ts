import setoresJson from "./setores_internacao.json" with { type: "json" };

/**
 * Tabela de referência de setores de internação (curada manualmente pela
 * operação, exportada de `setores_internacao.xlsx`). É a FONTE DE VERDADE dos
 * leitos operacionais — reflete o `NR_UNIDADES_NORMAIS` do TASY, sem leitos
 * temporários. É o denominador das taxas de ocupação (decisão de modelagem).
 */
export interface SetorRef {
  setor: string;
  id_setor: number | null;
  grupo_setor: string;
  id_grupo_setor: number | null;
  leitos_capacidade: number;
}

export const SETORES: SetorRef[] = setoresJson as SetorRef[];

/** Grupos do TASY: 3 = enfermaria/internação, 4 = UTI, 0 = descontinuado. */
export const GRUPO_INTERNACAO = 3;
export const GRUPO_UTI = 4;

function somaLeitos(idGrupo: number): number {
  return SETORES.filter((s) => s.id_grupo_setor === idGrupo).reduce(
    (acc, s) => acc + (s.leitos_capacidade || 0),
    0,
  );
}

/** Leitos operacionais de enfermaria/internação (denominador de `tx_ocupacao_uni`). */
export const LEITOS_INTERNACAO = somaLeitos(GRUPO_INTERNACAO);

/** Leitos operacionais de UTI (denominador de `tx_ocupacao_uti`). */
export const LEITOS_UTI = somaLeitos(GRUPO_UTI);
