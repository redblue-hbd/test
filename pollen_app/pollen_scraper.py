"""
Yahoo天気 品川区 花粉情報スクレイパー
URL: https://weather.yahoo.co.jp/weather/pollen/3/13/13109/

Playwrightを使用してJavaScript描画ページを取得し、
花粉データ（スギ・ヒノキ等）を抽出する。
"""

import json
import re
from datetime import date, datetime
from typing import Optional

from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeout

# 品川区の花粉情報ページ
POLLEN_URL = "https://weather.yahoo.co.jp/weather/pollen/3/13/13109/"

# 花粉レベルの数値変換マップ
LEVEL_MAP = {
    "なし": 0,
    "少ない": 1,
    "やや多い": 2,
    "多い": 3,
    "非常に多い": 4,
    "ごく少ない": 1,
    "-": None,
    "−": None,
    "": None,
}

LEVEL_LABELS = ["なし", "少ない", "やや多い", "多い", "非常に多い"]


def _level_to_int(text: str) -> Optional[int]:
    text = text.strip()
    return LEVEL_MAP.get(text, None)


def scrape_pollen() -> dict:
    """
    Yahoo天気から品川区の花粉データを取得する。

    Returns:
        {
            "scraped_at": "2024-03-15T10:00:00",
            "area": "品川区",
            "url": "...",
            "today": {"date": "2024-03-15", "cedar": 3, "cypress": 1},
            "forecast": [
                {"date": "2024-03-15", "cedar": 3, "cypress": 1},
                ...
            ],
            "season_trend": [
                {"date": "2024-01-01", "cedar": 0, "cypress": 0},
                ...
            ],
            "error": null
        }
    """
    result = {
        "scraped_at": datetime.now().isoformat(timespec="seconds"),
        "area": "品川区",
        "url": POLLEN_URL,
        "today": None,
        "forecast": [],
        "season_trend": [],
        "error": None,
    }

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            context = browser.new_context(
                user_agent=(
                    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                    "AppleWebKit/537.36 (KHTML, like Gecko) "
                    "Chrome/120.0.0.0 Safari/537.36"
                ),
                locale="ja-JP",
            )
            page = context.new_page()

            # API レスポンスを傍受してJSONデータを取得する
            intercepted = []

            def on_response(response):
                url = response.url
                content_type = response.headers.get("content-type", "")
                if "json" in content_type and (
                    "pollen" in url.lower()
                    or "kafun" in url.lower()
                    or "forecast" in url.lower()
                    or "13109" in url
                ):
                    try:
                        intercepted.append(
                            {"url": url, "data": response.json()}
                        )
                    except Exception:
                        pass

            page.on("response", on_response)

            page.goto(POLLEN_URL, wait_until="networkidle", timeout=30000)

            # ページが十分にレンダリングされるまで待機
            try:
                page.wait_for_selector(
                    "table, .pollen, .forecastPollen, [class*='pollen'], [class*='kafun']",
                    timeout=10000,
                )
            except PlaywrightTimeout:
                pass

            # ① ページ内のグローバルJSオブジェクトからデータ取得を試みる
            initial_state = None
            for var in [
                "window.__INITIAL_STATE__",
                "window.__NEXT_DATA__",
                "window.pollenData",
                "window.kafunData",
            ]:
                try:
                    val = page.evaluate(f"typeof {var} !== 'undefined' ? {var} : null")
                    if val:
                        initial_state = val
                        break
                except Exception:
                    pass

            if initial_state:
                _parse_initial_state(initial_state, result)

            # ② 傍受したAPIレスポンスからデータ取得
            if not result["forecast"] and intercepted:
                for item in intercepted:
                    _parse_api_response(item["data"], result)
                    if result["forecast"]:
                        break

            # ③ DOMから直接パース（フォールバック）
            if not result["forecast"]:
                _parse_from_dom(page, result)

            browser.close()

    except Exception as e:
        result["error"] = str(e)

    return result


def _parse_initial_state(state: dict, result: dict):
    """window.__INITIAL_STATE__ などのグローバル状態からデータを抽出する。"""
    # 再帰的にキーを探す
    def find_pollen_data(obj, depth=0):
        if depth > 10 or not isinstance(obj, (dict, list)):
            return
        if isinstance(obj, list):
            for item in obj:
                find_pollen_data(item, depth + 1)
        else:
            for k, v in obj.items():
                k_lower = k.lower()
                if any(kw in k_lower for kw in ["pollen", "kafun", "forecast"]):
                    _try_extract_list(v, result)
                find_pollen_data(v, depth + 1)

    find_pollen_data(state)


def _parse_api_response(data: dict, result: dict):
    """APIレスポンスのJSONからデータを抽出する。"""
    _try_extract_list(data, result)


def _try_extract_list(data, result: dict):
    """リスト形式の花粉データを解析する。"""
    if not isinstance(data, list):
        return
    rows = []
    for item in data:
        if not isinstance(item, dict):
            continue
        date_val = item.get("date") or item.get("dt") or item.get("datetime")
        cedar = item.get("cedar") or item.get("sugi") or item.get("スギ")
        cypress = item.get("cypress") or item.get("hinoki") or item.get("ヒノキ")
        if date_val and (cedar is not None or cypress is not None):
            rows.append(
                {
                    "date": str(date_val)[:10],
                    "cedar": _to_level(cedar),
                    "cypress": _to_level(cypress),
                }
            )
    if rows:
        result["forecast"] = rows
        result["today"] = rows[0]


