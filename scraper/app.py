from flask import Flask, render_template, request, jsonify
from scraper import scrape

app = Flask(__name__)


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/api/scrape", methods=["POST"])
def api_scrape():
    data = request.get_json(silent=True) or {}
    url = (data.get("url") or "").strip()

    if not url:
        return jsonify({"error": "URLを入力してください。"}), 400

    if not url.startswith(("http://", "https://")):
        url = "https://" + url

    raw_selectors = data.get("selectors") or {}
    # Accept at most 5 custom selectors
    selectors = {k: v for k, v in list(raw_selectors.items())[:5] if k and v}

    result = scrape(url, selectors)
    return jsonify(result)


if __name__ == "__main__":
    app.run(debug=True, port=5000)
