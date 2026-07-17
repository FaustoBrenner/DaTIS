# daily-report — processamento de KPIs

`[RASCUNHO]` — POC de processamento. Uso interno do DTIS.

Converte os relatórios brutos do TASY (extraídos pelo `tasy-client`) nos KPIs
de `daily_report_schema.json`, por unidade, e mantém o histórico local. Ver a
arquitetura geral em `ARQUITETURA.md`.

## Como rodar

```bash
npm install
npm run report                 # roda sobre data/sample_data (datas da amostra)
npm run report -- --persist    # também grava no histórico JSONL (upsert)
npm run report -- <pasta> <refIso> <mapaAlvoIso>   # outra pasta/datas
```

## Formato dos artefatos

Os `*.xls` do TASY **não são binário de planilha**: são TSV (tab-separado) em
**UTF-16 Big-Endian** com BOM. `OCUPACAO.json` é JSON do painel schematic/cpanel.

## Mapeamento KPI → fonte

| Campo do schema | Fonte | Regra |
|---|---|---|
| `atendimentos_ps` | 2432 Tracking PS | atendimentos distintos com entrada no dia-ref |
| `internacoes_ps` | 2432 Tracking PS | atendimentos com `Dt aloc leito` preenchida |
| `tx_internacao` | derivado | internacoes ÷ atendimentos |
| `cirurgias` | 3136 Cirurgias Realizadas | cirurgias com `Dt cirurgia` no dia-ref (D-1) |
| `cirurgias_previstas` | 4718 Mapa Cirúrgico | reservas com `Dt cirurgia` no dia-alvo (D+1) |
| `pac_dia_uni` | OCUPACAO.json | `QT_OCUPADAS` do subtotal "Unidades de Internação" |
| `pac_dia_uti` | OCUPACAO.json | `QT_OCUPADAS` do subtotal "terapia intensiva" |
| `leitos_uni` / `leitos_uti` | setores_internacao | soma de `leitos_capacidade` por grupo (3=uni, 4=UTI) |
| `tx_ocupacao_uni/uti` | derivado | ocupados ÷ leitos curados |
| `atendimentos_cemed` | 3523 Tracking CEMED | atendimentos distintos no dia-ref |

### Decisões de modelagem

- **Leitos (denominador das taxas)** vêm da tabela curada `setores_internacao`,
  que reflete o `NR_UNIDADES_NORMAIS` do TASY (sem leitos temporários). Validado
  na amostra: capacidade curada (221 uni / 91 UTI) == `NR_UNIDADES_NORMAIS` live.
- **Ocupados** vêm do snapshot live (`QT_OCUPADAS`). É ocupação instantânea,
  usada como proxy de paciente-dia — documentar quando o schema evoluir.

## Campos deixados em `null` (não deriváveis da extração atual)

- `tx_confirmacao_agenda_cirurgica`: exige mapa cirúrgico **e** realizadas do
  **mesmo** dia. Na amostra o mapa é D+1 e as realizadas D-1.
- `atendimentos_cemed_previstos`, `tx_confirmacao_agenda_cemed`: exigem a agenda
  ambulatorial (não presente na amostra).
- `*_frcst`: forecast, depende do histórico (fase posterior).

## O relatório 4317 (Gestão de Exames)

Não tem campo correspondente no schema atual. Parseado e mantido como fonte
diagnóstica (volume por tipo de atendimento) para quando o schema incluir SADT.

## Estrutura

```
src/
  io/        decode UTF-16BE TSV + parsing de datas BR
  ref/       tabela de setores (JSON) — fonte de verdade dos leitos
  sources/   1 parser por relatório (ps, cirurgias, cemed, mapaCir, exames, ocupacao)
  kpis/      computeUnidade — orquestra as fontes no objeto do schema
  store/     histórico JSONL (upsert idempotente por data+unidade)
  cli/       build-report — runner de teste
```
