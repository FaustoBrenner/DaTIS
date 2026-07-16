/**
 * Troca de estabelecimento (unidade). No cliente legado isso era feito por RPA
 * navegando o menu; aqui é uma chamada de serviço direta.
 *
 *   POST /service/CorSis_FK/performAction
 *   [{"tipo":"HashMap","valor":{"CD":<cd>,"IS_DEFAULT_ESTAB":false}}]
 *
 * `/service/*` não exige XSRF, então funciona só com o bearer.
 */
import type { TasySession } from "../core/session.js";

export class EstablishmentService {
  constructor(private readonly session: TasySession) {}

  /** Muda o estabelecimento ativo da sessão para o código informado. */
  async change(cdEstabelecimento: number, isDefault = false): Promise<unknown> {
    return this.session.callService("CorSis_FK", "performAction", [
      { tipo: "HashMap", valor: { CD: cdEstabelecimento, IS_DEFAULT_ESTAB: isDefault } },
    ]);
  }
}
