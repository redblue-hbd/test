from flask import Flask, jsonify, render_template, request
from data_store import (
    AREAS,
    add_demo_data,
    get_annual_data,
    get_available_years,
    get_comparison_data,
    get_latest_update,
    save_scrape_result,
)
from pollen_scraper import scrape_pollen

app = Flask(__name__)

VALID_AREAS = set(AREAS.keys())


def _area() -> str:
    area = request.args.get("area", "shinagawa")
    return area if area in VALID_AREAS else "shinagawa"


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/pollen/annual")
def api_annual():
    """指定エリア・年の年間花粉データを返す。"""
    area = _area()
    try:
        year = int(request.args.get("year", 0)) or None
    except (ValueError, TypeError):
        year = None

    return jsonify(
        {
            "data": get_annual_data(year, area),
            "available_years": get_available_years(area),
            "latest_update": get_latest_update(area),
            "area": area,
            "area_name": AREAS[area],
        }
    )


@app.route("/api/pollen/compare")
def api_compare():
    """2年間の比較データを返す。"""
    area = _area()
    current_year = get_available_years(area)
    default_year = current_year[0] if current_year else 2026

    try:
        year_a = int(request.args.get("year_a", default_year))
        year_b = int(request.args.get("year_b", default_year - 1))
    except (ValueError, TypeError):
        year_a, year_b = default_year, default_year - 1

    return jsonify(
        {
            **get_comparison_data(year_a, year_b, area),
            "area": area,
            "area_name": AREAS[area],
        }
    )


@app.route("/api/pollen/scrape", methods=["POST"])
def api_scrape():
    """Yahoo天気から最新の花粉データをスクレイピングして保存する。"""
    area = request.json.get("area", "shinagawa") if request.is_json else "shinagawa"
    if area not in VALID_AREAS:
        area = "shinagawa"

    result = scrape_pollen(area)

    if result.get("error"):
        return jsonify({"success": False, "error": result["error"]}), 500

    save_scrape_result(result, area)

    return jsonify(
        {
            "success": True,
            "scraped_at": result["scraped_at"],
            "today": result.get("today"),
            "forecast_days": len(result.get("forecast", [])),
        }
    )


@app.route("/api/pollen/demo", methods=["POST"])
def api_demo():
    """デモデータを生成する（開発・確認用）。"""
    add_demo_data()
    return jsonify(
        {
            "success": True,
            "available_years": {
                area: get_available_years(area) for area in VALID_AREAS
            },
        }
    )


@app.route("/api/areas")
def api_areas():
    """利用可能なエリア一覧を返す。"""
    return jsonify(
        [
            {
                "id": area_id,
                "name": area_name,
                "years": get_available_years(area_id),
            }
            for area_id, area_name in AREAS.items()
        ]
    )


if __name__ == "__main__":
    app.run(debug=True, port=5001)
