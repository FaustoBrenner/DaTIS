// discovery/probe.mjs
// Sondagem dos endpoints de autenticação do TASY para o rebuild do tasy-client.
//
// Objetivo: capturar as RESPOSTAS (headers, cookies e corpos) que o dump de
// requests do tasy_client_rebuild.md não mostra, para responder:
//   1. Qual o formato da resposta do POST /oauth (onde vem o token? vem csrf?)
//   2. De onde vem o header `crsftoken` usado nos requests pós-login
//   3. Quais cookies o servidor seta e em qual ordem
//   4. Se os endpoints de serviço funcionam sem o crsftoken
//
// Uso (PowerShell, no diretório do projeto):
//   $env:TASY_USER = "seu.usuario"
//   $env:TASY_PASS = "sua_senha"
//   node discovery/probe.mjs
//
// Saída: discovery/probe_output.json (gitignored — contém tokens reais).
// No console, tokens aparecem mascarados.

import { writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const BASE = process.env.TASY_BASE_URL ?? "http://hismorumbi.rededor.corp";
const USER = process.env.TASY_USER;
const PASS = process.env.TASY_PASS;

if (!USER || !PASS) {
  console.error("Defina TASY_USER e TASY_PASS no ambiente antes de rodar.");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Cookie jar mínimo: guarda o último valor de cada cookie setado pelo servidor
// ---------------------------------------------------------------------------
const jar = new Map();

function absorbCookies(res) {
  for (const raw of res.headers.getSetCookie()) {
    const [pair] = raw.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1));
  }
}

function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const log = [];
let bearer = null; // token capturado do /oauth
let csrf = null;   // csrf, se encontrado em alguma resposta

function mask(s) {
  if (typeof s !== "string" || s.length < 24) return s;
  return s.slice(0, 12) + "…(" + s.length + " chars)";
}

/**
 * O arquivo de saída é material de discovery e pode ser lido/compartilhado.
 * A senha nunca deve chegar nele: substitui o valor real por placeholder.
 */
function redactBody(body) {
  if (typeof body !== "string") return body;
  return PASS ? body.split(JSON.stringify(PASS).slice(1, -1)).join("<TASY_PASS>").split(PASS).join("<TASY_PASS>") : body;
}

/** Cookies e Authorization carregam tokens de sessão; trunca para não persistir credencial utilizável. */
function redactHeaders(headers) {
  const out = { ...headers };
  if (out.authorization) out.authorization = "BEARER <TOKEN:" + out.authorization.length + " chars>";
  if (out.cookie) out.cookie = out.cookie.replace(/=[^;]+/g, "=<REDACTED>");
  return out;
}

/** Busca em profundidade por strings que pareçam JWT ou por chaves com 'csrf' no nome. */
function deepScan(node, path, hits) {
  if (typeof node === "string") {
    if (node.startsWith("eyJ")) hits.jwt.push({ path, value: node });
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((v, i) => deepScan(v, `${path}[${i}]`, hits));
    return;
  }
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      if (/csrf/i.test(k) && typeof v === "string") hits.csrf.push({ path: `${path}.${k}`, value: v });
      deepScan(v, `${path}.${k}`, hits);
    }
  }
}

async function call(name, path, { method = "GET", body = null, extraHeaders = {} } = {}) {
  const url = path.startsWith("http") ? path : BASE + path;
  const headers = {
    accept: "application/json, text/plain, */*",
    "accept-language": "pt-BR,pt;q=0.9",
    referer: BASE + "/",
    ...(body !== null ? { "content-type": "application/json;charset=UTF-8" } : {}),
    ...(jar.size ? { cookie: cookieHeader() } : {}),
    ...(bearer ? { authorization: `BEARER ${bearer}` } : {}),
    ...(csrf ? { crsftoken: csrf } : {}),
    ...extraHeaders,
  };

  const entry = { name, url, method, requestHeaders: redactHeaders(headers), requestBody: redactBody(body) };
  try {
    const res = await fetch(url, { method, headers, body });
    absorbCookies(res);

    const text = await res.text();
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { /* corpo não-JSON, mantém texto cru */ }

    entry.status = res.status;
    entry.responseHeaders = Object.fromEntries(res.headers.entries());
    entry.setCookie = res.headers.getSetCookie();
    entry.responseBody = parsed ?? text;

    // varre a resposta procurando JWT e csrf
    const hits = { jwt: [], csrf: [] };
    if (parsed) deepScan(parsed, "$", hits);
    entry.scan = hits;

    if (!bearer && hits.jwt.length) {
      bearer = hits.jwt[0].value;
      console.log(`   ↳ token JWT capturado em ${hits.jwt[0].path}`);
    }
    if (!csrf && hits.csrf.length) {
      csrf = hits.csrf[0].value;
      console.log(`   ↳ csrf capturado em ${hits.csrf[0].path}: ${hits.csrf[0].value}`);
    }

    const preview = typeof entry.responseBody === "string"
      ? entry.responseBody.slice(0, 120)
      : JSON.stringify(entry.responseBody).slice(0, 120);
    console.log(`✓ [${res.status}] ${name} — corpo: ${mask(preview) ?? preview}`);
  } catch (e) {
    entry.error = String(e);
    console.log(`✗ [ERRO] ${name} — ${e}`);
  }
  log.push(entry);
  return entry;
}

// ---------------------------------------------------------------------------
// Sequência de sondagem
// ---------------------------------------------------------------------------
console.log(`Sondando ${BASE} como ${USER}\n`);

// 0. Página raiz — verifica se o servidor seta cookies antes de qualquer login
await call("00_root", "/");

// 1. Endpoint público que a UI chama antes do login
await call("01_isExpiredBetaServicePack", "/TasyAppServer/resources/public/system/isExpiredBetaServicePack");

// 2. O login em si — a resposta deste request é a peça central do discovery
await call("02_oauth", "/TasyAppServer/resources/public/security/oauth", {
  method: "POST",
  body: JSON.stringify({
    username: USER,
    password: PASS,
    computerName: null,
    osUsername: null,
    scope: "WTASY",
    timezone: "America/Sao_Paulo",
    ipMachine: null,
  }),
});

// 3. Dados do usuário — hipótese: contém estabelecimentos e perfis disponíveis
await call("03_user_data", "/TasyAppServer/resources/user/data");

// 4. Checagem de sessões simultâneas (a UI chama logo após o login)
await call("04_existsMoreSessions", "/TasyAppServer/resources/user/existsMoreSessionsThanAllowed");

// 5. Endpoint de serviço read-only — testa se funciona SEM crsftoken
//    (se csrf não foi encontrado até aqui, o header simplesmente não é enviado)
await call("05_getParameter_87", "/TasyAppServer/resources/service/WParameter/getParameter", {
  method: "POST",
  body: JSON.stringify([{ tipo: "Integer", valor: 0 }, { tipo: "Integer", valor: 87 }]),
});

// ---------------------------------------------------------------------------
// Persistência
// ---------------------------------------------------------------------------
const outPath = join(dirname(fileURLToPath(import.meta.url)), "probe_output.json");
mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify({ base: BASE, user: USER, when: new Date().toISOString(), calls: log }, null, 2), "utf-8");

console.log(`\nResultado completo salvo em: ${outPath}`);
console.log("Cookies finais no jar:", [...jar.keys()].join(", ") || "(nenhum)");
console.log("Bearer capturado:", bearer ? mask(bearer) : "NÃO ENCONTRADO — inspecionar probe_output.json");
console.log("CSRF capturado:", csrf ?? "não encontrado (pode não existir ou vir de outro lugar)");
