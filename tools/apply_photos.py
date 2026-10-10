"""urls.txt → photos/<id>.jpg と cards.json の photo（C-photo.md）

使い方: python tools/apply_photos.py [urls.txt のパス]   （Pillow が必要）
- 1行1語：「用語<タブまたは全角スペース>Commons のファイルページURL」
- ライセンスは CC BY / CC BY-SA / CC0 / パブリックドメインだけ。NC・ND・不明・Commons 以外は弾く
- Artist が空なら弾く（推測で埋めない）
- 反映できた行は urls_done.txt に移す。弾いた行は直せるよう urls.txt に残す
- # で始まる行は説明として読み飛ばす
"""
import html
import io
import json
import re
import sys
import urllib.parse
import urllib.request
from datetime import date
from pathlib import Path

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent.parent
CARDS = ROOT / "cards.json"
PHOTOS = ROOT / "photos"
DEFAULT_URLS = Path.home() / "Library/Mobile Documents/com~apple~CloudDocs/bunka-photos/urls.txt"

API = "https://commons.wikimedia.org/w/api.php"
UA = "bunka-cards/1.0 (https://github.com/kanta331/bunka-cards; personal study app)"
FILE_PAGE = re.compile(r"^https://commons\.wikimedia\.org/wiki/(File:[^?#]+)$")

LONG_EDGE, QUALITY, MIN_QUALITY, TARGET_BYTES = 800, 80, 60, 100 * 1024
WARN_TOTAL = 10 * 1024 * 1024

# 許可するライセンス（LicenseShortName）。これ以外はすべて弾く
ALLOWED = [
    re.compile(r"^CC BY(-SA)? \d\.\d( [a-z]{2,3})?$", re.I),   # CC BY 4.0 / CC BY-SA 2.1 jp など
    re.compile(r"^CC0( 1\.0)?$", re.I),
    re.compile(r"^Public domain$", re.I),
]


def license_ok(name):
    if not name or re.search(r"\b(NC|ND)\b", name, re.I):
        return False
    return any(p.match(name.strip()) for p in ALLOWED)


def strip_tags(s):
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", "", s or ""))).strip()


def get(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=60) as r:
        return r.read()


def imageinfo(title):
    q = urllib.parse.urlencode({
        "action": "query", "titles": title, "prop": "imageinfo",
        "iiprop": "url|extmetadata", "format": "json", "formatversion": "2",
    })
    pages = json.loads(get(f"{API}?{q}"))["query"]["pages"]
    page = pages[0] if pages else {}
    if page.get("missing") or not page.get("imageinfo"):
        return None
    return page["imageinfo"][0]


def shrink(raw):
    im = ImageOps.exif_transpose(Image.open(io.BytesIO(raw)))
    if im.mode not in ("RGB", "L"):
        bg = Image.new("RGB", im.size, "white")
        bg.paste(im, mask=im.convert("RGBA").split()[-1])
        im = bg
    im.thumbnail((LONG_EDGE, LONG_EDGE), Image.LANCZOS)
    q = QUALITY
    while True:
        buf = io.BytesIO()
        im.convert("RGB").save(buf, "JPEG", quality=q, optimize=True, progressive=True)
        if buf.tell() <= TARGET_BYTES or q <= MIN_QUALITY:
            return buf.getvalue(), q, im.size
        q -= 5


def parse_line(line):
    m = re.match(r"^(.+?)(?:\t|　)+(\S+)\s*$", line)
    return (m.group(1).strip(), m.group(2)) if m else (None, None)


def main():
    urls_path = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT_URLS
    done_path = urls_path.with_name("urls_done.txt")
    lines = urls_path.read_text(encoding="utf-8").splitlines()
    cards = json.loads(CARDS.read_text(encoding="utf-8"))
    byid = {c["id"]: c for c in cards}
    PHOTOS.mkdir(exist_ok=True)

    applied, rejected, keep, moved = [], [], [], []
    for line in lines:
        if not line.strip() or line.lstrip().startswith("#"):
            keep.append(line); continue   # 空行と # の行（説明）はそのまま残す
        term, url = parse_line(line)
        def reject(why):
            rejected.append((term or line, why)); keep.append(line)
        if not term:
            reject("行の形が「用語<タブか全角スペース>URL」になっていない"); continue
        if term not in byid:
            reject("cards.json に同じ id の語がない"); continue
        m = FILE_PAGE.match(url)
        if not m:
            reject(f"Commons のファイルページURLではない（{url}）"); continue
        title = urllib.parse.unquote(m.group(1)).replace("_", " ")
        try:
            info = imageinfo(title)
        except Exception as e:
            reject(f"Commons API に問い合わせできない（{e}）"); continue
        if not info:
            reject("Commons にそのファイルがない"); continue
        meta = info.get("extmetadata", {})
        lic = strip_tags(meta.get("LicenseShortName", {}).get("value"))
        artist = strip_tags(meta.get("Artist", {}).get("value"))
        if not license_ok(lic):
            reject(f"ライセンスが許可リスト外（{lic or '不明'}）"); continue
        if not artist:
            reject("Artist（撮影者・作者）が空"); continue
        try:
            data, q, size = shrink(get(info["url"]))
        except Exception as e:
            reject(f"画像を取得・縮小できない（{e}）"); continue
        out = PHOTOS / f"{term}.jpg"
        out.write_bytes(data)
        byid[term]["photo"] = {
            "file": f"photos/{term}.jpg",
            "caption": term,
            "credit": f"{artist}, {lic}, via Wikimedia Commons",
            "source": url,
        }
        applied.append((term, lic, len(data), q, size))
        moved.append(f"{line}\t# {date.today().isoformat()}")

    with CARDS.open("w", encoding="utf-8") as f:
        f.write("[\n" + ",\n".join(json.dumps(c, ensure_ascii=False) for c in cards) + "\n]\n")
    urls_path.write_text("".join(l + "\n" for l in keep), encoding="utf-8")
    if moved:
        with done_path.open("a", encoding="utf-8") as f:
            f.write("".join(l + "\n" for l in moved))

    total = sum(p.stat().st_size for p in PHOTOS.glob("*.jpg"))
    print("反映した語:")
    for term, lic, n, q, (w, h) in applied:
        print(f"  {term}　{lic}　{w}×{h}px　{n/1024:.0f}KB（品質{q}）")
    print("弾いた語:" + ("" if rejected else " なし"))
    for term, why in rejected:
        print(f"  {term}　{why}")
    count = len(list(PHOTOS.glob("*.jpg")))
    print(f"photos/ の合計: {count}枚 {total/1024:.0f}KB" + ("　※10MB を超えています" if total > WARN_TOTAL else ""))


if __name__ == "__main__":
    main()
