# ASTRA map

Mappa delle stazioni delle reti ARPAS della Sardegna con i dati meteorologici giornalieri del 2023.

## Dati di partenza

Due file scaricati a mano dal sito ARPAS. La mappa non usa altro.

| File | Contenuto | Dove si scarica |
|---|---|---|
| `dati_meteo_2023.xlsx` | 111.690 righe: 306 stazioni × 365 giorni, 12 misure | https://dati-annuali-rete-arpas-2021-arpas.hub.arcgis.com/pages/dati_meteo_2016_2022 |
| `Stazioni_ARPAS.csv` | anagrafica di 338 stazioni | https://arpas.maps.arcgis.com/home/item.html?id=8582ec448f234a63bdfd2ac3f09e259a |

Le 12 misure, con codice e unità pubblicati da ARPAS:

| Codice | Descrizione | Unità |
|---|---|---|
| TCG | Media giornaliera della temperatura dell'aria | °C |
| TCH | Valore massimo giornaliero della temperatura dell'aria | °C |
| TCL | Valore minimo giornaliero della temperatura dell'aria | °C |
| PCG | Cumulato giornaliero di pioggia | mm |
| RGG | Radiazione globale integrale giornaliera | MJ/m² |
| UCG | Media giornaliera dell'umidità relativa dell'aria | % |
| UCH | Valore massimo del giorno dell'umidità relativa dell'aria | % |
| UCL | Valore minimo del giorno dell'umidità relativa dell'aria | % |
| VAD | Modulo della media vettoriale giornaliera del vento a 10 metri | m/s |
| DVV | Argomento della media vettoriale giornaliera del vento a 10 metri | ° |
| VAH | Intensità massima giornaliera del vento a 10 metri | m/s |
| DVH | Direzione massima del vento a 10 metri | ° |

## Avvio

```sh
python scripts/build_data.py "percorso/dati_meteo_2023.xlsx" "percorso/Stazioni_ARPAS.csv"
python -m http.server 8765 --directory web
```

Poi apri http://localhost:8765. Il primo comando serve solo se cambiano i file di partenza: il risultato
(`web/data/dati_2023.json`, 3 MB) è già nella cartella. Richiede Python con `pandas` e `openpyxl`.

## Versione online

La cartella `web/` è pubblicata con GitHub Pages all'indirizzo https://mark76jx17.github.io/ASTRA-MAP-3D/

La pubblicazione è automatica (`.github/workflows/pages.yml`): parte a ogni push su `main` che modifica `web/`,
oppure a mano dalla scheda *Actions* del repository. Funziona solo con il repository pubblico e con
*Settings › Pages › Source* impostato su "GitHub Actions".

## Cosa fa `build_data.py`

- Le **stazioni** della mappa sono quelle dell'anagrafica (338); le misure sono agganciate con `COD_STAZ`.
  Tutte le 306 stazioni del file dei dati sono presenti in anagrafica; 32 stazioni dell'anagrafica non hanno righe nel file.
- I **valori** sono copiati così come sono: nessuna correzione, nessun filtro, celle vuote = dato assente.
- **Posizione**: `WGS84_LON` e `WGS84_LAT` dell'anagrafica. Per le 32 stazioni in cui questi due campi sono vuoti
  la posizione è calcolata da `WGS84_E` e `WGS84_N` (coordinate UTM zona 32 Nord); la mappa lo segnala.
- Nel file prodotto sono registrati nome e impronta SHA-256 dei due file di partenza.

## Uso della mappa

**Sinistra — navigazione**
- *Colore delle stazioni*: per rete (rosso Rete Unica, blu Rete Fiduciaria, grigio le altre) oppure secondo il valore
  di una misura nel giorno scelto; in questo caso le stazioni senza valore quel giorno sono un cerchio vuoto.
- *Misure*: elenco di caselle. Restano sulla mappa le stazioni che hanno almeno un valore, nel periodo scelto,
  per ogni misura selezionata. Senza selezione sono mostrate tutte. Il numero accanto a ogni misura è quante stazioni la hanno nel periodo.

**Centro — mappa e tempo**
- Passando sopra una stazione compaiono i dati dell'anagrafica.
- Lo slider ha due cursori e definisce il periodo, dal 1° gennaio al 31 dicembre 2023.
- Il campo *Giorno* apre un calendario limitato al periodo; il giorno scelto è segnato sullo slider.
- Sotto, per la stazione scelta, i valori di tutte le 12 misure nel giorno indicato.

**Mappa in 3D**
- Sfondo a scelta: immagini satellitari (predefinito), OpenStreetMap, oppure scuro con il solo rilievo ombreggiato.
- *Rilievo in 3D*: il terreno è in rilievo e le stazioni sono appoggiate sulla sua superficie, quindi ciascuna si trova alla quota
  del terreno in quel punto. L'esagerazione verticale (da 1× a 4×, predefinita 1,5×) rende leggibili i dislivelli.
- Per inclinare e ruotare: trascina con il tasto destro, oppure Ctrl + trascina. I due pulsanti riportano alla vista inclinata o dall'alto.
- La quota dichiarata in anagrafica resta quella mostrata al passaggio del mouse; la posizione verticale sulla mappa viene dal modello del terreno.

Servizi esterni usati solo per disegnare lo sfondo (nessun dato del progetto viene inviato):

| Cosa | Servizio | Indirizzo |
|---|---|---|
| Immagini satellitari | Esri World Imagery, lo stesso sfondo della mappa ARPAS | `server.arcgisonline.com` |
| Quote del terreno | Mapzen Terrain Tiles, dati aperti ospitati da Amazon | `s3.amazonaws.com/elevation-tiles-prod` |
| Mappa stradale (facoltativa) | OpenStreetMap | `tile.openstreetmap.org` |

Senza connessione la mappa funziona comunque con lo sfondo scuro e senza rilievo.

**Destra — grafici**
- Un grafico per ogni misura selezionata, per la stazione scelta e limitato al periodo.
  Se la stazione non ha dati, il riquadro lo dice. La linea tratteggiata è il giorno scelto.

## Struttura

```
scripts/build_data.py         dai due file ARPAS a web/data/dati_2023.json
scripts/download_sardegna.py  contorno dell'isola da OpenStreetMap (già scaricato in web/data/sardegna.geojson)
web/index.html, style.css     pagina
web/src/main.js               mappa, filtri, slider, pannelli
web/src/chart.js              grafici
web/vendor/                   MapLibre GL JS 4.7.1
```

Fonte dei dati: ARPAS. Contorno dell'isola e sfondo facoltativo: © OpenStreetMap.
