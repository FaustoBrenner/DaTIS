# daily-report — processamento de KPIs

`[RASCUNHO]` — POC de processamento. Uso interno do DTIS.

Converte os relatórios brutos do TASY (extraídos pelo `tasy-client`) nos KPIs de
`daily_report_schema.json`, por unidade. Um **banco local (SQLite)** é o
intermediário do I/O: as extrações são carregadas preservando todas as colunas, e
o cálculo dos KPIs consulta o banco. Ver a arquitetura geral em `ARQUITETURA.md`.

## Arquitetura em duas rotinas

```
Rotina de extração (agendada, D-0 de manhã):
  tasy_client → JSON → npm run load → SQLite (registros brutos + metadados)

Rotina de daily report (D-0, reporta D-1):
  SQLite → npm run report → KPIs (valida schema) → payload JSON → [HTTP Power Automate]
```

Separar as duas rotinas com o banco no meio **preserva o dado-fonte** (colunas
brutas de toda extração ficam disponíveis para KPIs futuros) e habilita KPIs que
dependem de **extrações de dias diferentes** — ex.: `cirurgias_previstas` (mapa de
ontem) e os `*_frcst` por mediana histórica.

## Como rodar

```bash
npm install                    # (sem dependências nativas: usa node:sqlite, Node 24+)

# 1) Carga de uma extração no banco (idempotente por relatorio×unidade×dia):
npm run load -- data/sample_data/new_sample --data-extracao 2026-07-22

# 2) Daily report a partir do banco:
npm run report -- --ref 2026-07-21 --hoje 2026-07-22            # calcula e grava o payload
npm run report -- --ref 2026-07-21 --hoje 2026-07-22 --persist  # + grava em relatorios_diarios

# 3) Backfill do histórico (habilita os forecasts por mediana):
npm run backfill -- data/sample_data/load_history --inicio 2026-05-01 --fim 2026-07-21
```

`--ref` = dia dos realizados (D-1); `--hoje` = dia da extração (D-0). O banco fica
em `data/db/daily_report.sqlite` (gitignored); `--db <arquivo>` troca o caminho.

### Backfill do histórico

`npm run backfill` reconstrói `relatorios_diarios` para uma janela de dias a
partir de uma **extração em massa** (relatórios cobrindo várias semanas em
`data/sample_data/load_history/`, incluindo o censo retroativo 5079). Sem esse
histórico o forecast por mediana retorna `null`; depois do backfill, o report
diário passa a emitir os `*_frcst`. É idempotente (upsert por data+unidade).

Diferenças de método do backfill vs. pipeline diário (**emenda documentada** —
alinhar o diário ao censo é follow-up, exigiria o 5079 na extração diária):

| | Pipeline diário | Backfill |
|---|---|---|
| pac-dia (ocupação) | snapshot `OCUPACAO` (~6h) | censo 5079, corte às 06:00 (entrada≤6h e saída>6h/vazia) |
| `cirurgias_previstas` | mapa extraído em D-1 | **eletivas realizadas + reservas não-realizadas do mapa** (4718 = diferença agendado−realizado) |
| `*_frcst` / `*_previstos` | calculados | `null` (linhas do backfill são os atuais, base do forecast) |

O overlap (ex.: 07-21) é sobrescrito pelo backfill, deixando a série histórica
consistente no método do censo. Como a ocupação do censo diverge um pouco do
snapshot (ex.: 07-22 → 203/82 censo vs 196/88 snapshot), o valor *realizado* de
pac-dia num dia pode diferir entre o payload diário e a linha de serving.

## Formato dos artefatos

**Padrão atual (2026-07):** o `tasy-client` transmite cada relatório como um
**array JSON** de registros, com tipos nativos (números como número, vazios como
`null`, datas em ISO 8601 — `aaaa-mm-ddThh:mm:ss.sssZ` ou só `aaaa-mm-dd`).
`OCUPACAO.json` vem em JSON aninhado (painel schematic/cpanel); na carga, cada
linha de `dados.linhasResultSet` vira um registro `relatorio='OCUPACAO'`.

> Formato legado: os `*.xls` antigos **não eram binário de planilha** — eram TSV
> UTF-16BE com BOM. O parser BR de datas (`dataIsoBr`) segue disponível como
> fallback em `io/dates.ts`, mas o caminho ativo é 100% JSON.

**Ressalva de fuso:** as datas ISO chegam com sufixo `Z`. O pipeline agrupa por
dia lendo os componentes de parede da string (sem conversão de fuso), assumindo
que o `tasy-client` serializa o horário local da unidade. Confirmar na integração
— se o `Z` for UTC genuíno, aplicar o offset BRT (−03:00) antes de fatiar o dia.

## Modelo temporal (qual extração alimenta cada KPI)

A extração roda em D-0 de manhã; os relatórios de "realizados" trazem os eventos
de **D-1**. A ocupação é o snapshot das ~6h de D-0.

