# Daily Report — Arquitetura Técnica

`[RASCUNHO]` — decisões consolidadas na discussão de 2026-07-16. Uso interno do DTIS.

## O que é

Relatório diário automatizado para a alta liderança da Regional Sudoeste: KPIs operacionais
das unidades extraídos do TASY, comparados a histórico e projeções, com síntese executiva
gerada por IA. MVP entrega via Teams; WhatsApp é fase 2.

## Restrição fundamental

O TASY (`hismorumbi.rededor.corp`) só é alcançável de dentro da rede corporativa. A extração
roda obrigatoriamente on-prem, na máquina de extração já existente (ligada e agendada).
Ponto de fragilidade aceito conscientemente; plano B = execução manual do job.

## Fluxo

```
Máquina na rede corp (Task Scheduler)           Nuvem M365
─────────────────────────────────────           ─────────────────────────────────
tasy-client (Node)                              Power Automate Cloud Flow
  → baixa 8 relatórios (TSV/UTF-16)               (trigger: HTTP request recebido)
  → parser + cálculo dos KPIs                   → valida segredo do header
  → atualiza store local de histórico           → upsert na lista SharePoint
  → calcula forecast + comparações              → Response 200 (cedo!)
  → valida contra daily_report_schema.json      → síntese IA (AI Builder / GPT)
  → POST no endpoint HTTP do PA ──────────────▶ → posta no Teams
```

## Decisões (fechadas)

| # | Decisão | Escolha |
|---|---|---|
| 1 | Runtime da extração | Node CLI + Task Scheduler na máquina de extração existente. Sem Power Automate Desktop (trabalho é headless). |
| 2 | Dono do histórico | **Node local**, **SQLite via `node:sqlite`** (embutido no Node 24, sem dependência nativa). Escolhido após `better-sqlite3` falhar na compilação (sem VS Build Tools na máquina de extração). O banco é intermediário do I/O: preserva as colunas brutas de toda extração (`registros`) e serve os KPIs computados (`relatorios_diarios`). O Node produz todo dado — incluindo backfill — e calcula forecast e comparações. |
| 3 | Papel do SharePoint | Lista = camada de **serving/leitura**: 1 linha por unidade-dia, fonte para Power BI e auditoria humana. **Nunca editar manualmente** — correção se faz no store do Node e reenvia (upsert). |
| 4 | Transporte Node → nuvem | POST no trigger "When an HTTP request is received" (Premium). Payload completo: KPIs + forecast + bloco de comparações prontas. |
| 5 | Síntese IA | AI Builder (GPT) dentro do M365 — zero procurement, dado não sai do tenant (e são KPIs agregados, sem dado de paciente). Prompt versionado neste repositório; migrar para API externa (Claude/GPT) depois é troca de transporte, não reescrita. |
| 6 | Papel da IA | Redatora de narrativa sobre números prontos. **IA não calcula nem projeta** — forecast e deltas são determinísticos, no Node. |
| 7 | Canal MVP | Teams (conector nativo). WhatsApp é fase 2 e depende de negociação corporativa (ver Fronteiras). |
| 8 | Escopo | Regional consolidado — todas as unidades (Morumbi, Itaim, VNS, Jabaquara) numa entrega única. |
| 9 | Forecast | Baseado no histórico da unidade. Backfill inicial: último ano, todas as unidades. Algoritmo a definir (ver Pendências), mas determinístico, simples e documentado. |
| 10 | Escopo do payload | **Uma unidade por payload** (2026-07-22). Há um agente de síntese por unidade; o agente do VP Regional é generalização futura sobre o mesmo envelope (`unidades: []` + `regional: {}`). |
| 11 | Papel do agente | **Só redator.** O agente (Copilot Studio) não consulta o SharePoint e não calcula: recebe variação, faixa do mesmo dia-da-semana, tendência, calendário, acumulado do mês e ranking de desvios prontos no payload. Descarta a alternativa de conectar a lista como *knowledge source* — busca semântica sobre linha numérica tem recall silenciosamente incompleto e não faz filtro exato por data. |
| 12 | Fonte dos valores do payload | **Leitura de volta de `relatorios_diarios`**, não o objeto em memória do `computeUnidade`. Realizado e histórico precisam sair da mesma tabela e do mesmo método, senão todo delta compara métodos diferentes (censo × snapshot, ver `README.md`). Efeito colateral: retransmitir um dia passado é um comando só. |

## Contratos e detalhes de implementação

### Payload (evolução do schema)

`daily_report_schema.json` descreve os KPIs de uma unidade-dia. O envelope transmitido está
em **`payload_schema.json`** (contrato executável: `payloadUnidadeSchema` em
`src/transmit/payload.ts`), com os blocos `periodo`, `unidade`, `calendario`, `kpis`,
`comparacoes`, `destaques`, `mes`, `radar_hoje` e `qualidade`. ~11,5 KB / ~3.100 tokens por
unidade — tamanho **fixo**, não cresce com o histórico acumulado.

