"""
花粉データの永続化・蓄積管理。

毎日のスクレイピング結果を data/history.json に保存し、
年間グラフ用の時系列データを管理する。
"""

import json
import os
from datetime import date, datetime
from pathlib import Path
from typing import Optional

DATA_DIR = Path(__file__).parent / "data"
HISTORY_FILE = DATA_DIR / "history.json"


def _load() -> dict:
    DATA_DIR.mkdir(exist_ok=True)
    if not HISTORY_FILE.exists():
        return {"entries": {}}
    try:
        with open(HISTORY_FILE, encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError):
        return {"entries": {}}


def _save(store: dict):
    DATA_DIR.mkdir(exist_ok=True)
    with open(HISTORY_FILE, "w", encoding="utf-8") as f:
        json.dump(store, f, ensure_ascii=False, indent=2)


def save_scrape_result(result: dict):
    """
    スクレイピング結果を履歴に保存する。
    forecast の各エントリを日付キーで保存する。
    """
    store = _load()
    entries: dict = store.setdefault("entries", {})

    for item in result.get("forecast", []):
        d = item.get("date")
        if not d:
            continue
        entries[d] = {
            "cedar": item.get("cedar"),
            "cypress": item.get("cypress"),
            "updated_at": result.get("scraped_at", ""),
        }

    # シーズン推移データも統合
    for item in result.get("season_trend", []):
        d = item.get("date")
        if not d or d in entries:
            continue
        entries[d] = {
            "cedar": item.get("cedar"),
            "cypress": item.get("cypress"),
            "updated_at": result.get("scraped_at", ""),
        }

    _save(store)


def get_annual_data(year: Optional[int] = None) -> list:
    """
    指定年（デフォルト: 今年）の日別花粉データを返す。

    Returns:
        [{"date": "2024-03-15", "cedar": 3, "cypress": 1}, ...]
        日付昇順、1月1日〜12月31日
    """
    if year is None:
        year = date.today().year

    store = _load()
    entries = store.get("entries", {})

    prefix = f"{year}-"
    result = []
    for d, v in entries.items():
        if d.startswith(prefix):
            result.append(
                {
                    "date": d,
                    "cedar": v.get("cedar"),
                    "cypress": v.get("cypress"),
                }
            )

    result.sort(key=lambda x: x["date"])
    return result


def get_available_years() -> list:
    """データが存在する年のリストを返す（降順）。"""
    store = _load()
    entries = store.get("entries", {})
    years = set()
    for d in entries:
        try:
            years.add(int(d[:4]))
        except (ValueError, IndexError):
            pass
    return sorted(years, reverse=True) or [date.today().year]


def get_latest_update() -> Optional[str]:
    """最終更新日時を返す。"""
    store = _load()
    entries = store.get("entries", {})
    if not entries:
        return None
    times = [v.get("updated_at", "") for v in entries.values() if v.get("updated_at")]
    return max(times) if times else None


def add_demo_data():
    """
    デモ用のサンプルデータを生成する。
    実際のスクレイピングが完了するまでの表示確認に使用。
    """
    import random
    from datetime import timedelta

    store = _load()
    entries = store.setdefault("entries", {})

    year = date.today().year
    # 既にデータがあれば追加しない
    if any(k.startswith(f"{year}-") for k in entries):
        return

    # 花粉シーズン(1月中旬〜5月末)のダミーデータを生成
    season_start = date(year, 1, 15)
    season_peak = date(year, 3, 10)
    season_end = date(year, 5, 31)

    today = date.today()
    d = season_start
    now_str = datetime.now().isoformat(timespec="seconds")

    while d <= min(season_end, today):
        days_from_start = (d - season_start).days
        total_days = (season_end - season_start).days
        peak_days = (season_peak - season_start).days

        # ベルカーブ状のレベルを生成
        progress = days_from_start / total_days
        peak_progress = peak_days / total_days
        bell = max(0.0, 1.0 - abs(progress - peak_progress) / peak_progress * 1.5)

        cedar_base = bell * 4
        cypress_base = max(0.0, bell * 3 - 0.5) if progress > 0.4 else 0

        # ランダムなノイズを加える
        cedar_lv = min(4, max(0, round(cedar_base + random.uniform(-0.8, 0.8))))
        cypress_lv = min(4, max(0, round(cypress_base + random.uniform(-0.5, 0.5))))

        entries[d.isoformat()] = {
            "cedar": cedar_lv,
            "cypress": cypress_lv,
            "updated_at": now_str,
        }
        d += timedelta(days=1)

    _save(store)
