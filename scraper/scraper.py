import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse


HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/120.0.0.0 Safari/537.36"
    )
}

TIMEOUT = 10


def scrape(url: str, selectors: dict) -> dict:
    """
    Scrape a URL and extract data based on CSS selectors.

    Args:
        url: Target URL to scrape
        selectors: Dict mapping label -> CSS selector

    Returns:
        Dict with keys: url, title, meta_description, links, images,
        headings, custom (from selectors), error
    """
    result = {
        "url": url,
        "title": None,
        "meta_description": None,
        "links": [],
        "images": [],
        "headings": [],
        "custom": {},
        "error": None,
    }

    try:
        resp = requests.get(url, headers=HEADERS, timeout=TIMEOUT)
        resp.raise_for_status()
        resp.encoding = resp.apparent_encoding

        soup = BeautifulSoup(resp.text, "lxml")

        # Title
        title_tag = soup.find("title")
        result["title"] = title_tag.get_text(strip=True) if title_tag else None

        # Meta description
        meta = soup.find("meta", attrs={"name": "description"})
        if meta:
            result["meta_description"] = meta.get("content", "").strip()

        # Links
        base = f"{urlparse(url).scheme}://{urlparse(url).netloc}"
        links = []
        for a in soup.find_all("a", href=True):
            href = a["href"].strip()
            if not href or href.startswith("#") or href.startswith("javascript:"):
                continue
            full = urljoin(base, href)
            text = a.get_text(strip=True) or href
            links.append({"text": text, "url": full})
        result["links"] = links[:50]  # cap at 50

        # Images
        images = []
        for img in soup.find_all("img", src=True):
            src = urljoin(base, img["src"].strip())
            alt = img.get("alt", "").strip()
            images.append({"src": src, "alt": alt})
        result["images"] = images[:30]  # cap at 30

        # Headings
        headings = []
        for tag in soup.find_all(["h1", "h2", "h3"]):
            text = tag.get_text(strip=True)
            if text:
                headings.append({"level": tag.name, "text": text})
        result["headings"] = headings

        # Custom selectors
        for label, selector in selectors.items():
            try:
                elements = soup.select(selector)
                result["custom"][label] = [el.get_text(strip=True) for el in elements]
            except Exception:
                result["custom"][label] = []

    except requests.exceptions.Timeout:
        result["error"] = "リクエストがタイムアウトしました。"
    except requests.exceptions.ConnectionError:
        result["error"] = "接続できませんでした。URLを確認してください。"
    except requests.exceptions.HTTPError as e:
        result["error"] = f"HTTPエラー: {e.response.status_code}"
    except Exception as e:
        result["error"] = f"予期しないエラー: {str(e)}"

    return result
