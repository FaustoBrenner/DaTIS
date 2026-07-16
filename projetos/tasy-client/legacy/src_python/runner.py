import json, pathlib, logging
from typing import Dict, Any, List, Optional
from datetime import date, timedelta

from .models import ReportSpec, JobConfig, JobReport, GenerateResult
from .tasy_client import TasyClient
from .utils import parse_date_ref, json_dumps, sleep_backoff

def load_json(path: str) -> Dict[str, Any]:
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)

def build_specs(catalog: Dict[str, Any]) -> Dict[str, ReportSpec]:
    specs: Dict[str, ReportSpec] = {}
    for item in catalog["reports"]:
        specs[item["key"]] = ReportSpec(
            key=item["key"],
            title=item["title"],
            type=item["type"],
            code=int(item["code"]),
            params_schema=item.get("params_schema", {}),
            file_prefix=item["outputs"]["file_prefix"],
            ext=item["outputs"].get("ext","xls")
        )
    return specs

def run_job(catalog_path: str, job_path: str, out_root: str,
            user: str, password: str, banco_opt: Optional[str],
            headless: bool, use_storage_state: bool, overwrite: bool) -> int:

    catalog = load_json(catalog_path)
    job = load_json(job_path)
    out_root = pathlib.Path(out_root, job.get("job_name"))

    date_ref = parse_date_ref(job.get("date_ref"))
    common_args = job.get("common_args", {})
    estabelecimento = job.get("estabelecimento")
    job_reports: List[JobReport] = [JobReport(**r) for r in job.get("reports", [])]

    specs_map = build_specs(catalog)
    base_url = catalog["base_url"]
    login_url = catalog.get("login_url","/")
    gen_url  = catalog["generate_url"]

    client = TasyClient(base_url, login_url, gen_url, user, password, banco_opt)
    client.start(headless=headless, use_storage_state=use_storage_state, storage_state_path="conf/storage_state.json")

    exit_code = 1
    try:
        client.login(force=False, storage_state_path=("conf/storage_state.json" if use_storage_state else None))

        if estabelecimento:
            client.mudar_estabelecimento(estabelecimento)
            logging.info(f"PerformAction: Estabelecimento alterado para: {estabelecimento}")

        exit_code = 0
        for jr in job_reports:
            spec = specs_map.get(jr.key)
            if not spec:
                logging.error(json_dumps({"report": jr.key, "ok": False, "error": "report_key not found in catalog"}))
                exit_code = 1
                continue

            # mescla args: comuns + específicos do job
            args = dict(common_args)
            args.update(jr.args or {})

            attempt = 1
            while attempt <= 3:
                res: GenerateResult = client.run_report(spec, args, date_ref, out_root, overwrite)
                
                logging.info(json_dumps({
                    "report": jr.key,
                    "attempt": attempt,
                    "ok": res.ok,
                    "status": res.status,
                    "files": res.files,
                    "saved": res.saved_paths,
                    "error": res.error
                }))

                if res.ok:
                    break
                if res.status in (401, 403):
                    client.login(force=True, storage_state_path=("conf/storage_state.json" if use_storage_state else None))
                if attempt < 3:
                    sleep_backoff(attempt, base=2.0)
                attempt += 1

            if not res.ok:
                logging.error("Max number of attemps reached. Not able to retrieve report.")
                exit_code = 1
    finally:
        client.stop()
        return exit_code