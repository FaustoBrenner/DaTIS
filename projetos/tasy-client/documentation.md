# tasy-client — Documentação Técnica

`[PARA REVISÃO]`

Cliente **Node.js / TypeScript** para interação de dados com o **TASY** (HIS Philips da Rede D'Or)
via requisições **XHR**, sem automação de navegador (RPA). Substitui o cliente Python + Playwright
legado (mantido em `legacy/`, sem manutenção).

- **Versão:** 0.1.0
- **Runtime:** Node.js ≥ 20 (usa `fetch` nativo; validado em Node 24)
- **Módulo:** ESM (`"type": "module"`)
- **Escopo:** biblioteca reutilizável + CLI de referência

---

## Índice

1. [Visão geral e filosofia](#1-visão-geral-e-filosofia)
2. [Arquitetura](#2-arquitetura)
3. [Requisitos e instalação](#3-requisitos-e-instalação)
4. [Configuração e variáveis de ambiente](#4-configuração-e-variáveis-de-ambiente)
5. [Uso como biblioteca](#5-uso-como-biblioteca)
6. [Referência da API pública](#6-referência-da-api-pública)
7. [Autenticação e ciclo de sessão](#7-autenticação-e-ciclo-de-sessão)
8. [Serviço de relatórios](#8-serviço-de-relatórios)
9. [Parâmetros, tokens de data e encoding](#9-parâmetros-tokens-de-data-e-encoding)
10. [Conversão TSV → CSV](#10-conversão-tsv--csv)
11. [Tratamento de erros](#11-tratamento-de-erros)
12. [CLI de execução de jobs](#12-cli-de-execução-de-jobs)
13. [Formato dos arquivos de configuração](#13-formato-dos-arquivos-de-configuração)
14. [Execução contínua (streaming) na mesma sessão](#14-execução-contínua-streaming-na-mesma-sessão)
15. [Protocolo TASY (resumo)](#15-protocolo-tasy-resumo)
16. [Testes e validação](#16-testes-e-validação)
17. [Limitações conhecidas](#17-limitações-conhecidas)
18. [Compliance e LGPD](#18-compliance-e-lgpd)
19. [Estrutura do projeto](#19-estrutura-do-projeto)

---

## 1. Visão geral e filosofia

O `tasy-client` fala com o TASY exatamente como o front-end web dele fala: por chamadas XHR
autenticadas por token OAuth. Isso elimina a dependência de um navegador headless (Playwright) e
torna o cliente leve o suficiente para rodar dentro de uma API, de uma automação ou de um job
agendado.

**Princípio central — a biblioteca não tem efeitos colaterais de I/O.** O núcleo autentica,
chama serviços e devolve dados **em memória** (`Buffer`, objetos tipados). Persistência,
conversão e transporte (arquivo em disco, resposta HTTP, SharePoint, data lake) são
responsabilidade do consumidor. Quem impõe filesystem é apenas o CLI de referência
(`src/cli/run-job.ts`), que é um consumidor como qualquer outro — não o coração do produto.

Consequência prática: a mesma instância de sessão serve para um script de linha de comando, para
um endpoint de API que gera um relatório sob demanda, ou para um worker que extrai dados em laço.

---

## 2. Arquitetura

```
┌──────────────────────────────────────────────────────────────┐
│  Consumidor (CLI, API, automação, worker de streaming)       │
└───────────────────────────┬──────────────────────────────────┘
                            │  usa a fachada
                ┌───────────▼───────────┐
                │      TasyClient        │   src/index.ts
                │  (agrega sessão +      │
                │   serviços)            │
                └───┬─────────┬──────────┘
        ┌───────────┘         └───────────┐
┌───────▼────────┐              ┌──────────▼──────────┐
│  TasySession   │              │  Serviços de alto   │
│  core/session  │◄─────────────│  nível              │
│                │  cada serviço│  ReportsService     │
│  • oauth/login │  chama a     │  EstablishmentSvc   │
│  • refresh     │  sessão      │  (params, convert)  │
│  • cookies     │              └─────────────────────┘
│  • retry 401   │
└───────┬────────┘
        │ fetch nativo + CookieJar
┌───────▼────────┐
│  Servidor TASY │  /TasyAppServer/resources/...
└────────────────┘
```

**Camadas:**

| Camada | Arquivos | Responsabilidade |
|---|---|---|
| Fachada | `src/index.ts` | Agrega sessão + serviços em `TasyClient`; superfície pública de exports |
| Núcleo | `src/core/*` | Sessão, autenticação, cookies, erros, tipos compartilhados |
| Serviços | `src/services/*` | Relatórios, troca de estabelecimento, encoding de parâmetros |
| Utilitário | `src/convert/tsv.ts` | Decodificação do "xls" (TSV UTF-16-BE) e conversão para CSV |
| CLI | `src/cli/*` | Runner de jobs + logger de console (consumidor de referência) |

A dependência é **unidirecional**: serviços dependem da sessão; a sessão não conhece serviço
algum. Nada no núcleo escreve em disco.

---

## 3. Requisitos e instalação

**Requisitos:**
- Node.js ≥ 20 (o `fetch` nativo e `Headers.getSetCookie()` são pré-requisitos).
- Acesso de rede ao servidor TASY (rede corporativa da Rede D'Or).
- Credenciais válidas de um usuário TASY.

**Instalação:**
```bash
npm install
```

**Scripts npm disponíveis:**

| Script | Comando | O que faz |
|---|---|---|
| `build` | `tsc` | Compila `src/` para `dist/` (JS + `.d.ts`) |
| `typecheck` | `tsc --noEmit` | Checagem de tipos sem emitir |
| `job` | `tsx src/cli/run-job.ts` | Roda o CLI de jobs direto do TS |
| `smoke` | `tsx scripts/smoke.ts` | Smoke test de auth contra o servidor real |

Dependência de runtime: `zod`. Dev: `tsx`, `typescript`, `@types/node`.

---

## 4. Configuração e variáveis de ambiente

| Variável | Obrigatória | Uso |
|---|---|---|
| `TASY_USER` | sim | Usuário TASY |
| `TASY_PASS` | sim | Senha TASY |
| `TASY_BASE_URL` | não | Sobrescreve o `base_url` do catálogo (ex.: apontar para outra unidade) |
| `TASY_DEBUG` | não | Qualquer valor "truthy" habilita logs `[DEBUG]` no `consoleLogger` |

Credenciais **nunca** ficam em código ou em arquivos versionados. O `.gitignore` já exclui
`.env`, `.env.*`, `conf/storage_state.json`, `logs/`, `raw/`, `out/`, `discovery/*.json` e
`*.har` (capturas que contêm tokens e dados reais).

---

## 5. Uso como biblioteca

```ts
import { TasyClient, buildSpecs, parseDateRef, tsvToCsv } from "tasy-client";

const tasy = new TasyClient({
  baseUrl: "http://hismorumbi.rededor.corp",
  username: process.env.TASY_USER!,
  password: process.env.TASY_PASS!,
  // scope: "WTASY",              // datasource/banco (default)
  // timezone: "America/Sao_Paulo",
  // refreshMarginSeconds: 60,    // renova o token N segundos antes de expirar
  // logger: meuLogger,           // opcional; sem logger, silencioso
  // fetchImpl: fetchDeTeste,     // injeção de fetch para testes
});

// 1) A sessão autentica sozinha na primeira chamada autenticada.
//    (opcionalmente, force o login antecipado:)
await tasy.session.ensureAuth();

// 2) Troca de estabelecimento (unidade), quando o relatório não recebe CD_ESTAB explícito:
await tasy.establishment.change(14);

// 3) Chamada de serviço genérica a qualquer endpoint /service/*:
const param = await tasy.session.callService("WParameter", "getParameter", [
  { tipo: "Integer", valor: 0 },
  { tipo: "Integer", valor: 87 },
]);

// 4) Geração de relatório — devolve os bytes em memória, NÃO grava em disco:
const specs = buildSpecs(catalogJson);
const dateRef = parseDateRef("2026-07-14");        // ou parseDateRef(null) => D-1
const result = await tasy.reports.generate(specs["cate_3142"], {
  fileExportType: "XLS",
  CD_ESTAB: 14,
  DT_INICIAL: "@date_ref_T00Z",
  DT_FINAL: "@date_ref_T00Z",
}, dateRef);

// 5) O consumidor decide o que fazer com os bytes:
const buffer = result.files[0].content;             // Buffer (TSV UTF-16-BE)
const csv = tsvToCsv(buffer);                        // string CSV (;, BOM UTF-8)
```

---

## 6. Referência da API pública

Tudo abaixo é exportado por `tasy-client` (`src/index.ts`).

### `class TasyClient`
Fachada. Constrói e agrega a sessão e os serviços.

```ts
new TasyClient(config: TasyConfig)
```
| Membro | Tipo | Descrição |
|---|---|---|
| `.session` | `TasySession` | Sessão viva (auth + chamadas genéricas) |
| `.reports` | `ReportsService` | Geração e download de relatórios |
| `.establishment` | `EstablishmentService` | Troca de estabelecimento ativo |

### `interface TasyConfig`
| Campo | Tipo | Default | Descrição |
|---|---|---|---|
| `baseUrl` | `string` | — | Base sem barra final (ex.: `http://hismorumbi.rededor.corp`) |
| `username` | `string` | — | Usuário TASY |
| `password` | `string` | — | Senha TASY |
| `scope` | `string?` | `"WTASY"` | Datasource/banco enviado no login |
| `timezone` | `string?` | `"America/Sao_Paulo"` | Timezone enviado no login |
| `refreshMarginSeconds` | `number?` | `60` | Renova o token essa margem antes de expirar |
| `logger` | `Logger?` | noop | Logger plugável |
| `fetchImpl` | `typeof fetch?` | `globalThis.fetch` | Implementação de fetch (testes) |

### `class TasySession`
Núcleo. Ver [seção 7](#7-autenticação-e-ciclo-de-sessão) para o ciclo de vida.

| Método / propriedade | Assinatura | Descrição |
|---|---|---|
| `isAuthenticated` | `get(): boolean` | True se há access token válido (dentro da margem) |
| `ensureAuth` | `(): Promise<void>` | Garante token válido (login ou refresh); coalesce concorrentes |
| `login` | `(): Promise<void>` | Login completo via `/oauth` |
| `refresh` | `(): Promise<void>` | Renova o access token pelo refresh token |
| `request<T>` | `(path, options?): Promise<TasyResponse<T>>` | Requisição autenticada genérica com retry em 401 |
| `callService<T>` | `(service, method, params?, options?): Promise<T>` | Chama `POST /service/<service>/<method>` |
| `downloadFile` | `(fileName): Promise<Buffer>` | Baixa binário de `/resources/files/<nome>` |

### `class ReportsService`
| Método | Assinatura | Descrição |
|---|---|---|
| `buildPayload` | `(spec, args, dateRef): unknown[]` | Monta o corpo do `generateReports` (valida obrigatórios, resolve tokens) |
| `generate` | `(spec, args, dateRef): Promise<GenerateResult>` | Gera e baixa os arquivos (em memória) |

### `class EstablishmentService`
| Método | Assinatura | Descrição |
|---|---|---|
| `change` | `(cdEstabelecimento, isDefault?): Promise<unknown>` | Muda o estabelecimento ativo via `CorSis_FK/performAction` |

### Funções utilitárias
| Função | Assinatura | Descrição |
|---|---|---|
| `buildSpecs` | `(catalog: CatalogFile): Record<string, ReportSpec>` | Constrói o mapa de specs a partir do JSON de catálogo |
| `resolveToken` | `(value, dateRef): unknown` | Resolve tokens `@date_ref` (ver [seção 9](#9-parâmetros-tokens-de-data-e-encoding)) |
| `encodeParam` | `(name, value, schema?): unknown` | Codifica um valor conforme o schema do parâmetro |
| `parseDateRef` | `(s?: string \| null): Date` | Interpreta `YYYY-MM-DD`; sem argumento retorna D-1 (UTC) |
| `decodeTasyText` | `(buf: Buffer): string` | Decodifica o "xls" do TASY para texto |
| `tsvToRows` | `(buf: Buffer): string[][] `| Converte para matriz de linhas/células |
| `tsvToCsv` | `(buf, opts?): string` | Converte para texto CSV |
| `fixMojibake` | `(text: string): string` | Corrige mojibake UTF-8-lido-como-Latin-1 |
| `parseTasyError` | `(body): { code?, message? }` | Extrai `{code, message}` de um corpo de erro |

### Classes de erro e tipos exportados
- Erros: `TasyError`, `TasyAuthError` (ver [seção 11](#11-tratamento-de-erros)).
- Classe utilitária: `CookieJar`.
- Tipos: `TasyConfig`, `OAuthTokens`, `TasyParam`, `RequestOptions`, `TasyResponse`, `Logger`,
  `ReportSpec`, `GeneratedFile`, `GenerateResult`, `CatalogFile`, `ParamSchema`, `TasyInstant`.

---

## 7. Autenticação e ciclo de sessão

A `TasySession` é **desenhada para ser longa e reutilizável** — uma única instância representa
uma sessão viva. Ela gerencia autenticação sozinha; o consumidor raramente chama `login`/`refresh`
diretamente.

**Fluxo de token:**
1. `ensureAuth()` roda antes de toda requisição autenticada.
2. Se há access token válido (dentro da margem de `refreshMarginSeconds`), reutiliza — sem custo.
3. Se expirou (ou está na margem):
   - Tenta **refresh** se o refresh token ainda é válido;
   - Se o refresh falhar (ou já expirou), faz **login** completo.
4. Chamadas concorrentes de `ensureAuth()` são **coalescidas** numa única promessa de
   autenticação (`authInFlight`), evitando logins/refreshes duplicados.

**Resiliência a 401:** em `request()`, um `401` numa chamada não-anônima dispara **um** relogin +
repetição da requisição (a menos que `options.noRetry` esteja setado). Cobre o caso de token
invalidado no servidor.

**Cookies:** o `CookieJar` guarda os cookies de infraestrutura do TASY ao longo de toda a
sessão — principalmente `TASYAPPSERVER` (afinidade de load balancer) e `JSESSIONID`. Isso mantém
todas as requisições da sessão no mesmo app server. Antes do primeiro login, um GET público
resolve o cookie de afinidade.

**Tempos (protocolo TASY):** access token 10 min, refresh token 24h. `expires_in` e
`refresh_expires` são tratados em **minutos** (`storeTokens`) — unidade **confirmada por
sondagem** (`expires_in:10`, `refresh_expires:1440`), não uma suposição.

---

## 8. Serviço de relatórios

`ReportsService.generate(spec, args, dateRef)` executa o pipeline completo:

1. **`buildPayload`** — valida parâmetros obrigatórios do spec, resolve tokens de data (`@date_ref`)
   contra `dateRef`, codifica cada argumento conforme seu schema e monta o DTO
   `ReportsParam`/`ReportParam` esperado pelo endpoint `Report/generateReports`.
2. **POST** `generateReports` — dispara a geração no servidor.
3. **`extractFileNames`** — extrai os nomes de arquivo da resposta (aceita `xlsFileName`,
   `fileName` ou `name`). Se nenhum nome vier, lança erro com preview do corpo.
4. **`downloadFile`** por nome — baixa cada binário de `/resources/files/<nome>` (URL-encoded).
5. Retorna `GenerateResult` com os `Buffer`s em memória.

```ts
interface GenerateResult {
  reportKey: string;
  fileNames: string[];         // nomes retornados pelo generateReports
  files: GeneratedFile[];      // { name, content: Buffer }
}
```

> O `content` é o "xls" do TASY, que na prática é **TSV codificado em UTF-16-BE**. Use
> `tsvToRows` / `tsvToCsv` para materializá-lo (seção 10).

---

## 9. Parâmetros, tokens de data e encoding

### Tokens de data (`resolveToken`)
Argumentos string que começam com `@` são resolvidos contra a `dateRef` da execução:

| Token | Resultado (ex.: `dateRef` = 2026-07-14) |
|---|---|
| `@date_ref` | `"2026-07-14"` |
| `@date_ref-1d` | `"2026-07-13"` (menos 1 dia) |
| `@date_ref+2d` | `"2026-07-16"` (mais 2 dias) |
| `@date_ref_T00Z` | `"2026-07-14T03:00:00.000Z"` (meia-noite local America/Sao_Paulo, UTC-3) |
| `@date_ref-1d_T00Z` | idem, deslocado |

Qualquer outro valor é retornado inalterado. A regex aceita apenas o formato acima
(case-sensitive, sufixo `_T00Z` literal).

> **Nota de fuso:** o `_T00Z` assume UTC-3 fixo (`03:00Z` = meia-noite em São Paulo). Correto
> enquanto o Brasil não tiver horário de verão (abolido em 2019).

### Encoding de parâmetros (`encodeParam`)
Cada argumento é codificado conforme o `type` do seu schema no catálogo:

| `type` | Saída | Observações |
|---|---|---|
| `instant` | `{ "@class": "java.time.Instant", type: "INSTANT", value }` | Exige string ISO UTC terminada em `Z`; caso contrário lança erro |
| `int` | `number` | `parseInt`; **lança erro** se o valor não for inteiro válido (`NaN`) |
| `bool` / `boolean` | `boolean` | Strings `1/true/t/yes/y/sim` → `true` |
| `json` | valor in natura | Passa sem transformação |
| `string` (default) | `String(value)` | — |

Se o schema define `allowed`, valores fora do domínio lançam erro antes do encoding.

### `parseDateRef`
- Sem argumento (ou `null`): retorna **D-1** (ontem, meia-noite UTC).
- Com `YYYY-MM-DD`: interpreta como data UTC. **Lança erro** para entrada inválida (ex.:
  `--date-ref garbage`) em vez de propagar `Invalid Date`.

---

## 10. Conversão TSV → CSV

O utilitário `src/convert/tsv.ts` é opcional e composto de funções puras (sem I/O).

**`decodeTasyText(buf)`** detecta o encoding:
1. UTF-16-BE com BOM (`0xFE 0xFF`) — caminho padrão das exportações do TASY;
2. UTF-16-BE sem BOM — via heurística de bytes `0x00` em posições pares;
3. Fallback UTF-8 (com BOM tolerado).

Buffers de comprimento **ímpar** (ex.: download truncado) não são UTF-16 válido e caem no
fallback UTF-8 em vez de estourar `RangeError` — a decodificação nunca muta o buffer de entrada.

**`tsvToRows(buf)`** → `string[][]` (split por `\r?\n` e `\t`, ignorando a última linha vazia).

**`tsvToCsv(buf, opts?)`** → `string`. Opções:
| Opção | Default | Descrição |
|---|---|---|
| `delimiter` | `";"` | Separador (compatível com Excel pt-BR) |
| `bom` | `true` | Prefixa BOM UTF-8 |

Campos com o delimitador, aspas ou quebra de linha são escapados conforme RFC 4180.

---

## 11. Tratamento de erros

Hierarquia:
- **`TasyError`** — erro genérico de operação. Campos: `status`, `url`, `tasyCode?`, `body?`.
- **`TasyAuthError extends TasyError`** — falha de login ou refresh.

O TASY responde erros como `{ code?, message }` (ex.: `{"code":1100,"message":"..."}`).
`parseTasyError` extrai esse par, e **`fixMojibake`** corrige corpos que vêm com UTF-8 relido
como Latin-1 (ex.: `"cabeÃ§alho"` → `"cabeçalho"`). As mensagens dos erros já saem corrigidas.

Respostas fora do range 2xx viram `TasyError` (ou `TasyAuthError` no fluxo de auth), preservando
`status`, `url`, código de negócio do TASY e corpo bruto para diagnóstico.

---

## 12. CLI de execução de jobs

Consumidor de referência: roda um job (lista de relatórios) definido em JSON e **grava em disco**.

```bash
# PowerShell — carregar credenciais do ambiente do usuário e rodar
$env:TASY_USER = [System.Environment]::GetEnvironmentVariable("TASY_USER","User")
$env:TASY_PASS = [System.Environment]::GetEnvironmentVariable("TASY_PASS","User")

npx tsx src/cli/run-job.ts --job conf/job_daily.json
```

**Flags:**
| Flag | Default | Descrição |
|---|---|---|
| `--job <path>` | — (obrigatória) | Arquivo de job |
| `--catalog <path>` | `conf/reports_catalog.json` | Catálogo de relatórios |
| `--out <dir>` | `out` | Raiz de saída |
| `--csv` | `false` | Grava também a versão convertida em CSV |
| `--date-ref <YYYY-MM-DD>` | — | Sobrescreve o `date_ref` do job |

**Fluxo:** autentica → (opcional) troca de estabelecimento pelo `estabelecimento_cd` do job →
para cada relatório, gera e grava, com **até 3 tentativas** e backoff exponencial (1s, 2s). Um
relatório ausente do catálogo ou que esgote as tentativas marca `exitCode = 1`, mas o job segue
com os demais.

**Saída:** `out/<job_name>/<report_key>/<ano>/<mes>/<file_prefix>_<YYYY-MM-DD>.<ext>` (e `.csv`
quando `--csv`). Rodar novamente com o mesmo `date_ref` **sobrescreve** o arquivo do dia.

> **Precedência de `date_ref`:** `--date-ref` (flag) > `date_ref` (job) > default D-1.
> **Precedência de argumentos:** `args` do relatório > `common_args` do job.

---

## 13. Formato dos arquivos de configuração

### Catálogo — `conf/reports_catalog.json`

```jsonc
{
  "base_url": "http://hismorumbi.rededor.corp",
  "reports": [
    {
      "key": "cate_3142",                 // identificador usado nos jobs
      "title": "HMSL - ... (excel)",      // título enviado no DTO ReportParam
      "type": "CATE",                     // tipo de relatório do TASY
      "code": 3142,                       // código do relatório
      "params_schema": {
        "CD_ESTAB":   { "type": "int",     "required": true },
        "DT_INICIAL": { "type": "instant", "required": true },
        "DT_FINAL":   { "type": "instant", "required": true }
      },
      "outputs": { "file_prefix": "HMSL_DESFECHO_INTERNACAO_PA", "ext": "xls" }
    }
  ]
}
```

Campos por relatório: `key`, `title`, `type`, `code`, `params_schema` (mapa nome→`ParamSchema`),
`outputs.file_prefix`, `outputs.ext` (default `"xls"`).

`ParamSchema`: `{ type?, required?, allowed? }` onde `type ∈ {string, int, bool, boolean,
instant, json}`.

### Job — `conf/job_*.json`

```jsonc
{
  "job_name": "job_daily",
  "date_ref": null,                       // null => D-1; ou "YYYY-MM-DD"
  "estabelecimento_cd": 14,               // opcional: troca de estabelecimento
  "common_args": {                        // aplicados a todos os relatórios
    "fileExportType": "XLS",
    "CD_ESTAB_P": 14
  },
  "reports": [
    {
      "key": "cate_3142",
      "args": {                           // sobrescrevem common_args
        "CD_ESTAB": 14,
        "DT_INICIAL": "@date_ref_T00Z",
        "DT_FINAL": "@date_ref_T00Z"
      }
    }
  ]
}
```

Jobs por unidade já existem em `conf/` (ITAIM, JABAQUARA, MORUMBI, VNS, etc.).

---

## 14. Execução contínua (streaming) na mesma sessão

A arquitetura **suporta** extração contínua de relatórios sobre uma única autenticação — por
exemplo, extrair um relatório a cada 2 minutos por horas. Isso decorre diretamente do desenho da
sessão:

- `ensureAuth()` roda antes de cada requisição, então o token é **renovado sob demanda** (refresh
  proativo na margem, ou relogin) sem necessidade de timer de fundo;
- o `CookieJar` mantém a afinidade de load balancer por toda a duração da instância;
- o retry único em 401 recompõe a sessão se o token for invalidado no servidor.

**O que a biblioteca não fornece (por design):** o laço de agendamento. O CLI atual é *single-shot*
(roda o job e encerra). Um runner de streaming é código do consumidor — ~20 linhas:

```ts
const tasy = new TasyClient({ baseUrl, username, password, logger });
await tasy.session.ensureAuth();
if (estabCd) await tasy.establishment.change(estabCd);

async function tick() {
  const result = await tasy.reports.generate(spec, args, parseDateRef(null));
  // persistir/emitir result.files, depois soltar a referência (GC)
}

while (running) {
  try { await tick(); }
  catch (err) { logger.error("tick falhou, seguindo", { err: String(err) }); }
  await sleep(120_000);                   // laço SEQUENCIAL, não setInterval
}
```

Três cuidados no wrapper (nenhum exige mudança no core):
1. **Laço sequencial** (await-então-sleep), não `setInterval`, para não empilhar execuções se um
   `generate` passar do intervalo.
2. **`try/catch` por tick** — uma falha não pode matar o stream.
3. **Soltar os `Buffer`s** de cada tick após persistir, para não acumular memória num processo de
   longa duração.

---

## 15. Protocolo TASY (resumo)

- **Login:** `POST /TasyAppServer/resources/public/security/oauth` com
  `{ username, password, scope, timezone, ... }` → `{ access_token, refresh_token, expires_in,
  refresh_expires, token_type }`.
- **Refresh:** `POST /TasyAppServer/resources/public/security/oauth/refresh` com
  `{ "refreshToken": "..." }`.
- **Autorização:** header `Authorization: BEARER <token>` nos endpoints `/service/*` e `/user/*`.
- **Serviço:** `POST /TasyAppServer/resources/service/<service>/<method>` com corpo em array de
  parâmetros tipados `{ tipo, valor }`.
- **Relatórios:** `POST /TasyAppServer/resources/service/Report/generateReports` (o 1º item do
  array é o DTO `ReportsParam`, não um `{tipo,valor}` puro).
- **Download:** `GET /TasyAppServer/resources/files/<nome>`.
- **Cookies de infra:** `TASYAPPSERVER` (afinidade), `JSESSIONID`.

Detalhes completos do protocolo XHR: [`full_request_workflow.md`](./full_request_workflow.md).

---

## 16. Testes e validação

Não há testes unitários ainda; a validação atual é por scripts em `scripts/`:

| Script | Rede? | O que valida |
|---|---|---|
| `scripts/test-convert.ts` | **offline, sem PII** | Decode UTF-16-BE, linhas e CSV com buffer sintético |
| `scripts/smoke.ts` | servidor real | Login, `callService(getParameter)`, refresh, chamada pós-refresh |
| `scripts/smoke-report.ts` | servidor real | Pipeline `generateReports` + download + decode (imprime só estrutura, sem linhas de paciente) |
| `scripts/inspect-out.ts` | — | Inspeção de saídas geradas |

Rodar o teste offline (não exige rede nem credenciais):
```bash
npx tsx scripts/test-convert.ts
```

---

## 17. Limitações conhecidas

- **Troca de estabelecimento por nome:** o CLI aceita `estabelecimento_cd` (código numérico). O
  mapeamento nome→código não é resolvido automaticamente (dependeria de `/user/data`, atrás da
  checagem XSRF ainda não decifrada). Relatórios que recebem `CD_ESTAB` explícito não precisam de
  troca.
- **Endpoints `/user/*`** (ex.: troca de perfil) exigem proteção XSRF cujo mecanismo ainda não foi
  resolvido (não é o header `crsftoken`). Não bloqueia o fluxo de relatórios.
- **Retry do CLI regenera o relatório:** o laço de retry envolve `generate` inteiro
  (generateReports + download). Se a geração tiver sucesso mas o download falhar, a nova tentativa
  regera o relatório no servidor. Tolerável para o batch noturno; revisitar se virar streaming.
- **Sem testes unitários** — apenas smoke tests.

---

## 18. Compliance e LGPD

- O conteúdo dos relatórios contém **dados sensíveis de paciente**. A biblioteca devolve esses
  dados em memória; o consumidor é responsável por armazená-los de forma segura e auditável.
- Os smoke tests imprimem **apenas estrutura** (nº de arquivos, bytes, nº de linhas, cabeçalho de
  colunas) — nunca linhas de dados.
- Capturas de discovery (`discovery/*.json`, `*.har`) contêm tokens e dados reais e estão
  **gitignored**.
- Credenciais e sessões (`.env`, `conf/storage_state.json`) nunca são versionadas.
- Qualquer integração com o TASY em produção exige aprovação da TI corporativa da Rede D'Or.

---

## 19. Estrutura do projeto

```
tasy-client/
├── src/
│   ├── index.ts               # superfície pública da biblioteca (TasyClient + exports)
│   ├── core/
│   │   ├── session.ts         # TasySession: oauth, refresh, cookies, retry em 401
│   │   ├── cookies.ts         # CookieJar mínimo
│   │   ├── errors.ts          # TasyError/TasyAuthError + parseTasyError + fixMojibake
│   │   └── types.ts           # tipos compartilhados
│   ├── services/
│   │   ├── reports.ts         # ReportsService + buildSpecs + CatalogFile
│   │   ├── establishment.ts   # EstablishmentService (performAction)
│   │   └── params.ts          # tokens @date_ref, encodeParam, parseDateRef
│   ├── convert/
│   │   └── tsv.ts             # decode UTF-16-BE + tsvToRows/tsvToCsv
│   └── cli/
│       ├── run-job.ts         # runner de jobs (consumidor de referência)
│       └── logger.ts          # consoleLogger
├── scripts/                   # smoke tests + inspeção (não são testes unitários)
├── conf/                      # reports_catalog.json + job_*.json (por unidade)
├── discovery/                 # sondas de protocolo (gitignored: capturas com PII/tokens)
├── legacy/                    # cliente Python + Playwright anterior (sem manutenção)
├── dist/                      # build (tsc)
├── README.md                  # visão rápida / quick start
├── documentation.md           # este documento
├── full_request_workflow.md   # protocolo XHR detalhado
└── tasy_client_rebuild.md     # notas de reconstrução
```

---

## O que pode estar incompleto / precisa de validação externa

- **Validação end-to-end** — nada do rebuild foi executado contra o servidor real ainda. É a
  pendência P0. Ver [`NEXT_STEPS.md`](./NEXT_STEPS.md).
- **Casing `BEARER`** — assumido do cliente legado; RFC 7235 torna o esquema case-insensitive, mas
  não foi reconfirmado contra o servidor após a reescrita.
- **XSRF de `/user/*`** — mecanismo ainda não decifrado; documentado como pendência, não bloqueia
  relatórios.
- Este documento reflete o estado do código nesta revisão. Mudanças no protocolo do TASY ou no
  catálogo exigem atualização aqui.

**Backlog completo e priorizado:** [`NEXT_STEPS.md`](./NEXT_STEPS.md).

**Próximo passo lógico:** rodar `npm run smoke` na rede corporativa para validar auth + refresh +
geração de relatório end-to-end (pendência P0).
