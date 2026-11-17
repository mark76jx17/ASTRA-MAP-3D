// ASTRA map: stazioni ARPAS e dati giornalieri 2023.
// Sinistra: colore delle stazioni e misure scelte. Centro: mappa, periodo, giorno. Destra: grafici della stazione scelta.
import { grafico } from './chart.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const RETI = { 'Rete Unica': '#e53935', 'Rete Fiduciaria': '#2f8fe8' };
const ALTRA_RETE = '#9aa3ab';
const coloreRete = (r) => RETI[r] ?? ALTRA_RETE;
const PROVINCE = { CA: 'CA', NU: 'NU', OR: 'OR', SS: 'SS' };

// scale di colore per misura: fondo scala e tinte, a passi uguali
const TEMP = ['#1e3a8a', '#38a3e0', '#7ad9c9', '#4caf50', '#c8e03a', '#ffd93b', '#ff8c2a', '#e0312a', '#7a1010'];
const VENTO = ['#39424d', '#6fb7e8', '#8a6fe8', '#e040d0'];
const UMIDITA = ['#b5651d', '#e8d174', '#5fc9a7', '#1f6fb5'];
const DIREZIONE = ['#e53935', '#f5d21f', '#2fa866', '#2f8fe8', '#e53935'];   // ciclica: 0 e 360 gradi hanno lo stesso colore
const SCALE = {
  TCG: [-5, 40, TEMP], TCH: [-5, 40, TEMP], TCL: [-5, 40, TEMP], PCG: [0, 60, ['#39424d', '#9ecae1', '#4292c6', '#2171b5', '#6a3d9a']],
  RGG: [0, 34, ['#3b2f6b', '#c0563a', '#f5a623', '#ffe98a']], UCG: [0, 100, UMIDITA], UCH: [0, 100, UMIDITA], UCL: [0, 100, UMIDITA],
  VAD: [0, 12, VENTO], VAH: [0, 35, VENTO], DVV: [0, 360, DIREZIONE], DVH: [0, 360, DIREZIONE],
};
const TINTA = { TCG: '#ff8c2a', TCH: '#e0312a', TCL: '#38a3e0', PCG: '#4fa3e3', RGG: '#ffd93b', UCG: '#5fc9a7', UCH: '#5fc9a7', UCL: '#5fc9a7',
  VAD: '#c58bff', DVV: '#c58bff', VAH: '#c58bff', DVH: '#c58bff' };
const TIPO = { PCG: 'barre', DVV: 'punti', DVH: 'punti' };

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
function coloreMisura(id, v) {
  const [min, max, tinte] = SCALE[id];
  const t = Math.max(0, Math.min(1, (v - min) / (max - min))) * (tinte.length - 1);
  const i = Math.min(tinte.length - 2, Math.floor(t)), f = t - i;
  const a = hex(tinte[i]), b = hex(tinte[i + 1]);
  return `rgb(${a.map((x, k) => Math.round(x + f * (b[k] - x))).join(',')})`;
}

let D, map, conteggi;                       // dati, mappa, conteggi cumulati per misura e stazione
const stato = { modo: 'rete', misuraColore: 'TCG', scelte: new Set(), da: 0, a: 0, giorno: 0, stazione: -1, esagerazione: 1.5 };
const VISTA_3D = { pitch: 60, bearing: -15 };

// ---------------------------------------------------------------- date
const MESI = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
const dataDi = (i) => new Date(Date.UTC(D.anno, 0, 1 + i));
const testoData = (i) => { const d = dataDi(i); return `${d.getUTCDate()} ${MESI[d.getUTCMonth()]} ${D.anno}`; };
const isoData = (i) => dataDi(i).toISOString().slice(0, 10);
const indiceDi = (iso) => Math.round((Date.parse(`${iso}T00:00:00Z`) - Date.UTC(D.anno, 0, 1)) / 86400e3);

// ---------------------------------------------------------------- dati
// quanti valori ha la stazione s per la misura id tra i giorni da e a (compresi)
const quanti = (id, s, da, a) => { const c = conteggi[id][s]; return c ? c[a + 1] - c[da] : 0; };
const valore = (id, s, g) => D.valori[id][s]?.[g] ?? null;
const misura = (id) => D.misure.find((m) => m.id === id);
const formato = (v, id) => (v === null ? null : `${Number.isInteger(v) ? v : v.toFixed(2).replace(/\.?0+$/, '')} ${misura(id).unita}`);
// la stazione resta sulla mappa se ha almeno un valore nel periodo per ogni misura scelta
const passa = (s) => [...stato.scelte].every((id) => quanti(id, s, stato.da, stato.a) > 0);

