import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { TasyClient, buildSpecs, parseDateRef } from "tasy-client";
import type { CatalogFile, ReportSpec } from "tasy-client";

import { ITAIM } from "../config.js";
import { abrirDb } from "../db/conn.js";
import { carregarExtracao } from "../db/load.js";
import { upsertRelatorioDiario } from "../db/repos.js";
import type { LinhaTasy } from "../io/json.js";
import { RELATORIOS, computeUnidade } from "../kpis/computeUnidade.js";
import { DiaNaoComputadoError, montarPayload } from "../transmit/payload.js";
import { enviar } from "../transmit/post.js";

/**
 * ROTINA DIÁRIA fim-a-fim: extração da fonte (TASY, via tasy-client, in-memory)
 * → carga no banco → KPIs + serving → payload → POST ao Power Automate. Um único
 * processo, uma única sessão TASY. É a rotina que a tarefa agendada das 6h roda.
 *
 * Fluxo:
 *   1. extrai os 5 relatórios do job (conf do tasy-client) + a ocupação;
 *   2. carrega cada extração no SQLite (idempotente por relatório×unidade×dia);
 *   3. computeUnidade → grava em relatorios_diarios (serving/forecast);
 *   4. montarPayload → enviar.
 *
 * Modelo temporal (ver computeUnidade / ARQUITETURA.md):
 *   - `ref`  = D-1 (dia dos realizados reportados). É o `dateRef` da extração:
 *     os tokens `@date_ref` dos relatórios de realizados resolvem para D-1, e
 *     `@date_ref+1d` da agenda (2070) resolve para D-0.
 *   - `hoje` = D-0 (dia da extração). É a `data_extracao` sob a qual tudo é
 *     carregado; a agenda de hoje vira `cirurgias_frcst`.
 *
 * Uso (dirigido por env vars — schedule-friendly, sem args obrigatórios):
 *   TASY_USER=... TASY_PASS=... npm run daily
 *   npm run daily -- --dry-run          (extrai/calcula/grava payload, sem POST)
 *   npm run daily -- --no-extract       (pula a extração; usa o que já está no banco)
 *   npm run daily -- --ref 2026-07-21 --hoje 2026-07-22   (reprocessamento manual)
 *   Flags extra: --db <arquivo> --catalog <path> --job <path> --snapshot
 *
 * Env vars:
 *   TASY_USER / TASY_PASS            (obrigatórias p/ extração; escopo User no Windows)
 *   TASY_BASE_URL                    (opcional; default = catalog.base_url)
 *   DAILY_REPORT_ENDPOINT_URL        (sem ela, o envio é no-op logado)
 *   DAILY_REPORT_SHARED_SECRET       (header x-dtis-secret)
 *
 * Exit codes: 0 ok · 1 degradado (relatório faltando / dia não computado) ·
 *   2 falha fatal (auth/rede) · 3 falha no envio.
 */

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const RAIZ = path.resolve(__dirname, "../..");

/** Config default da extração — single-sourced no tasy-client (projeto irmão). */
const CONF_TASY = path.resolve(RAIZ, "../tasy-client/conf");
const CATALOG_DEFAULT = path.join(CONF_TASY, "reports_catalog.json");
const JOB_DEFAULT = path.join(CONF_TASY, "job_daily_report.json");

/** Códigos de relatório aceitos pelo pipeline (os que o computeUnidade consome). */
const CODIGOS_VALIDOS = new Set<string>(Object.values(RELATORIOS));

interface JobFile {
  job_name: string;
  date_ref?: string | null;
  estabelecimento?: string;
  estabelecimento_cd?: number;
  common_args?: Record<string, unknown>;
  reports: Array<{ key: string; args?: Record<string, unknown> }>;
}

function opt(args: string[], nome: string): string | undefined {
  const i = args.indexOf(nome);
  return i >= 0 ? args[i + 1] : undefined;
}

