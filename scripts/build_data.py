"""Prepara i dati per ASTRA map a partire dai due file scaricati dal sito ARPAS.

Ingresso (percorsi passati come argomenti):
  1. dati_meteo_2023.xlsx   dati giornalieri 2023, da
     https://dati-annuali-rete-arpas-2021-arpas.hub.arcgis.com/pages/dati_meteo_2016_2022
  2. Stazioni_ARPAS.csv     anagrafica delle stazioni, da
     https://arpas.maps.arcgis.com/home/item.html?id=8582ec448f234a63bdfd2ac3f09e259a
Uscita: web/data/dati_2023.json

I valori delle misure sono copiati cosi come sono: nessuna correzione, nessun filtro.
Le stazioni mostrate sono quelle dell'anagrafica; le misure sono agganciate tramite COD_STAZ.

Uso:  python scripts/build_data.py "C:/.../dati_meteo_2023.xlsx" "C:/.../Stazioni_ARPAS.csv"
"""
import hashlib
import json
import math
import sys
from datetime import date
from pathlib import Path

import pandas as pd

OUT = Path(__file__).resolve().parent.parent / "web" / "data" / "dati_2023.json"
ANNO = 2023
# codice, descrizione e unita di misura come pubblicati da ARPAS sulla pagina dei dati
MISURE = [
    ("TCG", "Media giornaliera della temperatura dell'aria", "°C"),
    ("TCH", "Valore massimo giornaliero della temperatura dell'aria", "°C"),
    ("TCL", "Valore minimo giornaliero della temperatura dell'aria", "°C"),
    ("PCG", "Cumulato giornaliero di pioggia", "mm"),
    ("RGG", "Radiazione globale integrale giornaliera", "MJ/m²"),
    ("UCG", "Media giornaliera dell'umidità relativa dell'aria", "%"),
    ("UCH", "Valore massimo del giorno dell'umidità relativa dell'aria", "%"),
    ("UCL", "Valore minimo del giorno dell'umidità relativa dell'aria", "%"),
    ("VAD", "Modulo della media vettoriale giornaliera del vento a 10 metri", "m/s"),
    ("DVV", "Argomento della media vettoriale giornaliera del vento a 10 metri", "°"),
    ("VAH", "Intensità massima giornaliera del vento a 10 metri", "m/s"),
    ("DVH", "Direzione massima del vento a 10 metri", "°"),
]


def sha256(p):
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def utm32_a_lonlat(e, n):
    """UTM zona 32 Nord (WGS84) -> longitudine e latitudine in gradi. Usata solo per le stazioni senza WGS84_LON/LAT."""
    a, f, k0, lon0 = 6378137.0, 1 / 298.257223563, 0.9996, math.radians(9)
    n3 = f / (2 - f)
    A = a / (1 + n3) * (1 + n3**2 / 4 + n3**4 / 64)
    xi, eta = n / (k0 * A), (e - 500000) / (k0 * A)
    b = [n3 / 2 - 2 * n3**2 / 3 + 37 * n3**3 / 96, n3**2 / 48 + n3**3 / 15, 17 * n3**3 / 480]
    xi1 = xi - sum(b[j] * math.sin(2 * (j + 1) * xi) * math.cosh(2 * (j + 1) * eta) for j in range(3))
    eta1 = eta - sum(b[j] * math.cos(2 * (j + 1) * xi) * math.sinh(2 * (j + 1) * eta) for j in range(3))
    chi = math.asin(math.sin(xi1) / math.cosh(eta1))
    d = [2 * n3 - 2 * n3**2 / 3 - 2 * n3**3, 7 * n3**2 / 3 - 8 * n3**3 / 5, 56 * n3**3 / 15]
    lat = chi + sum(d[j] * math.sin(2 * (j + 1) * chi) for j in range(3))
    return math.degrees(lon0 + math.atan2(math.sinh(eta1), math.cos(xi1))), math.degrees(lat)


def numero(x):
    x = str(x).strip().replace(",", ".")
    return float(x) if x else None


