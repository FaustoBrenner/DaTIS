/**
 * Mapa dos KPIs de SADT (relatório 4317) → nome EXATO do `Setor atendimento`.
 *
 * O match é por igualdade exata, não por prefixo: há setores homônimos que NÃO
 * entram (ex.: "SADT Ultrassonografia - R Intervencionista - IT" e "SADT
 * Tomografia Intervencionista - IT" são distintos dos setores-base abaixo).
 *
 * Os sufixos "- IT"/"(ITM)" são do Itaim. Ao expandir para a regional, isto
 * vira um mapa por unidade (mesma questão de `config.ts`).
 */
export const SETORES_EXAME = {
  exames_eda: "Endoscopia Digestiva e Respiratória - IT",
  exames_usg: "SADT Ultrassonografia - IT",
  exames_cardio: "SADT Cardiologia (ITM)",
  exames_tc: "SADT Tomografia - IT",
  exames_rm: "SADT Ressonancia - IT",
} as const;

/** Chaves de KPI de exame (ex.: "exames_eda"). */
export type CampoExame = keyof typeof SETORES_EXAME;

export const CAMPOS_EXAME = Object.keys(SETORES_EXAME) as CampoExame[];
