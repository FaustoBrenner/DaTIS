/**
 * Tipos compartilhados do core do tasy-client.
 *
 * Convenção do TASY: chamadas de serviço recebem um array de parâmetros tipados
 * no formato { tipo, valor }. Modelamos isso como TasyParam.
 */

/** Logger mínimo que a biblioteca aceita. Não impõe implementação — o consumidor pluga a sua. */
export interface Logger {
  debug(message: string, meta?: unknown): void;
  info(message: string, meta?: unknown): void;
  warn(message: string, meta?: unknown): void;
  error(message: string, meta?: unknown): void;
}

/** Configuração de uma sessão TASY. */
export interface TasyConfig {
  /** Ex.: "http://hismorumbi.rededor.corp" (sem barra final). */
  baseUrl: string;
  username: string;
  password: string;
  /** Datasource/banco do TASY. Default: "WTASY". */
  scope?: string;
  /** Timezone enviado no login. Default: "America/Sao_Paulo". */
  timezone?: string;
  /**
   * Margem de segurança (segundos) para renovar o token antes de expirar.
   * Default: 60.
   */
  refreshMarginSeconds?: number;
  logger?: Logger;
  /** Implementação de fetch alternativa (testes). Default: globalThis.fetch. */
  fetchImpl?: typeof fetch;
}

/** Resposta dos endpoints /oauth e /oauth/refresh. */
export interface OAuthTokens {
  access_token: string;
  token_type: string;
  /** Validade do access token, em MINUTOS. */
  expires_in: number;
  /** Validade do refresh token, em MINUTOS. */
  refresh_expires: number;
  refresh_token: string;
}

/**
 * Parâmetro tipado do protocolo TASY. `valor` é opcional porque alguns tipos
 * (ex.: Integer vazio) aparecem sem valor no protocolo.
 */
export interface TasyParam {
  tipo: string;
  valor?: unknown;
}

/** Opções de uma requisição de baixo nível. */
export interface RequestOptions {
  method?: string;
  /** Corpo já serializado (string) ou objeto a ser serializado como JSON. */
  body?: unknown;
  headers?: Record<string, string>;
  /** Se true, não anexa o header Authorization (para endpoints públicos). */
  anonymous?: boolean;
  /** Se true, retorna o corpo como ArrayBuffer em vez de tentar JSON/texto. */
  binary?: boolean;
  /** Se true, não tenta relogar+repetir em 401. Default: false. */
  noRetry?: boolean;
}

/** Resultado bruto de uma requisição. */
export interface TasyResponse<T = unknown> {
  status: number;
  headers: Headers;
  /** Corpo parseado como JSON, ou string se não for JSON, ou ArrayBuffer se binary. */
  body: T;
}