/** aaaa-mm-dd no fuso local (a máquina de extração roda no horário de Brasília). */
function isoLocal(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function lerJson<T>(caminho: string): T {
  return JSON.parse(fs.readFileSync(caminho, "utf8")) as T;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Executa `fn` com até 3 tentativas e backoff exponencial (paridade com run-job). */
async function comRetry<T>(rotulo: string, fn: () => Promise<T>): Promise<T> {
  let ultimoErro: unknown;
  for (let tentativa = 1; tentativa <= 3; tentativa++) {
    try {
      return await fn();
    } catch (err) {
      ultimoErro = err;
      console.warn(`  [retry] ${rotulo} tentativa ${tentativa}/3 falhou: ${String(err)}`);
      if (tentativa < 3) await sleep(2 ** (tentativa - 1) * 1000);
    }
  }
  throw ultimoErro;
}

/** Grava o snapshot cru dos registros extraídos (auditoria/replay). */
function gravarSnapshot(hoje: string, relatorio: string, registros: LinhaTasy[]): void {
  const dir = path.join(RAIZ, "data", "out", "extracao", hoje);
  fs.mkdirSync(dir, { recursive: true });
  const arquivo = path.join(dir, `${relatorio}_${hoje}.json`);
  fs.writeFileSync(arquivo, JSON.stringify(registros, null, 2), "utf8");
}

async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const semExtracao = args.includes("--no-extract");
  const comSnapshot = args.includes("--snapshot");
  const dbPath = opt(args, "--db") ?? path.join(RAIZ, "data", "db", "daily_report.sqlite");
  const catalogPath = opt(args, "--catalog") ?? CATALOG_DEFAULT;
  const jobPath = opt(args, "--job") ?? JOB_DEFAULT;

  // Janela dinâmica: ref = ontem (D-1), hoje = hoje (D-0). Overrides p/ reprocessar.
  const hoje = opt(args, "--hoje") ?? isoLocal(new Date());
  const ref = opt(args, "--ref") ?? isoLocal(new Date(Date.now() - 86_400_000));

  const idUnidade = ITAIM.id_unidade;
  let degradado = false;

  console.log("=".repeat(62));
  console.log(`DAILY — ${ITAIM.unidade} (id ${idUnidade})`);
  console.log(`janela: realizados=${ref} (D-1) | extração=${hoje} (D-0)`);
  console.log(`db=${path.relative(RAIZ, dbPath)}${dryRun ? " | DRY-RUN" : ""}${semExtracao ? " | SEM-EXTRAÇÃO" : ""}`);
  console.log("=".repeat(62));

  const db = abrirDb(dbPath);

  // ── 1) EXTRAÇÃO + CARGA ────────────────────────────────────────────────────
  if (!semExtracao) {
    const catalog = lerJson<CatalogFile>(catalogPath);
    const job = lerJson<JobFile>(jobPath);
    const specs = buildSpecs(catalog);
    const commonArgs = job.common_args ?? {};
    const dateRef = parseDateRef(ref); // tokens resolvem contra D-1

    const user = process.env.TASY_USER;
    const password = process.env.TASY_PASS;
    if (!user || !password) {
      console.error("[daily] TASY_USER/TASY_PASS não definidos — extração impossível.");
      db.close();
      return 2;
    }
    const baseUrl = process.env.TASY_BASE_URL ?? catalog.base_url;

    const tasy = new TasyClient({ baseUrl, username: user, password });
    try {
      await comRetry("auth", () => tasy.session.ensureAuth());
    } catch (err) {
      console.error(`[daily] falha de autenticação/rede: ${String(err)}`);
      db.close();
      return 2;
    }
    console.log(`[extração] autenticado em ${baseUrl}`);

    // Troca de estabelecimento só se o job pedir (paridade com run-job). O
    // job_daily_report escopa por CD_ESTAB nos args, então não troca.
    const estabNome = job.estabelecimento;
    if (estabNome) {
      const estab = await tasy.establishment.changeByName(estabNome);
      console.log(`[extração] estabelecimento por nome: ${estab.name} (${estab.code})`);
    } else if (typeof job.estabelecimento_cd === "number") {
      await tasy.establishment.change(job.estabelecimento_cd);
      console.log(`[extração] estabelecimento: cd ${job.estabelecimento_cd}`);
    }

    // Relatórios do job.
    for (const jr of job.reports) {
      const spec: ReportSpec | undefined = specs[jr.key];
      if (!spec) {
        console.error(`  [erro] relatório '${jr.key}' ausente no catálogo — pulado.`);
        degradado = true;
        continue;
      }
      const relatorio = String(spec.code);
      if (!CODIGOS_VALIDOS.has(relatorio)) {
        console.warn(`  [aviso] código ${relatorio} (${jr.key}) não é consumido pelo pipeline.`);
      }
      const argsRel = { ...commonArgs, ...(jr.args ?? {}) };
      try {
        const result = await comRetry(jr.key, () => tasy.reports.generate(spec, argsRel, dateRef));
        const registros = result.files.flatMap((f) => f.rows) as LinhaTasy[];
        if (comSnapshot) gravarSnapshot(hoje, relatorio, registros);
        const r = carregarExtracao(db, {
          relatorio,
          idUnidade,
          dataExtracao: hoje,
          arquivo: `tasy:${jr.key}`,
          registros,
        });
        console.log(`  [ok] ${relatorio} (${jr.key}): ${r.linhas} registros${r.substituiu ? " (substituído)" : ""}`);
      } catch (err) {
        console.error(`  [erro] ${jr.key} falhou após retries: ${String(err)}`);
        degradado = true;
      }
    }

    // Ocupação (snapshot live, sem data; carregada sob D-0 = hoje).
    try {
      const occ = await comRetry("ocupação", () => tasy.occupancy.getOccupancy(idUnidade));
      const registros = occ.rows as LinhaTasy[];
      if (comSnapshot) gravarSnapshot(hoje, RELATORIOS.ocupacao, registros);
      const r = carregarExtracao(db, {
        relatorio: RELATORIOS.ocupacao,
        idUnidade,
        dataExtracao: hoje,
        arquivo: "tasy:occupancy",
        registros,
      });
      console.log(`  [ok] ${RELATORIOS.ocupacao}: ${r.linhas} registros${r.substituiu ? " (substituído)" : ""}`);
    } catch (err) {
      console.error(`  [erro] ocupação falhou após retries: ${String(err)}`);
      degradado = true;
    }
  }

  // ── 2) KPIs + SERVING ──────────────────────────────────────────────────────
  const { report } = computeUnidade(db, ITAIM, { refIso: ref, extracaoHoje: hoje });
  const { acao } = upsertRelatorioDiario(db, ref, report);
  console.log(`[kpis] relatorios_diarios: registro ${acao} (${ref}, u${idUnidade})`);

  // ── 3) PAYLOAD ─────────────────────────────────────────────────────────────
  let payload;
  try {
    payload = montarPayload(db, ITAIM, { refIso: ref, hojeIso: hoje });
  } catch (err) {
    db.close();
    if (err instanceof DiaNaoComputadoError) {
      console.error(`[payload] ${err.message}`);
      return 1;
    }
    throw err;
  }
  db.close();

  const saidaDir = path.join(RAIZ, "data", "out");
  fs.mkdirSync(saidaDir, { recursive: true });
  const saida = path.join(saidaDir, `payload_${ref}_u${idUnidade}.json`);
  fs.writeFileSync(saida, JSON.stringify(payload, null, 2), "utf8");
  const bytes = fs.statSync(saida).size;
  console.log(`[payload] ${path.relative(RAIZ, saida)} (${(bytes / 1024).toFixed(1)} KB)`);
  if (payload.qualidade.suspeitas.length) {
    for (const s of payload.qualidade.suspeitas) console.log(`  ! suspeita: ${s}`);
  }
  if (payload.qualidade.campos_null_relevantes.length) {
    console.log(`  nulos: ${payload.qualidade.campos_null_relevantes.join(", ")}`);
  }

  // ── 4) ENVIO ───────────────────────────────────────────────────────────────
  if (dryRun) {
    console.log("[daily] --dry-run: envio não tentado.");
    return degradado ? 1 : 0;
  }

  const resultado = await enviar(payload);
  switch (resultado.status) {
    case "nao_configurado":
      console.log("[envio] endpoint não configurado (DAILY_REPORT_ENDPOINT_URL ausente) — payload só em disco.");
      break;
    case "enviado":
      console.log(`[envio] enviado: HTTP ${resultado.httpStatus} em ${resultado.tentativas} tentativa(s).`);
      break;
    case "falhou":
      console.error(`[envio] FALHOU após ${resultado.tentativas} tentativa(s): ${resultado.erro}`);
      return 3;
  }

  return degradado ? 1 : 0;
}

main()
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error("[daily] erro fatal:", err);
    process.exit(2);
  });
