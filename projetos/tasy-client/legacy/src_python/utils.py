import json, pathlib, re, time, logging
from datetime import date, datetime, timedelta, time as dtime
from typing import Any, Dict

TOKEN_RE = re.compile(r"^@date_ref(?:(?P<off>[+-]\d+)d)?(?P<t00z>_T00Z)?$")

def ensure_dir(path: str) -> None:
    pathlib.Path(path).mkdir(parents=True, exist_ok=True)

def out_dir_for(out_root: str, report_key: str, d: date) -> str:
    p = pathlib.Path(out_root, report_key, d.strftime("%Y"), d.strftime("%m"))
    ensure_dir(str(p))
    return str(p)

def json_dumps(obj) -> str:
    return json.dumps(obj, ensure_ascii=False, separators=(",", ":"))

def sleep_backoff(attempt: int, base: float) -> None:
    delay = base ** (attempt - 1)
    time.sleep(delay)

def parse_date_ref(s: str | None) -> date:
    if not s:
        return date.today() - timedelta(days=1)
    return date.fromisoformat(s)

def resolve_token(val: Any, date_ref: date) -> Any:
    """
    Resolve tokens como:
    @date_ref
    @date_ref-1d
    @date_ref+2d
    @date_ref_T00Z
    @date_ref-1d_T00Z
    Qualquer outro valor retorna inalterado.
    """
    if not isinstance(val, str) or not val.startswith("@"):
        return val
    m = TOKEN_RE.match(val)
    if not m:
        return val
    off = int(m.group("off") or 0)
    t00z = bool(m.group("t00z"))
    d = date_ref + timedelta(days=off)
    if t00z:
        # local=UTC
        dt = datetime.combine(d, dtime(3,0,0))
        return dt.strftime("%Y-%m-%dT%H:%M:%S.") + "000Z"
    else:
        return d.isoformat()

def encode_param(name: str, value: Any, schema: Dict[str, Any]) -> Any:
    """
    Codifica conforme o schema do catálogo:
    - instant => objeto java.time.Instant
    - string/int/bool/json => coerção leve
    - allowed => validação de domínio
    """
    typ = schema.get("type", "string")
    allowed = schema.get("allowed")

    # domínio
    if allowed is not None and value not in allowed:
        raise ValueError(f"Param {name}: valor '{value}' fora do domínio {allowed}")

    if typ == "instant":
        if not isinstance(value, str) or not value.endswith("Z"):
            raise ValueError(f"Param {name}: esperado ISO UTC terminado em 'Z' para 'instant'")
        return {
            "@class": "java.time.Instant",
            "type": "INSTANT",
            "value": value
        }
    elif typ == "int":
        return int(value)
    elif typ == "bool" or typ == "boolean":
        if isinstance(value, bool):
            return value
        if isinstance(value, str):
            return value.strip().lower() in ("1","true","t","yes","y","sim")
        return bool(value)
    elif typ == "json":
        # permite objetos/dicts in natura
        return value
    else:
        # string (default)
        return str(value)