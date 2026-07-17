import fs from "node:fs";
import path from "node:path";
import type { UnidadeReport } from "../types.js";

/**
 * Store local de histórico (arquitetura, decisão #2/#3): o Node é o dono do
 * histórico. Formato JSONL — 1 linha por unidade-dia. O upsert é idempotente
 * por `(data, id_unidade)`, então reprocessar um dia (retry/correção) é seguro.
 *
 * Este store é a base para o forecast e para o bloco de comparações; a lista
 * SharePoint é apenas camada de leitura/serving, alimentada a partir daqui.
 */

export interface RegistroHistorico extends UnidadeReport {
  /** Dia que os KPIs descrevem (`aaaa-mm-dd`). Chave junto com id_unidade. */
  data: string;
  /** Timestamp ISO de quando o registro foi gerado/gravado. */
  capturado_em: string;
}

function chave(data: string, idUnidade: number): string {
  return `${data}::${idUnidade}`;
}

/** Lê todos os registros do arquivo JSONL (vazio se não existir). */
export function lerHistorico(arquivo: string): RegistroHistorico[] {
  if (!fs.existsSync(arquivo)) return [];
  return fs
    .readFileSync(arquivo, "utf8")
    .split(/\r?\n/)
    .filter((l) => l.trim().length > 0)
    .map((l) => JSON.parse(l) as RegistroHistorico);
}

/**
 * Insere ou atualiza o registro de uma unidade-dia. Retorna se foi
 * `inserido` ou `atualizado`. Reescreve o arquivo (volume diário é pequeno:
 * ~4 unidades/dia).
 */
export function upsertRegistro(
  arquivo: string,
  data: string,
  report: UnidadeReport,
): { acao: "inserido" | "atualizado"; total: number } {
  const registros = lerHistorico(arquivo);
  const k = chave(data, report.id_unidade);
  const idx = registros.findIndex((r) => chave(r.data, r.id_unidade) === k);

  const registro: RegistroHistorico = {
    data,
    ...report,
    capturado_em: new Date().toISOString(),
  };

  let acao: "inserido" | "atualizado";
  if (idx >= 0) {
    registros[idx] = registro;
    acao = "atualizado";
  } else {
    registros.push(registro);
    acao = "inserido";
  }

  // Ordena por data e depois unidade para leitura estável.
  registros.sort((a, b) =>
    a.data === b.data ? a.id_unidade - b.id_unidade : a.data < b.data ? -1 : 1,
  );

  fs.mkdirSync(path.dirname(arquivo), { recursive: true });
  fs.writeFileSync(
    arquivo,
    registros.map((r) => JSON.stringify(r)).join("\n") + "\n",
    "utf8",
  );

  return { acao, total: registros.length };
}
