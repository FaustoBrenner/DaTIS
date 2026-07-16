/**
 * Smoke test do core contra o servidor real. Não é teste unitário — exige rede
 * corporativa e credenciais válidas em TASY_USER / TASY_PASS.
 *
 *   tsx scripts/smoke.ts
 *
 * Valida: login, chamada de serviço autenticada (getParameter), e refresh do token.
 * Não imprime nenhum token.
 */
import { TasyClient } from "../src/index.js";
import { consoleLogger } from "../src/cli/logger.js";

async function main(): Promise<void> {
  const baseUrl = process.env.TASY_BASE_URL ?? "http://hismorumbi.rededor.corp";
  const username = process.env.TASY_USER;
  const password = process.env.TASY_PASS;
  if (!username || !password) throw new Error("Defina TASY_USER e TASY_PASS.");

  const tasy = new TasyClient({ baseUrl, username, password, logger: consoleLogger });

  console.log("1) Login...");
  await tasy.session.login();
  console.log("   OK, autenticado?", tasy.session.isAuthenticated);

  console.log("2) Chamada de serviço getParameter(0, 87)...");
  const param = await tasy.session.callService("WParameter", "getParameter", [
    { tipo: "Integer", valor: 0 },
    { tipo: "Integer", valor: 87 },
  ]);
  console.log("   Resposta:", JSON.stringify(param));

  console.log("3) Refresh do token...");
  await tasy.session.refresh();
  console.log("   OK, ainda autenticado?", tasy.session.isAuthenticated);

  console.log("4) Chamada após refresh...");
  const param2 = await tasy.session.callService("WParameter", "getParameter", [
    { tipo: "Integer", valor: 0 },
    { tipo: "Integer", valor: 87 },
  ]);
  console.log("   Resposta:", JSON.stringify(param2));

  console.log("\nSmoke test OK.");
}

main().catch((err) => {
  console.error("Smoke test FALHOU:", err);
  process.exit(1);
});
