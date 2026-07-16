/**
 * Smoke test da resolução de estabelecimento por nome (backlog P1).
 * login → establishment.list() → resolve() do próprio estab ativo.
 * Exige rede corporativa e TASY_USER / TASY_PASS. Imprime só contagens e
 * confirmação de match — não despeja a lista de unidades.
 *
 *   tsx scripts/smoke-estab.ts
 */
import { TasyClient } from "../src/index.js";
import { consoleLogger } from "../src/cli/logger.js";

async function main(): Promise<void> {
  const baseUrl = process.env.TASY_BASE_URL ?? "http://hismorumbi.rededor.corp";
  const username = process.env.TASY_USER;
  const password = process.env.TASY_PASS;
  if (!username || !password) throw new Error("Defina TASY_USER e TASY_PASS.");

  const tasy = new TasyClient({ baseUrl, username, password, logger: consoleLogger });
  await tasy.session.login();

  const all = await tasy.establishment.list();
  console.log(`1) list(): ${all.length} estabelecimentos disponíveis.`);
  if (all.length === 0) throw new Error("Lista vazia — nada a resolver.");

  // Pega o primeiro e resolve por nome exato e por um prefixo, sem imprimir o nome.
  const target = all[0]!;
  const byExact = await tasy.establishment.resolve(target.name);
  console.log(`2) resolve(nome exato) → code=${byExact.code} | bate com o esperado? ${byExact.code === target.code}`);

  const prefix = target.name.slice(0, Math.max(3, Math.floor(target.name.length / 2)));
  try {
    const byPrefix = await tasy.establishment.resolve(prefix);
    console.log(`3) resolve(prefixo, len=${prefix.length}) → code=${byPrefix.code}`);
  } catch (err) {
    console.log(`3) resolve(prefixo) lançou (esperado se ambíguo): ${(err as Error).message.slice(0, 90)}`);
  }

  console.log("Smoke estab OK.");
}

main().catch((err) => {
  console.error("Smoke estab FALHOU:", err);
  process.exit(1);
});
