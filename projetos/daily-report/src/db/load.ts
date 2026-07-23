import type { Db } from "./conn.js";
import type { LinhaTasy } from "../io/json.js";

/**
 * Carga de uma extração no banco. Preserva TODAS as colunas de cada registro
 * (serializadas em `registros.dados`), para consultas e KPIs futuros.
 *
 * Idempotente: a chave lógica de uma extração é (relatorio, id_unidade,
 * data_extracao). Recarregar o mesmo dia apaga a extração anterior (CASCADE nos
 * registros) e reinsere — seguro para retry/correção. Tudo numa transação.
 */

export interface EntradaExtracao {
  /** Código do relatório: '2432' | '3136' | '3523' | '4317' | '2070' | '4718' (histórico) | 'OCUPACAO'. */
  relatorio: string;
  idUnidade: number;
  /** Dia em que a extração rodou (aaaa-mm-dd). */
  dataExtracao: string;
  /** Nome/caminho do arquivo de origem — trilha de auditoria. */
  arquivo?: string;
  /** Registros já parseados (linhas do relatório). */
  registros: LinhaTasy[];
}

export interface ResultadoCarga {
  extracaoId: number;
  linhas: number;
  substituiu: boolean;
}

export function carregarExtracao(db: Db, entrada: EntradaExtracao): ResultadoCarga {
  const { relatorio, idUnidade, dataExtracao, arquivo, registros } = entrada;

  const tx = db.exec.bind(db);
  tx("BEGIN");
  try {
    // Remove extração anterior da mesma chave (CASCADE limpa os registros).
    const anterior = db
      .prepare(
        `SELECT id FROM extracoes
          WHERE relatorio = ? AND id_unidade = ? AND data_extracao = ?`,
      )
      .get(relatorio, idUnidade, dataExtracao) as { id: number } | undefined;
    if (anterior) {
      db.prepare(`DELETE FROM extracoes WHERE id = ?`).run(anterior.id);
    }

    const info = db
      .prepare(
        `INSERT INTO extracoes (relatorio, id_unidade, data_extracao, extraido_em, arquivo_origem)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(relatorio, idUnidade, dataExtracao, new Date().toISOString(), arquivo ?? null);
    const extracaoId = Number(info.lastInsertRowid);

    const insReg = db.prepare(
      `INSERT INTO registros (extracao_id, relatorio, id_unidade, data_extracao, dados)
       VALUES (?, ?, ?, ?, ?)`,
    );
    for (const linha of registros) {
      insReg.run(extracaoId, relatorio, idUnidade, dataExtracao, JSON.stringify(linha));
    }

    tx("COMMIT");
    return { extracaoId, linhas: registros.length, substituiu: Boolean(anterior) };
  } catch (erro) {
    tx("ROLLBACK");
    throw erro;
  }
}