function preparaConteggi() {
  conteggi = {};
  for (const m of D.misure) {
    conteggi[m.id] = D.valori[m.id].map((serie) => {
      if (!serie) return null;
      const c = new Uint16Array(D.giorni + 1);
      for (let g = 0; g < D.giorni; g++) c[g + 1] = c[g] + (serie[g] !== null ? 1 : 0);
      return c;
    });
  }
}

// ---------------------------------------------------------------- mappa
function creaMappa(isola) {
  map = new maplibregl.Map({
    container: 'map', center: [9.05, 40.07], zoom: 7.6, minZoom: 6, maxZoom: 17, pitch: VISTA_3D.pitch, bearing: VISTA_3D.bearing, maxPitch: 80,
    attributionControl: { compact: true },
    style: { version: 8, sources: {}, layers: [{ id: 'fondo', type: 'background', paint: { 'background-color': '#0b1016' } }] },
  });
  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), 'top-right');
  map.addControl(new maplibregl.ScaleControl({ unit: 'metric' }), 'bottom-right');
  return new Promise((ok) => map.on('load', () => {
    // immagini satellitari (le stesse della mappa ARPAS) e, in alternativa, OpenStreetMap
    map.addSource('satellite', { type: 'raster', tileSize: 256, maxzoom: 18,
      tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      attribution: 'Immagini: Esri, Maxar, Earthstar Geographics' });
    map.addSource('osm', { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19,
      attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' });
    // modello delle quote del terreno: una sorgente per il rilievo 3D e una per l'ombreggiatura
    const quote = { type: 'raster-dem', tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'], tileSize: 256,
      maxzoom: 14, encoding: 'terrarium', attribution: 'Rilievo: Mapzen Terrain Tiles' };
    map.addSource('quote', quote);
    map.addSource('quote-ombre', quote);
    map.addSource('isola', { type: 'geojson', data: isola });
    map.addSource('stazioni', { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({ id: 'satellite', type: 'raster', source: 'satellite' });
    map.addLayer({ id: 'osm', type: 'raster', source: 'osm', layout: { visibility: 'none' } });
    map.addLayer({ id: 'isola-terra', type: 'fill', source: 'isola', layout: { visibility: 'none' }, paint: { 'fill-color': '#2a2e33' } });
    map.addLayer({ id: 'ombre', type: 'hillshade', source: 'quote-ombre', layout: { visibility: 'none' },
      paint: { 'hillshade-shadow-color': '#000000', 'hillshade-highlight-color': '#8a929a', 'hillshade-exaggeration': 0.6 } });
    map.addLayer({ id: 'isola-costa', type: 'line', source: 'isola', paint: { 'line-color': '#ffffff', 'line-opacity': 0.35, 'line-width': 0.8 } });
    map.setTerrain({ source: 'quote', exaggeration: stato.esagerazione });
    try { map.setSky({ 'sky-color': '#7fb2e5', 'horizon-color': '#dfe9f2', 'fog-color': '#dfe9f2', 'sky-horizon-blend': 0.6, 'horizon-fog-blend': 0.6, 'fog-ground-blend': 0.2 }); } catch { /* cielo non disponibile in questa versione */ }
    const pieno = ['==', ['get', 'pieno'], 1];
    map.addLayer({ id: 'scelta', type: 'circle', source: 'stazioni', filter: ['==', ['get', 'i'], -1],
      paint: { 'circle-radius': 14, 'circle-color': 'rgba(255,255,255,0.15)', 'circle-stroke-color': '#ffffff', 'circle-stroke-width': 2 } });
    map.addLayer({ id: 'stazioni', type: 'circle', source: 'stazioni',
      paint: { 'circle-radius': ['interpolate', ['linear'], ['zoom'], 6, ['case', pieno, 3.5, 2.5], 10, ['case', pieno, 8, 5]],
        'circle-color': ['case', pieno, ['get', 'colore'], 'rgba(0,0,0,0)'],
        'circle-stroke-color': '#ffffff', 'circle-stroke-width': ['case', pieno, 1.2, 1.6] } });

    const sugg = $('suggerimento');
    map.on('mousemove', 'stazioni', (e) => {
      map.getCanvas().style.cursor = 'pointer';
      sugg.hidden = false;
      sugg.innerHTML = anagrafica(e.features[0].properties.i);
      const area = $('mappa-area').getBoundingClientRect();
      sugg.style.left = `${Math.min(e.point.x + 14, area.width - sugg.offsetWidth - 8)}px`;
      sugg.style.top = `${Math.min(e.point.y + 14, area.height - sugg.offsetHeight - 8)}px`;
    });
    map.on('mouseleave', 'stazioni', () => { sugg.hidden = true; map.getCanvas().style.cursor = ''; });
    map.on('click', (e) => {
      const f = map.queryRenderedFeatures(e.point, { layers: ['stazioni'] })[0];
      if (f) scegli(f.properties.i);
    });
    ok();
  }));
}

// i dati dell'anagrafica mostrati al passaggio del mouse
function anagrafica(i) {
  const s = D.stazioni[i];
  const riga = (a, b) => `<tr><td>${a}</td><td>${esc(b)}</td></tr>`;
  const n = (v, u = '') => (v === null ? 'non indicata' : `${v.toLocaleString('it-IT')}${u}`);
  return `<b>${esc(s.nome)}</b><table>
    ${riga('Codice stazione', s.cod)}${riga('Tipo di rete', s.rete)}${riga('Quota', n(s.quota, ' m s.l.m.'))}
    ${riga('Distanza dal mare', n(s.dist_mare, ' m'))}${riga('Termometro', s.termo || 'non indicato')}
    ${riga('Pluviometro', s.pluvio || 'non indicato')}${riga('Idrometro', s.idro || 'non indicato')}
    ${riga('Longitudine', s.lon.toFixed(5))}${riga('Latitudine', s.lat.toFixed(5))}
    ${s.posizione === 'WGS84_LON/LAT' ? '' : riga('Posizione', 'calcolata dalle coordinate UTM')}
    ${riga('Dati 2023', s.nei_dati ? 'presenti' : 'stazione assente dal file')}</table>`;
}

// ---------------------------------------------------------------- disegno
function disegna() {
  const features = [];
  let mostrate = 0;
  D.stazioni.forEach((s, i) => {
    if (!passa(i)) return;
    mostrate++;
    let colore = coloreRete(s.rete), pieno = 1;
    if (stato.modo === 'misura') {
      const v = valore(stato.misuraColore, i, stato.giorno);
      pieno = v === null ? 0 : 1;
      colore = v === null ? '' : coloreMisura(stato.misuraColore, v);
    }
    features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [s.lon, s.lat] }, properties: { i, colore, pieno } });
  });
  map.getSource('stazioni').setData({ type: 'FeatureCollection', features });
  const nomi = [...stato.scelte].join(', ');
  $('conteggio').innerHTML = stato.scelte.size
    ? `<b>${mostrate}</b> stazioni su ${D.stazioni.length} hanno dati per ${stato.scelte.size === 1 ? 'la misura scelta' : `tutte le ${stato.scelte.size} misure scelte`} (${esc(nomi)}) nel periodo.`
    : `<b>${mostrate}</b> stazioni: nessuna misura selezionata, quindi sono mostrate tutte quelle dell'anagrafica.`;
  // quante stazioni hanno ogni misura nel periodo
  for (const m of D.misure) {
    let n = 0;
    for (let s = 0; s < D.stazioni.length; s++) if (quanti(m.id, s, stato.da, stato.a) > 0) n++;
    const el = document.querySelector(`#misure [data-conta="${m.id}"]`);
    el.textContent = n;
    el.closest('.riga').classList.toggle('spenta', n === 0);
  }
  pannello();
  giornoDati();
}

