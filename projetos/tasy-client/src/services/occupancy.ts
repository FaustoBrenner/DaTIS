/**
 * Serviço de ocupação hospitalar (leitos). Alimenta o P4 (gestão de leitos).
 *
 * Endpoint da família `schematic/cpanel` (NÃO é `/service` nem relatório):
 *   POST /TasyAppServer/resources/schematic/atepacfn/cpanels/18273/datasource?dictionaryCode=372558
 *
 * Diferente dos relatórios, é um único POST JSON que devolve as linhas direto na
 * resposta (`dados.linhasResultSet`) — sem geração de arquivo, download ou parse TSV.
 *
 * Autenticação: apenas o bearer (anexado por `session.request`). Sem XSRF (não é
 * `/user/*`) e sem os headers de "feature" — testado bearer-only = 200 idêntico
 * (ver ENDPOINTS.md #10). Corpo capturado em discovery/probe5-occupancy.mjs.
 *
 * Dado agregado por setor, SEM PII. A 1ª linha costuma ser o agregado
 * (`DS_CLASSIFICATION: "Agrupamento"`) — devolvemos tudo cru; o consumidor
 * distingue pelo campo `DS_CLASSIFICATION`.
 */
import type { TasySession } from "../core/session.js";

/**
 * Uma linha de ocupação (um setor, ou o agregado). As chaves são preservadas
 * como o TASY as devolve (SCREAMING_SNAKE). Os campos conhecidos vêm tipados;
 * a index signature cobre o restante do payload.
 */
export interface OccupancyRow {
  /** Nome do setor (ou rótulo do agregado). */
  DS_SETOR_ATENDIMENTO: string;
  /** "Agrupamento" na linha agregada; classificação do setor nas demais. */
  DS_CLASSIFICATION: string;
  /** Total de leitos do setor. */
  NR_UNIDADES_SETOR: number;
  NR_UNIDADES_OCUPADAS: number;
  NR_UNIDADES_LIVRES: number;
  NR_UNIDADES_RESERVADAS: number;
  NR_UNIDADES_HIGIENIZACAO: number;
  NR_UNIDADES_INTERDITADAS: number;
  /** Pacientes em isolamento. */
  QT_PAC_ISOLADO: number;
  /** Leitos disponíveis (livres e utilizáveis). */
  NR_AVAILABLE_BEDS: number;
  /** Percentual de ocupação (0–100). */
  PR_OCUPACAO: number;
  PR_OCUPACAO_TOTAL: number;
  PORC_LEITOS_LIVRES: number;
  /** Demais colunas do payload não mapeadas explicitamente. */
  [key: string]: unknown;
}

/** Resultado de uma consulta de ocupação. */
export interface OccupancyResult {
  /** Código do estabelecimento consultado (`CD_ESTAB_OCUPACAO`). */
  estabCode: number;
  /** Total de registros informado pelo servidor (`qtTotalRegistros`). */
  totalRegistros: number;
  /** Linhas de ocupação (a 1ª costuma ser o agregado "Agrupamento"). */
  rows: OccupancyRow[];
}

/** Opções da consulta de ocupação (defaults conforme o probe da UI). */
export interface OccupancyOptions {
  /** Agrupamento de setores. Default: "0" (padrão). */
  nrSeqAgrupamento?: string;
  /** Consultar todos os estabelecimentos. Default: false. */
  todosEstab?: boolean;
  /** Máximo de linhas por página. Default: 1000. */
  recordsPerPage?: number;
}

/** Recorte da resposta do datasource que nos interessa. */
interface OccupancyResponse {
  dados?: {
    currentPage?: number;
    qtTotalRegistros?: number;
    linhasResultSet?: OccupancyRow[];
  };
}

/** Constantes do cpanel de ocupação, capturadas da UI (discovery/probe5-occupancy.mjs). */
const OCCUPANCY_PATH =
  "/TasyAppServer/resources/schematic/atepacfn/cpanels/18273/datasource?dictionaryCode=372558";
const SCHEMATIC_OBJ_CODE = 18273;
const FILTER_CODE = 418873;

export class OccupancyService {
  constructor(private readonly session: TasySession) {}

  /**
   * Monta o corpo do datasource de ocupação, injetando o estabelecimento
   * (`CD_ESTAB_OCUPACAO`) e aplicando os defaults do probe. As chaves do TASY
   * são mantidas verbatim (SCREAMING_SNAKE).
   */
  private buildBody(cdEstab: number, opts: OccupancyOptions = {}): unknown {
    const nrSeqAgrupamento = opts.nrSeqAgrupamento ?? "0";
    const ieTodosEstab = opts.todosEstab ? "S" : "N";
    const recordsPerPage = opts.recordsPerPage ?? 1000;

    return {
      actionName: "OccupancyAction",
      activationType: "NamedAction",
      filterValues: {
        NR_SEQ_AGRUPAMENTO: nrSeqAgrupamento,
        IE_TODOS_ESTAB: ieTodosEstab,
        _filterCode: FILTER_CODE,
        _dimensionValues: {},
      },
      legendDefinition: null,
      pageBegin: 1,
      parameters: {
        _schematicObjCode: SCHEMATIC_OBJ_CODE,
        NR_SEQ_AGRUPAMENTO: nrSeqAgrupamento,
        IE_TODOS_ESTAB: opts.todosEstab ? "S" : null,
        _filterCode: FILTER_CODE,
        _dimensionValues: {},
        CD_ESTAB_OCUPACAO: cdEstab,
      },
      recordsPerPage,
      sortAscending: true,
    };
  }

  /**
   * Consulta a ocupação de leitos de um estabelecimento. Retorna todas as linhas
   * (por setor + a linha agregada "Agrupamento"), sem PII.
   *
   * @param cdEstab código do estabelecimento (ex.: 14 = Morumbi).
   */
  async getOccupancy(cdEstab: number, opts?: OccupancyOptions): Promise<OccupancyResult> {
    const { body } = await this.session.request<OccupancyResponse>(OCCUPANCY_PATH, {
      method: "POST",
      body: this.buildBody(cdEstab, opts),
    });

    const dados = body?.dados;
    const rows = dados?.linhasResultSet;
    if (!Array.isArray(rows)) {
      const raw: unknown = body;
      const preview =
        typeof raw === "string" ? raw.slice(0, 300) : JSON.stringify(raw).slice(0, 300);
      throw new Error(
        `Resposta de ocupação sem dados.linhasResultSet para estab ${cdEstab}. Corpo: ${preview}`,
      );
    }

    return {
      estabCode: cdEstab,
      totalRegistros: dados?.qtTotalRegistros ?? rows.length,
      rows,
    };
  }
}
