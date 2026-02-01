import json
import urllib.parse
import urllib.request
import re


def main() -> None:
    query = """
    PREFIX schema: <http://schema.org/>
    SELECT ?code (SAMPLE(COALESCE(?capRu, ?capRuTitle, ?capEn)) AS ?cap) WHERE {
      ?country wdt:P31 wd:Q6256;
               wdt:P297 ?code;
               wdt:P36 ?capital.
      OPTIONAL { ?capital rdfs:label ?capRu FILTER (lang(?capRu) = "ru") }
      OPTIONAL { ?capital rdfs:label ?capEn FILTER (lang(?capEn) = "en") }
      OPTIONAL {
        ?ruArticle schema:about ?capital;
                   schema:isPartOf <https://ru.wikipedia.org/>;
                   schema:name ?capRuTitle.
      }
    }
    GROUP BY ?code
    """

    url = "https://query.wikidata.org/sparql?format=json&query=" + urllib.parse.quote(query)
    req = urllib.request.Request(url, headers={"User-Agent": "flags-app/1.0"})

    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode("utf-8"))

    wikidata_caps = {}
    for row in data.get("results", {}).get("bindings", []):
        code = row.get("code", {}).get("value", "").upper()
        cap = row.get("cap", {}).get("value", "").strip()
        if code and cap and code not in wikidata_caps:
            wikidata_caps[code] = cap

    rc_url = "https://restcountries.com/v3.1/all?fields=cca2,capital"
    rc_req = urllib.request.Request(rc_url, headers={"User-Agent": "flags-app/1.0"})
    with urllib.request.urlopen(rc_req) as resp:
        rc_data = json.loads(resp.read().decode("utf-8"))

    rest_caps = {}
    for c in rc_data:
        code = (c.get("cca2") or "").upper()
        caps = c.get("capital") or []
        cap = caps[0].strip() if caps else ""
        if code and cap and code not in rest_caps:
            rest_caps[code] = cap

    result = dict(rest_caps)
    for code, cap in wikidata_caps.items():
        if code and cap:
            result[code] = cap

    # Try to convert remaining Latin capitals via enwiki -> ru langlinks.
    latin_re = re.compile(r"[A-Za-z]")
    for code, cap in list(result.items()):
        if not cap or not latin_re.search(cap):
            continue
        ru = resolve_ru_langlink(cap)
        if ru:
            result[code] = ru

    overrides = {
        "AI": "Вэлли",
        "AS": "Паго-Паго",
        "CC": "Уэст-Айленд",
        "EH": "Эль-Аюн",
        "GG": "Сент-Питер-Порт",
        "GU": "Хагатна",
        "HK": "Виктория",
        "IM": "Дуглас",
        "JE": "Сент-Хелиер",
        "KY": "Джорджтаун",
        "MF": "Маригот",
        "MP": "Сайпан",
        "PF": "Папеэте",
        "RE": "Сен-Дени",
        "UM": "Вашингтон",
        "WF": "Мата-Уту"
    }
    for code, name in overrides.items():
        if code in result:
            result[code] = name

    with open("capitals-ru.json", "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2, sort_keys=True)

    print("saved", len(result), "capitals")


def resolve_ru_langlink(name: str) -> str:
    try:
        q = urllib.parse.quote(name)
        url = (
            "https://en.wikipedia.org/w/api.php?"
            f"action=query&titles={q}&prop=langlinks&lllang=ru&format=json"
        )
        req = urllib.request.Request(url, headers={"User-Agent": "flags-app/1.0"})
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        pages = data.get("query", {}).get("pages", {})
        for _, page in pages.items():
            links = page.get("langlinks") or []
            if links:
                return links[0].get("*", "") or ""
    except Exception:
        return ""
    return ""


if __name__ == "__main__":
    main()