def main():
    f_dati, f_anag = sys.argv[1], sys.argv[2]

    # ---- anagrafica: le stazioni della mappa
    an = pd.read_csv(f_anag, sep=";", dtype=str, keep_default_na=False, encoding="utf-8-sig")
    an.columns = [c.strip() for c in an.columns]
    stazioni, da_utm = [], 0
    for r in an.itertuples(index=False):
        lon, lat = numero(r.WGS84_LON), numero(r.WGS84_LAT)
        origine = "WGS84_LON/LAT"
        if lon is None or lat is None:
            lon, lat = utm32_a_lonlat(numero(r.WGS84_E), numero(r.WGS84_N))
            origine, da_utm = "calcolata da WGS84_E/N", da_utm + 1
        stazioni.append({"cod": r.COD_STAZ, "nome": r.NOME, "rete": r.TIPO_RETE, "quota": numero(r.QUOTA), "dist_mare": numero(r.DIST_MARE),
                         "termo": r.TERMO, "pluvio": r.PLUVIO, "idro": r.IDRO, "utm_e": numero(r.WGS84_E), "utm_n": numero(r.WGS84_N),
                         "lon": round(lon, 6), "lat": round(lat, 6), "posizione": origine})
    indice = {s["cod"]: i for i, s in enumerate(stazioni)}
    print(f"anagrafica: {len(stazioni)} stazioni | reti {an.TIPO_RETE.value_counts().to_dict()} | posizione calcolata dalle coordinate UTM per {da_utm}")

    # ---- dati giornalieri
    d = pd.read_excel(f_dati, sheet_name=0)
    d.columns = [str(c).strip() for c in d.columns]
    d["DATAM"] = pd.to_datetime(d["DATAM"])
    assert (d["DATAM"].dt.year == ANNO).all(), "il file contiene date fuori dal 2023"
    giorni = (date(ANNO, 12, 31) - date(ANNO, 1, 1)).days + 1
    d["g"] = (d["DATAM"] - pd.Timestamp(ANNO, 1, 1)).dt.days
    nei_dati = set(d["COD_STAZ"])
    fuori = sorted(nei_dati - set(indice))
    print(f"dati: {len(d):,} righe | {len(nei_dati)} stazioni | {d['g'].nunique()} giorni | stazioni dei dati assenti dall'anagrafica: {len(fuori)} {fuori}")
    print(f"stazioni dell'anagrafica senza righe nei dati: {len(set(indice) - nei_dati)}")
    d = d[d["COD_STAZ"].isin(indice)]
    d["s"] = d["COD_STAZ"].map(indice)

    valori = {}
    for cod, _, _ in MISURE:
        serie = [None] * len(stazioni)
        x = d.dropna(subset=[cod])
        for s, g in x.groupby("s"):
            v = [None] * giorni
            for gi, val in zip(g["g"].to_numpy(), g[cod].to_numpy()):
                v[int(gi)] = float(val) if float(val) != int(val) else int(val)
            serie[int(s)] = v
        valori[cod] = serie
        print(f"   {cod}: {len(x):>7,} valori su {sum(v is not None for v in serie)} stazioni")
    for s in stazioni:
        s["nei_dati"] = s["cod"] in nei_dati

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({
        "anno": ANNO, "giorni": giorni,
        "misure": [{"id": c, "nome": n, "unita": u} for c, n, u in MISURE],
        "stazioni": stazioni, "valori": valori,
        "fonti": {"dati": {"file": Path(f_dati).name, "sha256": sha256(f_dati),
                           "pagina": "https://dati-annuali-rete-arpas-2021-arpas.hub.arcgis.com/pages/dati_meteo_2016_2022"},
                  "anagrafica": {"file": Path(f_anag).name, "sha256": sha256(f_anag),
                                 "pagina": "https://arpas.maps.arcgis.com/home/item.html?id=8582ec448f234a63bdfd2ac3f09e259a"}},
    }, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"scritto {OUT} ({OUT.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