function legendaMisura() {
  const [min, max, tinte] = SCALE[stato.misuraColore];
  $('legenda-misura').hidden = stato.modo !== 'misura';
  $('legenda-barra').style.background = `linear-gradient(to right, ${tinte.join(', ')})`;
  const u = misura(stato.misuraColore).unita;
  $('legenda-tacche').innerHTML = [min, (min + max) / 2, max].map((v) => `<span>${Math.round(v)} ${esc(u)}</span>`).join('');
}

// ---------------------------------------------------------------- destra: stazione e grafici
function pannello() {
  const p = $('pannello');
  if (stato.stazione < 0) {
    p.innerHTML = `<h2>Nessuna stazione scelta</h2><p class="vuoto">Clicca una stazione sulla mappa: qui compaiono i grafici delle misure selezionate,
      per il periodo scelto con lo slider.</p>`;
    return;
  }
  const s = D.stazioni[stato.stazione];
  const n = (v, u) => (v === null ? 'non indicata' : `${v.toLocaleString('it-IT')} ${u}`);
  let html = `<button class="chiudi" id="chiudi">Chiudi</button>
    <h2 style="color:${coloreRete(s.rete)}">${esc(s.nome)}<small>${esc(s.cod)}</small></h2>
    <div class="scheda"><span>Provincia: <b>${esc(PROVINCE[s.cod.slice(0, 2)] ?? '–')}</b></span><span>Tipo rete: <b>${esc(s.rete)}</b></span>
      <span>Quota: <b>${n(s.quota, 'm s.l.m.')}</b></span><span>Distanza dal mare: <b>${n(s.dist_mare, 'm')}</b></span></div>`;
  const scelte = D.misure.filter((m) => stato.scelte.has(m.id));
  if (!scelte.length) html += '<p class="vuoto">Seleziona una o più misure nell\'elenco a sinistra: ogni misura selezionata diventa un grafico.</p>';
  const giorni = stato.a - stato.da + 1;
  for (const m of scelte) {
    const serie = D.valori[m.id][stato.stazione];
    const pezzo = serie ? serie.slice(stato.da, stato.a + 1) : [];
    const validi = pezzo.filter((v) => v !== null);
    html += `<div class="grafico-box"><h5>${esc(m.nome)} (${esc(m.unita)})</h5>`;
    if (!validi.length) {
      html += `<div class="senza">Nessun dato per questa stazione${serie ? ' nel periodo scelto' : ' nel 2023'}</div></div>`;
      continue;
    }
    const somma = validi.reduce((a, b) => a + b, 0);
    const f = (v) => v.toFixed(1);
    const sintesi = m.id === 'PCG' ? `totale ${f(somma)} · massimo ${f(Math.max(...validi))}`
      : m.id === 'DVV' || m.id === 'DVH' ? '' : `min ${f(Math.min(...validi))} · media ${f(somma / validi.length)} · max ${f(Math.max(...validi))}`;
    html += `<p class="sintesi">${validi.length} valori su ${giorni} giorni${sintesi ? ` · ${sintesi}` : ''}</p><canvas data-misura="${m.id}"></canvas></div>`;
  }
  p.innerHTML = html;
  $('chiudi').onclick = () => scegli(-1);
  p.querySelectorAll('canvas').forEach((c) => {
    const id = c.dataset.misura;
    const pezzo = D.valori[id][stato.stazione].slice(stato.da, stato.a + 1);
    const cicl = id === 'DVV' || id === 'DVH';
    grafico(c, pezzo, { tipo: TIPO[id] ?? 'linea', colore: TINTA[id], cursore: stato.giorno - stato.da,
      etichette: [testoData(stato.da), testoData(stato.a)], ...(cicl ? { min: 0, max: 360 } : {}) });
  });
}

