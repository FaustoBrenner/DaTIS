import fs from "node:fs";

/**
 * Carrega variáveis de um arquivo `.env` simples (uma `CHAVE=VALOR` por linha)
 * para `process.env`. Mantém o cliente sem dependências: parser mínimo próprio.
 *
 * Regras:
 *  - o ambiente do SO TEM PRECEDÊNCIA — chaves já definidas não são sobrescritas
 *    (assim `TASY_USER`/`TASY_PASS` do escopo User continuam mandando);
 *  - ignora linhas vazias e comentários (`#`);
 *  - apara espaços em torno da chave e do valor (aceita `CHAVE = valor`);
 *  - remove aspas simples/duplas envolventes do valor;
 *  - no-op silencioso se o arquivo não existir (a rotina roda só com o ambiente).
 *
 * Segurança: o arquivo costuma conter segredos (ex.: a URL SAS do Power Automate,
 * que embute o `sig`). Nunca versionar — ver `.gitignore`.
 */
export function carregarEnv(caminho: string): { carregadas: string[] } {
  let conteudo: string;
  try {
    conteudo = fs.readFileSync(caminho, "utf8");
  } catch {
    return { carregadas: [] };
  }

  const carregadas: string[] = [];
  for (const linhaBruta of conteudo.split(/\r?\n/)) {
    const linha = linhaBruta.trim();
    if (!linha || linha.startsWith("#")) continue;

    const eq = linha.indexOf("=");
    if (eq === -1) continue;

    const chave = linha.slice(0, eq).trim();
    if (!chave || chave in process.env) continue;

    let valor = linha.slice(eq + 1).trim();
    if (valor.length >= 2) {
      const a = valor[0];
      const z = valor[valor.length - 1];
      if ((a === '"' && z === '"') || (a === "'" && z === "'")) {
        valor = valor.slice(1, -1);
      }
    }

    process.env[chave] = valor;
    carregadas.push(chave);
  }
  return { carregadas };
}
