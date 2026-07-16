/**
 * TasySession — núcleo do cliente. Responsável por:
 *   - autenticar via /oauth e renovar o token (refresh) proativamente;
 *   - anexar Authorization + cookies em toda requisição autenticada;
 *   - repetir uma vez com relogin em caso de 401;
 *   - expor um método genérico de chamada de serviço.
 *
 * Projetado como biblioteca: nada de efeitos colaterais de filesystem, logger
 * plugável, e uma única instância representa uma sessão viva reutilizável por
 * uma API ou automação de longa duração.
 */
import { CookieJar } from "./cookies.js";
import { TasyError, TasyAuthError, parseTasyError } from "./errors.js";
import type {
  TasyConfig,
  OAuthTokens,
  TasyParam,
  RequestOptions,
  TasyResponse,
  Logger,
} from "./types.js";

const noopLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
};

interface TokenState {
  accessToken: string;
  refreshToken: string;
  /** Instantes (epoch ms) em que cada token expira. */
  accessExpiresAt: number;
  refreshExpiresAt: number;
}

export class TasySession {
  private readonly baseUrl: string;
  private readonly scope: string;
  private readonly timezone: string;
  private readonly marginMs: number;
  private readonly logger: Logger;
  private readonly fetchImpl: typeof fetch;
  private readonly jar = new CookieJar();

  private tokens: TokenState | null = null;
  /** Evita múltiplos logins/refreshes concorrentes. */
  private authInFlight: Promise<void> | null = null;

  constructor(private readonly config: TasyConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.scope = config.scope ?? "WTASY";
    this.timezone = config.timezone ?? "America/Sao_Paulo";
    this.marginMs = (config.refreshMarginSeconds ?? 60) * 1000;
    this.logger = config.logger ?? noopLogger;
    this.fetchImpl = config.fetchImpl ?? globalThis.fetch;
  }

  /** True se há um access token ainda dentro da validade (com margem). */
  get isAuthenticated(): boolean {
    return this.tokens !== null && Date.now() < this.tokens.accessExpiresAt - this.marginMs;
  }

  // --------------------------------------------------------------------------
  // Autenticação
  // --------------------------------------------------------------------------

  /** Garante um token válido: faz login, ou refresh, conforme o estado. */
  async ensureAuth(): Promise<void> {
    if (this.isAuthenticated) return;
    // Coalesce chamadas concorrentes na mesma promessa de autenticação.
    if (this.authInFlight) return this.authInFlight;
    this.authInFlight = this.authenticate().finally(() => {
      this.authInFlight = null;
    });
    return this.authInFlight;
  }

  private async authenticate(): Promise<void> {
    const now = Date.now();
    const canRefresh = this.tokens !== null && now < this.tokens.refreshExpiresAt - this.marginMs;
    if (canRefresh) {
      try {
        await this.refresh();
        return;
      } catch (err) {
        this.logger.warn("Refresh falhou, refazendo login", { err: String(err) });
      }
    }
    await this.login();
  }

  /** Login completo via /oauth. */
  async login(): Promise<void> {
    // Um GET público antes do login resolve o cookie de afinidade (TASYAPPSERVER).
    if (!this.jar.get("TASYAPPSERVER")) {
      await this.rawFetch("/TasyAppServer/resources/public/system/isExpiredBetaServicePack", {
        method: "GET",
      }).catch(() => undefined);
    }

    const res = await this.rawFetch("/TasyAppServer/resources/public/security/oauth", {
      method: "POST",
      headers: { "content-type": "application/json;charset=UTF-8" },
      body: JSON.stringify({
        username: this.config.username,
        password: this.config.password,
        computerName: null,
        osUsername: null,
        scope: this.scope,
        timezone: this.timezone,
        ipMachine: null,
      }),
    });

    const body = await this.readJson(res);
    if (res.status !== 200) {
      const { code, message } = parseTasyError(body);
      throw new TasyAuthError(message ?? `Login falhou (HTTP ${res.status})`, {
        status: res.status,
        url: res.url,
        tasyCode: code,
        body,
      });
    }
    this.storeTokens(body as OAuthTokens);
    this.logger.info("Login TASY OK", { user: this.config.username, scope: this.scope });
  }

