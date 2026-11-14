"""Scarica il contorno della Sardegna (isole minori comprese) da OpenStreetMap, via Nominatim.

Uscita: web/data/sardegna.geojson (WGS84). Dati (c) OpenStreetMap contributors, licenza ODbL.
Uso:  python scripts/download_sardegna.py
"""
import json
from pathlib import Path

import requests

OUT = Path(__file__).resolve().parent.parent / "web" / "data" / "sardegna.geojson"
r = requests.get("https://nominatim.openstreetmap.org/search", timeout=120,
                 headers={"User-Agent": "ASTRA-map/0.1 (research prototype)"},
                 params={"q": "Sardegna, Italia", "format": "geojson", "polygon_geojson": 1, "polygon_threshold": 0.0015, "limit": 5})
r.raise_for_status()
regioni = [f for f in r.json()["features"] if f["geometry"]["type"] in ("Polygon", "MultiPolygon")
           and f["properties"].get("addresstype") in ("state", "region", "island")]
if not regioni:
    raise SystemExit("contorno non trovato")
f = max(regioni, key=lambda x: len(json.dumps(x["geometry"])))
OUT.parent.mkdir(parents=True, exist_ok=True)
OUT.write_text(json.dumps({"type": "FeatureCollection", "features": [{"type": "Feature", "properties": {"name": "Sardegna"}, "geometry": f["geometry"]}]}), encoding="utf-8")
g = f["geometry"]
n = len(g["coordinates"]) if g["type"] == "MultiPolygon" else 1
print(f"{f['properties'].get('display_name')}: {g['type']} con {n} poligoni -> {OUT} ({OUT.stat().st_size:,} byte)")
