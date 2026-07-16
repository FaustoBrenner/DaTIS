// probe4-xsrf.mjs — Confirmar o fluxo XSRF do TASY (backlog P1).
//
// Hipótese (do bundle): o servidor emite um header de resposta `xsrf-token` em
// respostas de /service|/public; o frontend o guarda (`storeCors`) e o reenvia.
// Falta descobrir com QUAL nome de header o cliente reenvia para satisfazer /user/*.
//
// Uso (PowerShell):
//   $env:TASY_USER = [System.Environment]::GetEnvironmentVariable("TASY_USER","User")
//   $env:TASY_PASS = [System.Environment]::GetEnvironmentVariable("TASY_PASS","User")
//   node discovery/probe4-xsrf.mjs
//
// Segurança: não imprime o valor do token, só comprimento e status.

const BASE = process.env.TASY_BASE_URL ?? "http://hismorumbi.rededor.corp";
const USER = process.env.TASY_USER;
const PASS = process.env.TASY_PASS;
if (!USER || !PASS) { console.error("Defina TASY_USER e TASY_PASS."); process.exit(1); }

const jar = new Map();
let xsrf = null; // último valor do header `xsrf-token` visto numa resposta.

function absorb(res) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
  const h = res.headers.get("xsrf-token");
  if (h) { xsrf = h; }
}
async function req(path, init = {}) {
  const headers = { accept: "application/json, text/plain, */*", referer: BASE + "/", ...init.headers };
  const ck = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  if (ck) headers.cookie = ck;
  const res = await fetch(path.startsWith("http") ? path : BASE + path, { ...init, headers });
  absorb(res);
  return res;
}

// Login
await req("/TasyAppServer/resources/public/system/isExpiredBetaServicePack").catch(() => {});
const loginRes = await req("/TasyAppServer/resources/public/security/oauth", {
  method: "POST", headers: { "content-type": "application/json;charset=UTF-8" },
  body: JSON.stringify({ username: USER, password: PASS, computerName: null, osUsername: null, scope: "WTASY", timezone: "America/Sao_Paulo", ipMachine: null }),
});
const jwt = (await loginRes.json()).access_token;
console.log("Login:", loginRes.status, "| xsrf-token no login?", loginRes.headers.get("xsrf-token") ? `sim (len=${loginRes.headers.get("xsrf-token").length})` : "não");

// Uma chamada /service para (talvez) receber o header xsrf-token
const svc = await req("/TasyAppServer/resources/service/WParameter/getParameter", {
  method: "POST", headers: { authorization: `BEARER ${jwt}`, "content-type": "application/json;charset=UTF-8" },
  body: JSON.stringify([{ tipo: "Integer", valor: 0 }, { tipo: "Integer", valor: 87 }]),
});
console.log("Service getParameter:", svc.status, "| xsrf-token na resposta?", svc.headers.get("xsrf-token") ? `sim (len=${svc.headers.get("xsrf-token").length})` : "não");
console.log("Token XSRF capturado até agora:", xsrf ? `sim (len=${xsrf.length})` : "NÃO");

// Dump de TODOS os headers de resposta do /service (nomes só), caso o header tenha outro nome
console.log("Headers de resposta do /service:", [...svc.headers.keys()].join(", "));

async function tryUserData(label, extraHeaders) {
  const res = await req("/TasyAppServer/resources/user/data", { headers: { authorization: `BEARER ${jwt}`, ...extraHeaders } });
  let msg = ""; const text = await res.text();
  try { msg = JSON.parse(text).message ?? ""; } catch { msg = text.slice(0, 60); }
  console.log(`   [${res.status}] ${label} — ${msg.slice(0, 70)}`);
  return res.status;
}

console.log("Tentativas /user/data com o token capturado:");
if (xsrf) {
  for (const hn of ["crsftoken", "xsrf-token", "x-xsrf-token", "csrftoken", "X-CSRF-TOKEN"]) {
    await tryUserData(`${hn}`, { [hn]: xsrf });
  }
} else {
  console.log("   (nenhum token XSRF foi capturado — investigar nome do header)");
  await tryUserData("baseline", {});
}
console.log("FIM.");
