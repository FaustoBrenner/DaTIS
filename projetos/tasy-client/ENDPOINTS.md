# TASY — Catálogo de Endpoints

`[PARA REVISÃO]`

Referência canônica dos endpoints XHR do TASY consumidos pelo `tasy-client`. Cada entrada traz:
**contexto de request**, **autenticação**, **input** (com exemplo) e **output** (com exemplo).
É a fonte de verdade no nível de request/response — complementa:

- [`documentation.md`](./documentation.md) — referência da **biblioteca** (classes, métodos).
- [`full_request_workflow.md`](./full_request_workflow.md) — narrativa do **protocolo** e modelo de auth.

> **Segurança/LGPD.** Todos os tokens, cookies e dados de paciente nos exemplos abaixo são
> **ilustrativos/sintéticos** — segredos e PII reais nunca entram neste arquivo. Exemplos de saída
> de prontuário são sintéticos; a estrutura (nomes de campo, tipos) é real, os valores não.

---

## Convenções gerais

- **Base URL:** `http://hismorumbi.rededor.corp` (unidade Morumbi; sobrescrevível por `TASY_BASE_URL`).
- **Prefixo comum:** `/TasyAppServer/resources/...`.
- **Autenticação:** header `Authorization: BEARER <access_token>` (JWT). Ver [Login](#1-login).
  Access token dura **10 min**; refresh token **24h**. Só endpoints `/public/*` dispensam o bearer.
- **XSRF:** só os endpoints `/user/*` exigem o header `crsftoken` (valor emitido pelo servidor no
  header de resposta `xsrf-token`). `/service/*`, `/schematic/*` e `/public/*` **não** exigem.
- **Content-Type:** `application/json;charset=UTF-8` em todos os POST.
- **Cookies de infra:** `TASYAPPSERVER` (afinidade de load balancer) e `JSESSIONID` acompanham a
  sessão; o cliente os mantém automaticamente.

### Famílias de endpoint

| Família | Path | Corpo | Auth | Exemplos |
|---|---|---|---|---|
| Público | `/resources/public/*` | JSON objeto | nenhuma | login, refresh |
| Serviço | `/resources/service/<Svc>/<método>` | **array** de `{tipo,valor}` ou DTO | bearer | getParameter, relatórios, prontuário |
| Esquemático | `/resources/schematic/<rota>/cpanels/<id>/datasource` | JSON objeto | bearer | ocupação |
| Usuário | `/resources/user/*` | JSON objeto | bearer **+ XSRF** | user/data, troca de perfil |
| Arquivo | `/resources/files/<nome>` | — (GET) | bearer | download de relatório |

### Headers de "feature" (opcionais)

A UI envia headers extras (`feature-code`, `feature-route`, `active-feature-code`, `developer-mode`,
`tasybackendversion`, `locale-customization`). **Testado: são supérfluos** — os endpoints respondem
igual só com o bearer. Documentados por endpoint apenas como pista de contexto (qual função/tela do
TASY dispara a chamada).

---

## 1. Login

**`POST /TasyAppServer/resources/public/security/oauth`**

- **Contexto:** primeira autenticação. Um GET a qualquer endpoint `/public/*` antes disso resolve o
  cookie de afinidade `TASYAPPSERVER`.
- **Autenticação:** nenhuma (endpoint público).

**Input:**
```json
{"username":"<user>","password":"<pass>","computerName":null,"osUsername":null,"scope":"WTASY","timezone":"America/Sao_Paulo","ipMachine":null}
```

**Output (200):**
```json
{"access_token":"<JWT>","token_type":"BEARER","expires_in":10,"refresh_expires":1440,"refresh_token":"<opaque>"}
```
> `expires_in`/`refresh_expires` são em **minutos**. O servidor também emite o header de resposta
> `xsrf-token` (usado depois pelos endpoints `/user/*`).

**Erro conhecido:** `400 {"code":1100,"message":"O usuário e as credenciais enviadas não coincidem."}`

---

## 2. Refresh de token

**`POST /TasyAppServer/resources/public/security/oauth/refresh`**

- **Contexto:** renovar o access token sem novo login. Só aceita JSON com a chave camelCase
  `refreshToken` (form-urlencoded/query → `500 RESTEASY003065`).
- **Autenticação:** nenhuma (usa o refresh token no corpo).

**Input:**
```json
{"refreshToken":"<opaque>"}
```

**Output (200):** idêntico ao [Login](#1-login) (novo `access_token`, `expires_in:10`).

---

## 3. Chamada de serviço genérica

**`POST /TasyAppServer/resources/service/<Servico>/<metodo>`**

- **Contexto:** padrão de todas as chamadas `/service/*`. Corpo é um **array de parâmetros tipados**
  `{tipo, valor}`. Tipos observados: `Integer`, `String`, `Boolean`/`boolean`, `ArrayList`,
  `HashMap`, `LinkedHashMap`, `Map` (+ DTOs com `@class`, ver prontuário).
- **Autenticação:** bearer. Sem XSRF.

**Exemplo — `WParameter/getParameter`:**

**Input:**
```json
[{"tipo":"Integer","valor":0},{"tipo":"Integer","valor":87}]
```
**Output (200):** valor do parâmetro (formato depende do parâmetro consultado).

---

## 4. Trocar estabelecimento (unidade)

**`POST /TasyAppServer/resources/service/CorSis_FK/performAction`**

- **Contexto:** define o estabelecimento ativo da sessão. `CD` é o código interno da unidade.
- **Autenticação:** bearer. Sem XSRF.

**Input:**
```json
[{"tipo":"HashMap","valor":{"CD":14,"IS_DEFAULT_ESTAB":false}}]
```
**Output (200):** confirmação da ação (o cliente ignora o corpo; sucesso = HTTP 2xx).

---

## 5. Trocar perfil  ⚠️ requer XSRF

**`POST /TasyAppServer/resources/user/profile`**

- **Contexto:** troca o perfil ativo do usuário. Endpoint `/user/*`.
- **Autenticação:** bearer **+ header `crsftoken`** (token XSRF emitido no login).

**Input:**
```json
{"profile":123,"changingProfile":true}
```
**Output (200):** dados do perfil ativo. Sem o XSRF: `401 {"message":"request not allowed (XSRF)"}`.

---

## 6. Dados do usuário / sessão  ⚠️ requer XSRF

**`GET /TasyAppServer/resources/user/data`**

- **Contexto:** perfil, estabelecimentos disponíveis e metadados da sessão. Base do
  `EstablishmentService.list()` (resolução de estabelecimento por nome).
- **Autenticação:** bearer **+ `crsftoken`**.

**Input:** nenhum (GET).

**Output (200) — recorte:**
```json
{
  "estabelecimentos": [
    {"cdEstabelecimento":14,"dsEstabelecimento":"SAO LUIZ - UNIDADE MORUMBI","dsRazaoSocial":"..."}
  ],
  "perfilAtivo": {"cdPerfil":123,"dsPerfil":"..."}
}
```
> Nomes de campo exatos conforme o servidor; o `EstablishmentService` normaliza para
> `{code, name, tradingName}`.

---

## 7. Gerar relatório

**`POST /TasyAppServer/resources/service/Report/generateReports`**

- **Contexto:** dispara a geração de um relatório do catálogo TASY. 1º item do array é o DTO
  `ReportsParam` (contendo `reports:[ReportParam]`), seguido de um "eco" posicional de parâmetros.
- **Autenticação:** bearer. Sem XSRF.

**Input (recorte):**
```json
[
  {"reports":[{
    "title":"HMSL - Desfecho internação PA (excel)","type":"CATE","code":3142,
    "parameters":{
      "CD_ESTAB":14,
      "DT_INICIAL":{"@class":"java.time.Instant","type":"INSTANT","value":"2026-07-14T03:00:00.000Z"},
      "DT_FINAL":{"@class":"java.time.Instant","type":"INSTANT","value":"2026-07-14T03:00:00.000Z"}
    },
    "fileExportType":"XLS"
  }]},
  14, "2026-07-14T03:00:00.000Z"
]
```
> Datas usam o wrapper `java.time.Instant` (`03:00Z` = meia-noite em America/Sao_Paulo, UTC-3).

**Output (200):** nomes dos arquivos gerados.
```json
{"reports":[{"xlsFileName":"rel_3142_20260714_abc123.xls","fileName":"rel_3142_20260714_abc123.xls"}]}
```

---

## 8. Metadados de relatório

**`POST /TasyAppServer/resources/service/Report/getReportsData`**

- **Contexto:** devolve a estrutura/parâmetros de um relatório. Serve para **gerar o registro de
  catálogo** de um relatório novo a partir de uma captura, em vez de montar o schema à mão.
- **Autenticação:** bearer. Sem XSRF.

**Input:** um `ReportsParam` reduzido (só a identificação do relatório).
**Output (200):** metadados/estrutura de parâmetros do relatório.

---

## 9. Download de arquivo gerado

**`GET /TasyAppServer/resources/files/<nome>`**

- **Contexto:** baixa o binário produzido pelo [generateReports](#7-gerar-relatório).
- **Autenticação:** bearer.

**Input:** nome do arquivo na URL (URL-encoded).
**Output (200):** binário. O "`.xls`" do TASY é, na prática, **TSV em UTF-16-BE** (conversão para
CSV é responsabilidade do consumidor — ver `tsvToCsv` na biblioteca).

---

## 10. Ocupação hospitalar

**`POST /TasyAppServer/resources/schematic/atepacfn/cpanels/18273/datasource?dictionaryCode=372558`**

- **Contexto:** painel de ocupação de leitos (função `atepacfn`, feature-code `44`, cpanel `18273`).
  Alimenta o **P4 — gestão de leitos**. Família `schematic/cpanel` (não `/service`).
- **Autenticação:** bearer. **Sem XSRF** e **sem os headers de feature** (testado: bearer-only = 200
  idêntico).
- **Dado:** **agregado por setor, sem PII.**
- **Parâmetro-chave:** `parameters.CD_ESTAB_OCUPACAO` = código do estabelecimento.

**Input:**
```json
{
  "actionName":"OccupancyAction","activationType":"NamedAction",
  "filterValues":{"NR_SEQ_AGRUPAMENTO":"0","IE_TODOS_ESTAB":"N","_filterCode":418873,"_dimensionValues":{}},
  "legendDefinition":null,"pageBegin":1,
  "parameters":{"_schematicObjCode":18273,"NR_SEQ_AGRUPAMENTO":"0","IE_TODOS_ESTAB":null,"_filterCode":418873,"_dimensionValues":{},"CD_ESTAB_OCUPACAO":14},
  "recordsPerPage":1000,"sortAscending":true
}
```

**Output (200):** `dados.linhasResultSet[]` = uma linha por setor (a 1ª é o agregado "Agrupamento").
Estrutura e exemplo (valores reais — sem PII):
```json
{
  "id":"...",
  "dados":{
    "currentPage":1,"qtTotalRegistros":29,
    "linhasResultSet":[
      {
        "DS_SETOR_ATENDIMENTO":"     Unidades de internação/intensiva",
        "DS_CLASSIFICATION":"Agrupamento",
        "NR_UNIDADES_SETOR":343,"NR_UNIDADES_OCUPADAS":294,"NR_UNIDADES_LIVRES":25,
        "NR_UNIDADES_RESERVADAS":3,"NR_UNIDADES_HIGIENIZACAO":9,"NR_UNIDADES_INTERDITADAS":0,
        "QT_PAC_ISOLADO":53,"NR_AVAILABLE_BEDS":25,
        "PR_OCUPACAO":91.875,"PR_OCUPACAO_TOTAL":92.71,"PORC_LEITOS_LIVRES":7.2886
      }
    ]
  }
}
```

**Campos-chave por linha:** `DS_SETOR_ATENDIMENTO` (setor), contagens de leitos por estado
(`NR_UNIDADES_SETOR` total, `_OCUPADAS`, `_LIVRES`, `_RESERVADAS`, `_HIGIENIZACAO`, `_INTERDITADAS`),
`QT_PAC_ISOLADO`, `NR_AVAILABLE_BEDS`, e percentuais (`PR_OCUPACAO`, `PR_OCUPACAO_TOTAL`).
Sonda: `discovery/probe5-occupancy.mjs`.

**Biblioteca:** `tasy.occupancy.getOccupancy(cdEstab)` (`src/services/occupancy.ts`) — devolve
`{ estabCode, totalRegistros, rows }` com as linhas cruas (chaves do servidor preservadas). Smoke:
`scripts/smoke-occupancy.ts`.

---

## 11. Prontuário — cabeçalho do paciente

**`POST /TasyAppServer/resources/service/WPaciente/wPacienteLerAtendimentoGWT`**

- **Contexto:** "ativa" um atendimento (função PEP `atepaceh`, feature-code `281`) e devolve o
  cabeçalho do paciente/encontro. Passo 1 do fluxo de prontuário da UI.
- **Autenticação:** bearer. Sem XSRF (é `/service/*`).
- **Dado:** **PHI — identificável.** Ver [LGPD](#nota-lgpd-endpoints-de-prontuário).
- **Parâmetro-chave:** `nrAtendimento` (número do atendimento/encontro).

**Input:** array com um VO tipado + um DTO de controle de acesso.
```json
[
  {"tipo":"WPacienteAtivarVO","valor":{"nrAtendimento":55859107}},
  {"@class":"br.com.philips.tasy.dto.shared.AccessControlResult","accessType":"RW","externalAccess":false,"tabParentCode":0}
]
```

**Output (200):** `dados.valores` = mapa plano com ~100 campos do paciente/encontro. Exemplo
**sintético** (recorte representativo — estrutura real, valores fictícios):
```json
{
  "id":"...","sensitiveFields":[],"showDoctorChangeConfirm":false,"blockErrorCode":0,
  "dados":{"valores":{
    "NR_ATENDIMENTO":55859107,"NR_PRONTUARIO":123456,"CD_PESSOA_FISICA":"48818",
    "NM_PESSOA_FISICA":"FULANO DE TAL DA SILVA","NM_MAE":"MARIA DE TAL",
    "DT_NASCIMENTO":{"tipo":"Instant","@class":"java.time.Instant","value":"1970-01-15T03:00:00Z"},
    "DS_SEXO":"Masculino","IE_SEXO":"M","DS_IDADE":"56 anos","DS_ALERGIAS":"Dipirona; Penicilina",
    "IE_NEGA_ALERGIAS":"N","DS_CONVENIO":"XPTO","CD_CONVENIO":45,
    "NM_MEDICO":"DR. BELTRANO DE SOUZA","CD_MEDICO_RESP":"98765",
    "DS_UNIDADE":"APTO 512 - ALA LESTE","DS_SETOR":"INTERNACAO CLINICA","CD_SETOR":"167",
    "QT_DIA_INTERNACAO":4,"QT_ESTADIA_ATUAL":4,"IE_PACIENTE_ISOLADO":"N",
    "CD_ESTABELECIMENTO":14,"TEMP_ATUAL":36.5,"QT_PA_MAX":120,"QT_PA_MIN":80,"QT_FC":72,"QT_SATURACAO":98
  }}
}
```
> O mapa completo tem ~100 chaves (demografia, convênio, médico, setor/unidade, dias de internação,
> sinais vitais). `sensitiveFields`/`blockErrorCode` indicam controle de acesso a campos sensíveis.

---

## 12. Prontuário — evoluções clínicas

**`POST /TasyAppServer/resources/service/DataSourceProvider/getDataSource`**

- **Contexto:** lista as evoluções clínicas do atendimento (`actionName:"ActivateClinicalNotesAction"`,
  tabela `EVOLUCAO_PACIENTE`, feature-code `281`). Passo 2 do fluxo de prontuário. **Não requer
  ativação prévia** do [cabeçalho](#11-prontuário--cabeçalho-do-paciente): testado com sessão nova
  (só login) → retornou as evoluções igual (probe7). O corpo é auto-contido (`NR_ATENDIMENTO`).
- **Autenticação:** bearer. Sem XSRF.
- **Dado:** **PHI — texto clínico livre.** Ver [LGPD](#nota-lgpd-endpoints-de-prontuário).
- **Paginação:** `page` + `qtRegistrosPagina` (a UI usa 500). 1 atendimento ≈ **3,3 MB / 500 notas**.
- **Janela temporal:** `DT_INICIO`/`DT_FIM` no wrapper `java.time.Instant` (`03:00Z` = meia-noite BRT).

**Input (recorte — o corpo completo é extenso; ver `discovery/probe6-prontuario.mjs`):**
```json
[{
  "tipo":"RequisicaoDataSource","@class":"br.com.wheb.vo.componentes.metaData.RequisicaoDataSource",
  "page":1,"qtRegistrosPagina":500,
  "actionName":"ActivateClinicalNotesAction","tableName":"EVOLUCAO_PACIENTE","featureCode":281,
  "paramsByName":{
    "NR_ATENDIMENTO":54589548,"CD_PESSOA_FISICA":"48818","CD_FUNCAO_ATIVA":281,"cdSetorAtendimento":167,
    "IE_CONSIDERAR_DATAS":"S",
    "DT_INICIO":{"@class":"java.time.Instant","type":"INSTANT","value":"2026-07-02T03:00:00.000Z"},
    "DT_FIM":{"@class":"java.time.Instant","type":"INSTANT","value":"2026-07-17T03:00:00.000Z"}
  },
  "filterValues":{"NR_ATENDIMENTO":54589548,"IE_CONSIDERAR_DATAS":"S","IE_SUMARIO":"S"},
  "allAttributes":["DS_EVOLUCAO","CD_EVOLUCAO","DT_EVOLUCAO","NM_MEDICO","DS_ESPECIALIDADE","..."]
}]
```

**Output (200):** `dados.linhasResultSet[]` = uma linha por evolução. Exemplo **sintético** (1 linha;
estrutura real, texto fictício):
```json
{
  "id":"...",
  "dados":{
    "qtTotalRegistros":500,
    "linhasResultSet":[
      {
        "CD_EVOLUCAO":9001234,
        "DT_EVOLUCAO":{"tipo":"Instant","@class":"java.time.Instant","value":"2026-07-15T13:22:00Z"},
        "DS_EVOLUCAO":"Paciente estável, afebril, mantendo boa evolução clínica...",
        "IE_TIPO_EVOLUCAO":"M","DS_TIPO_EVOLUCAO":"Evolução Médica","IE_EVOLUCAO_CLINICA":"SIM",
        "CD_PESSOA_FISICA":"48818","NR_ATENDIMENTO":54589548,
        "CD_MEDICO":"98765","NM_MEDICO":"DR. BELTRANO DE SOUZA","NM_USUARIO":"bsouza",
        "CD_SETOR_ATENDIMENTO":167,"DS_SETOR_ATENDIMENTO":"INTERNACAO CLINICA",
        "IE_SITUACAO":"A","QT_TOT_REG_INT_WDBP":500,"PAGING_RN":1
      }
    ]
  }
}
```

**Campos-chave por evolução:** `DS_EVOLUCAO` (texto livre da nota), `DT_EVOLUCAO`,
`DS_TIPO_EVOLUCAO`/`IE_TIPO_EVOLUCAO`, `NM_MEDICO`/`CD_MEDICO`, `DS_ESPECIALIDADE`,
`DS_SETOR_ATENDIMENTO`, `IE_SITUACAO` (A = ativa). `QT_TOT_REG_INT_WDBP` = total de registros
(base para paginar). Sonda: `discovery/probe6-prontuario.mjs`.

### Nota LGPD — endpoints de prontuário

Os endpoints 11 e 12 retornam **dado pessoal sensível de saúde** (nome, mãe, nascimento, convênio,
diagnósticos implícitos no texto das evoluções). Diferente da [ocupação](#10-ocupação-hospitalar)
(agregada, sem PII). Qualquer job sobre esses endpoints exige: minimização de acesso, log de acesso,
justificativa de fluxo de dado e armazenamento seguro/auditável. Sondas e exemplos **nunca**
imprimem/versionam conteúdo clínico real.

---

## Resumo — matriz de endpoints

| # | Endpoint | Família | Auth | Entrada | Saída | PII |
|---|---|---|---|---|---|---|
| 1 | oauth (login) | público | nenhuma | credenciais | tokens | não |
| 2 | oauth/refresh | público | refresh token | refreshToken | tokens | não |
| 3 | service genérico | serviço | bearer | array `{tipo,valor}` | varia | varia |
| 4 | CorSis_FK/performAction | serviço | bearer | HashMap CD | ack | não |
| 5 | user/profile | usuário | bearer+XSRF | profile | perfil | não |
| 6 | user/data | usuário | bearer+XSRF | — | perfil+estabs | leve |
| 7 | Report/generateReports | serviço | bearer | ReportsParam | nomes de arquivo | — |
| 8 | Report/getReportsData | serviço | bearer | ReportsParam reduzido | metadados | não |
| 9 | files/&lt;nome&gt; | arquivo | bearer | nome | binário (TSV UTF-16BE) | **sim** |
| 10 | ocupação (schematic) | esquemático | bearer | filtros+CD_ESTAB | leitos por setor | não |
| 11 | wPacienteLerAtendimentoGWT | serviço | bearer | nrAtendimento | cabeçalho do paciente | **sim** |
| 12 | getDataSource (evoluções) | serviço | bearer | RequisicaoDataSource | evoluções clínicas | **sim** |

---

## Como manter este catálogo

Ao descobrir/alterar um endpoint (sonda em `discovery/`), atualize aqui **na mesma passada**,
mantendo o template: contexto, autenticação, input+exemplo, output+exemplo, campos-chave, e a
linha correspondente na matriz-resumo. Nunca cole tokens/cookies/PII reais — use `<JWT>`,
`<opaque>` e valores sintéticos.
