import json
import pathlib
import urllib.request


ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT_DIR = ROOT / "flags"
API_URL = "https://restcountries.com/v3.1/all?fields=cca2"
GITHUB_SVG = "https://raw.githubusercontent.com/hjnilsson/country-flags/master/svg/{code}.svg"


def fetch_json(url: str) -> list:
    req = urllib.request.Request(url, headers={"User-Agent": "flags-app/1.0"})
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read().decode("utf-8"))


def download(url: str, path: pathlib.Path) -> bool:
    req = urllib.request.Request(url, headers={"User-Agent": "flags-app/1.0"})
    with urllib.request.urlopen(req) as resp:
        data = resp.read()
    if not data:
        return False
    path.write_bytes(data)
    return True


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    data = fetch_json(API_URL)

    saved = 0
    skipped = 0
    failed = 0

    for c in data:
        code = (c.get("cca2") or "").upper()
        if not code:
            skipped += 1
            continue
        out = OUT_DIR / f"{code}.svg"
        if out.exists():
            skipped += 1
            continue
        url = GITHUB_SVG.format(code=code.lower())
        try:
            ok = download(url, out)
        except Exception:
            ok = False
        if ok:
            saved += 1
        else:
            failed += 1
            if out.exists():
                out.unlink()
            print("failed:", code, url)

    print("saved", saved, "skipped", skipped, "failed", failed, "dir", str(OUT_DIR))


if __name__ == "__main__":
    main()
