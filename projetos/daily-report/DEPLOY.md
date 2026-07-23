# Deploy — Rotina diária na máquina de extração

Guia para colocar a rotina `daily-report` rodando numa máquina dedicada, agendada
para **6h00 todos os dias**. A rotina roda num único processo (`npm run daily`):
extrai do TASY via `tasy-client` → carrega no SQLite → calcula os KPIs → monta o
payload → faz POST ao Power Automate.

> A máquina precisa estar na **rede corporativa** (para alcançar o TASY em
> `hismorumbi.rededor.corp`) **e** com saída para a internet (endpoint do Power
> Automate). Sem rede corporativa a extração falha na autenticação.

---

## 1. Pré-requisitos

| Item | Requisito |
|---|---|
| SO | Windows (usa o Task Scheduler) |
| Node.js | **≥ 22** — o pipeline usa o módulo nativo `node:sqlite` (testado em Node 24). Confira com `node -v`. |
| Git | qualquer versão recente |
| Rede | acesso ao TASY (rede corporativa/VPN) + ao endpoint do Power Automate |
| Credenciais | usuário de serviço do TASY (`TASY_USER`/`TASY_PASS`) e a URL SAS do fluxo |

---

## 2. Clonar / atualizar o repositório

O repositório é **único** e contém os dois projetos (`projetos/daily-report` e
`projetos/tasy-client`).

```powershell
# primeira vez:
git clone <URL-DO-REPO> C:\caminho\para\DaTIS
# atualizações depois:
cd C:\caminho\para\DaTIS
git pull
```

Ajuste `C:\caminho\para\DaTIS` para o caminho real na máquina.

---

## 3. Build da biblioteca + dependências

O `daily-report` consome o `tasy-client` **compilado** (`dist/`), então a ordem
importa. `dist/` e `node_modules/` são versionados-fora (`.gitignore`), por isso o
build é obrigatório a cada máquina e **a cada `git pull` que altere o tasy-client**.

```powershell
cd C:\caminho\para\DaTIS\projetos\tasy-client
npm install
npm run build            # gera dist/  (OBRIGATÓRIO)

cd ..\daily-report
npm install              # resolve "tasy-client": "file:../tasy-client"
```

---

## 4. Variáveis de ambiente (escopo **User**)

A tarefa agendada herda as variáveis de **escopo User** do usuário que a executa.
Defina-as **uma vez**, no PowerShell, **logado como a conta que vai rodar a tarefa**:

```powershell
[Environment]::SetEnvironmentVariable("TASY_USER", "<usuario_de_servico>", "User")
[Environment]::SetEnvironmentVariable("TASY_PASS", "<senha>", "User")
[Environment]::SetEnvironmentVariable("DAILY_REPORT_ENDPOINT_URL", "<URL_SAS_completa_com_&sig=>", "User")

# recomendadas:
[Environment]::SetEnvironmentVariable("DAILY_REPORT_SHARED_SECRET", "<segredo>", "User")
[Environment]::SetEnvironmentVariable("TASY_BASE_URL", "http://hismorumbi.rededor.corp", "User")
```

| Variável | Obrigatória | Descrição |
|---|---|---|
| `TASY_USER` / `TASY_PASS` | **sim** | credenciais do usuário de serviço do TASY |
| `DAILY_REPORT_ENDPOINT_URL` | sim (p/ enviar) | URL SAS **completa** do trigger, com `&sp&sv&sig`. Sem ela o envio vira no-op logado (o resto roda). |
| `DAILY_REPORT_SHARED_SECRET` | recomendada | vai no header `x-dtis-secret` (2ª camada de segurança; **o fluxo precisa validar**) |
| `TASY_BASE_URL` | não | default = `base_url` do catálogo |

> **Segurança:** nunca coloque essas variáveis no repositório. A
> `DAILY_REPORT_ENDPOINT_URL` **contém o `sig`, que é segredo** (equivale à chave do
> endpoint). Reabra o terminal após defini-las para que entrem em vigor.

---

## 5. Validação manual (antes de agendar)

```powershell
cd C:\caminho\para\DaTIS\projetos\daily-report
npm run typecheck                 # deve passar limpo
npm run daily -- --dry-run        # extrai do TASY, calcula, grava o payload, NÃO envia
npm run daily                     # execução real (com POST ao Power Automate)
```

Esperado na execução real: `[envio] enviado: HTTP 202 ...`. Códigos de saída:

| Exit | Significado |
|---|---|
| 0 | tudo certo |
| 1 | degradado (relatório faltando ou dia sem computar) |
| 2 | falha fatal (autenticação/rede TASY) |
| 3 | falha no envio (endpoint) |

