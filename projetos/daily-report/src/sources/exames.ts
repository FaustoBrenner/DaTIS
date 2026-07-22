import { txt, type LinhaTasy } from "../io/json.js";
import { dataIso } from "../io/dates.js";
import { SETORES_EXAME, CAMPOS_EXAME, type CampoExame } from "../ref/setoresExame.js";

/**
 * Relatório 4317 — Gestão de Exames (SADT).
 * 1 linha por exame. KPIs `exames_*`: quantidade de procedimentos EXECUTADOS
 * (com `Dt execucao` no dia de referência) por setor, contabilizados apenas
 * para os setores mapeados em `setoresExame` (match exato de `Setor atendimento`).
 *
 * Regra (decisão com o líder, 2026-07-22): "executado" = tem `Dt execucao`; a
 * contagem do dia usa `Dt execucao` == refIso. Demais setores do relatório são
 * mantidos apenas no diagnóstico (`por_setor`) para calibração/uso futuro.
 */

const COL_SETOR = "Setor atendimento";
const COL_DT_EXEC = "Dt execucao";

export type KpisExames = Record<CampoExame, number> & {
  _diag: {
    linhas_brutas: number;
    executados_no_dia: number;
    por_setor: Record<string, number>;
    datas: Record<string, number>;
  };
};

/** Índice reverso: nome exato do setor → campo do schema. */
const SETOR_PARA_CAMPO = new Map<string, CampoExame>(
  CAMPOS_EXAME.map((campo) => [SETORES_EXAME[campo], campo]),
);

export function calcularKpisExames(linhas: LinhaTasy[], refIso: string): KpisExames {
  const datas: Record<string, number> = {};
  const porSetor: Record<string, number> = {};
  const contagem = Object.fromEntries(CAMPOS_EXAME.map((c) => [c, 0])) as Record<
    CampoExame,
    number
  >;
  let executadosNoDia = 0;

  for (const l of linhas) {
    const dia = dataIso(l[COL_DT_EXEC]); // "executado" = tem Dt execucao
    datas[dia ?? "(sem data)"] = (datas[dia ?? "(sem data)"] ?? 0) + 1;
    if (dia !== refIso) continue;
    executadosNoDia++;

    const setor = txt(l[COL_SETOR]) || "(sem setor)";
    porSetor[setor] = (porSetor[setor] ?? 0) + 1;

    const campo = SETOR_PARA_CAMPO.get(setor);
    if (campo) contagem[campo]++;
  }

  return {
    ...contagem,
    _diag: {
      linhas_brutas: linhas.length,
      executados_no_dia: executadosNoDia,
      por_setor: porSetor,
      datas,
    },
  };
}
