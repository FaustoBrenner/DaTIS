# Gestão de Leitos — Conceito da POC

**Status:** `[RASCUNHO]`
**Projeto:** P4 — Plataforma de gestão de leitos (Produtos & Automações)
**Pilares:** Resultado Financeiro + Qualidade Percebida
**Unidade da POC:** Hospital Itaim (gestão de leitos centralizada, equipe de hotelaria)
**Autor:** Líder DTIS
**Última atualização:** 2026-06-11

> Documento vivo. Captura o conceito, as decisões já tomadas e as perguntas em aberto.
> Ainda **não é** PRD — o problema precisa ser validado em discovery antes de virar spec.

---

## 1. Tese do produto

Ser uma **ferramenta de gestão inteligente de leitos em tempo real** — não um painel informativo.
O valor não está em mostrar a ocupação, e sim em **antecipar gargalos e recomendar ação**:
quais altas priorizar, quais leitos destravar, quando escalar.

Princípio que guia todo o desenho (decisão da discussão inicial, ponto 2.8):

> Toda tela que não muda uma decisão do gestor é candidata a sair do escopo.

---

## 2. Funcionalidades pretendidas (produto final)

| # | Funcionalidade | Natureza | Observação de desenho |
|---|---|---|---|
| F1 | Acompanhamento da ocupação dos leitos por setor, em tempo real | Painel + dado | Ver risco R5 (ocupação administrativa ≠ física) |
| F2 | Previsão de alta por paciente, com IA, a partir do prontuário (evoluções + sinais vitais), com **racional textual** | IA | Desenho híbrido — ver seção 4 |
| F3 | Previsão de demanda de leitos (agenda cirúrgica + conversão do PS + movimentação entre setores) | IA / modelo | Por **tipo de leito**, com faixa de incerteza |
| F4 | Identificação antecipada de gargalos (defasagem demanda × capacidade), **por tipo de leito** | IA / regra | Núcleo do valor — saldo, não só fluxo |
| F5 | **Lista de pacientes clinicamente prontos mas "presos"**, com o motivo do travamento | IA + operação | Adicionado na discussão (ponto 2.2) |
| F6 | **Permanência excedente (LOS outliers)** — pacientes acima do tempo esperado, com explicação | IA + dado | Adicionado na discussão (ponto 2.4) |
| F7 | Indicador de **alta antes do meio-dia** | Métrica | Adicionado na discussão (ponto 2.7) |
| F8 | **Camada de recomendação / ação** sobre todas as previsões (quais cirurgias adiar, quais altas priorizar, quando acionar higiene/regulação) | IA / regra | Adicionado na discussão (ponto 2.8) — é o diferencial |

> F5, F6, F7 e F8 nasceram da revisão crítica do conceito. F8 é o que separa "ferramenta de gestão"
> de "painel informativo" e deve ser tratada como requisito de primeira classe, não enfeite.

---

## 3. Fora de escopo (por ora)

| Item | Decisão | Quando reavaliar |
|---|---|---|
| Camada financeira (diária glosada / autorização de convênio) | Fora do v1 — sem valor imediato para a POC (ponto 2.5) | Melhoria futura; conecta com P5 e P11 |
| Restrição de capacidade por isolamento/coorte | **Não se aplica** — Itaim só tem quarto privado, sem enfermaria compartilhada (ponto 2.3) | — |
| Capacidade limitada por equipe de enfermagem (staffing) | **Não se aplica no momento** (ponto 2.6) | — |

> Nota: a ausência de quarto compartilhado **simplifica** a modelagem de capacidade —
> um leito vago é de fato um leito disponível, sem o desconto de isolamento que existe em outras unidades.

---

## 4. Decisões de desenho já tomadas

### 4.1. Previsão de alta = desenho híbrido, não LLM cru
O LLM lê a evolução em texto livre e **extrai sinal clínico** (ex: "aguardando vaga", "desmame de O2",
"afebril há 48h", "família orientada sobre alta") e **redige o racional explicável**.
A estimativa de probabilidade/data de alta deve vir de uma camada calibrada, não de um número cuspido pelo LLM.
Sempre comparar contra um **baseline simples** (tempo médio de permanência por procedimento/CID):
se a IA não bate o baseline, não justifica o custo.

### 4.2. Gargalo é calculado por **tipo de leito** (UTI / UNI / enfermaria-equivalente), nunca agregado
Leito não é fungível: alta de um tipo não libera leito de outro tipo.
O número agregado mascara exatamente o gargalo que a ferramenta deveria prever.

### 4.3. Modelo de estoque-e-fluxo, não só fluxo
`ocupação projetada (por tipo, por hora) = ocupação atual + entradas previstas − saídas previstas`,
comparada com a **capacidade física disponível**. A defasagem precisa partir do censo atual, não de fluxo líquido.

### 4.4. Previsões entregues como **faixa + probabilidade**, não ponto cravado
Tanto a previsão de alta quanto a de demanda têm erro. Abater uma previsão contra a outra
exige propagar a incerteza. Número cravado que falha uma vez destrói a confiança do gestor.

