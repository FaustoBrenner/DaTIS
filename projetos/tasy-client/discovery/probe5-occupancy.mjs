// probe5-occupancy.mjs — Conhecer o endpoint de "schematic cpanel datasource"
// (Ocupação hospitalar), família nova fora de /service e /report.
//
// Endpoint capturado da UI:
//   POST /TasyAppServer/resources/schematic/atepacfn/cpanels/18273/datasource?dictionaryCode=372558
//
// Objetivos:
//   1) Confirmar se exige os headers de "feature" (feature-code/route/active) ou só o bearer.
//   2) Confirmar se exige XSRF (esperado que NÃO — não é /user/*).
//   3) Mapear a ESTRUTURA da resposta (formas e contagens), com uma amostra de 1 linha.
//
// Uso (PowerShell):
//   $env:TASY_USER = [System.Environment]::GetEnvironmentVariable("TASY_USER","User")
//   $env:TASY_PASS = [System.Environment]::GetEnvironmentVariable("TASY_PASS","User")
//   node discovery/probe5-occupancy.mjs
//
// Segurança: ambiente seguro (dados de paciente autorizados em disco neste projeto),
// mas por padrão só imprime formas/contagens + 1 linha de amostra no console.

const BASE = process.env.TASY_BASE_URL ?? "http://hismorumbi.rededor.corp";
const USER = process.env.TASY_USER;
const PASS = process.env.TASY_PASS;
if (!USER || !PASS) { console.error("Defina TASY_USER e TASY_PASS."); process.exit(1); }

const jar = new Map();
function absorb(res) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [pair] = c.split(";");
    const eq = pair.indexOf("=");
    if (eq > 0) jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}
async function req(path, init = {}) {
  const headers = { accept: "application/json, text/plain, */*", referer: BASE + "/", ...init.headers };
  const ck = [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
  if (ck) headers.cookie = ck;
  const res = await fetch(path.startsWith("http") ? path : BASE + path, { ...init, headers });
  absorb(res);
  return res;
}

// Descreve a forma de um valor sem despejar conteúdo sensível.
function shape(v, depth = 0) {
  if (v === null || typeof v !== "object") {
    if (typeof v === "string") return `string(len=${v.length})`;
    return typeof v;
  }
  if (Array.isArray(v)) return `array(${v.length})` + (v.length && depth < 3 ? ` of ${JSON.stringify(shape(v[0], depth + 1))}` : "");
  return Object.fromEntries(Object.entries(v).map(([k, val]) => [k, shape(val, depth + 1)]));
}

// ── Login ────────────────────────────────────────────────────────────────
await req("/TasyAppServer/resources/public/system/isExpiredBetaServicePack").catch(() => {});
const loginRes = await req("/TasyAppServer/resources/public/security/oauth", {
  method: "POST", headers: { "content-type": "application/json;charset=UTF-8" },
  body: JSON.stringify({ username: USER, password: PASS, computerName: null, osUsername: null, scope: "WTASY", timezone: "America/Sao_Paulo", ipMachine: null }),
});
const jwt = (await loginRes.json()).access_token;
console.log("Login:", loginRes.status);

// ── Chamada de ocupação ──────────────────────────────────────────────────
const PATH = "/TasyAppServer/resources/schematic/atepacfn/cpanels/18273/datasource?dictionaryCode=372558";
const BODY = JSON.stringify({
  actionName: "OccupancyAction",
  activationType: "NamedAction",
  filterValues: { NR_SEQ_AGRUPAMENTO: "0", IE_TODOS_ESTAB: "N", _filterCode: 418873, _dimensionValues: {} },
  legendDefinition: null,
  pageBegin: 1,
  parameters: { _schematicObjCode: 18273, NR_SEQ_AGRUPAMENTO: "0", IE_TODOS_ESTAB: null, _filterCode: 418873, _dimensionValues: {}, CD_ESTAB_OCUPACAO: 14 },
  recordsPerPage: 1000,
  sortAscending: true,
});

const featureHeaders = {
  "active-feature-code": "44",
  "feature-code": "44",
  "feature-route": "atepacfn",
  "developer-mode": "false",
  "locale-customization": "all",
  "tasybackendversion": "dev",
};

async function attempt(label, extraHeaders) {
  const res = await req(PATH, {
    method: "POST",
    headers: { authorization: `BEARER ${jwt}`, "content-type": "application/json;charset=UTF-8", ...extraHeaders },
    body: BODY,
  });
  const text = await res.text();
  let parsed = null;
  try { parsed = JSON.parse(text); } catch {}
  console.log(`\n[${res.status}] ${label}`);
  if (res.status !== 200) {
    console.log("   corpo:", text.slice(0, 200));
    return null;
  }
  return parsed;
}

// A) Só o bearer — o endpoint precisa dos headers de feature?
await attempt("A) só bearer (sem feature headers)", {});

// B) Bearer + headers de feature completos (como a UI envia)
const data = await attempt("B) bearer + feature headers completos", featureHeaders);

if (data) {
  console.log("\n=== ESTRUTURA DA RESPOSTA (formas/contagens) ===");
  console.log(JSON.stringify(shape(data), null, 2));

  // Localiza o array de linhas (heurística: maior array de objetos no payload).
  const arrays = [];
  (function walk(o, path) {
    if (Array.isArray(o)) { arrays.push([path, o]); return; }
    if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) walk(v, path ? `${path}.${k}` : k);
  })(data, "");
  arrays.sort((a, b) => b[1].length - a[1].length);
  if (arrays.length) {
    const [path, rows] = arrays[0];
    console.log(`\n=== MAIOR ARRAY: '${path}' com ${rows.length} itens ===`);
    if (rows.length && typeof rows[0] === "object") {
      console.log("Colunas (chaves da 1ª linha):", Object.keys(rows[0]).join(", "));
      console.log("\nAmostra (1ª linha, valores reais — ambiente seguro):");
      console.log(JSON.stringify(rows[0], null, 2));
    }
  }
}
console.log("\nFIM.");
