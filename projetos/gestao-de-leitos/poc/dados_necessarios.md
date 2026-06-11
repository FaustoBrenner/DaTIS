# Gestão de Leitos — Dados necessários (POC Itaim)

**Status:** `[RASCUNHO]`
**Projeto:** P4 — Gestão de leitos · POC
**Unidade:** Hospital Itaim
**Última atualização:** 2026-06-11
**Relacionado:** `conceito.md`, `discovery_roteiro_itaim.md`

> Inventário de dados para o escopo **como definido hoje** (F1–F8 do `conceito.md`).
> Nomes de campo do TASY seguem a convenção conhecida (`cd_paciente`, `dt_internacao`, etc.);
> os nomes exatos de tabela/coluna precisam ser confirmados com a TI / no dicionário do TASY.
> Nada aqui assume acesso direto ao banco — a coluna **"Como obter"** distingue export sob demanda
> de integração (que exige aprovação da TI).

---

## 0. Como ler este documento

Cada bloco abaixo é um **conjunto de dados** (≈ uma entidade). Para cada um:
- **Para que serve** → qual(is) funcionalidade(s) consome
- **Granularidade** → o nível de cada linha
- **Frequência** → quão atual o dado precisa ser
- **Fonte / Como obter** → sistema e via de acesso
- **Campos** → nível de coluna, com observação de uso
- **Sensibilidade (LGPD)** → se contém dado identificável de paciente
- **Risco de qualidade** → o que costuma estar errado/faltando

Matriz dado × funcionalidade no fim (seção 12).

---

## 1. Estrutura física de leitos (dado mestre)

- **Para que serve:** F1, F3, F4 — base de capacidade. Sem isto não há denominador de ocupação.
- **Granularidade:** 1 linha por leito
- **Frequência:** baixa (muda quando reforma/reclassifica leito) — carga inicial + atualização eventual
- **Fonte / Como obter:** TASY (cadastro de leitos) — export inicial. Hotelaria deve ter a lista mais fiel.
- **Sensibilidade:** baixa
- **Risco de qualidade:** leito "ativo" no cadastro mas bloqueado/desativado na prática; classificação de tipo desatualizada.

| Campo | Tipo | Observação |
|---|---|---|
| `cd_leito` | id | Identificador do leito |
| `ds_leito` | texto | Descrição/numeração visível no andar |
| `tp_leito` | categórico | **UTI / UNI / apartamento** — eixo crítico (leito não é fungível) |
| `cd_setor` | id | Setor ao qual pertence |
| `cd_unidade` | id | Filtrar sempre = Itaim |
| `tp_acomodacao` | categórico | No Itaim: privativo (sem coorte — simplifica capacidade) |
| `st_operacional` | categórico | Ativo / bloqueado / manutenção / desativado |
| `dt_status` | datetime | Desde quando está no status atual |
| `sn_isolamento_dedicado` | bool | Se houver leito específico de isolamento |

---

## 2. Setores / unidade (dado mestre)

- **Para que serve:** F1, F3, F4 — agrupamento e capacidade por setor.
- **Granularidade:** 1 linha por setor
- **Fonte / Como obter:** TASY — export inicial.
- **Sensibilidade:** baixa

| Campo | Observação |
|---|---|
| `cd_setor` | id |
| `ds_setor` | nome do setor |
| `tp_setor` | UTI / unidade de internação / PS / centro cirúrgico |
| `cd_unidade` | = Itaim |
| `qt_leitos_operacionais` | capacidade efetiva (validar com hotelaria vs cadastro) |

---

## 3. Eventos de ocupação / ADT — admissão, alta, transferência

- **Para que serve:** F1 (ocupação tempo real), F3 (movimentação entre setores), F4. **Espinha dorsal do produto.**
- **Granularidade:** 1 linha por evento de movimentação
- **Frequência:** **tempo real / near-real-time** — é o coração do "em tempo real". Na POC pode começar com export diário e evoluir.
- **Fonte / Como obter:** TASY (movimentação de leito / ADT, idealmente via HL7 ADT). Integração = aprovação TI. POC: export periódico.
- **Sensibilidade:** **alta** (vincula paciente a leito)
- **Risco de qualidade:** **R5 — atraso de lançamento.** Alta médica às 9h lançada às 15h; leito aparece ocupado quando já está vago (e vice-versa). Cruzar com Eritel (bloco 9).

| Campo | Observação |
|---|---|
| `cd_evento` | id do evento |
| `cd_paciente` | **DADO SENSÍVEL** — pode ser pseudonimizado em dev |
| `cd_atendimento` / `cd_internacao` | chave da internação |
| `tp_evento` | admissão / transferência / alta / óbito |
| `cd_leito_origem` | nulo na admissão |
| `cd_leito_destino` | nulo na alta |
| `cd_setor_origem` / `cd_setor_destino` | para movimentação entre setores (F3) |
| `dt_evento_real` | quando ocorreu de fato (se existir) |
| `dt_evento_sistema` | quando foi lançado — a diferença mede o atraso (R5) |