Quando o agente regional existir, o envelope vira
`{ ..., unidades: [ {...} ], regional: {...} }`. O agregado regional é calculado no **Node**:
taxa de ocupação regional = Σ pac-dia ÷ Σ leitos, **não** média das taxas.

**Armadilha de datas (verificada no banco, `src/kpis/backfill.ts:19-29`):** na linha
`data = D` de `relatorios_diarios`, os `*_previstos` são o esperado de **D**, mas os
`*_frcst` são o esperado de **D+1**. Comparar o realizado de D contra o `*_frcst` da própria
linha D compara com o dia seguinte — erro silencioso e grande. Por isso `comparacoes` usa
`*_previstos` (mesma linha) ou o `*_frcst` da linha D−1, e os `*_frcst` da linha D viram o
bloco `radar_hoje`.

### Fluxo Power Automate

- **URL do trigger é segredo** (assinatura SAS embutida): vive em env var na máquina de
  extração, nunca no repositório. Segunda camada: header com segredo compartilhado, validado
  no início do fluxo.
- **Responder cedo**: ação `Response` (200) imediatamente após o upsert na lista dar certo;
  síntese e entrega seguem assíncronas. Evita o timeout (~2 min) do trigger síncrono e impede
  que soluço de IA vire falha falsa de extração.
- **Idempotência**: chave da lista = `data + unidade`; sempre upsert, nunca insert cego.
  Reprocessar um dia (retry/correção) é seguro.

### Lista SharePoint

- 1 linha por unidade-dia; colunas = campos do schema + comparações principais.
- Pseudo-unidade `REGIONAL` para os agregados (ou agregação no Power BI — decidir na
  implementação).
- TSVs brutos do TASY e JSONs enviados ficam arquivados na máquina de extração como trilha
  de auditoria.

### Backfill (1 ano × 4 unidades)

- Dia a dia ≈ 1.500–3.000 gerações de relatório no TASY. **Antes de rodar**: testar
  empiricamente se os relatórios agregam corretamente por período (`DT_INICIAL`/`DT_FINAL`
  de um mês) — reduziria o volume ~30×.
- Se só funcionarem dia a dia: job noturno com throttle, em janelas, fora de horário
  assistencial.

## Fronteiras DTIS (aprovações externas)

- **WhatsApp (fase 2)**: rotas oficiais (Meta Cloud API ou BSP tipo Twilio) exigem Business
  Manager verificado da Rede D'Or, número institucional e templates pré-aprovados pela Meta.
  Conversa com TI/Marketing corporativo **antes** de prometer o canal — hospitais costumam
  já ter BSP contratado para comunicação com pacientes.
- **Carga do backfill no TASY**: se o volume dia a dia for inevitável, alinhar janela com a
  TI para não estressar o servidor de relatórios.

## Pendências (abertas)

1. ~~**Mapeamento relatório → KPI**~~ **FECHADO (2026-07-22).** Ver a tabela KPI→fonte no
   `README.md`. 5 relatórios + ocupação mapeados; parsing em `src/sources/`.
2. ~~**Algoritmo de forecast**~~ **FECHADO (2026-07-22).** **Mediana do mesmo dia-da-semana
   nas últimas 10 semanas** (determinístico, `src/kpis/forecast.ts`). `cirurgias_frcst` é
   exceção: vem da contagem do mapa cirúrgico extraído no próprio dia (D-0). Substitui a
   nota antiga de "SMA/mediana 8 semanas".
3. **Teste de agregação por período** dos relatórios (define a estratégia do backfill).
4. **Horário de corte**: a que horas os dados do dia anterior estão estáveis no TASY?
   Define o agendamento do job.
5. **Destino no Teams**: canal de equipe vs chat em grupo; lista de destinatários.
6. ~~**Prompt da síntese**~~ **FECHADO (2026-07-22).** Ver `PROMPT_SINTESE_IA.md` (agente no
   Copilot Studio, um por unidade) e `payload_schema.json`.
7. **Endpoint do Power Automate** ainda não existe. `npm run transmit` roda ponta a ponta e
   grava em disco; plugar é setar `DAILY_REPORT_ENDPOINT_URL` e `DAILY_REPORT_SHARED_SECRET`.
8. **Divergência de realizados** entre o pipeline diário e a linha persistida de 21/07
   (PS 276 × 308, RM 60 × 76). A parte de ocupação é a documentada no `README.md`
   (snapshot × censo); PS e exames **não estão explicados**. Investigar antes do piloto — se
   for método e não amostra, contamina toda comparação.
9. **`metodo_ocupacao` não é rastreado por linha** em `relatorios_diarios`. Enquanto censo
   (backfill) e snapshot (diário) convivem na janela de 10 semanas, a faixa histórica de
   ocupação mistura métodos. Correção real: alinhar o diário ao censo.
10. **Curadoria de `src/ref/feriados.json`** — municipais variam por unidade; conferir com
   RH/administração.
