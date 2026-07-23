import { DatabaseSync } from "node:sqlite";
import fs from "node:fs";
import path from "node:path";

/**
 * Conexão com o banco local (SQLite via módulo nativo `node:sqlite`, embutido no
 * Node 24 — sem dependência nem compilação). O banco é o intermediário do I/O:
 * as extrações do TASY são carregadas aqui (preservando TODAS as colunas) e o
 * cálculo dos KPIs consulta este banco, não os arquivos.
 *
 * Três tabelas (ver ARQUITETURA.md):
 *   - `extracoes`         : metadados de cada execução de extração (relatório×unidade×dia).
 *   - `registros`         : 1 linha por registro do relatório, colunas brutas em `dados` (JSON).
 *   - `relatorios_diarios`: camada computada/serving — 1 linha por unidade-dia com os KPIs.
 */

export type Db = DatabaseSync;

const DDL = `
CREATE TABLE IF NOT EXISTS extracoes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  relatorio     TEXT    NOT NULL,   -- '2432' | '3136' | '3523' | '4317' | '2070' | '4718' (histórico) | 'OCUPACAO'
  id_unidade    INTEGER NOT NULL,
  data_extracao TEXT    NOT NULL,   -- dia em que a extração rodou (aaaa-mm-dd)
  extraido_em   TEXT    NOT NULL,   -- timestamp ISO completo
  arquivo_origem TEXT,
  UNIQUE (relatorio, id_unidade, data_extracao)
);

CREATE TABLE IF NOT EXISTS registros (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  extracao_id   INTEGER NOT NULL REFERENCES extracoes(id) ON DELETE CASCADE,
  relatorio     TEXT    NOT NULL,
  id_unidade    INTEGER NOT NULL,
  data_extracao TEXT    NOT NULL,
  dados         TEXT    NOT NULL    -- JSON da linha completa (todas as colunas preservadas)
);
CREATE INDEX IF NOT EXISTS ix_registros_chave
  ON registros (relatorio, id_unidade, data_extracao);

CREATE TABLE IF NOT EXISTS relatorios_diarios (
  data         TEXT    NOT NULL,    -- dia que os KPIs descrevem (aaaa-mm-dd)
  id_unidade   INTEGER NOT NULL,
  dia_semana   INTEGER NOT NULL,    -- 0=domingo .. 6=sábado (para o forecast)
  kpis         TEXT    NOT NULL,    -- JSON do objeto do schema (UnidadeReport)
  capturado_em TEXT    NOT NULL,
  PRIMARY KEY (data, id_unidade)
);
`;

/**
 * Abre (ou cria) o banco no caminho dado, aplica os PRAGMAs e garante o schema.
 * Cria o diretório do arquivo se necessário. Idempotente.
 */
export function abrirDb(caminho: string): Db {
  if (caminho !== ":memory:") {
    fs.mkdirSync(path.dirname(caminho), { recursive: true });
  }
  const db = new DatabaseSync(caminho);
  db.exec("PRAGMA journal_mode = WAL;");
  db.exec("PRAGMA foreign_keys = ON;");
  db.exec(DDL);
  return db;
}
