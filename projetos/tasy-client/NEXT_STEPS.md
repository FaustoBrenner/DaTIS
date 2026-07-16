# tasy-client — Próximos Passos / Backlog

`[PARA REVISÃO]` · Atualizado em 2026-07-16

Documento de continuidade: o estado atual do trabalho e o backlog priorizado, para uma sessão
futura (humana ou Claude) retomar sem reconstruir contexto. Referências cruzadas:
[`documentation.md`](./documentation.md), [`README.md`](./README.md),
[`full_request_workflow.md`](./full_request_workflow.md).

---

## Estado atual (o que já está feito)

- **Rebuild Node/TS concluído** — cliente XHR (biblioteca + CLI) substitui o legado Python +
  Playwright. Código em `src/`, estruturado em núcleo / serviços / conversão / CLI.
- **Code review executado** — 4 achados de robustez tratados:
  - guarda de comprimento par em `decodeTasyText` (evita `RangeError` em download truncado);
  - `parseDateRef` lança erro em data inválida (antes propagava `Invalid Date`);
  - `encodeParam` tipo `int` lança erro em `NaN` (antes enviava `null` silencioso);
  - branch morto removido em `extractFileNames`.
  - **Verificado:** `tsc --noEmit` OK + `scripts/test-convert.ts` (offline) OK.
- **Documentação técnica completa** criada em `documentation.md` (19 seções).
- **Avaliação de streaming** feita — a arquitetura suporta extração contínua na mesma auth;
  falta só o laço de agendamento (código do consumidor). Design documentado em
  `documentation.md` §14.
- **✅ P0 — Validação end-to-end CONCLUÍDA em 2026-07-16**, na rede corporativa:
  - `npm run smoke` — login, `callService(getParameter)`, refresh e chamada pós-refresh OK;
  - `scripts/smoke-report.ts` — cate_3142 gerado, baixado e decodificado (37 linhas, 17 colunas);
  - `run-job.ts --job conf/job_daily.json --csv` — **8/8 relatórios** salvos (raw + CSV) na
    primeira tentativa, todos com conteúdo real (5 a 1115 linhas).
  - O rebuild está validado ponta a ponta contra o TASY real.

> ⚠️ **Tudo isso está NÃO COMMITADO.** O repositório está no commit inicial
> (`4f09140 Estrutura inicial do workspace DTIS`) com todo o conteúdo do `tasy-client` untracked.
> Primeiro passo de qualquer sessão futura: decidir o commit inicial do projeto.

---

## Backlog priorizado

### ~~P0 — Validação end-to-end contra o servidor real~~ ✅ CONCLUÍDO (2026-07-16)
Ver "Estado atual". **Pegadinha operacional descoberta:** as credenciais canônicas vivem nas
variáveis de ambiente de escopo *User* do Windows; uma sessão de terminal aberta antes de uma
troca de senha herda o valor antigo e o login falha com `1100 credenciais inválidas`. Solução:
reinjetar antes de rodar —
```powershell
$env:TASY_PASS = [System.Environment]::GetEnvironmentVariable("TASY_PASS","User")
$env:TASY_USER = [System.Environment]::GetEnvironmentVariable("TASY_USER","User")
```

### P1 — Decifrar o XSRF dos endpoints `/user/*`
Hoje `/user/*` retorna `401 "request not allowed (XSRF)"`; o header `crsftoken` não satisfaz.
Hipótese registrada: padrão AngularJS (cookie `XSRF-TOKEN` → header `X-XSRF-TOKEN`). Investigar via
capturas em `discovery/`. **Desbloqueia:** troca de estabelecimento por nome e demais chamadas
`/user/*`. Não bloqueia o fluxo de relatórios.

### P1 — Mapeamento estabelecimento nome → código
Depende do P1 acima (endpoint `/user/data` atrás do XSRF). Hoje o CLI só aceita
`estabelecimento_cd` numérico. Automatizar o nome→código elimina a necessidade de decorar códigos
nos jobs.

### P2 — Runner de streaming (`src/cli/stream-job.ts`)
Se o produto pedir extração contínua (ex.: um relatório a cada N minutos na mesma auth),
implementar o consumidor de laço já desenhado em `documentation.md` §14 (laço sequencial +
`try/catch` por tick + liberação dos Buffers). ~20 linhas; não exige mudança no core.

### P2 — Testes unitários
Não há nenhum ainda (só smoke tests). Priorizar as funções puras e testáveis offline sem PII:
`resolveToken`, `encodeParam`, `parseDateRef`, `tsvToRows`/`tsvToCsv`, `fixMojibake`,
`parseTasyError`, `CookieJar`. Cobrir também o retry em 401 da `TasySession` com `fetchImpl`
injetado.

### P3 — Itens menores
- **Granularidade do retry no CLI** (`run-job.ts`): o laço reenvolve `generate` inteiro, então uma
  falha de download regera o relatório no servidor. Tolerável no batch noturno; revisitar se virar
  streaming (separar retry de geração e de download).
- **Casing `BEARER`** — herdado do legado; RFC 7235 torna o esquema case-insensitive, mas convém
  reconfirmar contra o servidor após o rebuild (baixo risco).
- **Export para stakeholders** — gerar PPTX/DOCX da `documentation.md` se for apresentar à TI
  corporativa ou ao VP.

---

## Resolvido / não-pendências (para não reabrir)

- **Unidade de expiração do token** — **confirmado em MINUTOS** por sondagem em `discovery/`
  (`expires_in:10` = 10min, `refresh_expires:1440` = 24h). O `storeTokens` já trata assim
  corretamente. Só reabrir se o servidor mudar o protocolo.

---

## Próximo passo lógico único

Com o P0 validado, **commitar o projeto** (decisão do líder — todo o rebuild segue untracked
sobre o commit inicial do workspace) e então atacar o **P1 (XSRF de `/user/*`)** ou os
**testes unitários (P2)**, conforme a prioridade do produto.
