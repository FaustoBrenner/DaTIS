/**
 * Troca de estabelecimento (unidade). No cliente legado isso era feito por RPA
 * navegando o menu; aqui é uma chamada de serviço direta.
 *
 *   POST /service/CorSis_FK/performAction
 *   [{"tipo":"HashMap","valor":{"CD":<cd>,"IS_DEFAULT_ESTAB":false}}]
 *
 * `/service/*` não exige XSRF, então a troca em si funciona só com o bearer. Já a
 * resolução nome→código consulta `/user/data` (protegido por XSRF, tratado
 * transparentemente pela sessão) para ler `availableEstablishments`.
 */
import type { TasySession } from "../core/session.js";

/** Estabelecimento disponível ao usuário, conforme `/user/data`. */
export interface Establishment {
  /** Código numérico (o `CD` esperado por `change`). */
  code: number;
  /** Nome do estabelecimento. */
  name: string;
  /** Nome fantasia (razão comercial). */
  tradingName?: string;
}

/** Resposta parcial de `/user/data` que nos interessa. */
interface UserData {
  availableEstablishments?: Array<{ code: number; name: string; tradingName?: string }>;
}

/** Normaliza texto para comparação: minúsculas, sem acento e sem espaços nas pontas. */
function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

export class EstablishmentService {
  constructor(private readonly session: TasySession) {}

  /** Muda o estabelecimento ativo da sessão para o código informado. */
  async change(cdEstabelecimento: number, isDefault = false): Promise<unknown> {
    return this.session.callService("CorSis_FK", "performAction", [
      { tipo: "HashMap", valor: { CD: cdEstabelecimento, IS_DEFAULT_ESTAB: isDefault } },
    ]);
  }

  /**
   * Lista os estabelecimentos disponíveis ao usuário autenticado (via
   * `/user/data` › `availableEstablishments`).
   */
  async list(): Promise<Establishment[]> {
    const data = await this.session.getUserData<UserData>();
    const items = data.availableEstablishments ?? [];
    return items.map((e) => ({ code: e.code, name: e.name, tradingName: e.tradingName }));
  }

  /**
   * Resolve um estabelecimento por nome (ou nome fantasia). A busca é
   * case/acento-insensível: casa por igualdade exata e, na falta, por
   * substring. Lança erro se não houver correspondência ou se for ambígua.
   */
  async resolve(nameOrTradingName: string): Promise<Establishment> {
    const query = normalize(nameOrTradingName);
    const all = await this.list();

    const exact = all.filter(
      (e) => normalize(e.name) === query || (e.tradingName ? normalize(e.tradingName) === query : false),
    );
    const chosen = exact.length > 0
      ? exact
      : all.filter(
          (e) => normalize(e.name).includes(query) || (e.tradingName ? normalize(e.tradingName).includes(query) : false),
        );

    const [first] = chosen;
    if (!first) {
      throw new Error(`Estabelecimento não encontrado: "${nameOrTradingName}".`);
    }
    if (chosen.length > 1) {
      const opcoes = chosen.map((e) => `${e.name} (${e.code})`).join("; ");
      throw new Error(`Nome de estabelecimento ambíguo "${nameOrTradingName}" — casou com: ${opcoes}.`);
    }
    return first;
  }

  /**
   * Muda o estabelecimento ativo pelo nome (resolve nome→código e troca).
   * Retorna o estabelecimento resolvido.
   */
  async changeByName(nameOrTradingName: string, isDefault = false): Promise<Establishment> {
    const estab = await this.resolve(nameOrTradingName);
    await this.change(estab.code, isDefault);
    return estab;
  }
}
