from flask import Flask, jsonify, render_template, request
from data_store import (
    add_demo_data,
    get_annual_data,
    get_available_years,
    get_latest_update,
    save_scrape_result,
)
from pollen_scraper import scrape_pollen

app = Flask(__name__)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/pollen/annual")
def api_annual():
    """指定年の年間花粉データを返す。"""
    try:
        year = int(request.args.get("year", 0)) or None
    except (ValueError, TypeError):
        year = None

    data = get_annual_data(year)
    years = get_available_years()
    latest = get_latest_update()

    return jsonify(
        {
            "data": data,
            "available_years": years,
            "latest_update": latest,
        }
    )


@app.route("/api/pollen/scrape", methods=["POST"])
def api_scrape():
    """
    Yahoo天気から最新の花粉データをスクレイピングして保存する。
    時間がかかるため非同期的に呼び出すことを想定。
    """
    result = scrape_pollen()

    if result.get("error"):
        return jsonify({"success": False, "error": result["error"]}), 500

    save_scrape_result(result)

    return jsonify(
        {
            "success": True,
            "scraped_at": result["scraped_at"],
            "today": result.get("today"),
            "forecast_days": len(result.get("forecast", [])),
            "trend_days": len(result.get("season_trend", [])),
        }
    )


@app.route("/api/pollen/demo", methods=["POST"])
def api_demo():
    """デモデータを生成する（開発・確認用）。"""
    add_demo_data()
    years = get_available_years()
    latest = get_latest_update()
    return jsonify({"success": True, "available_years": years, "latest_update": latest})


if __name__ == "__main__":
    app.run(debug=True, port=5001)
