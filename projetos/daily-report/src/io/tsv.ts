import fs from "node:fs";

/**
 * Decodifica um relatório exportado pelo TASY.
 *
 * Formato observado nas amostras: TSV (tab-separado) em UTF-16 **Big-Endian**
 * com BOM `fe ff`. O TextDecoder resolve a ordem dos bytes pelo BOM, mas o
 * arquivo carrega `.xls` no nome apenas por convenção do TASY — não é binário
 * de planilha.
 */
export function decodeTasyTsv(caminho: string): string {
  const buf = fs.readFileSync(caminho);
  // utf-16be cobre o caso das amostras (BOM fe ff). O replace remove o BOM
  // residual (U+FEFF) caso o decoder o preserve.
  return new TextDecoder("utf-16be").decode(buf).replace(/^﻿/, "");
}

export type LinhaTsv = Record<string, string>;

/**
 * Faz o parse de um TSV do TASY em uma lista de objetos indexados pelo
 * cabeçalho. Valores são mantidos como string crua (trim aplicado); a
 * tipagem/normalização fica a cargo de cada parser de fonte.
 */
export function parseTasyTsv(caminho: string): LinhaTsv[] {
  const texto = decodeTasyTsv(caminho);
  const linhas = texto.split(/\r?\n/).filter((l) => l.length > 0);
  if (linhas.length === 0) return [];

  const cabecalho = linhas[0]!.split("\t").map((h) => h.trim());
  return linhas.slice(1).map((linha) => {
    const celulas = linha.split("\t");
    const registro: LinhaTsv = {};
    cabecalho.forEach((coluna, i) => {
      registro[coluna] = (celulas[i] ?? "").trim();
    });
    return registro;
  });
}