def _to_level(val) -> Optional[int]:
    if val is None:
        return None
    if isinstance(val, int):
        return val
    if isinstance(val, float):
        return int(val)
    return _level_to_int(str(val))


def _parse_from_dom(page, result: dict):
    """
    DOMから花粉データをパースする。
    Yahoo天気花粉ページの典型的なセレクターを複数試みる。
    """
    today_str = date.today().isoformat()

    # ---- 今日の花粉レベル ----
    # Yahoo天気は画像のalt属性やspan内テキストでレベルを表示することが多い
    today_data = {"date": today_str, "cedar": None, "cypress": None}

    # セレクター候補を複数試す
    level_selectors = [
        "[class*='pollen'] [class*='level']",
        "[class*='kafun'] [class*='level']",
        ".pollen-level",
        ".pollenLevel",
        "td.pollen",
        "[data-pollen-level]",
    ]
    for sel in level_selectors:
        elements = page.query_selector_all(sel)
        if elements:
            texts = [el.inner_text().strip() for el in elements[:2]]
            for i, t in enumerate(texts):
                lv = _level_to_int(t)
                if i == 0:
                    today_data["cedar"] = lv
                elif i == 1:
                    today_data["cypress"] = lv
            break

    # ---- 週間予報テーブル ----
    forecast = []

    # テーブルセレクター候補
    table_selectors = [
        "[class*='pollen'] table",
        "[class*='forecast'] table",
        "[class*='kafun'] table",
        "table[class*='pollen']",
        ".yjw_table",
        ".forecastTable",
    ]

    for sel in table_selectors:
        table = page.query_selector(sel)
        if not table:
            continue

        rows = table.query_selector_all("tr")
        if not rows:
            continue

        # ヘッダー行から日付を取得
        header_cells = rows[0].query_selector_all("th, td") if rows else []
        dates = []
        for cell in header_cells:
            text = cell.inner_text().strip()
            # "3/15(金)" のような形式
            m = re.search(r"(\d{1,2})/(\d{1,2})", text)
            if m:
                month, day = int(m.group(1)), int(m.group(2))
                year = date.today().year
                try:
                    d = date(year, month, day)
                    dates.append(d.isoformat())
                except ValueError:
                    dates.append(None)
            else:
                dates.append(None)

        # データ行からレベルを取得
        cedar_row = []
        cypress_row = []
        for row in rows[1:]:
            cells = row.query_selector_all("td, th")
            row_text = [c.inner_text().strip() for c in cells]
            row_label = row_text[0] if row_text else ""
            # スギ行
            if any(k in row_label for k in ["スギ", "杉", "cedar", "Cedar"]):
                cedar_row = row_text[1:]
            # ヒノキ行
            elif any(k in row_label for k in ["ヒノキ", "檜", "cypress", "Cypress"]):
                cypress_row = row_text[1:]

        for i, d in enumerate(dates):
            if not d:
                continue
            cedar_lv = _level_to_int(cedar_row[i]) if i < len(cedar_row) else None
            cypress_lv = _level_to_int(cypress_row[i]) if i < len(cypress_row) else None
            forecast.append(
                {"date": d, "cedar": cedar_lv, "cypress": cypress_lv}
            )

        if forecast:
            break

    # ---- シーズン推移（グラフデータ）----
    season_trend = []

    # Yahooのグラフは多くの場合 <script> タグにデータが埋め込まれている
    scripts = page.evaluate(
        """() => Array.from(document.querySelectorAll('script:not([src])'))
                .map(s => s.textContent)"""
    )
    for script in scripts:
        # JSON配列 or オブジェクトを探す
        matches = re.findall(r'\[\s*\{[^[\]]{20,}\}\s*\]', script)
        for match in matches:
            try:
                data = json.loads(match)
                if isinstance(data, list) and len(data) > 3:
                    extracted = _extract_trend_from_json(data)
                    if extracted:
                        season_trend = extracted
                        break
            except json.JSONDecodeError:
                pass
        if season_trend:
            break

    # 結果をセット
    if forecast:
        result["forecast"] = forecast
        result["today"] = forecast[0]
    elif today_data["cedar"] is not None or today_data["cypress"] is not None:
        result["today"] = today_data
        result["forecast"] = [today_data]

    if season_trend:
        result["season_trend"] = season_trend


def _extract_trend_from_json(data: list) -> list:
    """JSONリストからシーズン推移データを抽出する。"""
    results = []
    for item in data:
        if not isinstance(item, dict):
            continue
        date_val = None
        for k in ["date", "dt", "datetime", "day", "d"]:
            if k in item:
                date_val = str(item[k])[:10]
                break
        if not date_val:
            continue
        cedar = None
        cypress = None
        for k in ["cedar", "sugi", "スギ", "杉"]:
            if k in item:
                cedar = _to_level(item[k])
                break
        for k in ["cypress", "hinoki", "ヒノキ", "檜"]:
            if k in item:
                cypress = _to_level(item[k])
                break
        if cedar is not None or cypress is not None:
            results.append({"date": date_val, "cedar": cedar, "cypress": cypress})
    return results
