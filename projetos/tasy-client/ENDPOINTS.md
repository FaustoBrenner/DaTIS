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

## 13. Agenda Exames

```
fetch("https://hismorumbi.rededor.com.br/TasyAppServer/resources/service/DataSourceProvider/getDataSource", {
  "headers": {
    "accept": "application/json, text/plain, */*",
    "accept-language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7,fr;q=0.6",
    "active-feature-code": "820",
    "authorization": "BEARER <BEARER_TOKEN>",
    "content-type": "application/json;charset=UTF-8",
    "crsftoken": "<CRSFTOKEN>",
    "developer-mode": "false",
    "feature-code": "820",
    "feature-route": "atepaca1",
    "locale-customization": "all",
    "priority": "u=1, i",
    "sec-ch-ua": "\"Google Chrome\";v=\"149\", \"Chromium\";v=\"149\", \"Not)A;Brand\";v=\"24\"",
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": "\"Windows\"",
    "sec-fetch-dest": "empty",
    "sec-fetch-mode": "cors",
    "sec-fetch-site": "same-origin",
    "tasybackendversion": "dev",
    "cookie": "JSESSIONID=<JSESSIONID>; TASYAPPSERVER_HISMORUMBI=<AFFINITY>; TASYAPPSERVER=<AFFINITY>; hasPerformedSuccessfulLogin=true; SERVERID=<SERVERID>; Authorization=BEARER+<BEARER_TOKEN>; NGSESSION=<NGSESSION>",
    "Referer": "https://hismorumbi.rededor.com.br/"
  },
  "body": "[{\"tipo\":\"RequisicaoDataSource\",\"@class\":\"br.com.wheb.vo.componentes.metaData.RequisicaoDataSource\",\"page\":1,\"fieldActivators\":{},\"selectFirstRecord\":false,\"paramsByName\":{\"_schematicObjCode\":725754,\"CD_AGENDA\":5667,\"IE_PAR_312\":\"N\",\"isToReloadActivationParameters\":true,\"cdSetorAtendimento\":167,\"IE_GERAR_HORARIOS\":\"S\",\"DT_INICIAL\":{\"@class\":\"java.time.Instant\",\"type\":\"INSTANT\",\"value\":\"2026-07-24T03:00:00.000Z\"},\"IE_APRESENTACAO\":\"0\",\"IE_TURNO\":\"2\",\"IE_EXIBIR_INATIVOS\":\"N\",\"IE_EXIBIR_CANCELADAS\":\"N\",\"IE_SOMENTE_MARCADAS\":\"N\",\"IE_SOMENTE_LIVRES\":\"N\",\"IE_SOMENTE_ENCAIXE\":\"N\",\"IE_SOMENTE_ANESTESIA\":\"N\",\"IE_ATENDIMENTO\":\"2\",\"_filterCode\":719434,\"_checkoutFilters\":[],\"DS_AGENDAS\":\"27224,13018,5674,13222,5673,13019,13223,27222,764,765,805,806,807,12031,10091,7098,1201,9086,4236,5894,10556,11898,3770,3187,1841,3709,21185,267,9738,9814,24808,266,1095,21082,21166,21167,279,9201,4972,14905,12886,12843,12831,12800,12892,12856,12826,12862,12928,17441,12878,12877,12839,12801,12798,12864,12631,12946,12948,13061,13145,13053,13064,12949,12950,12947,14739,12945,12619,18247,18393,18461,18485,18437,18394,18474,18246,16681,8394,17547,16842,5755,5781,5289,993,2762,6058,5726,8575,12396,14881,5121,9578,7883,3567,5915,4712,1159,2270,3720,7936,12589,14151,7397,1058,7463,9594,7996,5178,5746,1069,21994,5251,1077,9591,1081,7488,6060,7547,9475,17257,17255,3312,3953,10065,8527,1079,7462,7994,5801,18152,7461,10063,3999,4387,4855,3992,3993,4209,3998,3995,3990,3989,3986,4824,4838,4826,4833,4846,4847,4851,4848,4849,4850,4852,4854,4856,4857,4858,4859,4870,4872,4873,4871,3997,17450,9495,11225,8906,8803,8821,8888,8882,8865,9364,22201,22150,8939,8884,8855,22200,8850,8809,8823,8795,16608,10519,17393,8750,5999,3996,5207,3987,5335,5327,5330,5642,5349,5333,5340,5345,5336,5526,5641,5328,5344,5350,5331,5334,5337,5615,5622,5696,5502,5343,5329,5342,5628,5352,4197,4151,14874,13884,23421,13872,14986,13885,13508,17668,13886,13652,16081,13507,17679,14794,7476,5677,9807,5669,7974,10654,9421,5682,14496,5687,5699,9850,10415,12189,10309,4557,12079,4611,10224,4612,5676,5675,50,5697,5698,5667,5679,5670,17740,14885,12788,7257,18109,18054,9454,17411,17412,17413,6612,6611,17414,17415,17416,23321,22276,6613,6610,17830,6666,6968,6775,17417,17418,6607,12202,2529,24295,24294,24387,4951,355,3177,1863,389,14116,13487,13831,14949,21477,15430,15523,15424,15538,17744,17544,17470,15425,15426,15423,11275,14433,11291,11288,11444,11268,15504,15761,11289,11267,11287,18132,10438,7006,6863,6585,6458,6460,12973,6467,6589,6464,6459,6457,8175,6446,6447,6448,7595,8618,6451,21454,21656,21528,21442,21441,21538,24274,23770,25618,27221,27370,23037,25617,27589,22261,27480,22245,25623,25456,22347,27346,26005,23046,23200,22126,22564,22216,22343,22342,22249,22874,22367,22496,22488,22424,22463,22437,22521,24678,23233,23771,23234,23853,24038,24139,23990,24593,25000,24961,25825,26337,25800,25985,27195,25986,26594,26694,26647,26732,27041,27150,27225,27363,25691,25695,25696,25697,25698,25699,25700,25701\",\"_dimensionValues\":{}},\"legendDef\":{},\"functionVariables\":{\"CD_ESTAB_ORIG_P\":14,\"FIRST_ACTIVATION\":false,\"IE_GERAR_HORARIOS\":\"N\",\"IE_MOSTRAR_ORIENTACAO\":\"S\"},\"tableName\":\"AGENDA_PACIENTE\",\"nrSeqVisao\":71051,\"nrSeqAtivacao\":75378,\"featureCode\":820,\"tableDescription\":\"AGENDA_PACIENTE_820_71051_dg\",\"schematicsObj\":725754,\"tipoAtivacao\":6,\"inicioPagina\":1,\"actionName\":\"activatePatientSchedule\",\"qtRegistrosPagina\":150,\"qtMaxRegistros\":0,\"unificarCountRegistros\":true,\"withoutCache\":false,\"allAttributes\":[\"DS_OBSERVACAO\",\"QT_ALTURA_CM\",\"DT_STATUS_PAC\",\"NM_MEDICO_AUXILIAR\",\"DS_AUTORIZACAO\",\"NR_SEQ_EVENTO_ATEND\",\"DS_COR_CLASSIF\",\"DT_EXECUTADA\",\"NR_SEQ_TIPO_CLASSIF_PAC\",\"CD_MEDICO_REQ\",\"NR_RESERVA\",\"NM_PACIENTE_FUNC\",\"IE_EXIGE_LADO_PROC\",\"IE_CARONA_AMIGA\",\"IE_TIPO_ATEND\",\"NR_SEQ_SALA\",\"CD_SETOR_DESTINO\",\"DS_STATUS_ORIENTACAO\",\"QT_PESO\",\"IE_LEITO\",\"CD_SENHA_AUTOR\",\"DS_PROCEDENCIA\",\"DS_TIPO_ATENDIMENTO\",\"DS_COR_CONV\",\"DS_CIRURGIA\",\"DS_AVISO\",\"QT_AGENDAS_OCUPADO_DIA\",\"IE_REGRA_ESTAGIO_AUTOR\",\"NR_SEQ_OFTALMO\",\"DS_OBS_FINAL_AGEINT\",\"DT_AGENDAMENTO\",\"NR_SEQ_FORMA_CONFIRMACAO\",\"NR_SEQUENCIA\",\"DS_OBS_GRID\",\"CD_AGENDAMENTO_EXTERNO\",\"IE_ENCAIXE\",\"DS_COR_PROCED\",\"IE_FORMA_AGENDAMENTO\",\"DS_OBS_RESERVA\",\"IE_ATUALIZOU_AUTOATENDIMENTO\",\"DS_SEXO\",\"CD_PESSOA_FISICA\",\"IE_ORIGEM_PROCED\",\"NM_USUARIO_ORIG\",\"DS_LADO\",\"DS_ESTAGIO_AUTOR\",\"DS_PRONTUARIO_EXT\",\"DT_ENVIO_CONS\",\"CD_CATEGORIA\",\"DT_ATUALIZACAO\",\"IE_TIPO_ATEND_AGENDA\",\"NM_MEDICO_EXTERNO\",\"CD_AUTORIZACAO\",\"DS_CIRURGIA_GRID\",\"CD_PROCEDIMENTO_TUSS\",\"NM_EMPRESA\",\"IE_HR_DISP\",\"NR_ATENDIMENTO\",\"NR_SEQ_STATUS_PAC\",\"DS_USUARIO\",\"DS_PROC_INTERNO\",\"CD_SETOR_ATENDIMENTO\",\"IE_ANESTESIA\",\"IE_PAC_INTERNADO\",\"NM_USUARIO_CONFIRM_ENCAIXE\",\"CD_ESTAB_AGENDA\",\"QT_TEMPO_ATEND\",\"NR_SEQ_PEPO\",\"NM_USUARIO_ACESSO\",\"DT_OBITO\",\"DT_VALIDADE_CARTEIRA\",\"DS_CONVENIO\",\"DS_ESTAGIO_PRESCR\",\"NR_PRONTUARIO_PF\",\"IE_AGENDA_EM_AGENDAMENTO\",\"IE_NECESSITA_INTERNACAO\",\"CD_MEDICO\",\"DS_PROCEDIMENTO\",\"DT_ATENDIMENTO\",\"NR_PRESCRICAO\",\"IE_ANAMNESE\",\"DT_ATENDIDO\",\"CD_PESSOA_INDICACAO\",\"QT_IDADE_PACIENTE\",\"QT_IDADE_MES\",\"DS_PREFERENCIA\",\"IE_TIPO_ATENDIMENTO\",\"DS_STATUS_PACIENTE\",\"DS_ORIENTACAO\",\"DS_PROCEDIMENTO_TUSS\",\"IE_PERMITE_ALTERAR\",\"NR_SEQ_APRESENT\",\"IE_PERMITE_VINCULAR\",\"DS_COR_FONTE_STATUS_PAC\",\"IE_AGENDA_ATEND\",\"DS_COR_FUNDO\",\"DS_COR_FUNDO_AGENDA\",\"IE_LADO\",\"NR_SECAO\",\"CD_PROCEDIMENTO\",\"DT_GERACAO_SENHA\",\"DS_COR_AVISO\",\"CD_PROFISSIONAL_PREF\",\"DS_COR_FONTE\",\"IE_COD_USUARIO_MAE_RESP\",\"DS_EXAME_ADIC\",\"IE_MOSTRA_HOR_DISP_MEDIC\",\"DS_IDADE_PACIENTE\",\"DS_PROTOCOLO_CANCL\",\"NM_USUARIO\",\"DS_OBS_TURNO\",\"CD_ANESTESISTA\",\"CD_SETOR_AGENDA\",\"DT_AGENDA\",\"DT_VINCULACAO_ATENDIMENTO\",\"NR_SEQ_REGULACAO\",\"NM_SOCIAL\",\"IE_AGENDA_DIA\",\"HR_INICIO\",\"DS_OBS_AUTOR\",\"DT_CONFIRMACAO\",\"NR_CONTROLE_SUS\",\"QT_IG_DIA\",\"NM_USUARIO_RESERVA\",\"NR_ATEND_PLS\",\"DS_COR_FONTE_PROCEDENCIA\",\"NR_SEQ_PREFERENCIA\",\"CD_USUARIO_CONVENIO\",\"NM_MEDICO_EXEC\",\"IE_ALERTA_PF\",\"IE_STATUS_AGENDA\",\"NR_SEQ_ORIGEM\",\"NM_PACIENTE_AGENDA\",\"NR_SEQ_COBERTURA\",\"DS_PRECAUCAO\",\"QT_TEMP_ATRASO_EXEC\",\"NR_SEQ_HORARIO\",\"IE_TIPO_GUIA\",\"NR_SEQ_UNID_SOLIC_EXT\",\"DT_NASCIMENTO_PAC\",\"NR_SEQ_CLASSIF_AGEINT\",\"DS_USUARIO_ORIG\",\"NR_TELEFONE\",\"DS_AGENDA\",\"DT_FINAL_AGENDAMENTO\",\"DT_SOLIC_MEDICO\",\"IE_TEM_PACIENTE\",\"DT_CHEGADA\",\"NR_SEQ_SEGURADO\",\"DT_EM_EXAME\",\"CD_MOTIVO_CANCELAMENTO\",\"IE_STATUS_LAUDO\",\"DS_COR_FONTE_AGENDA\",\"NR_MINUTO_DURACAO\",\"DS_EMAIL\",\"CD_CONVENIO\",\"NR_SEQ_AVAL_PRE\",\"CD_PLANO\",\"NM_ANESTESISTA\",\"IE_SITUACAO\",\"NM_USUARIO_VINCULO_ATEND\",\"QT_IDADE_MESES\",\"DS_SETOR_PACIENTE\",\"NR_SEQ_LISTA\",\"IE_AUTORIZACAO\",\"CD_TOPOGRAFIA_PROCED\",\"DS_ESPECIALIDADE\",\"QT_TEMPO_AGUARD\",\"IE_AGEND_CONFIRM_SMS\",\"IE_RESERVA_LEITO\",\"DS_PERFIL\",\"CRM_MEDICO_EXTERNO\",\"DS_MOTIVO_FALTA\",\"DT_ENVIO_ORIENT\",\"DS_TIMEZONE\",\"NR_DOC_CONVENIO\",\"CD_REGULACAO_SUS\",\"DS_GRUPO_PACIENTE\",\"DS_STATUS_AGENDA\",\"NM_PESSOA_CONTATO\",\"QT_AGENDAS_LIVRES_DIA\",\"CD_AUXILIAR\",\"DT_CANCELAMENTO\",\"CD_CNPJ_PRESTADOR\",\"NM_PACIENTE\",\"DS_STATUS_EXEC_GE\",\"NR_SEQ_INDICACAO\",\"NM_USUARIO_CONFIRM\",\"NR_SEQ_TRANSPORTE\",\"IE_ESCALA\",\"DS_CLASSIF_AGENDA\",\"NM_PROFISSIONAL_PREF\",\"NM_MEDICO\",\"CD_TIPO_AGENDA\",\"NR_SEQ_CLASSIF_AGENDA\",\"NR_SEQ_INTERNO\",\"CD_DOENCA_CID\",\"DS_FORMA_TRANSPORTE\",\"QT_TEMPO_PROC\",\"IE_CONSENTIMENTO\",\"QT_AGENDAS_TOTAL_DIA\",\"CD_TIPO_ANESTESIA\",\"NR_CONTROLE\",\"NM_MED_RESP_LAUDO\",\"CD_AGENDA\",\"DT_ENTRADA_ATEND\",\"CD_SENHA_GERADA\",\"QT_TOTAL_SECAO\",\"CD_MEDICO_EXEC\",\"IE_POSSUI_HISTORICO\",\"DT_ULTIMA_MENSTRUACAO\",\"QT_IG_SEMANA\",\"DS_MOTIVO\",\"DS_SENHA\",\"CD_PROCEDENCIA\",\"NR_SEQ_MOTIVO_ANEST\",\"DS_MUNICIPIO_IBGE\",\"CD_EMPRESA_REF\",\"DS_PROFISSAO_PF\",\"CD_SETOR_ORIGEM\",\"DS_ABRANGENCIA\",\"DS_COR_FUNDO_STATUS_PAC\",\"DS_SALA\",\"IE_AGENDA_WEB\",\"CD_CHAVE_REGULACAO_SUS\",\"CD_UNIDADE_EXTERNA\",\"QT_TEMPO_STATUS_PAC\",\"CD_TURNO\",\"DS_CONFIRMACAO\",\"DS_PROTOCOLO\",\"CD_TIPO_ACOMODACAO\",\"NR_SEQ_MOTIVO_AGENDAMENTO\",\"DS_TIPO_ANESTESIA\",\"DS_COR_FUNDO_PROCEDENCIA\",\"NR_SEQ_PROC_INTERNO\"],\"ieLibera\":false,\"newParams\":{},\"saveOrderBy\":true,\"filterValues\":{\"CD_AGENDA\":5667,\"IE_PAR_312\":\"N\",\"_dimensionValues\":{},\"CD_ESTABELECIMENTO\":null,\"CD_SETOR\":null,\"NR_SEQ_GRUPO\":null,\"CD_CONVENIO\":null,\"NR_SEQ_AGRUPAMENTO\":null,\"DT_INICIAL\":{\"@class\":\"java.time.Instant\",\"type\":\"INSTANT\",\"value\":\"2026-07-24T03:00:00.000Z\"},\"IE_APRESENTACAO\":\"0\",\"IE_TURNO\":\"2\",\"IE_EXIBIR_INATIVOS\":\"N\",\"IE_EXIBIR_CANCELADAS\":\"N\",\"IE_SOMENTE_MARCADAS\":\"N\",\"IE_SOMENTE_LIVRES\":\"N\",\"IE_SOMENTE_ENCAIXE\":\"N\",\"IE_SOMENTE_ANESTESIA\":\"N\",\"IE_ATENDIMENTO\":\"2\",\"_filterCode\":719434,\"_checkoutFilters\":[],\"DS_AGENDAS\":\"27224,13018,5674,13222,5673,13019,13223,27222,764,765,805,806,807,12031,10091,7098,1201,9086,4236,5894,10556,11898,3770,3187,1841,3709,21185,267,9738,9814,24808,266,1095,21082,21166,21167,279,9201,4972,14905,12886,12843,12831,12800,12892,12856,12826,12862,12928,17441,12878,12877,12839,12801,12798,12864,12631,12946,12948,13061,13145,13053,13064,12949,12950,12947,14739,12945,12619,18247,18393,18461,18485,18437,18394,18474,18246,16681,8394,17547,16842,5755,5781,5289,993,2762,6058,5726,8575,12396,14881,5121,9578,7883,3567,5915,4712,1159,2270,3720,7936,12589,14151,7397,1058,7463,9594,7996,5178,5746,1069,21994,5251,1077,9591,1081,7488,6060,7547,9475,17257,17255,3312,3953,10065,8527,1079,7462,7994,5801,18152,7461,10063,3999,4387,4855,3992,3993,4209,3998,3995,3990,3989,3986,4824,4838,4826,4833,4846,4847,4851,4848,4849,4850,4852,4854,4856,4857,4858,4859,4870,4872,4873,4871,3997,17450,9495,11225,8906,8803,8821,8888,8882,8865,9364,22201,22150,8939,8884,8855,22200,8850,8809,8823,8795,16608,10519,17393,8750,5999,3996,5207,3987,5335,5327,5330,5642,5349,5333,5340,5345,5336,5526,5641,5328,5344,5350,5331,5334,5337,5615,5622,5696,5502,5343,5329,5342,5628,5352,4197,4151,14874,13884,23421,13872,14986,13885,13508,17668,13886,13652,16081,13507,17679,14794,7476,5677,9807,5669,7974,10654,9421,5682,14496,5687,5699,9850,10415,12189,10309,4557,12079,4611,10224,4612,5676,5675,50,5697,5698,5667,5679,5670,17740,14885,12788,7257,18109,18054,9454,17411,17412,17413,6612,6611,17414,17415,17416,23321,22276,6613,6610,17830,6666,6968,6775,17417,17418,6607,12202,2529,24295,24294,24387,4951,355,3177,1863,389,14116,13487,13831,14949,21477,15430,15523,15424,15538,17744,17544,17470,15425,15426,15423,11275,14433,11291,11288,11444,11268,15504,15761,11289,11267,11287,18132,10438,7006,6863,6585,6458,6460,12973,6467,6589,6464,6459,6457,8175,6446,6447,6448,7595,8618,6451,21454,21656,21528,21442,21441,21538,24274,23770,25618,27221,27370,23037,25617,27589,22261,27480,22245,25623,25456,22347,27346,26005,23046,23200,22126,22564,22216,22343,22342,22249,22874,22367,22496,22488,22424,22463,22437,22521,24678,23233,23771,23234,23853,24038,24139,23990,24593,25000,24961,25825,26337,25800,25985,27195,25986,26594,26694,26647,26732,27041,27150,27225,27363,25691,25695,25696,25697,25698,25699,25700,25701\"}}]",
  "method": "POST"
});
```

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
