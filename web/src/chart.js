// Grafico su canvas di una serie giornaliera: linea (interrotta dove manca il dato), barre o punti; cursore sul giorno scelto.
export function grafico(canvas, valori, { tipo = 'linea', cursore = -1, etichette = ['', ''], colore = '#7fd1c7', min = null, max = null } = {}) {
  const dpr = window.devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = w * dpr; canvas.height = h * dpr;
  const g = canvas.getContext('2d');
  g.scale(dpr, dpr);
  g.clearRect(0, 0, w, h);
  const stile = getComputedStyle(document.documentElement);
  const tenue = stile.getPropertyValue('--bordo').trim(), testo = stile.getPropertyValue('--testo2').trim();
  const m = { s: 38, d: 8, a: 8, b: 18 };
  const validi = valori.filter((v) => v !== null);
  let lo = min ?? Math.min(...validi), hi = max ?? Math.max(...validi);
  if (tipo === 'barre' && min === null) lo = 0;
  if (hi - lo < 1e-9) hi = lo + 1;
  const n = valori.length;
  const X = (i) => m.s + (n === 1 ? 0.5 : i / (n - 1)) * (w - m.s - m.d);
  const Y = (v) => h - m.b - ((v - lo) / (hi - lo)) * (h - m.a - m.b);

  g.font = '11px system-ui, sans-serif';
  g.strokeStyle = tenue; g.fillStyle = testo; g.lineWidth = 1; g.textAlign = 'right'; g.textBaseline = 'middle';
  for (const v of [lo, (lo + hi) / 2, hi]) {
    g.beginPath(); g.moveTo(m.s, Y(v)); g.lineTo(w - m.d, Y(v)); g.stroke();
    g.fillText(hi - lo < 10 ? v.toFixed(1) : Math.round(v), m.s - 5, Y(v));
  }
  g.textBaseline = 'alphabetic'; g.textAlign = 'left'; g.fillText(etichette[0], m.s, h - 4);
  g.textAlign = 'right'; g.fillText(etichette[1], w - m.d, h - 4);

  g.strokeStyle = colore; g.fillStyle = colore; g.lineWidth = 1.5;
  if (tipo === 'barre') {
    const lb = Math.max(1, (w - m.s - m.d) / n - 1);
    valori.forEach((v, i) => { if (v !== null) g.fillRect(X(i) - lb / 2, Y(v), lb, Math.max(1, Y(lo) - Y(v))); });
  } else if (tipo === 'punti') {
    valori.forEach((v, i) => { if (v !== null) { g.beginPath(); g.arc(X(i), Y(v), 1.8, 0, 7); g.fill(); } });
  } else {
    g.beginPath();
    let penna = false;
    valori.forEach((v, i) => {
      if (v === null) { penna = false; return; }
      if (penna) g.lineTo(X(i), Y(v)); else g.moveTo(X(i), Y(v));
      penna = true;
    });
    g.stroke();
    // i valori isolati tra due buchi non formano una linea: li segno con un punto
    valori.forEach((v, i) => {
      if (v !== null && (n < 70 || ((valori[i - 1] ?? null) === null && (valori[i + 1] ?? null) === null))) { g.beginPath(); g.arc(X(i), Y(v), 1.8, 0, 7); g.fill(); }
    });
  }
  if (cursore >= 0 && cursore < n) {
    g.strokeStyle = '#ffffff'; g.lineWidth = 1; g.setLineDash([3, 3]);
    g.beginPath(); g.moveTo(X(cursore), m.a); g.lineTo(X(cursore), h - m.b); g.stroke(); g.setLineDash([]);
  }
}
