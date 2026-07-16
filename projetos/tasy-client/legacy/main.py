import os, sys, argparse, logging, pathlib, datetime
from src.runner import run_job
from src.uploading import process_raw_to_sharepoint

def env_or(name: str, default=None):
    v = os.environ.get(name, default)
    if v is None:
        raise RuntimeError(f"Env var {name} not set")
    return v

def parse_args():
    p = argparse.ArgumentParser(description="Runner de relatórios Tasy")
    p.add_argument("--catalog", default="conf/reports_catalog.json")
    p.add_argument("--job", required=True, help="Arquivo de job (ex.: conf/job_daily.json)")
    p.add_argument("--out", default="raw", help="Diretório raiz de saída")
    p.add_argument("--user", default=None, help="Usuário (ou TASY_USER no ambiente)")
    p.add_argument("--pass", dest="password", default=None, help="Senha (ou TASY_PASS no ambiente)")
    p.add_argument("--banco", default=None)
    p.add_argument("--headed", action="store_true")
    p.add_argument("--storage-state", action="store_true")
    p.add_argument("--overwrite", action="store_true", default=False, help="Sobrescrever arquivos no Sharepoint")
    return p.parse_args()

def setup_logging():
    # Cria pasta de logs
    logdir = pathlib.Path("logs")
    logdir.mkdir(exist_ok=True)

    # Um arquivo por dia (ex: run_2025-09-24.log)
    logfile = logdir / f"run_{datetime.datetime.now().strftime('%Y%m%d_%H%M%S')}.log"

    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(message)s",
        handlers=[
            logging.FileHandler(logfile, encoding="utf-8"),
            logging.StreamHandler()  # também mostra no console se rodar manual
        ]
    )


def main():
    a = parse_args()
    user = a.user or env_or("TASY_USER")
    pwd  = a.password or env_or("TASY_PASS")

    setup_logging()
    code = run_job(
        catalog_path=a.catalog,
        job_path=a.job,
        out_root=a.out,
        user=user,
        password=pwd,
        banco_opt=a.banco,
        headless=(not a.headed),
        use_storage_state=a.storage_state,
        overwrite=a.overwrite
    )

    # process_raw_to_sharepoint(
    #     overwrite=a.overwrite, 
    #     job_path=a.job
    # )
    
    sys.exit(code)


if __name__ == "__main__":
    main()
