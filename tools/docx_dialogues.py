"""東大文化経営用語対策_全語集.docx のコメント（KANTAくん × Claude先生の掛け合い）→ dialogues.json

使い方: python3 tools/docx_dialogues.py [docx のパス]
- コメントは本文の語の見出しの段落に付いている。見出しの語を cards.json の用語と照らして語ごとにまとめる
- 文言は変えない。発言者は author で決める（KANTAくん → "k"、Claude先生 → "t"）
"""
import json
import re
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DEFAULT = Path.home() / "Downloads/東大文化経営用語対策_全語集.docx"
WHO = {"KANTAくん": "k", "Claude先生": "t"}


def texts(xml):
    return "".join(re.findall(r"<w:t[^>]*>([^<]*)</w:t>", xml))


def main():
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else DEFAULT
    z = zipfile.ZipFile(src)
    doc = z.read("word/document.xml").decode("utf8")
    cm = z.read("word/comments.xml").decode("utf8")
    terms = [c["term"] for c in json.loads((ROOT / "cards.json").read_text(encoding="utf-8"))]

    comments = {}
    for m in re.finditer(r'<w:comment w:id="(\d+)"[^>]*w:author="([^"]*)"[^>]*>(.*?)</w:comment>', cm, re.S):
        paras = [texts(p) for p in re.findall(r"<w:p[ >].*?</w:p>", m.group(3), re.S)]
        comments[m.group(1)] = (WHO[m.group(2)], "\n".join(p for p in paras if p))

    out, cur = {}, None
    for p in re.findall(r"<w:p[ >].*?</w:p>", doc, re.S):
        t = texts(p)
        for term in terms:
            if t.startswith(term) and ("（" in t[len(term):len(term) + 12] or t == term):
                cur = term
                break
        for cid in re.findall(r'<w:commentRangeStart w:id="(\d+)"', p):
            who, text = comments[cid]
            out.setdefault(cur, []).append({"who": who, "text": text})

    assert None not in out, "見出しより前にコメントがある"
    for term, msgs in out.items():
        assert msgs[0]["who"] == "k", term + "：KANTAくんから始まっていない"
    (ROOT / "dialogues.json").write_text(json.dumps(out, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{len(out)}語・{sum(len(v) for v in out.values())}件")


if __name__ == "__main__":
    main()