### 4.5. Taxa de conversão do PS deve ser segmentada
Conversão PS→internação varia por dia da semana, hora e sazonalidade (surto, inverno respiratório).
Taxa fixa erra exatamente nos dias de pico — que são os que importam.

---

## 5. Fontes de dado (mapa inicial — a confirmar no discovery)

| Fonte | O que fornece | Status / observação |
|---|---|---|
| TASY (ADT) | Admissão, alta, transferência; censo administrativo | Integração requer aprovação da TI. **Atraso conhecido** entre evento real e lançamento (R5) |
| TASY (prontuário) | Evoluções, sinais vitais — insumo da previsão de alta (F2) | Dado sensível — LGPD (R1) |
| Agenda cirúrgica | Demanda eletiva prevista + destino pós-op + LOS esperado | Insumo de F3 |
| **Eritel (ramais)** | Rastreamento de **giro e higienização** de leito em tempo real (solicitação de limpeza e etapas pela enfermagem/hotelaria) | **Fonte complementar a estudar** — pode dar o estado real do leito (limpo/pronto) que o TASY não dá |
| Planilhas / contato com hotelaria | Frequentemente a fonte mais atual da realidade do andar | Possível ponto de entrada para o v1 enquanto a integração TASY não sai |

> O Eritel pode ser a chave para resolver o R5: o TASY diz "ocupado/vago" de forma administrativa,
> o Eritel sabe se o leito está **sujo, em limpeza ou pronto**. Cruzar os dois aproxima do estado físico real.

---

## 6. Riscos

| ID | Risco | Impacto | Mitigação |
|---|---|---|---|
| R1 | LGPD — evolução de prontuário alimentando LLM | Alto | Dado sintético/anonimizado em dev; em produção, LLM no ambiente aprovado pela TI (vocabulário: Bedrock). Documentar fluxo de dado |
| R2 | Viés de automação — racional convincente induz alta indevida | Alto | Posicionar como **apoio**, nunca decisão. Validação clínica antes de qualquer piloto |
| R3 | **Acurácia das estimativas insuficiente para viabilidade** | Alto | **Exploração de dados dedicada** para aferir acurácia antes de comprometer o desenho (ver seção 7) |
| R4 | Custo de token em escala (rodar todo prontuário a cada poucas horas) | Médio | Processar só o delta da evolução; cache; modelo menor para triagem |
| R5 | Ocupação no TASY é administrativa e atrasa vs. realidade física | Alto | Cruzar com Eritel e/ou hotelaria; validar defasagem real no discovery |

---

## 7. Questão crítica em aberto — viabilidade por acurácia (R3)

A preocupação central levantada: **as estimativas de alta e de demanda serão acuradas o suficiente
para serem úteis?** Antes de investir no produto completo, é preciso uma **exploração de dados dedicada** que responda:

- Qual o erro da previsão de alta vs. alta real (calibração, erro em dias)?
- A IA bate o baseline simples (LOS médio por procedimento/CID)?
- A previsão de demanda por tipo de leito tem faixa de erro gerenciável nos dias de pico?

**Decisão:** tratar acurácia como critério de go/no-go. Se a previsão não for acionável dentro de uma
faixa de erro tolerável, o produto pivota para as funcionalidades de **execução em tempo real**
(F5 lista de presos, F1 ocupação, giro via Eritel) — que entregam valor mesmo sem previsão precisa.

---

## 8. Hipótese a validar no discovery

> Hipótese do líder DTIS (a confirmar): o valor de curto prazo está mais na **execução** —
> lista de altas travadas (F5) e giro de leito (Eritel) — do que na **previsão de demanda** (F3),
> que é a parte mais difícil de acertar e mais fácil de errar na frente do gestor.

O discovery no Itaim (roteiro em `discovery_roteiro_itaim.md`) existe para confirmar ou refutar isso.

---

## 9. Próximos passos

1. [ ] Discovery com a gestão de leitos / hotelaria do Itaim — `discovery_roteiro_itaim.md`
2. [ ] Mapear acesso aos dados: TASY (ADT + prontuário), agenda cirúrgica, Eritel — inventário em `dados_necessarios.md`
3. [ ] Exploração de dados de acurácia (R3 / seção 7) — definir viabilidade da previsão
4. [ ] Síntese de discovery → decisão: avançar para PRD, mais discovery, ou pivotar escopo
5. [ ] Criar `projetos/gestao-de-leitos/poc/` com PRD quando o problema estiver validado

---

## O que ainda está incompleto neste documento
- Não há ainda perfil definido de quem é o gestor de leitos no Itaim (cargo, rotina) — sai do discovery.
- Não sabemos se já existe ferramenta/planilha atual de gestão de leitos no Itaim — sai do discovery.
- Métricas de sucesso (baseline + meta) ainda não definidas — dependem do discovery e da exploração de dados.
- Acesso aos dados (TASY, Eritel) **depende de aprovação da TI corporativa** — sinalizar cedo.
