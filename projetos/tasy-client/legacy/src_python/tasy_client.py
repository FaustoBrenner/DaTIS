from playwright.sync_api import sync_playwright, Browser, BrowserContext, Page, expect
from typing import Dict, Any, List
import json, pathlib, logging

from .models import ReportSpec, GenerateResult
from .utils import out_dir_for, ensure_dir, json_dumps, encode_param, resolve_token
from .uploading import process_to_sharepoint


class TasyClient:
    def __init__(self, base_url: str, login_url: str, generate_url: str,
                 user: str, password: str, banco_opt: str | None = None):
        self.base_url = base_url.rstrip("/")
        self.login_url = self.base_url + login_url
        self.generate_url = self.base_url + generate_url
        self.user = user
        self.password = password
        self.banco_opt = banco_opt

        self._pw = None
        self.browser: Browser | None = None
        self.ctx: BrowserContext | None = None
        self.page: Page | None = None

    def start(self, headless: bool, use_storage_state: bool, storage_state_path: str):
        self._pw = sync_playwright().start()
        self.browser = self._pw.chromium.launch(headless=headless)
        ctx_kwargs = {
            "accept_downloads": True,
            "user_agent": ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                           "AppleWebKit/537.36 (KHTML, like Gecko) "
                           "Chrome/131.0.0.0 Safari/537.36")
        }
        if use_storage_state and pathlib.Path(storage_state_path).exists():
            ctx_kwargs["storage_state"] = storage_state_path

        self.ctx = self.browser.new_context(**ctx_kwargs)
        self.ctx.set_extra_http_headers({
            "Accept": "*/*",
            "Accept-Language": "pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7",
            "X-Requested-With": "XMLHttpRequest",
            "Origin": self.base_url,
            "Referer": self.base_url + "/"
        })
        self.page = self.ctx.new_page()

    
    def stop(self):
        if self.browser:
            self.browser.close()
        if self._pw:
            self._pw.stop()

    def login(self, force: bool = False, storage_state_path: str | None = None):
        assert self.page is not None

        # Fluxo direto de login
        self.page.goto(self.login_url)
        self.page.fill("#loginUsername", self.user)
        self.page.fill("#loginPassword", self.password)
        try:
            if self.banco_opt:
                self.page.select_option("#loginDatabase", self.banco_opt)
        except Exception:
            pass
        self.page.click("input[type=submit][value='Entrar']")
        self.page.wait_for_load_state("networkidle")

        if storage_state_path:
            ensure_dir(str(pathlib.Path(storage_state_path).parent))
            self.ctx.storage_state(path=storage_state_path)

    def mudar_estabelecimento(self, estabelecimento):
        self.page.locator("#userData-dropdown-options").get_by_role("img").click()
        self.page.get_by_text("Estabelecimento:").click()
        self.page.locator("div:nth-child(2) > .w-attr-container > .w-attr-container__content > .ng-scope.ng-isolate-scope > .w-listbox").click()
        
        l = self.page.locator("a").filter(has_text=estabelecimento).click()
        self.page.get_by_role("button", name="Ok").click()

        self.page.wait_for_load_state('networkidle')
        expect(self.page.locator("div:nth-child(2) > .w-attr-container > .w-attr-container__content > .ng-scope.ng-isolate-scope > .w-listbox")).to_have_count(0)

    # ---- payload builder a partir do schema + args (sem defaults) ----
    @staticmethod
    def build_payload(spec: ReportSpec, args: Dict[str, Any], date_ref) -> List[Dict[str, Any]]:
        # validação: obrigatórios presentes
        missing = [k for k,v in spec.params_schema.items() if v.get("required") and k not in args]
        if missing:
            raise ValueError(f"Parâmetros obrigatórios ausentes para {spec.key}: {missing}")

        # resolve + encode
        encoded_params: Dict[str, Any] = {}
        for name, raw in args.items():
            schema = spec.params_schema.get(name, {"type": "string"})
            resolved = resolve_token(raw, date_ref=date_ref)
            encoded = encode_param(name, resolved, schema)
            encoded_params[name] = encoded

        body = [
            {
                "@class": "br.com.philips.tasy.dto.shared.report.ReportsParam",
                "reports": [
                    {
                        "@class": "br.com.philips.tasy.dto.shared.report.ReportParam",
                        "title": spec.title,
                        "type":  spec.type,
                        "code":  spec.code,
                        "parameters": encoded_params,
                        "actionClass": "",
                        "customPreview": "",
                        "customGenerate": False,
                        "configure": "N",
                        "kind": "EXCEL",
                        "printedCopies": 1,
                        "duplexPrinting": "N",
                        "usingSectorPrinters": False,
                        "printSetup": False,
                        "showParameters": False,
                        "tray": 0,
                        "sharedParameter": False,
                        "useDigitalSign": False,
                        "internalUseDigitalSign": False,
                        "paperSize": "A4"
                    }
                ],
                "printersAvailable": [],
                "defaultPrinter": None,
                "fileList": [],
                "localStoragePrinterName": None
            },
            {"tipo": "Boolean",  "valor": False},
            {"tipo": "Integer"},
            {"tipo": "String",   "valor": encoded_params.get("fileExportType","XLS")},  # alguns backends usam este eco
            {"tipo": "String",   "valor": ""},
            {"tipo": "boolean",  "valor": True},
            {"tipo": "HashMap",  "valor": {}},
            {"tipo": "String",   "valor": ""}
        ]
        return body

    # ---- POST generate via fetch (robusto) ----
    def _post_generate_via_fetch(self, payload: List[Dict[str, Any]]) -> Dict[str, Any]:
        assert self.page is not None
        script = """
        async ({ url, body }) => {
          const r = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json','X-Requested-With':'XMLHttpRequest' },
            body: JSON.stringify(body)
          });
          const text = await r.text();
          return JSON.stringify({ status: r.status, text });
        }
        """
        resp_text = self.page.evaluate(script, {"url": self.generate_url, "body": payload})
        return json.loads(resp_text)

    @staticmethod
    def _parse_generate_response_text(text: str) -> List[str]:
        try:
            data = json.loads(text)
        except Exception:
            try:
                data = json.loads(json.loads(text))
            except Exception:
                data = None

        files: List[str] = []
        if isinstance(data, dict) and "reports" in data:
            for rep in data.get("reports", []):
                name = rep.get("xlsFileName") or rep.get("fileName") or rep.get("name")
                if name:
                    files.append(name)
        return files
    
    def run_report(self, spec: ReportSpec, args: Dict[str, Any], date_ref, out_root: str, overwrite = False) -> GenerateResult:
        try:
            payload = self.build_payload(spec, args, date_ref)
            logging.info(f"Payload built: {payload}")
            resp = self._post_generate_via_fetch(payload)
            status = int(resp.get("status", 0))
            text = resp.get("text", "")

            if status != 200:
                return GenerateResult(spec.key, [], [], False, status,
                                      error=f"generateReports HTTP {status} - {text[:300]}")

            file_names = self._parse_generate_response_text(text)
            if not file_names:
                return GenerateResult(spec.key, [], [], False, status,
                                      error=f"Sem xlsFileName - corpo: {text[:300]}")

            out_dir = out_dir_for(out_root, spec.key, date_ref)
            saved: List[str] = []

            for fn in file_names:
                url_file = f"{self.base_url}/TasyAppServer/resources/files/{fn}"
                binr = self.page.request.get(url_file)
                if binr.status != 200:
                    return GenerateResult(spec.key, file_names, saved, False, binr.status,
                                          error=f"Download HTTP {binr.status} - corpo: {binr.text()[:300]}")

                out_path = pathlib.Path(out_dir, f"{spec.file_prefix}_{date_ref.isoformat()}.{spec.ext}")
                out_path.write_bytes(binr.body())
                
                process_to_sharepoint(out_path, overwrite = overwrite)
                
                saved.append(str(out_path))

            return GenerateResult(spec.key, file_names, saved, True, 200, "")

        except Exception as e:
            return GenerateResult(spec.key, [], [], False, 0, error=str(e))
