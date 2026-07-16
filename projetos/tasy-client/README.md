# tasy-client

Cliente **Node.js / TypeScript** para interação de dados com o **TASY** (HIS Philips da Rede D'Or),
via requisições **XHR** — sem automação de navegador (RPA).

Projetado como **biblioteca**: o núcleo é uma sessão TASY reutilizável que outras aplicações
(uma API, uma automação, um job agendado) consomem. O CLI incluído é apenas o consumidor de
referência.

> Substitui o cliente Python + Playwright legado, agora em [`legacy/`](./legacy/). O protocolo XHR
> está documentado em [`full_request_workflow.md`](./full_request_workflow.md).

## Requisitos

- Node.js >= 20 (usa `fetch` nativo). Validado em Node 24.
- Acesso de rede ao servidor TASY (rede corporativa).
- Credenciais em variáveis de ambiente: `TASY_USER`, `TASY_PASS`.

## Instalação

```bash
npm install
```

## Uso como biblioteca

```ts
import { TasyClient } from "tasy-client";

const tasy = new TasyClient({
  baseUrl: "http://hismorumbi.rededor.corp",
  username: process.env.TASY_USER!,
  password: process.env.TASY_PASS!,
  // scope: "WTASY",            // datasource/banco (default)
  // refreshMarginSeconds: 60,  // renova o token N s antes de expirar
  // logger: meuLogger,         // opcional; sem logger, silencioso
});

// A sessão autentica sozinha na primeira chamada e renova o token (TTL 10 min)
// automaticamente via refresh token (TTL 24h).

// Chamada de serviço genérica (qualquer endpoint /service/*):
const param = await tasy.session.callService("WParameter", "getParameter", [
  { tipo: "Integer", valor: 0 },
  { tipo: "Integer", valor: 87 },
]);

// Geração de relatório — devolve os bytes em memória, NÃO grava em disco:
import { buildSpecs } from "tasy-client";
const specs = buildSpecs(catalogJson);
const result = await tasy.reports.generate(specs["cate_3142"], args, dateRef);
result.files[0].content; // Buffer (o "xls" do TASY é TSV UTF-16-BE)
```

### Filosofia de output

A biblioteca **não escreve em disco nem envia para lugar nenhum** — devolve dados em memória
(`Buffer`, objetos tipados). Persistência, conversão e transporte (arquivo, resposta HTTP,
SharePoint, data lake) são responsabilidade do consumidor. Isso mantém o cliente focado só na
interação com o TASY e reutilizável em qualquer contexto.

Para quem quer CSV, o utilitário opcional converte o TSV UTF-16-BE do TASY:

```ts
import { tsvToCsv, tsvToRows } from "tasy-client";
const csv = tsvToCsv(result.files[0].content);      // string CSV (;, BOM UTF-8)
const rows = tsvToRows(result.files[0].content);     // string[][]
```

## Uso como CLI

Consumidor de referência: roda um job de relatórios definido em JSON.

```bash
# PowerShell: carregar credenciais do ambiente do usuário e rodar
$env:TASY_USER = [System.Environment]::GetEnvironmentVariable("TASY_USER","User")
$env:TASY_PASS = [System.Environment]::GetEnvironmentVariable("TASY_PASS","User")

npx tsx src/cli/run-job.ts --job conf/job_daily.json
# Flags: --catalog <path>  --out <dir>  --csv  --date-ref YYYY-MM-DD
```

Os arquivos são gravados em `out/<job>/<report_key>/<ano>/<mes>/<prefixo>_<data>.<ext>`
(`--csv` grava também a versão convertida).

## Estrutura

```
src/
├── index.ts              # superfície pública da biblioteca
├── core/
│   ├── session.ts        # TasySession: oauth, refresh, cookies, retry em 401
│   ├── cookies.ts        # cookie jar mínimo
│   ├── errors.ts         # TasyError + tratamento de {code,message} e mojibake
│   └── types.ts
├── services/
│   ├── reports.ts        # generateReports + download
│   ├── establishment.ts  # troca de estabelecimento (performAction)
│   └── params.ts         # tokens de data @date_ref e encoding de parâmetros
├── convert/tsv.ts        # TSV UTF-16-BE -> linhas/CSV (opcional)
└── cli/run-job.ts        # runner de jobs
scripts/                  # smoke tests contra o servidor real (não são testes unitários)
discovery/                # sondas de exploração do protocolo (gitignored: capturas)
conf/                     # catálogo de relatórios + jobs
legacy/                   # cliente Python + Playwright anterior (sem manutenção)
```

## Autenticação (resumo)

- `POST /public/security/oauth` → `access_token` (JWT, **10 min**) + `refresh_token` (**24h**).
- `POST /public/security/oauth/refresh` com `{"refreshToken":"..."}` renova sem re-login.
- Header `Authorization: BEARER <token>` autentica os endpoints `/service/*` e `/user/*`.
- A `TasySession` gerencia isso sozinha (renovação proativa + retry único com relogin em 401).

Detalhes completos e demais endpoints: [`full_request_workflow.md`](./full_request_workflow.md).

## Limitações conhecidas / próximos passos

- **Troca de estabelecimento por nome**: o CLI aceita `estabelecimento_cd` (código numérico).
  O mapeamento nome→código ainda não é resolvido automaticamente (dependeria do endpoint
  `/user/data`, que está atrás da checagem XSRF ainda não decifrada). Relatórios que recebem
  `CD_ESTAB`/`CD_ESTABELECIMENTO` como argumento explícito não precisam de troca.
- **Endpoints `/user/*`** (ex.: troca de perfil) exigem proteção XSRF cujo mecanismo ainda não
  foi resolvido (não é o header `crsftoken`). Não bloqueia o fluxo de relatórios.
- Sem testes unitários ainda — a validação atual é via smoke tests (`scripts/`) contra o servidor.
