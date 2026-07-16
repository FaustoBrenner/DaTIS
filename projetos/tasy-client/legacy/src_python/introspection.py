# src/introspection.py
from __future__ import annotations
from typing import Any, Dict, List, Tuple
import json
import re

COMMON_EXPORT_TYPES = {"XLS": "xls", "CSV": "csv", "PDF": "pdf"}

_slug_re = re.compile(r"[^A-Z0-9]+", flags=re.IGNORECASE)

def _safe_load_json(maybe_json: Any) -> Any:
    """Aceita dict/list já parseado, ou string JSON (inclusive 'string do JSON')."""
    if isinstance(maybe_json, (dict, list)):
        return maybe_json
    if not isinstance(maybe_json, str):
        raise ValueError("Payload precisa ser dict/list ou string JSON.")
    try:
        data = json.loads(maybe_json)
    except Exception:
        raise
    # alguns backends mandam string JSON dentro de string
    if isinstance(data, str):
        data = json.loads(data)
    return data

def _infer_param_type(value: Any) -> str:
    """Mapeia valor do payload para tipo do schema do catálogo."""
    if isinstance(value, dict) and value.get("@class") == "java.time.Instant":
        return "instant"
    if isinstance(value, bool):
        return "bool"
    if isinstance(value, int):
        return "int"
    # floats são raros aqui; trate como string ou adicione 'float' se desejar
    return "string"  # seguro por padrão

def _infer_ext_from_context(report_obj: Dict[str, Any], parameters: Dict[str, Any]) -> str:
    # 1) kind: "EXCEL" => xls (heurística)
    kind = (report_obj.get("kind") or "").upper()
    if kind == "EXCEL":
        return "xls"
    # 2) fileExportType em parameters => mapeia
    fet = parameters.get("fileExportType")
    if isinstance(fet, str):
        return COMMON_EXPORT_TYPES.get(fet.upper(), fet.lower())
    # fallback
    return "xls"

def _make_file_prefix_from_title(title: str) -> str:
    # pega letras e números; transforma em UPPER com underscores curtos
    base = _slug_re.sub("_", title).strip("_")
    # abreviar palavras muito longas é opcional; por ora, mantenha simples:
    return base[:24].upper() or "REL"

def _extract_reports_objects(payload: Any) -> List[Dict[str, Any]]:
    """
    O payload de generateReports costuma ser uma lista cujo 1º item tem:
    { "@class": "...ReportsParam", "reports": [ { ReportParam... } ] }
    Retorna a lista de objetos ReportParam.
    """
    reports: List[Dict[str, Any]] = []
    if not isinstance(payload, list) or not payload:
        return reports
    first = payload[0]
    arr = first.get("reports") if isinstance(first, dict) else None
    if isinstance(arr, list):
        for rp in arr:
            if isinstance(rp, dict) and rp.get("@class", "").endswith("ReportParam"):
                reports.append(rp)
    return reports

def infer_catalog_blocks_from_generate_payload(
    generate_payload: Any,
    required_overrides: Dict[str, bool] | None = None,
    key_prefix: str = ""
) -> List[Dict[str, Any]]:
    """
    Converte um payload XHR de generateReports em blocos de catálogo (um por ReportParam).
    - generate_payload: dict/list já parseado ou string JSON.
    - required_overrides: permite marcar certos params como obrigatórios (ex.: {"DT_INICIAL": True, "DT_FINAL": True})
    - key_prefix: prefixo opcional para gerar 'key' (ex.: "hmsl_")
    Retorna lista de blocos prontos para inserir em reports_catalog.json (sem valores).
    """
    required_overrides = required_overrides or {}
    data = _safe_load_json(generate_payload)
    report_params_list = _extract_reports_objects(data)
    blocks: List[Dict[str, Any]] = []

    for rp in report_params_list:
        title = rp.get("title", "").strip() or "Relatório"
        rtype = rp.get("type", "").strip() or "CATE"
        code  = int(rp.get("code", 0))
        params = rp.get("parameters", {}) or {}

        # Monta params_schema a partir dos parâmetros VISTOS no XHR,
        # sem fixar valores; tipagem por inferência do 'value'.
        params_schema: Dict[str, Dict[str, Any]] = {}
        for name, raw in params.items():
            # se for java.time.Instant em forma de dict, o 'value' está dentro; mas para tipo só olhamos @class
            if isinstance(raw, dict) and raw.get("@class") == "java.time.Instant":
                ptype = "instant"
            else:
                ptype = _infer_param_type(raw)
            params_schema[name] = {
                "type": ptype,
                "required": bool(required_overrides.get(name, False))
            }
            # exemplo: opcionalmente limitar domínio do fileExportType
            if name == "fileExportType" and ptype == "string":
                params_schema[name]["allowed"] = sorted(list(COMMON_EXPORT_TYPES.keys()))

        # Heurísticas de saída
        ext = _infer_ext_from_context(rp, params)
        file_prefix = _make_file_prefix_from_title(title)

        # Geração de 'key'
        base_key = f"{rtype.lower()}_{code}" if code else _slug_re.sub("_", title).lower()
        key = (key_prefix + base_key).strip("_")

        block = {
            "key": key,
            "title": title,
            "type": rtype,
            "code": code,
            "params_schema": params_schema,
            "outputs": {
                "file_prefix": file_prefix,
                "ext": ext
            }
        }
        blocks.append(block)

    return blocks


if __name__ == "__main__":
    #import argparse

    #p = argparse.ArgumentParser(description="Catalogar relatórios")
    #p.add_argument("--XHR", default="NULL", help="Payload do XHR capturado")

    #a = p.parse_args()
    sample = r'''[{"@class":"br.com.philips.tasy.dto.shared.report.ReportsParam","reports":[{"@class":"br.com.philips.tasy.dto.shared.report.ReportParam","title":"RDSL - Repasse Terceiros","type":"CFAT","code":4402,"parameters":{"fileExportType":"XLS","DT_FINAL":{"@class":"java.time.Instant","type":"INSTANT","value":"2025-09-01T03:00:00.000Z"},"_nrSeqSchematicsFeature":1254,"DT_INICIAL":{"@class":"java.time.Instant","type":"INSTANT","value":"2025-09-01T03:00:00.000Z"}},"actionClass":"","customPreview":"","customGenerate":false,"configure":"N","kind":"EXCEL","sequenceId":"2882312","printedCopies":1,"duplexPrinting":"N","usingSectorPrinters":false,"showMessage":false,"printSetup":false,"showParameters":false,"tray":0,"sharedParameter":false,"useDigitalSign":false,"internalUseDigitalSign":false,"paperSize":"A4"}],"printersAvailable":["Microsoft Print to PDF","\\\\SPITMPS04\\ITM_HONMED01","\\\\SPITMPS04\\ITM_LMHONMED02"],"defaultPrinter":"\\\\SPITMPS04\\ITM_LMHONMED02","fileList":[],"localStoragePrinterName":null},{"tipo":"Boolean","valor":false},{"tipo":"Integer"},{"tipo":"String","valor":"XLS"},{"tipo":"String","valor":""},{"tipo":"boolean","valor":true},{"tipo":"HashMap","valor":{}},{"tipo":"String","valor":""}]'''
    blocks = infer_catalog_blocks_from_generate_payload(sample, required_overrides={"DT_INICIAL": True, "DT_FINAL": True})
    print(json.dumps(blocks, indent=2, ensure_ascii=False))