---

## 4. Internação / permanência

- **Para que serve:** F2, F4, F6, F7 + baseline de LOS (seção 11).
- **Granularidade:** 1 linha por internação (atendimento internado)
- **Frequência:** diária + atualização de altas em tempo real
- **Fonte / Como obter:** TASY — export. Modelo semântico corporativo pode já ter isto limpo.
- **Sensibilidade:** alta
- **Risco de qualidade:** `dt_alta_prevista` frequentemente vazia ou não confiável; caráter (eletivo/urgência) mal preenchido.

| Campo | Observação |
|---|---|
| `cd_internacao` | id |
| `cd_paciente` | **SENSÍVEL** |
| `dt_internacao` | início |
| `dt_alta_prevista` | se preenchida — comparar com previsão da IA |
| `dt_alta_medica` | alta clínica |
| `dt_alta_administrativa` | saída efetiva — gap entre as duas alimenta F5 (paciente pronto mas preso) |
| `cd_setor_atual` / `cd_leito_atual` | posição atual |
| `tp_origem` | PS / cirúrgico eletivo / transferência externa |
| `tp_carater` | eletivo / urgência |
| `cd_cid_principal` | diagnóstico — eixo de LOS esperado |
| `cd_procedimento_principal` | procedimento — eixo de LOS esperado |
| `cd_medico_responsavel` | para análise de variação por médico |
| `cd_convenio` | corte; insumo futuro (camada financeira, fora do v1) |
| `idade` / `sexo` | features clínicas (não usar nome) |

---

## 5. Evoluções clínicas (texto livre) — insumo da previsão de alta com IA

- **Para que serve:** F2 (previsão de alta + racional), F5 (detectar "aguardando vaga/exame", "alta programada"), F6.
- **Granularidade:** 1 linha por registro de evolução
- **Frequência:** sempre que registrada (várias por dia); para a IA, processar o **delta** (só novas) — controle de custo (R4).
- **Fonte / Como obter:** TASY (prontuário). **Acesso exige aprovação TI.** Em dev: **dados sintéticos/anonimizados** (R1).
- **Sensibilidade:** **máxima** — texto livre frequentemente contém nome, contexto familiar, etc.
- **Risco de qualidade:** copy-paste de evolução anterior; texto incompleto; abreviação/jargão; evolução de enfermagem ≠ médica em conteúdo.

| Campo | Observação |
|---|---|
| `cd_evolucao` | id |
| `cd_paciente` / `cd_internacao` | **SENSÍVEL** |
| `dt_evolucao` | timestamp — ordem temporal importa |
| `tp_evolucao` | médica / enfermagem / multiprofissional |
| `cd_profissional` / especialidade | quem evoluiu |
| `ds_evolucao` | **texto livre — insumo principal do LLM** |

> Sinais de alta a extrair do texto (exemplos): "afebril há X", "desmame de O2 concluído",
> "aceitando dieta", "deambulando", "família orientada sobre alta", "aguardando vaga em destino",
> "aguardando exame/parecer", "alta programada para amanhã".

---

## 6. Sinais vitais

- **Para que serve:** F2 — trajetória de estabilidade clínica (feature estruturada que complementa o texto).
- **Granularidade:** 1 linha por aferição por parâmetro (ou por conjunto)
- **Frequência:** alta (várias por dia, mais frequente em UTI)
- **Fonte / Como obter:** TASY (sinais vitais / monitorização) — export. Acesso exige TI.
- **Sensibilidade:** alta (vinculado a paciente)
- **Risco de qualidade:** lacunas de aferição; outliers de digitação (ex: FC 700); unidade inconsistente.

| Campo | Observação |
|---|---|
| `cd_paciente` / `cd_internacao` | **SENSÍVEL** |
| `dt_afericao` | timestamp |
| `vl_pa_sistolica` / `vl_pa_diastolica` | mmHg |
| `vl_fc` | bpm |
| `vl_fr` | irpm |
| `vl_temperatura` | °C |
| `vl_saturacao_o2` | % |
| `vl_glicemia` | se aferida |
| `vl_dor` | escala 0–10 |
| `vl_score_alerta` | se houver MEWS/NEWS calculado pelo TASY — atalho forte para estabilidade |

---

## 7. Dispositivos, suporte e prescrição (sinais de gravidade) — *desejável*

