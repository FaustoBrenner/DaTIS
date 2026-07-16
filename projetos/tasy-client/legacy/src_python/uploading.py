# uploading.py
from pathlib import Path
import csv, json
import logging

RAW_ROOT = Path("raw")
DEST_ROOT = Path(
    r"C:\Users\fausto.brenner\Rede D'Or\Inteligência Operacional Regional Sul - Documentos\Dados"
)


def _read_text(fp: Path) -> str:
    # tenta UTF-8 (com/sem BOM); se falhar, latin-1 (comum em TSVs legados)
    try:
        return fp.read_text(encoding="utf-16-be")
    except UnicodeDecodeError:
        return fp.read_text(encoding="utf-8-sig")
        # return fp.read_text(encoding="latin-1")

def _tsv_to_csv_text(tsv_text: str, out_csv: Path) -> None:
    out_csv.parent.mkdir(parents=True, exist_ok=True)
    with out_csv.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f, lineterminator="\n", delimiter =";")
        for line in tsv_text.splitlines():
            w.writerow(line.split("\t"))

def load_json(path: str):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)
    
def process_to_sharepoint(orignal_path: Path, dest_root:Path = DEST_ROOT, overwrite: bool = False):
    """
    Processa o arquivo gerado .xls em raw/<KEY>/<ANO>/<MES>/<DIA>/
    Converte (TSV) -> CSV e salva em:
      <DEST_ROOT>/<KEY>/<ANO>/<MES>/<mesmo_nome>.csv
    """
    relative_path = orignal_path.relative_to(Path(RAW_ROOT))
    dest = dest_root / relative_path.parent / (relative_path.stem + ".csv")

    if dest.exists() and not overwrite:
        logging.info(f"Arquivo já existente em destino Sharepoint, pulando upload: {dest}")
        return
    
    try:
        tsv = _read_text(orignal_path)
        _tsv_to_csv_text(tsv, dest)
        logging.info(f"[uploading] CSV gerado: {dest}")
    except Exception as e:
        err += 1
        logging.error(f"[uploading] ERRO em {orignal_path}: {e}")
    return

def process_raw_to_sharepoint(raw_root: Path = RAW_ROOT,
                              dest_root: Path = DEST_ROOT,
                              overwrite: bool = False,
                              job_path: str = "") -> None:
    """
    Lê todos os .xls em raw/<KEY>/<ANO>/<MES>/<DIA>/
    Converte (TSV) -> CSV e salva em:
      <DEST_ROOT>/<KEY>/<ANO>/<MES>/<mesmo_nome>.csv
    """
    if job_path == "":
        raw_root = Path(raw_root)
        dest_root = Path(dest_root)
    else:
        job = load_json(job_path)
        raw_root = Path(raw_root, job.get("job_name"))
        dest_root = Path(dest_root, job.get("job_name"))

    xls_files = sorted(raw_root.glob("*/*/*/*.xls"))
    if not xls_files:
        logging.error("[uploading] Nenhum .xls encontrado.")
        return

    ok = 0
    skip = 0
    err = 0

    for src in xls_files:
        try:
            # Extrai partes da estrutura conhecida
            rel = src.relative_to(raw_root)                 # KEY/ANO/MES/DIA/file.xls
            key, ano, mes = rel.parts[0:3]                  # confiando na estrutura fixa
            dest_dir = dest_root / key / ano / mes
            dest = dest_dir / (src.stem + ".csv")

            if dest.exists() and not overwrite:
                skip += 1
                continue
     
            tsv = _read_text(src)
            _tsv_to_csv_text(tsv, dest)
            ok += 1
            logging.info(f"[uploading] CSV gerado: {dest}")
        except Exception as e:
            err += 1
            logging.error(f"[uploading] ERRO em {src}: {e}")

    logging.info(f"[uploading] Concluído. OK={ok} | Skipped={skip} | Erros={err}")

if __name__ == "__main__":
    process_raw_to_sharepoint()
