/**
 * Smoke test do fluxo XSRF: login → getUserData() (endpoint /user/* protegido).
 * Valida que o header `crsftoken` capturado no login satisfaz o servidor.
 * Exige rede corporativa e TASY_USER / TASY_PASS. Não imprime dados de paciente
 * nem tokens — só nomes de campos e contagens.
 *
 *   tsx scripts/smoke-userdata.ts
 */
import { TasyClient } from "../src/index.js";
import { consoleLogger } from "../src/cli/logger.js";

function shape(v: unknown, depth = 0): unknown {
  if (v === null || typeof v !== "object") {
    return typeof v === "string" ? `string(len=${(v as string).length})` : typeof v;
  }
  if (Array.isArray(v)) return `array(${v.length})` + (v.length && depth < 2 ? ` of ${JSON.stringify(shape(v[0], depth + 1))}` : "");
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, val]) => [k, shape(val, depth + 1)]));
}

async function main(): Promise<void> {
  const baseUrl = process.env.TASY_BASE_URL ?? "http://hismorumbi.rededor.corp";
  const username = process.env.TASY_USER;
  const password = process.env.TASY_PASS;
  if (!username || !password) throw new Error("Defina TASY_USER e TASY_PASS.");

  const tasy = new TasyClient({ baseUrl, username, password, logger: consoleLogger });

  console.log("1) Login...");
  await tasy.session.login();

  console.log("2) getUserData() (endpoint /user/data protegido por XSRF)...");
  const data = await tasy.session.getUserData();
  console.log("   OK. Estrutura da resposta (só formas, sem valores):");
  console.log(JSON.stringify(shape(data), null, 2));
}

main().catch((err) => {
  console.error("Smoke userdata FALHOU:", err);
  process.exit(1);
});