// ---------------------------------------------------------------- in basso: i valori del giorno scelto
function giornoDati() {
  const el = $('giorno-dati');
  if (stato.stazione < 0) {
    el.innerHTML = '<p class="vuoto">Scegli una stazione per vedere qui tutte le sue misure nel giorno indicato.</p>';
    return;
  }
  const s = D.stazioni[stato.stazione];
  el.innerHTML = `<h3>Grandezze misurate · ${esc(s.nome)} <span>· ${testoData(stato.giorno)}</span></h3><div class="griglia">${
    D.misure.map((m) => {
      const v = formato(valore(m.id, stato.stazione, stato.giorno), m.id);
      return `<div class="${stato.scelte.has(m.id) ? 'attiva' : ''}"><span>${esc(m.nome)}</span>${v ? `<b>${esc(v)}</b>` : '<b class="assente">nessun dato</b>'}</div>`;
    }).join('')}</div>`;
}

function scegli(i) {
  stato.stazione = i;
  map.setFilter('scelta', ['==', ['get', 'i'], i]);
  pannello();
  giornoDati();
  map.resize();
}

// ---------------------------------------------------------------- tempo: periodo (due cursori) e giorno (calendario)
function aggiornaTempo() {
  const ultimo = D.giorni - 1;
  $('da').value = stato.da; $('a').value = stato.a;
  stato.giorno = Math.max(stato.da, Math.min(stato.a, stato.giorno));    // il giorno resta dentro il periodo
  const g = $('giorno');
  g.min = isoData(stato.da); g.max = isoData(stato.a); g.value = isoData(stato.giorno);
  const n = stato.a - stato.da + 1;
  $('periodo-testo').textContent = `dal ${testoData(stato.da)} al ${testoData(stato.a)} (${n} ${n === 1 ? 'giorno' : 'giorni'})`;
  $('tratto').style.left = `${(100 * stato.da) / ultimo}%`;
  $('tratto').style.width = `${(100 * (stato.a - stato.da)) / ultimo}%`;
  $('segno-giorno').style.left = `${(100 * stato.giorno) / ultimo}%`;
  // il cursore mosso per ultimo sta sopra, cosi si possono sempre separare quando coincidono
  $('da').style.zIndex = stato.da > ultimo / 2 ? 3 : 2;
  $('a').style.zIndex = stato.da > ultimo / 2 ? 2 : 3;
  disegna();
}

