/**
 * Serviço de relatórios: monta o payload ReportsParam/ReportParam do TASY,
 * dispara generateReports, extrai os nomes de arquivo e baixa os resultados.
 *
 * Formato de retorno: por padrão os relatórios já vêm parseados como linhas JSON
 * (`rows: TsvRecord[]`) — decodificação UTF-16-BE + TSV feita uma única vez, aqui.
 * O retorno bruto (`content: Buffer`) é opt-in via `{ raw: true }`, para casos não
 * tabulares (PDF/binário) ou quando o consumidor quer persistir/streamar os bytes.
 *
 * A biblioteca NÃO escreve em disco — devolve tudo em memória. Persistência
 * (arquivo, HTTP response) é responsabilidade do consumidor.
 * Portado de src/tasy_client.py (build_payload / run_report) do cliente legado.
 */
import type { TasySession } from "../core/session.js";
import type { TasyParam } from "../core/types.js";
import { tsvToRecords, type ColumnsSchema, type TsvRecord } from "../convert/tsv.js";
import { encodeParam, resolveToken, type ParamSchema } from "./params.js";

/** Especificação de um relatório (registro do catálogo). */
export interface ReportSpec {
  key: string;
  title: string;
  type: string;
  code: number;
  paramsSchema: Record<string, ParamSchema>;
  /** Tipos das colunas de saída. Ausente => todas as colunas ficam `string`. */
  columnsSchema?: ColumnsSchema;
  filePrefix: string;
  ext: string;
}

/** Um arquivo gerado, já parseado em linhas JSON (formato padrão). */
export interface GeneratedFile {
  /** Nome do arquivo no servidor TASY. */
  name: string;
  /** Linhas do relatório indexadas pelo cabeçalho (o "xls" do TASY é TSV UTF-16-BE). */
  rows: TsvRecord[];
}

/** Um arquivo gerado, entregue como bytes brutos (modo `raw`). */
export interface GeneratedRawFile {
  /** Nome do arquivo no servidor TASY. */
  name: string;
  /** Conteúdo bruto (o "xls" do TASY é TSV UTF-16-BE). */
  content: Buffer;
}

export interface GenerateResult {
  reportKey: string;
  /** Nomes de arquivo retornados pelo generateReports. */
  fileNames: string[];
  files: GeneratedFile[];
}

export interface GenerateRawResult {
  reportKey: string;
  /** Nomes de arquivo retornados pelo generateReports. */
  fileNames: string[];
  files: GeneratedRawFile[];
}

/** Opções de geração. `raw: true` devolve o Buffer bruto em vez das linhas JSON. */
export interface GenerateOptions {
  raw?: boolean;
}

interface ReportResponse {
  reports?: Array<{ xlsFileName?: string; fileName?: string; name?: string }>;
}

export class ReportsService {
  constructor(private readonly session: TasySession) {}

  /**
   * Monta o corpo do generateReports a partir do spec + argumentos.
   * Valida obrigatórios e resolve tokens de data (@date_ref...) contra dateRef.
   */
  buildPayload(spec: ReportSpec, args: Record<string, unknown>, dateRef: Date): unknown[] {
    const missing = Object.entries(spec.paramsSchema)
      .filter(([k, v]) => v.required && !(k in args))
      .map(([k]) => k);
    if (missing.length) {
      throw new Error(`Parâmetros obrigatórios ausentes para ${spec.key}: ${missing.join(", ")}`);
    }

    const encoded: Record<string, unknown> = {};
    for (const [name, raw] of Object.entries(args)) {
      const schema = spec.paramsSchema[name] ?? { type: "string" };
      const resolved = resolveToken(raw, dateRef);
      encoded[name] = encodeParam(name, resolved, schema);
    }

    const fileExportType = typeof encoded.fileExportType === "string" ? encoded.fileExportType : "XLS";

    return [
      {
        "@class": "br.com.philips.tasy.dto.shared.report.ReportsParam",
        reports: [
          {
            "@class": "br.com.philips.tasy.dto.shared.report.ReportParam",
            title: spec.title,
            type: spec.type,
            code: spec.code,
            parameters: encoded,
            actionClass: "",
            customPreview: "",
            customGenerate: false,
            configure: "N",
            kind: "EXCEL",
            printedCopies: 1,
            duplexPrinting: "N",
            usingSectorPrinters: false,
            printSetup: false,
            showParameters: false,
            tray: 0,
            sharedParameter: false,
            useDigitalSign: false,
            internalUseDigitalSign: false,
            paperSize: "A4",
          },
        ],
        printersAvailable: [],
        defaultPrinter: null,
        fileList: [],
        localStoragePrinterName: null,
      },
      { tipo: "Boolean", valor: false },
      { tipo: "Integer" },
      { tipo: "String", valor: fileExportType },
      { tipo: "String", valor: "" },
      { tipo: "boolean", valor: true },
      { tipo: "HashMap", valor: {} },
      { tipo: "String", valor: "" },
    ];
  }

