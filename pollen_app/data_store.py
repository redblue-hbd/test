"""
花粉データの永続化・蓄積管理（エリア別・年別対応）

data/history.json の構造:
{
  "areas": {
    "shinagawa": { "entries": { "2025-03-15": {"cedar": 3, "cypress": 1, "updated_at": "..."} } },
    "shinjuku":  { "entries": { ... } }
  }
}
"""

import json
import random
from datetime import date, datetime, timedelta
from pathlib import Path
from typing import Optional

DATA_DIR = Path(__file__).parent / "data"
HISTORY_FILE = DATA_DIR / "history.json"

AREAS = {
    "shinagawa": "品川区",
    "shinjuku": "新宿区",
}


# ---------- internal I/O ----------

def _load() -> dict:
    DATA_DIR.mkdir(exist_ok=True)
    if not HISTORY_FILE.exists():
        return {"areas": {}}
    try:
        with open(HISTORY_FILE, encoding="utf-8") as f:
            raw = json.load(f)
        # 旧フォーマット互換 (entries が直下にある場合)
        if "entries" in raw and "areas" not in raw:
            return {"areas": {"shinagawa": {"entries": raw["entries"]}}}
        return raw
    except (json.JSONDecodeError, OSError):
        return {"areas": {}}


def _save(store: dict):
    DATA_DIR.mkdir(exist_ok=True)
    with open(HISTORY_FILE, "w", encoding="utf-8") as f:
        json.dump(store, f, ensure_ascii=False, indent=2)


def _area_entries(store: dict, area: str) -> dict:
    return store.setdefault("areas", {}).setdefault(area, {}).setdefault("entries", {})


# ---------- public write ----------

def save_scrape_result(result: dict, area: str = "shinagawa"):
    store = _load()
    entries = _area_entries(store, area)

    for item in result.get("forecast", []) + result.get("season_trend", []):
        d = item.get("date")
        if not d or (d in entries and item in result.get("season_trend", [])):
            continue
        entries[d] = {
            "cedar": item.get("cedar"),
            "cypress": item.get("cypress"),
            "updated_at": result.get("scraped_at", ""),
        }

    _save(store)


# ---------- public read ----------

def get_annual_data(year: Optional[int] = None, area: str = "shinagawa") -> list:
    """指定エリア・年の日別花粉データを返す（日付昇順）。"""
    if year is None:
        year = date.today().year

    store = _load()
    entries = _area_entries(store, area)

    prefix = f"{year}-"
    result = [
        {"date": d, "cedar": v.get("cedar"), "cypress": v.get("cypress")}
        for d, v in entries.items()
        if d.startswith(prefix)
    ]
    result.sort(key=lambda x: x["date"])
    return result


def get_available_years(area: str = "shinagawa") -> list:
    store = _load()
    entries = _area_entries(store, area)
    years = set()
    for d in entries:
        try:
            years.add(int(d[:4]))
        except (ValueError, IndexError):
            pass
    return sorted(years, reverse=True) or [date.today().year]


def get_latest_update(area: str = "shinagawa") -> Optional[str]:
    store = _load()
    entries = _area_entries(store, area)
    times = [v.get("updated_at", "") for v in entries.values() if v.get("updated_at")]
    return max(times) if times else None


def get_comparison_data(year_a: int, year_b: int, area: str = "shinagawa") -> dict:
    """2年分のデータを並べて返す（前年比較用）。"""
    return {
        "year_a": {"year": year_a, "data": get_annual_data(year_a, area)},
        "year_b": {"year": year_b, "data": get_annual_data(year_b, area)},
    }


# ---------- demo data ----------

def _bell(d: date, season_start: date, season_end: date, peak: date) -> float:
    total = max((season_end - season_start).days, 1)
    peak_pos = (peak - season_start).days / total
    pos = (d - season_start).days / total
    return max(0.0, 1.0 - abs(pos - peak_pos) / max(peak_pos, 0.01) * 1.8)


def _gen_year(
    entries: dict,
    year: int,
    cedar_scale: float,
    cypress_scale: float,
    seed: int,
    force: bool = False,
):
    """指定年のデモデータを生成する。"""
    prefix = f"{year}-"
    if not force and any(k.startswith(prefix) for k in entries):
        return

    rng = random.Random(seed)
    now_str = datetime.now().isoformat(timespec="seconds")
    today = date.today()

    season_start = date(year, 1, 15)
    season_end = date(year, 5, 31)
    cedar_peak = date(year, 3, 10)
    cypress_peak = date(year, 4, 5)

    d = season_start
    while d <= min(season_end, today):
        cb = _bell(d, season_start, season_end, cedar_peak) * 4 * cedar_scale
        cyb = _bell(d, season_start, season_end, cypress_peak) * 3.5 * cypress_scale

        cedar_lv = min(4, max(0, round(cb + rng.uniform(-0.7, 0.7))))
        cypress_lv = min(4, max(0, round(cyb + rng.uniform(-0.5, 0.5))))

        # 前年のデータは5月末まで全部生成
        if year < today.year or d <= today:
            entries[d.isoformat()] = {
                "cedar": cedar_lv,
                "cypress": cypress_lv,
                "updated_at": now_str,
            }
        d += timedelta(days=1)


def add_demo_data():
    """2025・2026年の品川区・新宿区のデモデータを生成する。"""
    store = _load()

    # 品川区: 2025年（やや多め）・2026年（多め）
    sh_entries = _area_entries(store, "shinagawa")
    _gen_year(sh_entries, 2025, cedar_scale=0.9, cypress_scale=0.8, seed=101)
    _gen_year(sh_entries, 2026, cedar_scale=1.1, cypress_scale=1.0, seed=201)

    # 新宿区: 2025年（少なめ）・2026年（やや多め）
    sj_entries = _area_entries(store, "shinjuku")
    _gen_year(sj_entries, 2025, cedar_scale=0.75, cypress_scale=0.7, seed=102)
    _gen_year(sj_entries, 2026, cedar_scale=0.95, cypress_scale=0.85, seed=202)

    _save(store)