// ---------------------------------------------------------------- comandi
function creaComandi() {
  $('legenda-reti').innerHTML = [...Object.entries(RETI), ['Altra rete', ALTRA_RETE]]
    .map(([r, c]) => `<span class="pallino"><i style="background:${c}"></i>${esc(r)}</span>`).join('');
  $('misura-colore').innerHTML = D.misure.map((m) => `<option value="${m.id}">${esc(m.nome)}</option>`).join('');
  $('misura-colore').onchange = (e) => {
    stato.misuraColore = e.target.value; stato.modo = 'misura';
    document.querySelector('input[name=modo][value=misura]').checked = true;
    legendaMisura(); disegna();
  };
  document.querySelectorAll('input[name=modo]').forEach((r) => { r.onchange = () => { stato.modo = r.value; legendaMisura(); disegna(); }; });

  $('misure').innerHTML = D.misure.map((m) => `<label class="riga"><input type="checkbox" value="${m.id}">
    <span>${esc(m.nome)}<small>${m.id} · ${esc(m.unita)}</small></span><span class="conta" data-conta="${m.id}" title="Stazioni con almeno un valore nel periodo"></span></label>`).join('');
  $('misure').onchange = (e) => { if (e.target.checked) stato.scelte.add(e.target.value); else stato.scelte.delete(e.target.value); disegna(); };
  const tutte = (si) => {
    stato.scelte = new Set(si ? D.misure.map((m) => m.id) : []);
    document.querySelectorAll('#misure input').forEach((c) => { c.checked = si; });
    disegna();
  };
  $('tutte').onclick = () => tutte(true);
  $('nessuna').onclick = () => tutte(false);

  const ultimo = D.giorni - 1;
  $('da').max = ultimo; $('a').max = ultimo;
  $('da').oninput = (e) => { stato.da = Math.min(Number(e.target.value), stato.a); aggiornaTempo(); };
  $('a').oninput = (e) => { stato.a = Math.max(Number(e.target.value), stato.da); aggiornaTempo(); };
  $('giorno').onchange = (e) => {
    if (!e.target.value) return;
    stato.giorno = Math.max(stato.da, Math.min(stato.a, indiceDi(e.target.value)));
    aggiornaTempo();
  };
  let html = '';
  for (let m = 0; m < 12; m++) {
    const g = Math.round((Date.UTC(D.anno, m, 1) - Date.UTC(D.anno, 0, 1)) / 86400e3);
    html += `<span style="left:${(100 * g) / ultimo}%">${MESI[m]}</span>`;
  }
  $('mesi').innerHTML = html;

  // sfondo, rilievo 3D e inclinazione
  const visibile = (id, si) => map.setLayoutProperty(id, 'visibility', si ? 'visible' : 'none');
  $('sfondo').onchange = (e) => {
    const s = e.target.value;
    visibile('satellite', s === 'satellite'); visibile('osm', s === 'osm'); visibile('isola-terra', s === 'scuro'); visibile('ombre', s === 'scuro');
  };
  const rilievo = () => {
    map.setTerrain($('rilievo3d').checked ? { source: 'quote', exaggeration: stato.esagerazione } : null);
    $('esagerazione-testo').textContent = `${stato.esagerazione.toLocaleString('it-IT')}×`;
    $('esagerazione').disabled = !$('rilievo3d').checked;
  };
  $('rilievo3d').onchange = rilievo;
  $('esagerazione').oninput = (e) => { stato.esagerazione = Number(e.target.value); rilievo(); };
  rilievo();
  $('vista-3d').onclick = () => map.easeTo({ ...VISTA_3D, duration: 800 });
  $('vista-alto').onclick = () => map.easeTo({ pitch: 0, bearing: 0, duration: 800 });
  const f = D.fonti;
  $('fonte').innerHTML = `Misure: <a href="${esc(f.dati.pagina)}" target="_blank" rel="noopener">${esc(f.dati.file)}</a>.<br>
    Stazioni: <a href="${esc(f.anagrafica.pagina)}" target="_blank" rel="noopener">${esc(f.anagrafica.file)}</a>.<br>Fonte: ARPAS. Contorno: © OpenStreetMap.`;
  window.addEventListener('resize', () => { if (stato.stazione >= 0) pannello(); });
}