  /** Renova o access token usando o refresh token. */
  async refresh(): Promise<void> {
    if (!this.tokens) throw new Error("Sem refresh token — chame login() primeiro.");
    const res = await this.rawFetch("/TasyAppServer/resources/public/security/oauth/refresh", {
      method: "POST",
      headers: { "content-type": "application/json;charset=UTF-8" },
      // O endpoint só aceita JSON com a chave camelCase `refreshToken`.
      body: JSON.stringify({ refreshToken: this.tokens.refreshToken }),
    });
    const body = await this.readJson(res);
    if (res.status !== 200) {
      const { code, message } = parseTasyError(body);
      throw new TasyAuthError(message ?? `Refresh falhou (HTTP ${res.status})`, {
        status: res.status,
        url: res.url,
        tasyCode: code,
        body,
      });
    }
    this.storeTokens(body as OAuthTokens);
    this.logger.debug("Token TASY renovado");
  }

  private storeTokens(t: OAuthTokens): void {
    const now = Date.now();
    this.tokens = {
      accessToken: t.access_token,
      refreshToken: t.refresh_token,
      // expires_in e refresh_expires são em MINUTOS no protocolo do TASY.
      accessExpiresAt: now + t.expires_in * 60_000,
      refreshExpiresAt: now + t.refresh_expires * 60_000,
    };
  }

  // --------------------------------------------------------------------------
  // Requisições
  // --------------------------------------------------------------------------

  /** fetch de baixo nível: injeta baseUrl, cookies e absorve Set-Cookie. Sem auth. */
  private async rawFetch(path: string, init: RequestInit): Promise<Response> {
    const url = path.startsWith("http") ? path : this.baseUrl + path;
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json, text/plain, */*");
    headers.set("referer", this.baseUrl + "/");
    const cookie = this.jar.header();
    if (cookie) headers.set("cookie", cookie);
    const res = await this.fetchImpl(url, { ...init, headers });
    this.jar.absorb(res);
    return res;
  }

  private async readJson(res: Response): Promise<unknown> {
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      return text;
    }
  }

  /**
   * Requisição autenticada de propósito geral. Garante token válido, anexa
   * Authorization, e em caso de 401 refaz login uma vez e repete.
   */
  async request<T = unknown>(path: string, options: RequestOptions = {}): Promise<TasyResponse<T>> {
    if (!options.anonymous) await this.ensureAuth();

    const doFetch = async (): Promise<Response> => {
      const headers: Record<string, string> = { ...options.headers };
      if (!options.anonymous && this.tokens) {
        headers["authorization"] = `BEARER ${this.tokens.accessToken}`;
      }
      let body: string | undefined;
      if (options.body !== undefined && options.body !== null) {
        if (typeof options.body === "string") {
          body = options.body;
        } else {
          body = JSON.stringify(options.body);
          headers["content-type"] = headers["content-type"] ?? "application/json;charset=UTF-8";
        }
      }
      return this.rawFetch(path, { method: options.method ?? "GET", headers, body });
    };

    let res = await doFetch();

    // Retry único com relogin em 401 (token pode ter sido invalidado no servidor).
    if (res.status === 401 && !options.anonymous && !options.noRetry) {
      this.logger.warn("401 recebido, refazendo login e repetindo", { path });
      this.tokens = null;
      await this.ensureAuth();
      res = await doFetch();
    }

    const url = res.url;
    if (options.binary) {
      const buf = await res.arrayBuffer();
      if (res.status < 200 || res.status >= 300) {
        throw new TasyError(`HTTP ${res.status} em ${path}`, { status: res.status, url });
      }
      return { status: res.status, headers: res.headers, body: buf as T };
    }

    const parsed = await this.readJson(res);
    if (res.status < 200 || res.status >= 300) {
      const { code, message } = parseTasyError(parsed);
      throw new TasyError(message ?? `HTTP ${res.status} em ${path}`, {
        status: res.status,
        url,
        tasyCode: code,
        body: parsed,
      });
    }
    return { status: res.status, headers: res.headers, body: parsed as T };
  }

  /**
   * Chamada a um endpoint de serviço do TASY:
   *   POST /TasyAppServer/resources/service/<service>/<method>
   * com corpo no formato array de parâmetros tipados { tipo, valor }.
   */
  async callService<T = unknown>(
    service: string,
    method: string,
    params: TasyParam[] = [],
    options: RequestOptions = {},
  ): Promise<T> {
    const path = `/TasyAppServer/resources/service/${service}/${method}`;
    const res = await this.request<T>(path, { ...options, method: "POST", body: params });
    return res.body;
  }

  /** Baixa um arquivo gerado pelo TASY em /resources/files/<nome>. */
  async downloadFile(fileName: string): Promise<Buffer> {
    const path = `/TasyAppServer/resources/files/${encodeURIComponent(fileName)}`;
    const res = await this.request<ArrayBuffer>(path, { method: "GET", binary: true });
    return Buffer.from(res.body);
  }
}
