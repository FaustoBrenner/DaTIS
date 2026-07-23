# Protocolo XHR do TASY — fluxo de extração

Documento de referência do protocolo HTTP do TASY (HIS Philips), validado empiricamente
pelas sondas em `discovery/`. Base: `http://hismorumbi.rededor.corp`. É a fonte de verdade
para o core do `tasy-client` (Node/TS). Todos os valores de token/cookie abaixo são
ilustrativos — segredos reais nunca entram neste arquivo.

## Resumo do modelo de autenticação

- **Bearer token (JWT)** obtido via `/oauth`, enviado no header `Authorization: BEARER <token>`.
- **TTL curto**: access token dura **10 minutos** (`expires_in: 10`, em minutos).
- **Refresh**: refresh token dura **24h** (`refresh_expires: 1440` min); renovável sem re-login.
- **Cookies** acompanham a sessão mas o header `Authorization` é o que autentica os endpoints
  de serviço. Cookies observados: `TASYAPPSERVER` (afinidade de load balancer, setado no 1º
  toque em endpoint público), `JSESSIONID` (path `/TasyAppServer`), `Authorization` (espelho do
  bearer), `rememberMe`.
- **XSRF**: endpoints `/resources/user/*` exigem proteção anti-CSRF (retornam
  `401 {"message":"request not allowed (XSRF)"}` sem ela). O header `crsftoken` **não** é a peça
  que satisfaz essa checagem (testado ausente/vazio/arbitrário/valor-de-outra-sessão: todos 401).
  Mecanismo provável: cookie/header no padrão AngularJS (`XSRF-TOKEN` → `X-XSRF-TOKEN`), ainda
  **não resolvido**. Endpoints `/resources/service/*` e `/resources/public/*` **não** exigem XSRF,
  então o fluxo de relatórios não depende disso.

## 1. Login — `POST /TasyAppServer/resources/public/security/oauth`

Request (sem autenticação prévia; um GET a qualquer endpoint público antes disso já resolve o
cookie `TASYAPPSERVER`):

```
POST /TasyAppServer/resources/public/security/oauth
Content-Type: application/json;charset=UTF-8

{"username":"<user>","password":"<pass>","computerName":null,"osUsername":null,"scope":"WTASY","timezone":"America/Sao_Paulo","ipMachine":null}
```

Resposta 200:

```json
{
  "access_token": "<JWT>",
  "token_type": "BEARER",
  "expires_in": 10,
  "refresh_expires": 1440,
  "refresh_token": "<opaque>"
}
```

Erros conhecidos: `400 {"code":1100,"message":"O usuário e as credenciais enviadas não coincidem."}`
(credencial inválida).

## 2. Refresh — `POST /TasyAppServer/resources/public/security/oauth/refresh`

Só aceita **JSON com a chave `refreshToken`** (camelCase). Form-urlencoded e query string
retornam `500 RESTEASY003065: Cannot consume content type`.

```
POST /TasyAppServer/resources/public/security/oauth/refresh
Content-Type: application/json;charset=UTF-8

{"refreshToken":"<opaque>"}
```

Resposta 200: mesmo formato do login (novo `access_token`, `expires_in: 10`).

## 3. Chamada de serviço autenticada — `/TasyAppServer/resources/service/<Servico>/<metodo>`

Padrão de payload do TASY: **array de parâmetros tipados** `{tipo, valor}`. Exemplo mínimo
validado (retorna 200 só com o bearer, sem XSRF):

```
POST /TasyAppServer/resources/service/WParameter/getParameter
Authorization: BEARER <token>
Content-Type: application/json;charset=UTF-8

[{"tipo":"Integer","valor":0},{"tipo":"Integer","valor":87}]
```

Tipos observados no protocolo: `Integer`, `String`, `Boolean`/`boolean`, `ArrayList`, `HashMap`,
`LinkedHashMap`, `Map`.

## 4. Trocar estabelecimento — `POST /service/CorSis_FK/performAction`

```
[{"tipo":"HashMap","valor":{"CD":<cd_estab>,"IS_DEFAULT_ESTAB":false}}]
```

`/service/*` — não exige XSRF. `CD` é o código interno do estabelecimento.

## 5. Trocar perfil — `POST /user/profile`  ⚠️ requer XSRF

```
{"profile":<id>,"changingProfile":true}
```

Endpoint `/user/*` — **bloqueado pela checagem XSRF ainda não resolvida**. Não é necessário para
o fluxo de relatórios atual.

## 6. Gerar relatório — `POST /service/Report/generateReports`

