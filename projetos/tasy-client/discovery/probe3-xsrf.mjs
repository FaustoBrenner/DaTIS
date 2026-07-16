// probe3-xsrf.mjs — Decifrar o mecanismo XSRF dos endpoints /user/* (backlog P1).
//
// Perguntas:
//   Q1. De onde o frontend tira o valor do header `crsftoken`?
//       Candidatos: corpo da resposta do /oauth, payload do JWT, cookie, bundle JS.
//   Q2. Qual combinação de header/valor satisfaz o /user/data?
//
// Uso (PowerShell):
//   $env:TASY_USER = [System.Environment]::GetEnvironmentVariable("TASY_USER","User")
//   $env:TASY_PASS = [System.Environment]::GetEnvironmentVariable("TASY_PASS","User")
//   node discovery/probe3-xsrf.mjs
//
// Segurança: NUNCA imprime valores de token/senha — só nomes de campos, comprimentos
// e trechos de código do bundle JS (que é público para qualquer usuário da rede).

const BASE = process.env.TASY_BASE_URL ?? "http://hismorumbi.rededor.corp";
const USER = process.env.TASY_USER;
const PASS = process.env.TASY_PASS;
if (!USER || !PASS) { console.error("Defina TASY_USER e TASY_PASS."); process.exit(1); }

const jar = new Map();
function absorb(res) {
  const set = res.headers.getSetCookie?.() ?? [];
  for (const c of set) {
    const [pair] = c.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}
function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}
async function req(path, init = {}) {
  const headers = { accept: "application/json, text/plain, */*", referer: BASE + "/", ...init.headers };
  const ck = cookieHeader();
  if (ck) headers.cookie = ck;
  const res = await fetch(path.startsWith("http") ? path : BASE + path, { ...init, headers });
  absorb(res);
  return res;
}
// Descreve um objeto sem vazar valores: nome → tipo (+ comprimento se string).
function shape(obj) {
  if (obj === null || typeof obj !== "object") return typeof obj;
  return Object.fromEntries(Object.entries(obj).map(([k, v]) =>
    [k, typeof v === "string" ? `string(len=${v.length})` : Array.isArray(v) ? `array(${v.length})` : typeof v]));
}

// ---------------------------------------------------------------------------
// 1) Login e dissecação da resposta
// ---------------------------------------------------------------------------
await req("/TasyAppServer/resources/public/system/isExpiredBetaServicePack").catch(() => {});
const loginRes = await req("/TasyAppServer/resources/public/security/oauth", {
  method: "POST",
  headers: { "content-type": "application/json;charset=UTF-8" },
  body: JSON.stringify({ username: USER, password: PASS, computerName: null, osUsername: null, scope: "WTASY", timezone: "America/Sao_Paulo", ipMachine: null }),
});
const login = await loginRes.json();
console.log("1) LOGIN", loginRes.status);
console.log("   Campos da resposta:", JSON.stringify(shape(login)));
console.log("   Cookies no jar:", [...jar.keys()].join(", ") || "(nenhum)");

// Payload do JWT (claims) — só nomes e formas.
const jwt = login.access_token;
const claims = JSON.parse(Buffer.from(jwt.split(".")[1], "base64url").toString("utf8"));
console.log("   Claims do JWT:", JSON.stringify(shape(claims)));

// ---------------------------------------------------------------------------
// 2) Candidatos a valor de XSRF
// ---------------------------------------------------------------------------
const candidates = [];
for (const [k, v] of Object.entries(login))
  if (typeof v === "string" && /sr?f|token/i.test(k) && !["access_token", "refresh_token"].includes(k))
    candidates.push([`login.${k}`, v]);
for (const [k, v] of Object.entries(claims))
  if (typeof v === "string" && /sr?f/i.test(k)) candidates.push([`jwt.${k}`, v]);
for (const [k, v] of jar.entries())
  if (/sr?f/i.test(k)) candidates.push([`cookie.${k}`, decodeURIComponent(v)]);
console.log("2) Candidatos a XSRF encontrados:", candidates.map(([n]) => n).join(", ") || "(nenhum)");

// ---------------------------------------------------------------------------
// 3) Baseline e tentativas contra /user/data
// ---------------------------------------------------------------------------
async function tryUserData(label, extraHeaders) {
  const res = await req("/TasyAppServer/resources/user/data", {
    headers: { authorization: `BEARER ${jwt}`, ...extraHeaders },
  });
  const text = await res.text();
  let msg = "";
  try { msg = JSON.parse(text).message ?? ""; } catch { msg = text.slice(0, 80); }
  console.log(`   [${res.status}] ${label} — ${msg.slice(0, 80)}`);
  return res.status;
}

console.log("3) Tentativas /user/data:");
await tryUserData("baseline (só BEARER)", {});
for (const [name, value] of candidates) {
  await tryUserData(`crsftoken=${name}`, { crsftoken: value });
  await tryUserData(`X-XSRF-TOKEN=${name}`, { "x-xsrf-token": value });
}

// ---------------------------------------------------------------------------
// 4) Bundle JS do frontend: onde nasce o `crsftoken`?
// ---------------------------------------------------------------------------
console.log("4) Vasculhando o frontend por 'crsftoken' / 'xsrf'...");
const htmlRes = await req("/");
const html = await htmlRes.text();
const scripts = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1]);
console.log("   Scripts no index:", scripts.join(", ") || "(nenhum)");
for (const src of scripts) {
  const url = src.startsWith("http") ? src : BASE + (src.startsWith("/") ? "" : "/") + src;
  const js = await (await req(url)).text().catch(() => "");
  for (const term of ["crsftoken", "csrfToken", "xsrf", "CSRF"]) {
    let idx = -1, found = 0;
    while ((idx = js.indexOf(term, idx + 1)) !== -1 && found < 3) {
      console.log(`   --- ${src} @ '${term}' #${++found} ---`);
      console.log("   " + js.slice(Math.max(0, idx - 200), idx + 250).replace(/\s+/g, " "));
    }
  }
}
console.log("FIM.");
