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
| 2 | Dono do histórico | **Node local** (JSONL ou SQLite). O Node produz todo dado — incluindo backfill — e calcula forecast e comparações. |
| 3 | Papel do SharePoint | Lista = camada de **serving/leitura**: 1 linha por unidade-dia, fonte para Power BI e auditoria humana. **Nunca editar manualmente** — correção se faz no store do Node e reenvia (upsert). |
| 4 | Transporte Node → nuvem | POST no trigger "When an HTTP request is received" (Premium). Payload completo: KPIs + forecast + bloco de comparações prontas. |
| 5 | Síntese IA | AI Builder (GPT) dentro do M365 — zero procurement, dado não sai do tenant (e são KPIs agregados, sem dado de paciente). Prompt versionado neste repositório; migrar para API externa (Claude/GPT) depois é troca de transporte, não reescrita. |
| 6 | Papel da IA | Redatora de narrativa sobre números prontos. **IA não calcula nem projeta** — forecast e deltas são determinísticos, no Node. |
| 7 | Canal MVP | Teams (conector nativo). WhatsApp é fase 2 e depende de negociação corporativa (ver Fronteiras). |
| 8 | Escopo | Regional consolidado — todas as unidades (Morumbi, Itaim, VNS, Jabaquara) numa entrega única. |
| 9 | Forecast | Baseado no histórico da unidade. Backfill inicial: último ano, todas as unidades. Algoritmo a definir (ver Pendências), mas determinístico, simples e documentado. |

## Contratos e detalhes de implementação

### Payload (evolução do schema)

`daily_report_schema.json` descreve uma unidade. Para o regional, o payload vira:

```
{ data, unidades: [ { unidade, ...campos do schema, comparacoes: {...} } ], regional: {...} }
```

- Agregado regional é calculado no **Node**: taxa de ocupação regional = Σ pac-dia ÷ Σ leitos,
  **não** média das taxas.
- Bloco `comparacoes` por unidade e regional: D-1, média do mesmo dia da semana (últimas N
  semanas), acumulado do mês vs forecast. É esse bloco que vai ao prompt — o AI Builder nunca
  precisa reconstruir histórico da lista (resolve o limite de tokens/contexto).

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

1. **Mapeamento relatório → KPI**: quais dos 8 relatórios do `job_daily` alimentam quais
   campos do schema, e a spec de parsing de cada um. Primeira tarefa de implementação.
2. **Algoritmo de forecast**: definir método determinístico (ex.: mediana do mesmo dia da
   semana nas últimas 8 semanas, com sazonalidade mensal) após olhar o histórico real.
3. **Teste de agregação por período** dos relatórios (define a estratégia do backfill).
4. **Horário de corte**: a que horas os dados do dia anterior estão estáveis no TASY?
   Define o agendamento do job.
5. **Destino no Teams**: canal de equipe vs chat em grupo; lista de destinatários.
6. **Prompt da síntese**: estrutura, tom executivo (três pilares: QT/QP/RF), formato da
   mensagem.