  /** Extrai nomes de arquivo da resposta do generateReports. */
  private extractFileNames(body: unknown): string[] {
    let data: unknown = body;
    if (typeof data === "string") {
      try {
        data = JSON.parse(data);
      } catch {
        return [];
      }
    }
    const resp = data as ReportResponse;
    if (!resp || !Array.isArray(resp.reports)) return [];
    const names: string[] = [];
    for (const rep of resp.reports) {
      const name = rep.xlsFileName ?? rep.fileName ?? rep.name;
      if (name) names.push(name);
    }
    return names;
  }

  /**
   * Gera um relatório e baixa os arquivos resultantes (em memória).
   *
   * Padrão: retorna as linhas já parseadas (`files[].rows`). Com `{ raw: true }`
   * retorna os bytes brutos (`files[].content`) sem parsear.
   *
   * @param dateRef data de referência para resolução dos tokens @date_ref.
   */
  async generate(spec: ReportSpec, args: Record<string, unknown>, dateRef: Date): Promise<GenerateResult>;
  async generate(
    spec: ReportSpec,
    args: Record<string, unknown>,
    dateRef: Date,
    opts: { raw: true },
  ): Promise<GenerateRawResult>;
  async generate(
    spec: ReportSpec,
    args: Record<string, unknown>,
    dateRef: Date,
    opts?: GenerateOptions,
  ): Promise<GenerateResult | GenerateRawResult>;
  async generate(
    spec: ReportSpec,
    args: Record<string, unknown>,
    dateRef: Date,
    opts?: GenerateOptions,
  ): Promise<GenerateResult | GenerateRawResult> {
    const payload = this.buildPayload(spec, args, dateRef);
    // generateReports não é um endpoint {tipo,valor} puro — o 1º item é o DTO ReportsParam.
    const body = await this.session
      .request<unknown>("/TasyAppServer/resources/service/Report/generateReports", {
        method: "POST",
        body: payload,
      })
      .then((r) => r.body);

    const fileNames = this.extractFileNames(body);
    if (fileNames.length === 0) {
      const preview = typeof body === "string" ? body.slice(0, 300) : JSON.stringify(body).slice(0, 300);
      throw new Error(`generateReports não retornou nome de arquivo para ${spec.key}. Corpo: ${preview}`);
    }

    if (opts?.raw) {
      const files: GeneratedRawFile[] = [];
      for (const name of fileNames) {
        const content = await this.session.downloadFile(name);
        files.push({ name, content });
      }
      return { reportKey: spec.key, fileNames, files };
    }

    const files: GeneratedFile[] = [];
    for (const name of fileNames) {
      const content = await this.session.downloadFile(name);
      files.push({ name, rows: tsvToRecords(content, spec.columnsSchema) });
    }
    return { reportKey: spec.key, fileNames, files };
  }
}

/** Constrói um mapa de ReportSpec a partir do JSON de catálogo (formato legado). */
export function buildSpecs(catalog: CatalogFile): Record<string, ReportSpec> {
  const specs: Record<string, ReportSpec> = {};
  for (const item of catalog.reports) {
    specs[item.key] = {
      key: item.key,
      title: item.title,
      type: item.type,
      code: Number(item.code),
      paramsSchema: item.params_schema ?? {},
      columnsSchema: item.columns_schema,
      filePrefix: item.outputs.file_prefix,
      ext: item.outputs.ext ?? "xls",
    };
  }
  return specs;
}

/** Formato do reports_catalog.json (mantido do legado). */
export interface CatalogFile {
  base_url: string;
  login_url?: string;
  generate_url?: string;
  reports: Array<{
    key: string;
    title: string;
    type: string;
    code: number;
    params_schema?: Record<string, ParamSchema>;
    columns_schema?: ColumnsSchema;
    outputs: { file_prefix: string; ext?: string };
  }>;
}