| Grupo | Relatório | Extração usada |
|---|---|---|
| Realizados (PS, cirurgias, CEMED, exames) | 2432/3136/3523/4317 | de **D-0**, filtrando coluna-data == **D-1** |
| Ocupação (pac-dia) | OCUPACAO | snapshot de **D-0** |
| `cirurgias_previstas` | 4718 Mapa | mapa extraído em **D-1** |
| `cirurgias_frcst` | 4718 Mapa | mapa extraído em **D-0** (contagem total) |
| demais `*_frcst` | relatorios_diarios | mediana do mesmo dia-da-semana, últimas 10 semanas |

## Mapeamento KPI → fonte

| Campo do schema | Fonte | Regra |
|---|---|---|
| `atendimentos_ps` | 2432 Tracking PS | atendimentos distintos com entrada no dia-ref |
| `internacoes_ps` | 2432 Tracking PS | atendimentos com `Dt aloc leito` preenchida |
| `tx_internacao` | derivado | internacoes ÷ atendimentos |
| `cirurgias` | 3136 Cirurgias | realizadas no dia-ref = eletivas + urgência |
| `cirurgias_eletivas` | 3136 | `Carater Cirurgia` == "Eletiva" |
| `cirurgias_urgencia` | 3136 | `Carater Cirurgia` ∈ {"Urgência","Emergência"} |
| `cirurgias_previstas` | 4718 Mapa (extraído em D-1) | reservas com `Dt cirurgia` no dia-ref |
| `tx_confirmacao_agenda_cirurgica` | derivado | `cirurgias_eletivas` ÷ `cirurgias_previstas` |
| `exames_eda/usg/cardio/tc/rm` | 4317 Gestão de Exames | executados (`Dt execucao` no dia-ref) por `Setor atendimento` exato (ver `ref/setoresExame.ts`) |
| `pac_dia_uni` / `pac_dia_uti` | OCUPACAO | `QT_OCUPADAS` do subtotal Internação / Terapia Intensiva |
| `leitos_uni` / `leitos_uti` | setores_internacao | soma de `leitos_capacidade` por grupo (3=uni, 4=UTI) |
| `tx_ocupacao_uni/uti` | derivado | ocupados ÷ leitos curados |
| `atendimentos_cemed` | 3523 Tracking CEMED | atendimentos distintos no dia-ref |
| `cirurgias_frcst` | 4718 Mapa (extraído em D-0) | contagem total do mapa de hoje |
| `pac_dia_*_frcst`, `atendimentos_*_frcst`, `exames_*_frcst` | relatorios_diarios | mediana do mesmo dia-da-semana (D-0), últimas 10 semanas |

### Decisões de modelagem

- **Leitos (denominador das taxas)** vêm da tabela curada `setores_internacao`,
  que reflete o `NR_UNIDADES_NORMAIS` do TASY (sem leitos temporários). Validado
  na amostra: capacidade curada (221 uni / 91 UTI) == `NR_UNIDADES_NORMAIS` live.
- **Ocupados** vêm do snapshot live (`QT_OCUPADAS`). É ocupação instantânea,
  usada como proxy de paciente-dia — documentar quando o schema evoluir.
- **Forecast** determinístico: mediana do mesmo dia-da-semana nas últimas 10
  semanas (`kpis/forecast.ts`). Retorna `null` até haver histórico suficiente.

## Campos deixados em `null` (não deriváveis das extrações atuais)

- `atendimentos_cemed_previstos`, `tx_confirmacao_agenda_cemed`: exigem a agenda
  ambulatorial (não presente nas extrações).
- `exames_*_previstos`: exigem a agenda de exames (não presente).
- `cirurgias_previstas` / `tx_confirmacao_agenda_cirurgica`: `null` até haver o
  mapa cirúrgico extraído em D-1 no banco (na amostra só há o mapa de D-0).
- `*_frcst` por mediana: `null` até acumular ~10 semanas em `relatorios_diarios`
  (o banco habilita o backfill que os preenche).

## LGPD

O banco (`registros`) guarda colunas brutas com PHI (nomes, CPF, telefone).
Autorizado no ambiente seguro do projeto, mas: `data/db/` é gitignored, local
only; o payload/serving (`relatorios_diarios`, `data/out/`) só carrega KPIs
agregados, sem PHI.

## Estrutura

```
src/
  io/        leitura JSON dos relatórios (json.ts) + datas ISO/BR + iterarDias (dates.ts)
  db/        banco SQLite: conn (schema), load (carga idempotente), repos (consultas)
  ref/       setores/leitos (fonte de verdade) + setoresExame (mapa SADT→setor)
  sources/   1 parser por relatório (funções puras); censo.ts = ocupação por censo (5079)
  kpis/      computeUnidade (diário) + forecast (mediana) + backfill (KPIs de um dia histórico)
  cli/       load-extraction (carga) + build-report (report) + backfill-history (histórico)
```