// Apertura in uno stato preciso tramite l'indirizzo. Esempio:
// ?misure=TCH,PCG&colore=TCH&da=2023-07-01&a=2023-07-31&giorno=2023-07-18&stazione=NU061S226&centro=9.2,40.0&zoom=9&pitch=55
// Parametri: misure (codici separati da virgola, oppure "tutte"), modo (rete|misura), colore (codice), da, a, giorno (AAAA-MM-GG),
// stazione (codice), sfondo (satellite|osm|scuro), rilievo (0 per spegnerlo), esagerazione, centro (lon,lat), zoom, pitch, bearing.
function applicaIndirizzo() {
  const p = new URLSearchParams(location.search);
  if (![...p.keys()].length) return;
  const data = (k) => (p.has(k) ? Math.max(0, Math.min(D.giorni - 1, indiceDi(p.get(k)))) : null);
  const m = p.get('misure');
  if (m) {
    stato.scelte = new Set(m === 'tutte' ? D.misure.map((x) => x.id) : m.split(',').filter((id) => conteggi[id]));
    document.querySelectorAll('#misure input').forEach((c) => { c.checked = stato.scelte.has(c.value); });
  }
  const c = p.get('colore');
  if (c && conteggi[c]) { stato.misuraColore = c; $('misura-colore').value = c; stato.modo = 'misura'; }
  if (['rete', 'misura'].includes(p.get('modo'))) stato.modo = p.get('modo');
  document.querySelector(`input[name=modo][value=${stato.modo}]`).checked = true;
  if (data('da') !== null) stato.da = data('da');
  if (data('a') !== null) stato.a = Math.max(stato.da, data('a'));
  if (data('giorno') !== null) stato.giorno = data('giorno');
  const s = D.stazioni.findIndex((x) => x.cod === p.get('stazione'));
  if (s >= 0) stato.stazione = s;
  if (p.has('sfondo')) { $('sfondo').value = p.get('sfondo'); $('sfondo').dispatchEvent(new Event('change')); }
  if (p.get('rilievo') === '0') { $('rilievo3d').checked = false; $('rilievo3d').dispatchEvent(new Event('change')); }
  if (p.has('esagerazione')) { $('esagerazione').value = p.get('esagerazione'); $('esagerazione').dispatchEvent(new Event('input')); }
  const vista = {};
  if (p.has('centro')) vista.center = p.get('centro').split(',').map(Number);
  for (const k of ['zoom', 'pitch', 'bearing']) if (p.has(k)) vista[k] = Number(p.get(k));
  if (Object.keys(vista).length) map.jumpTo(vista);
}

async function avvio() {
  const [dati, isola] = await Promise.all(['data/dati_2023.json', 'data/sardegna.geojson'].map((u) => fetch(u).then((r) => {
    if (!r.ok) throw new Error(`${u}: ${r.status}`);
    return r.json();
  })));
  D = dati;
  preparaConteggi();
  stato.a = D.giorni - 1;
  await creaMappa(isola);
  creaComandi();
  applicaIndirizzo();
  legendaMisura();
  aggiornaTempo();
  if (stato.stazione >= 0) scegli(stato.stazione);
  map.once('idle', () => { window.astraPronta = true; });   // segnale usato da chi cattura la mappa in automatico
}

avvio().catch((e) => { $('avviso').hidden = false; $('avviso').textContent = `Errore di avvio: ${e.message}`; console.error(e); });