Body é um array cujo 1º item é um DTO `ReportsParam` contendo `reports: [ReportParam]`, seguido de
um "eco" de parâmetros posicionais. O `ReportParam` carrega `title`, `type`, `code`, `parameters`
(mapa nome→valor, com datas no formato `java.time.Instant`) e flags de impressão. A resposta traz
os nomes dos arquivos gerados (`xlsFileName`/`fileName`).

Datas usam o wrapper:

```json
{"@class":"java.time.Instant","type":"INSTANT","value":"2026-07-01T03:00:00.000Z"}
```

(03:00Z = meia-noite em America/Sao_Paulo.)

## 7. Metadados do relatório — `POST /service/Report/getReportsData`

Recebe um `ReportsParam` reduzido e devolve os metadados/estrutura de parâmetros do relatório.
Serve para **gerar o registro de catálogo** de um relatório novo a partir de uma captura, em vez
de montar o schema à mão.

## 8. Download do arquivo gerado — `GET /TasyAppServer/resources/files/<nome>`

Retorna o binário. O "`.xls`" do TASY é, na prática, **TSV em UTF-16-BE** (a conversão para CSV é
responsabilidade do consumidor, fora do escopo desta biblioteca).

## 9. Ocupação hospitalar — `POST /schematic/atepacfn/cpanels/18273/datasource`

Família **esquemática** (`schematic/cpanel`), fora de `/service` e `/report`. Painel de ocupação
de leitos (função `atepacfn`, feature-code `44`). Só bearer — **não exige XSRF nem os headers de
feature** (testado: bearer-only = 200 idêntico). Corpo é JSON objeto (não o array `{tipo,valor}`).
Parâmetro-chave: `parameters.CD_ESTAB_OCUPACAO` (código do estabelecimento).

```
POST /TasyAppServer/resources/schematic/atepacfn/cpanels/18273/datasource?dictionaryCode=372558
Authorization: BEARER <JWT>
Content-Type: application/json;charset=UTF-8

{"actionName":"OccupancyAction","activationType":"NamedAction","filterValues":{"NR_SEQ_AGRUPAMENTO":"0","IE_TODOS_ESTAB":"N","_filterCode":418873,"_dimensionValues":{}},"legendDefinition":null,"pageBegin":1,"parameters":{"_schematicObjCode":18273,"NR_SEQ_AGRUPAMENTO":"0","IE_TODOS_ESTAB":null,"_filterCode":418873,"_dimensionValues":{},"CD_ESTAB_OCUPACAO":14},"recordsPerPage":1000,"sortAscending":true}
```

Resposta: `dados.linhasResultSet[]` = uma linha **agregada por setor** (sem PII). Exemplo de input
e output completos, campos-chave e sonda: ver [`ENDPOINTS.md` §10](./ENDPOINTS.md#10-ocupação-hospitalar).

## 10. Prontuário (2 passos) — `/service/*`, dado clínico (PHI)

Fluxo por **atendimento** (`nrAtendimento`), família `/service/*` (só bearer, sem XSRF). É **PHI** —
regras de LGPD se aplicam (minimização, log de acesso). Dois passos:

**10.1 — cabeçalho/ativar atendimento** `POST /service/WPaciente/wPacienteLerAtendimentoGWT`

```
POST /TasyAppServer/resources/service/WPaciente/wPacienteLerAtendimentoGWT
Authorization: BEARER <JWT>
Content-Type: application/json;charset=UTF-8

[{"tipo":"WPacienteAtivarVO","valor":{"nrAtendimento":55859107}},{"@class":"br.com.philips.tasy.dto.shared.AccessControlResult","accessType":"RW","externalAccess":false,"tabParentCode":0}]
```

Retorna `dados.valores` = mapa plano (~100 campos) do paciente/encontro.

**10.2 — evoluções clínicas** `POST /service/DataSourceProvider/getDataSource`

Corpo `RequisicaoDataSource` (`actionName:"ActivateClinicalNotesAction"`, tabela `EVOLUCAO_PACIENTE`,
feature-code `281`), janela `DT_INICIO`/`DT_FIM` (wrapper `java.time.Instant`), paginado
(`page`/`qtRegistrosPagina`=500). Retorna `dados.linhasResultSet[]` = 1 linha por evolução, com o
texto livre em `DS_EVOLUCAO`. Corpo extenso — ver a sonda `discovery/probe6-prontuario.mjs`.

Exemplos completos de input e output (sintéticos), campos-chave e nota de LGPD: ver
[`ENDPOINTS.md` §11–12](./ENDPOINTS.md#11-prontuário--cabeçalho-do-paciente).

> **Nota:** os tokens/cookies acima são ilustrativos. Capturas reais (com JWT/PII) ficam só em
> `discovery/*` (gitignored), nunca neste arquivo.