> No **1º dia**, `cirurgias_previstas` sai nulo — ele depende da agenda (2070)
> extraída no **dia anterior**. A partir do 2º dia consecutivo, normaliza sozinho.

---

## 6. Wrapper de execução (`run-daily.ps1`)

Crie este arquivo na máquina (ex.: em `projetos\daily-report\run-daily.ps1`). Ele
fixa o diretório, registra log e propaga o código de saída para o Task Scheduler:

```powershell
# run-daily.ps1 — wrapper da tarefa agendada.
$ErrorActionPreference = "Stop"
$proj = "C:\caminho\para\DaTIS\projetos\daily-report"   # AJUSTAR
$logDir = Join-Path $proj "logs"
New-Item -ItemType Directory -Force -Path $logDir | Out-Null
$log = Join-Path $logDir ("daily_" + (Get-Date -Format "yyyy-MM-dd") + ".log")

Set-Location $proj
("[{0}] iniciando npm run daily" -f (Get-Date -Format o)) | Tee-Object -FilePath $log -Append
npm run daily *>> $log
$code = $LASTEXITCODE
("[{0}] finalizado exit={1}" -f (Get-Date -Format o), $code) | Tee-Object -FilePath $log -Append
exit $code
```

> Se guardar os logs dentro do repositório, adicione `logs/` ao `.gitignore`. Os
> logs trazem apenas números de KPI (sem PHI), mas melhor mantê-los fora do git.

---

## 7. Registrar a tarefa às 6h00

Rode como a **mesma conta** cujas variáveis de ambiente foram definidas no passo 4
— senão a tarefa não enxerga `TASY_USER`/`TASY_PASS`. Este é o principal ponto de
falha na configuração.

```powershell
schtasks /Create `
  /TN "DTIS\DailyReport" `
  /TR "powershell -NoProfile -ExecutionPolicy Bypass -File \"C:\caminho\para\DaTIS\projetos\daily-report\run-daily.ps1\"" `
  /SC DAILY /ST 06:00 `
  /RU "<DOMINIO\usuario>" /RP "*" `
  /RL LIMITED /F
```

| Flag | O que faz |
|---|---|
| `/SC DAILY /ST 06:00` | diária, às 06:00 |
| `/RU` | conta que executa — **a mesma do passo 4** |
| `/RP "*"` | pede a senha da conta (permite rodar com o usuário deslogado) |
| `/RL LIMITED` | privilégios normais (não precisa de admin) |
| `/F` | sobrescreve se a tarefa já existir |

Alternativa: usar a GUI "Agendador de Tarefas" e apontar a ação para o mesmo
`powershell ... -File run-daily.ps1`.

---

## 8. Verificar a tarefa

```powershell
schtasks /Query /TN "DTIS\DailyReport" /V /FO LIST     # detalhes / última execução
schtasks /Run   /TN "DTIS\DailyReport"                 # dispara agora, para testar
```

Confira o log gerado em `daily-report\logs\daily_<data>.log` e o payload em
`daily-report\data\out\payload_<data>_u14.json`.

---

## 9. Operação e troubleshooting

- **Reprocessar um dia específico:** `npm run daily -- --ref <D-1> --hoje <D-0>`
  (ex.: `--ref 2026-07-22 --hoje 2026-07-23`).
- **Recomputar sem re-extrair:** acrescente `--no-extract` (usa o que já está no banco).
- **Após `git pull` que altere o `tasy-client`:** rode `npm run build` no `tasy-client`
  de novo (o `daily-report` consome o `dist/`).
- **Falha de autenticação (exit 2):** credenciais erradas/expiradas ou fora da rede
  corporativa.
- **Falha no envio 401 (exit 3):** URL SAS incompleta (sem `&sig=`) ou o fluxo passou a
  exigir o `x-dtis-secret` — confira `DAILY_REPORT_ENDPOINT_URL` e o segredo.
- **Onde ficam os dados:** banco em `data/db/` e payloads em `data/out/` — ambos
  **fora do git** (`.gitignore`), pois o SQLite contém dados de paciente (PHI).

---

## 10. Segurança e fronteira DTIS

- **PHI:** as linhas cruas dos relatórios (nomes de paciente) ficam no SQLite local.
  Nunca versione `data/`; nunca copie o banco para fora da máquina.
- **Endpoint anônimo (SAS):** qualquer um com a URL pode disparar o fluxo. Garanta que
  o fluxo **valide o header `x-dtis-secret`** e defina `DAILY_REPORT_SHARED_SECRET`.
- **Produção:** a integração direta com o TASY e o uso do relatório nas unidades
  dependem de **aprovação da TI corporativa** e **validação clínica / sign-off do VP**.