- **Para que serve:** F2 — paciente em droga vasoativa / O2 / antibiótico EV dificilmente recebe alta amanhã. Forte preditor.
- **Granularidade:** 1 linha por item ativo por internação
- **Frequência:** diária
- **Fonte / Como obter:** TASY (prescrição / dispositivos) — export. TI.
- **Sensibilidade:** alta
- **Prioridade:** desejável, não bloqueante para a primeira exploração.

| Campo | Observação |
|---|---|
| `cd_internacao` | chave |
| `sn_o2_suplementar` / `tp_o2` | uso e via |
| `sn_droga_vasoativa` | marcador de gravidade |
| `sn_atb_ev` | antibiótico endovenoso ativo |
| `sn_dispositivo` (sonda, dreno, CVC) | dispositivos invasivos |
| `sn_dieta_via` | oral / enteral / parenteral / zero |

---

## 8. Pedidos / pendências assistenciais — *desejável, alto valor para F5*

- **Para que serve:** F5 — distinguir "preso aguardando exame/parecer" de "pronto para alta".
- **Granularidade:** 1 linha por solicitação (exame, parecer, procedimento)
- **Frequência:** tempo real / diária
- **Fonte / Como obter:** TASY (solicitações / agendamentos internos). TI. **Confirmar no discovery** se há registro estruturado.
- **Sensibilidade:** alta

| Campo | Observação |
|---|---|
| `cd_internacao` | chave |
| `tp_pedido` | exame imagem / laboratório / parecer / procedimento |
| `dt_solicitacao` | quando pedido |
| `dt_realizacao` | nulo = pendente → trava potencial de alta |
| `st_pedido` | solicitado / agendado / realizado / liberado |

---

## 9. Giro e higienização de leito — **Eritel (ramais)**

- **Para que serve:** F1 (estado real do leito: limpo/pronto vs ocupado), giro de leito, resolve parte do R5.
- **Granularidade:** 1 linha por ciclo de higienização de leito (ou 1 por etapa/evento de ramal)
- **Frequência:** tempo real
- **Fonte / Como obter:** **Eritel** (sistema de ramais da hotelaria). **Fonte complementar a estudar** — confirmar no discovery formato de export/API. Pode ser o dado mais fiel do estado físico do leito.
- **Sensibilidade:** baixa (não tem paciente — só leito e tempos)
- **Risco de qualidade:** etapas não registradas; ramal acionado fora do fluxo.

| Campo | Observação |
|---|---|
| `cd_leito` | chave de junção com TASY |
| `dt_alta_paciente` | gatilho do ciclo |
| `dt_solicitacao_limpeza` | enfermagem aciona via ramal |
| `dt_inicio_limpeza` | equipe de higiene inicia |
| `dt_fim_limpeza` | conclusão |
| `dt_leito_liberado` | leito pronto para próxima admissão |
| `cd_equipe_higiene` | quem executou |
| `tp_limpeza` | concorrente / terminal |

> **Métricas derivadas:** tempo de giro = `dt_leito_liberado − dt_alta_paciente`;
> decomposto em espera-de-acionamento, fila, tempo-de-limpeza. Identifica onde o giro trava.

---

## 10. Demanda futura — agenda cirúrgica

- **Para que serve:** F3 (previsão de demanda), F4, F8 (recomendar adiar eletiva).
- **Granularidade:** 1 linha por cirurgia agendada
- **Frequência:** diária (agenda do dia seguinte + horizonte)
- **Fonte / Como obter:** TASY (agendamento cirúrgico) / centro cirúrgico. Export.
- **Sensibilidade:** média (tem paciente)
- **Risco de qualidade:** **destino pós-op e LOS esperado raramente preenchidos** — pode precisar derivar de histórico por procedimento; taxa de cancelamento de eletiva.

| Campo | Observação |
|---|---|
| `cd_agendamento` | id |
| `dt_cirurgia` | data/hora prevista |
| `cd_procedimento` | mapeia para tipo de leito + LOS esperado |
| `ds_porte` | porte cirúrgico |
| `cd_cirurgiao` | variação por cirurgião |
| `tp_destino_posop` | **UTI / UNI / apto / ambulatorial** — se vazio, derivar do histórico |
| `qt_los_esperado` | se vazio, derivar do histórico do procedimento |
| `tp_carater` | eletivo / urgência |
| `st_agendamento` | agendado / confirmado / cancelado |
| `cd_convenio` | corte |

---

## 11. Demanda futura — PS e conversão para internação

- **Para que serve:** F3 (conversão PS→leito), F4. Conversão **segmentada** (decisão 4.5 do conceito).
- **Granularidade:** 1 linha por atendimento de PS
- **Frequência:** tempo real + histórico (≥ 12 meses para sazonalidade)
- **Fonte / Como obter:** TASY (atendimentos PS). Export histórico + feed atual.
- **Sensibilidade:** alta
- **Risco de qualidade:** desfecho registrado com atraso; tipo de leito de internação nem sempre claro no momento da decisão.

