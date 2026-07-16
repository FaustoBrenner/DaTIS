/**
 * tasy-client — superfície pública da biblioteca.
 *
 * Uso típico como biblioteca (ex.: dentro de uma API ou automação):
 *
 *   import { TasyClient } from "tasy-client";
 *   const tasy = new TasyClient({ baseUrl, username, password });
 *   await tasy.session.ensureAuth();
 *   await tasy.establishment.change(68);
 *   const result = await tasy.reports.generate(spec, args, dateRef);
 *   // result.files[0].content é um Buffer — persista como quiser.
 */
import { TasySession } from "./core/session.js";
import { ReportsService } from "./services/reports.js";
import { EstablishmentService } from "./services/establishment.js";
import type { TasyConfig } from "./core/types.js";

/** Fachada que agrega a sessão e os serviços de alto nível. */
export class TasyClient {
  readonly session: TasySession;
  readonly reports: ReportsService;
  readonly establishment: EstablishmentService;

  constructor(config: TasyConfig) {
    this.session = new TasySession(config);
    this.reports = new ReportsService(this.session);
    this.establishment = new EstablishmentService(this.session);
  }
}

// Core
export { TasySession } from "./core/session.js";
export { TasyError, TasyAuthError, parseTasyError, fixMojibake } from "./core/errors.js";
export { CookieJar } from "./core/cookies.js";
export type {
  TasyConfig,
  OAuthTokens,
  TasyParam,
  RequestOptions,
  TasyResponse,
  Logger,
} from "./core/types.js";

// Serviços
export { ReportsService, buildSpecs } from "./services/reports.js";
export type { ReportSpec, GeneratedFile, GenerateResult, CatalogFile } from "./services/reports.js";
export { EstablishmentService } from "./services/establishment.js";
export { resolveToken, encodeParam, parseDateRef } from "./services/params.js";
export type { ParamSchema, TasyInstant } from "./services/params.js";

// Conversão (utilitário opcional)
export { decodeTasyText, tsvToRows, tsvToCsv } from "./convert/tsv.js";
