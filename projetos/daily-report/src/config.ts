/**
 * Configuração por unidade. As amostras atuais são todas do Itaim (sufixo
 * "- IT" nos setores, `Cd estab` = 14). Quando o pipeline cobrir a regional
 * inteira, isto vira um mapa `cd_estab -> UnidadeConfig`.
 */
export interface UnidadeConfig {
  unidade: string;
  id_unidade: number;
  /** Sufixo dos setores desta unidade nos relatórios (ex.: "- IT"). */
  sufixoSetor: string;
}

export const ITAIM: UnidadeConfig = {
  unidade: "Itaim",
  id_unidade: 14,
  sufixoSetor: "- IT",
};