| Campo | Observação |
|---|---|
| `cd_atendimento_ps` | id |
| `dt_chegada` | timestamp — hora e dia da semana importam |
| `nv_classificacao_risco` | Manchester/cor |
| `tp_desfecho` | alta / internação / transferência / óbito / evasão |
| `tp_leito_internacao` | quando internou: UTI / UNI / apto |
| `dt_decisao_internacao` | quando virou demanda de leito |

> **Histórico** desta tabela é o que permite estimar **taxa de conversão por dia da semana, faixa horária
> e sazonalidade** — não uma taxa fixa. Também é insumo direto da exploração de acurácia (R3).

---

## 12. Histórico para baseline e validação de acurácia (R3)

- **Para que serve:** validar **viabilidade** antes de construir (decisão da seção 7 do conceito).
- **O que é:** recorte histórico (≥ 12 meses, Itaim) das tabelas 3, 4, 5/6, 10, 11 — com **desfecho real** já conhecido.
- **Usos:**
  - Baseline de LOS: `LOS médio por cd_procedimento` e `por cd_cid` → previsão "burra" a ser batida pela IA.
  - Validação da previsão de alta: comparar previsto × `dt_alta_medica` real (erro em dias, calibração).
  - Validação da previsão de demanda: reconstruir a demanda real por tipo de leito por dia e comparar.
- **Sensibilidade:** alta → trabalhar anonimizado/pseudonimizado.

---

## 13. Matriz dado × funcionalidade

| Conjunto de dados | F1 ocup. | F2 alta IA | F3 demanda | F4 gargalo | F5 presos | F6 LOS | F7 alta<12h | F8 recom. |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| 1. Estrutura de leitos | ● | | ● | ● | | | | ● |
| 2. Setores | ● | | ● | ● | | | | ● |
| 3. ADT / movimentação | ● | | ● | ● | ● | | ● | ● |
| 4. Internação/permanência | ● | ● | ● | ● | ● | ● | ● | ● |
| 5. Evoluções (texto) | | ● | | | ● | ○ | | ● |
| 6. Sinais vitais | | ● | | | ○ | | | ○ |
| 7. Dispositivos/prescrição | | ● | | | ○ | | | ○ |
| 8. Pedidos/pendências | | ○ | | | ● | | | ● |
| 9. Eritel (giro/higiene) | ● | | ○ | ● | | | | ● |
| 10. Agenda cirúrgica | | | ● | ● | | | | ● |
| 11. PS / conversão | | | ● | ● | | | | ● |
| 12. Histórico (baseline/val.) | | ● | ● | ● | | ● | | |

● = essencial · ○ = desejável

---

## 14. Priorização de obtenção (o que buscar primeiro)

**Onda 1 — viabilidade e execução (não dependem de prontuário, menor barreira LGPD/TI):**
1. Estrutura de leitos + setores (1, 2)
2. ADT / movimentação + internação (3, 4)
3. Eritel — giro/higienização (9)
4. Histórico de PS e agenda cirúrgica (10, 11, 12) para a **exploração de acurácia (R3)**

> Com a Onda 1 já dá para entregar F1, giro de leito, F5 (versão por gap de alta médica×administrativa),
> F6, F7 — e responder se a **previsão é viável** antes de mexer em prontuário.

**Onda 2 — previsão clínica com IA (exige aprovação TI + tratamento LGPD):**
5. Evoluções (5), sinais vitais (6), dispositivos (7), pedidos (8) → habilita F2 e o F5 "inteligente".

---

## 15. Pendências e próximos passos

- [ ] **Confirmar no discovery (Itaim):** existe registro estruturado de motivo de não-alta? Eritel exporta/tem API? Agenda cirúrgica preenche destino pós-op e LOS?
- [ ] **Pedido formal à TI** (com justificativa por serviço): export histórico de 12 meses das tabelas da Onda 1, escopo Itaim.
- [ ] Obter dicionário de dados do TASY para fixar nomes reais de tabela/coluna.
- [ ] Definir estratégia de anonimização/pseudonimização para Onda 2 (R1).
- [ ] Avaliar se o **modelo semântico corporativo** já entrega parte das tabelas 3/4 limpas (atalho).

---

## Limites desta análise
- Nomes de campo são a convenção esperada, **não verificados** contra o TASY do Itaim.
- Não sei ainda se Eritel exporta dado estruturado — é premissa a confirmar.
- Volume/custo de processamento das evoluções pelo LLM (R4) não está dimensionado — depende do nº de internações/dia do Itaim.
- Acesso a tudo que toca paciente **depende de aprovação da TI corporativa** — pré-requisito, não detalhe.
