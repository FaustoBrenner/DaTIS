from dataclasses import dataclass
from datetime import date
from typing import Dict, Any, List, Optional

@dataclass
class ReportSpec:
    key: str
    title: str
    type: str
    code: int
    params_schema: Dict[str, Dict[str, Any]]  # nome -> {type, required, allowed?}
    file_prefix: str
    ext: str = "xls"

@dataclass
class RunOptions:
    date_ref: date
    out_root: str
    max_retries: int = 3
    backoff_base: float = 2.0
    headless: bool = True
    use_storage_state: bool = False
    storage_state_path: str = "conf/storage_state.json"

@dataclass
class GenerateResult:
    report_key: str
    files: List[str]
    saved_paths: List[str]
    ok: bool
    status: int
    error: str = ""

@dataclass
class JobReport:
    key: str
    args: Dict[str, Any]

@dataclass
class JobConfig:
    date_ref: Optional[str]  # iso string ou null => D-1
    common_args: Dict[str, Any]
    reports: List[JobReport]
