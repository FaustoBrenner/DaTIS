import fs from "node:fs";
import { LEITOS_INTERNACAO, LEITOS_UTI } from "../ref/setores.js";
import { taxa } from "../types.js";

/**
 * OCUPACAO.json — snapshot (ponto no tempo) da ocupação de leitos, vindo do
 * painel schematic/cpanel do TASY.
 *
 * Estrutura: `dados.linhasResultSet[]`, com `CD_TIPO_INFORMACAO`:
 *   3 = total geral (internação + intensiva)
 *   2 = subtotais ("Unidades de Internação" e "Unidade de terapia intensiva")
 *   1 = setores individuais (com CD_CLASSIF_SETOR 3=enfermaria, 4=UTI)
 *
 * Modelagem (decisão fechada com o líder):
 *   - OCUPADOS (proxy de pac-dia) = `QT_OCUPADAS` do subtotal live.
 *   - LEITOS (denominador)        = capacidade curada de `setores_internacao`
 *                                   (reflete `NR_UNIDADES_NORMAIS`, sem leitos
 *                                   temporários), NÃO o `NR_UNIDADES_SETOR` live.
 *   - tx_ocupacao                 = ocupados ÷ leitos_curados.
 *
 * Ressalva: `QT_OCUPADAS` é ocupação instantânea, não paciente-dia contábil.
 * Para o report diário é um proxy aceito; documentar ao evoluir o schema.
 */

interface LinhaOcupacao {
  CD_TIPO_INFORMACAO?: number;
  DS_SETOR_ATENDIMENTO?: string;
  QT_OCUPADAS?: number;
  NR_UNIDADES_SETOR?: number;
  NR_UNIDADES_NORMAIS?: number;
}

export interface KpisOcupacao {
  pac_dia_uni: number | null;
  leitos_uni: number;
  tx_ocupacao_uni: number | null;
  pac_dia_uti: number | null;
  leitos_uti: number;
  tx_ocupacao_uti: number | null;
  _diag: {
    ocupados_uni_live: number | null;
    ocupados_uti_live: number | null;
    leitos_uni_ref: number;
    leitos_uti_ref: number;
    leitos_uni_live: number | null;
    leitos_uti_live: number | null;
  };
}

function normalizar(s: string | undefined): string {
  return (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export function calcularKpisOcupacao(caminho: string): KpisOcupacao {
  const doc = JSON.parse(fs.readFileSync(caminho, "utf8"));
  const linhas: LinhaOcupacao[] = doc?.dados?.linhasResultSet ?? [];

  const subtotais = linhas.filter((l) => l.CD_TIPO_INFORMACAO === 2);
  const uni = subtotais.find((l) => normalizar(l.DS_SETOR_ATENDIMENTO).includes("unidades de internacao"));
  const uti = subtotais.find((l) => normalizar(l.DS_SETOR_ATENDIMENTO).includes("terapia intensiva"));

  const ocupUni = uni?.QT_OCUPADAS ?? null;
  const ocupUti = uti?.QT_OCUPADAS ?? null;

  return {
    pac_dia_uni: ocupUni,
    leitos_uni: LEITOS_INTERNACAO,
    tx_ocupacao_uni: taxa(ocupUni, LEITOS_INTERNACAO),
    pac_dia_uti: ocupUti,
    leitos_uti: LEITOS_UTI,
    tx_ocupacao_uti: taxa(ocupUti, LEITOS_UTI),
    _diag: {
      ocupados_uni_live: ocupUni,
      ocupados_uti_live: ocupUti,
      leitos_uni_ref: LEITOS_INTERNACAO,
      leitos_uti_ref: LEITOS_UTI,
      leitos_uni_live: uni?.NR_UNIDADES_NORMAIS ?? null,
      leitos_uti_live: uti?.NR_UNIDADES_NORMAIS ?? null,
    },
  };
}
