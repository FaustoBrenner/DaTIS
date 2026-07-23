import type { PayloadUnidade } from "./payload.js";

/**
 * Envio do payload ao trigger "When an HTTP request is received" do Power
 * Automate (ARQUITETURA.md, decisão #4).
 *
 * A URL do trigger É SEGREDO (assinatura SAS embutida) e nunca entra no
 * repositório: vive em `DAILY_REPORT_ENDPOINT_URL` na máquina de extração.
 * Segunda camada, validada no início do fluxo: header com segredo compartilhado
 * (`DAILY_REPORT_SHARED_SECRET`).
 *
 * Enquanto o endpoint não existir, `enviar` é um no-op logado — a rotina inteira
 * roda e grava o payload em disco, e plugar o endpoint depois é só setar a env var.
 */

const HEADER_SEGREDO = "x-dtis-secret";
const TENTATIVAS = 3;
const BACKOFF_MS = 2000;

export type ResultadoEnvio =
  | { status: "nao_configurado" }
  | { status: "enviado"; httpStatus: number; tentativas: number }
  | { status: "falhou"; erro: string; tentativas: number };

export async function enviar(payload: PayloadUnidade): Promise<ResultadoEnvio> {
  const url = process.env.DAILY_REPORT_ENDPOINT_URL;
  const segredo = process.env.DAILY_REPORT_SHARED_SECRET;

  if (!url) return { status: "nao_configurado" };

  const headers: Record<string, string> = { "content-type": "application/json" };
  if (segredo) headers[HEADER_SEGREDO] = segredo;

  let ultimoErro = "";
  for (let tentativa = 1; tentativa <= TENTATIVAS; tentativa++) {
    try {
      const resp = await fetch(url, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      });
      if (resp.ok) {
        return { status: "enviado", httpStatus: resp.status, tentativas: tentativa };
      }
      ultimoErro = `HTTP ${resp.status} ${resp.statusText}`;
      // 4xx não é transitório (segredo errado, payload rejeitado): não insiste.
      if (resp.status >= 400 && resp.status < 500) break;
    } catch (e) {
      ultimoErro = e instanceof Error ? e.message : String(e);
    }
    if (tentativa < TENTATIVAS) {
      await new Promise((r) => setTimeout(r, BACKOFF_MS * tentativa));
    }
  }

  return { status: "falhou", erro: ultimoErro, tentativas: TENTATIVAS };
}
