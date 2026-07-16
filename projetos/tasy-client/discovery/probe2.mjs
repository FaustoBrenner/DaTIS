// discovery/probe2.mjs
// Segunda sonda: agora que o login funciona, resolve as incógnitas de design do SDK.
//
//   Q1. O header `crsftoken` precisa CASAR com um valor do servidor, ou basta ESTAR PRESENTE?
//       (endpoints /user/* deram 401 "XSRF" sem ele; /service/* passaram sem ele)
//   Q2. Existe endpoint de refresh que aceite o refresh_token, evitando re-login a cada 10min?
//
// Uso (PowerShell):
//   $env:TASY_PASS = [System.Environment]::GetEnvironmentVariable("TASY_PASS","User")
//   $env:TASY_USER = [System.Environment]::GetEnvironmentVariable("TASY_USER","User")
//   node discovery/probe2.mjs
//
// Não persiste nada em disco: imprime apenas status e diagnóstico, sem tokens.

const BASE = process.env.TASY_BASE_URL ?? "http://hismorumbi.rededor.corp";
const USER = process.env.TASY_USER;
const PASS = process.env.TASY_PASS;
if (!USER || !PASS) { console.error("Defina TASY_USER e TASY_PASS."); process.exit(1); }

const jar = new Map();
function absorb(res) {
  for (const raw of res.headers.getSetCookie()) {
    const [pair] = raw.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1));
  }
}
const cookieHeader = () => [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");

async function raw(path, { method = "GET", body = null, headers = {} } = {}) {
  const res = await fetch(path.startsWith("http") ? path : BASE + path, {
    method,
    headers: {
      accept: "application/json, text/plain, */*",
      referer: BASE + "/",
      ...(body !== null ? { "content-type": "application/json;charset=UTF-8" } : {}),
      ...(jar.size ? { cookie: cookieHeader() } : {}),
      ...headers,
    },
    body,
  });
  absorb(res);
  const text = await res.text();
  let json = null; try { json = JSON.parse(text); } catch {}
  return { status: res.status, json, text };
}

// ---- Login ----
await raw("/TasyAppServer/resources/public/system/isExpiredBetaServicePack");
const login = await raw("/TasyAppServer/resources/public/security/oauth", {
  method: "POST",
  body: JSON.stringify({ username: USER, password: PASS, computerName: null, osUsername: null, scope: "WTASY", timezone: "America/Sao_Paulo", ipMachine: null }),
});
if (login.status !== 200) { console.error("Login falhou:", login.status, login.json?.message); process.exit(1); }
const token = login.json.access_token;
const refreshToken = login.json.refresh_token;
const auth = { authorization: `BEARER ${token}` };
console.log("Login OK. Token dura", login.json.expires_in, "min | refresh dura", login.json.refresh_expires, "min\n");

// ---- Q1: crsftoken em /user/data ----
console.log("Q1 — /user/data (endpoint que exige XSRF):");
const arbitrary = Buffer.from(String(Math.floor(Math.random() * 1e10))).toString("base64");
const cases = [
  ["sem crsftoken",              { ...auth }],
  ["crsftoken vazio",            { ...auth, crsftoken: "" }],
  ["crsftoken arbitrario novo",  { ...auth, crsftoken: arbitrary }],
  ["crsftoken do dump antigo",   { ...auth, crsftoken: "MTU3MTUzNDcyMg==" }],
];
for (const [label, headers] of cases) {
  const r = await raw("/TasyAppServer/resources/user/data", { headers });
  console.log(`  [${r.status}] ${label}${r.json?.message ? " -> " + r.json.message : " -> OK"}`);
}

// ---- Q2: formato do refresh no endpoint /public/security/oauth/refresh (confirmado existente) ----
console.log("\nQ2 — formato do refresh em /public/security/oauth/refresh:");
const REFRESH = "/TasyAppServer/resources/public/security/oauth/refresh";
const form = (obj) => Object.entries(obj).map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join("&");
const refreshAttempts = [
  ["form: refresh_token", REFRESH, "POST", form({ refresh_token: refreshToken }), "application/x-www-form-urlencoded"],
  ["form: grant_type+refresh_token", REFRESH, "POST", form({ grant_type: "refresh_token", refresh_token: refreshToken }), "application/x-www-form-urlencoded"],
  ["json: refreshToken(camel)", REFRESH, "POST", JSON.stringify({ refreshToken }), "application/json;charset=UTF-8"],
  ["query string", REFRESH + "?refresh_token=" + encodeURIComponent(refreshToken), "POST", "", null],
];
for (const [label, path, method, body, ctype] of refreshAttempts) {
  try {
    const headers = { ...auth };
    if (ctype) headers["content-type"] = ctype;
    const res = await fetch(BASE + path, { method, headers: { accept: "application/json, text/plain, */*", referer: BASE + "/", cookie: cookieHeader(), ...headers }, body: body || null });
    const text = await res.text(); let json = null; try { json = JSON.parse(text); } catch {}
    const gotToken = json && (json.access_token || json.token);
    console.log(`  [${res.status}] ${label}${gotToken ? " -> RENOVOU ✓ (novo access_token, expires_in=" + json.expires_in + ")" : json?.message ? " -> " + json.message : " -> " + text.slice(0, 60)}`);
  } catch (e) {
    console.log(`  [ERRO] ${label} -> ${e}`);
  }
}

console.log("\nCookies no jar ao final:", [...jar.keys()].join(", "));
