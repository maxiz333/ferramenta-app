// ══ MOVIMENTI & FEATURES ══════════════════════════════════════════
// [SECTION: MOVIMENTI] -----------------------------------------------------
//  Storico movimenti magazzino (vendite, carichi, rettifiche)
var MOVK_MAX = 2000; // max movimenti salvati

function registraMovimento(rowIdx, tipo, delta, qtyPrima, qtyDopo, note){
  // tipo: 'vendita' | 'carico' | 'rettifica' | 'ordine'
  var r = rows[rowIdx] || {};
  var mov = {
    id: 'mv_' + Date.now() + '_' + rowIdx,
    rowIdx: rowIdx,
    desc: r.desc || '',
    codF: r.codF || '',
    tipo: tipo,
    delta: delta,        // es: -1 (vendita) +5 (carico)
    qtyPrima: qtyPrima,
    qtyDopo: qtyDopo,
    note: note || '',
    ts: new Date().toISOString(),
    ora: new Date().toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'}),
    data: new Date().toLocaleDateString('it-IT')
  };
  movimenti.unshift(mov);
  // Taglia a MOVK_MAX
  if(movimenti.length > MOVK_MAX) movimenti = movimenti.slice(0, MOVK_MAX);
  lsSet(MOVK, movimenti);
  updateMovBadge();
}

function updateMovBadge(){
  // Badge con movimenti di oggi
  var oggi = new Date().toLocaleDateString('it-IT');
  var n = movimenti.filter(function(m){ return m.data === oggi; }).length;
  var b = document.getElementById('mov-badge');
  if(b){ b.textContent = n; b.style.display = n ? '' : 'none'; }
}


// ---------------------------------------------------------------
//  RENDER MOVIMENTI
// ---------------------------------------------------------------
var movFiltro = 'tutti';

function filterMov(f){
  movFiltro = f;
  ['tutti','vendita','carico','ordine','rettifica'].forEach(function(x){
    var btn = document.getElementById('mov-f-'+x);
    if(!btn) return;
    var on = (x===f);
    btn.style.background = on ? 'var(--accent)' : 'transparent';
    btn.style.color = on ? '#111' : 'var(--muted)';
    btn.style.borderColor = on ? 'var(--accent)' : 'var(--border)';
  });
  renderMovimenti();
}

function clearMovimenti(){
  showConfirm('Eliminare tutto lo storico movimenti?', function(){

  movimenti = [];
  lsSet(MOVK, movimenti);
  updateMovBadge();
  renderMovimenti();

  });
}

function renderMovimenti(){
  var list = document.getElementById('mov-list');
  var statsEl = document.getElementById('mov-stats');
  if(!list) return;

  var search = (document.getElementById('mov-search')||{}).value||'';
  var filtered = movimenti.filter(function(m){
    if(movFiltro !== 'tutti' && m.tipo !== movFiltro) return false;
    if(search && !fuzzyMatch(search, m.desc + ' ' + m.codF)) return false;
    return true;
  });

  // Stats
  var oggi = new Date().toLocaleDateString('it-IT');
  var venditeOggi = movimenti.filter(function(m){ return m.data===oggi && (m.tipo==='vendita'||m.tipo==='ordine'); }).length;
  var carichiOggi = movimenti.filter(function(m){ return m.data===oggi && m.tipo==='carico'; }).length;
  var totMovimenti = movimenti.length;
  if(statsEl) statsEl.innerHTML =
    '<div class="sc"><span class="n">'+totMovimenti+'</span>Totale</div>'+
    '<div class="sc r"><span class="n" style="color:#fc8181;">'+venditeOggi+'</span>Vendite oggi</div>'+
    '<div class="sc g"><span class="n" style="color:#68d391;">'+carichiOggi+'</span>Carichi oggi</div>';

  if(!filtered.length){
    list.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted);">- Nessun movimento</div>';
    return;
  }

  // Raggruppa per data
  var gruppi = {};
  filtered.forEach(function(m){
    if(!gruppi[m.data]) gruppi[m.data] = [];
    gruppi[m.data].push(m);
  });

  var html = '';
  Object.keys(gruppi).forEach(function(data){
    html += '<div style="font-size:11px;color:var(--muted);font-weight:700;text-transform:uppercase;letter-spacing:.5px;padding:8px 0 4px;border-bottom:1px solid var(--border);margin-bottom:6px;">'+data+'</div>';
    gruppi[data].forEach(function(m){
      var isVendita = m.tipo==='vendita'||m.tipo==='ordine';
      var isCarico  = m.tipo==='carico';
      var tipoColor = isVendita ? '#fc8181' : isCarico ? '#68d391' : '#888';
      var tipoIcon  = isVendita ? '-' : isCarico ? '-' : m.tipo==='ordine' ? '-' : '--';
      var deltaStr  = (m.delta > 0 ? '+' : '') + m.delta;
      var qStr = (m.qtyPrima!==null&&m.qtyPrima!==undefined ? m.qtyPrima : '?') + ' - ' + (m.qtyDopo!==null&&m.qtyDopo!==undefined ? m.qtyDopo : '?');

      html += '<div onclick="openMovDetail('+m.rowIdx+')" style="background:#1e1e1e;border:1px solid var(--border);border-left:3px solid '+tipoColor+';border-radius:8px;padding:9px 12px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;gap:10px;cursor:pointer;" onmouseover="this.style.background=\'#252525\'" onmouseout="this.style.background=\'#1e1e1e\'">';
      // Sinistra: ora + prodotto
      html += '<div style="flex:1;min-width:0;">';
      html += '<div style="display:flex;align-items:baseline;gap:6px;">';
      html += '<span style="font-size:10px;color:var(--muted);font-variant-numeric:tabular-nums;white-space:nowrap;">'+m.ora+'</span>';
      html += '<span style="font-size:12px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+esc(m.desc)+'</span>';
      html += '</div>';
      if(m.codF) html += '<div style="font-size:10px;color:#fc8181;margin-top:1px;">'+esc(m.codF)+'</div>';
      if(m.note) html += '<div style="font-size:10px;color:var(--muted);font-style:italic;margin-top:1px;">'+esc(m.note)+'</div>';
      html += '</div>';
      // Destra: tipo + delta + qty
      html += '<div style="text-align:right;flex-shrink:0;">';
      html += '<div style="font-size:13px;font-weight:900;color:'+tipoColor+';">'+tipoIcon+' '+deltaStr+'</div>';
      html += '<div style="font-size:10px;color:var(--muted);margin-top:2px;">'+qStr+'</div>';
      html += '</div>';
      html += '</div>';
    });
  });

  list.innerHTML = html;
}


function openMovProdotto(i){
  // Vai alla tab movimenti e filtra per descrizione
  goTab('tmov');
  var r=rows[i]||{};
  var search=document.getElementById('mov-search');
  if(search){ search.value=r.desc||r.codF||''; }
  renderMovimenti();
}


function closeMovDetail(){
  var el = document.getElementById('mov-detail');
  if(el) el.classList.remove('open');
}

function openMovDetail(rowIdx){
  var body = document.getElementById('mov-detail-body');
  if(!body) return;
  var r   = rows[rowIdx] || {};
  var m   = magazzino[rowIdx] || {};
  var qty = m.qty !== undefined && m.qty !== '' ? Number(m.qty) : null;
  var soglia = getSoglia(rowIdx);
  var isLow  = qty !== null && qty <= soglia;

  // Calcola valore magazzino
  var prezzoVend = (r.prezzo);
  var prezzoAcq  =  parsePriceIT(m.prezzoAcquisto);
  var valMag     = qty !== null ? (prezzoVend * qty).toFixed(2) : '-';
  var costoMag   = qty !== null && prezzoAcq ? (prezzoAcq * qty).toFixed(2) : '-';
  var margine    = prezzoAcq && prezzoVend ? (((prezzoVend - prezzoAcq) / prezzoVend)*100).toFixed(1) : null;

  // Tutti i movimenti di questo prodotto
  var movProd = movimenti.filter(function(mv){ return mv.rowIdx === rowIdx; });
  var totVenduto = movProd
    .filter(function(mv){ return mv.tipo==='vendita'||mv.tipo==='ordine'; })
    .reduce(function(s,mv){ return s + Math.abs(mv.delta||0); }, 0);
  var totCaricato = movProd
    .filter(function(mv){ return mv.tipo==='carico'; })
    .reduce(function(s,mv){ return s + Math.abs(mv.delta||0); }, 0);
  var primoMov = movProd.length ? movProd[movProd.length-1] : null;
  var ultimoMov = movProd.length ? movProd[0] : null;

  var html = '';

  // -- Intestazione prodotto
  html += '<div style="background:#111;border-radius:10px;padding:12px 14px;margin-bottom:12px;">';
  html += '<div style="font-size:15px;font-weight:900;color:var(--text);margin-bottom:4px;">'+esc(r.desc||'-')+'</div>';
  html += '<div style="display:flex;gap:10px;flex-wrap:wrap;font-size:11px;">';
  html += '<span style="color:#fc8181;">- '+esc(r.codF||'-')+'</span>';
  html += '<span style="color:var(--accent);">-- '+esc(r.codM||'-')+'</span>';
  if(m.marca) html += '<span style="color:var(--muted);">- '+esc(m.marca)+'</span>';
  if(m.nomeFornitore) html += '<span style="color:var(--muted);">- '+esc(m.nomeFornitore)+'</span>';
  html += '</div>';
  if(m.specs) html += '<div style="font-size:11px;color:#2dd4bf;font-style:italic;margin-top:5px;">- '+esc(m.specs)+'</div>';
  if(m.posizione) html += '<div style="font-size:11px;color:#888;margin-top:3px;">- '+esc(m.posizione)+'</div>';
  html += '</div>';

  // -- Dati economici
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px;">';

  html += '<div style="background:#1e1e1e;border:1px solid var(--border);border-radius:8px;padding:10px 12px;">';
  html += '<div style="font-size:10px;color:var(--muted);margin-bottom:2px;">- Prezzo vendita</div>';
  html += '<div style="font-size:20px;font-weight:900;color:var(--accent);">- '+esc(r.prezzo||'0')+'</div>';
  if(r.prezzoOld) html += '<div style="font-size:10px;color:#555;text-decoration:line-through;">era - '+esc(r.prezzoOld)+'</div>';
  html += '</div>';

  html += '<div style="background:#1e1e1e;border:1px solid var(--border);border-radius:8px;padding:10px 12px;">';
  html += '<div style="font-size:10px;color:#555;margin-bottom:2px;">- Costo acquisto</div>';
  html += '<div style="font-size:20px;font-weight:900;color:#555;">- '+(m.prezzoAcquisto||'-')+'</div>';
  if(margine) html += '<div style="font-size:10px;color:#68d391;">margine '+margine+'%</div>';
  html += '</div>';

  html += '<div style="background:#1e1e1e;border:1px solid var(--border)';
  html += (isLow?';border-color:#e53e3e':'');
  html += ';border-radius:8px;padding:10px 12px;">';
  html += '<div style="font-size:10px;color:var(--muted);margin-bottom:2px;">- Giacenza attuale</div>';
  html += '<div style="font-size:20px;font-weight:900;color:'+(isLow?'#e53e3e':'var(--accent)')+';">'+(qty!==null?qty:'-')+' '+(m.unit||'pz')+'</div>';
  html += '<div style="font-size:10px;color:'+(isLow?'#e53e3e':'var(--muted)')+';">min: '+soglia+(isLow?' -- SOTTO SCORTA':'')+'</div>';
  html += '</div>';

  html += '<div style="background:#1e1e1e;border:1px solid var(--border);border-radius:8px;padding:10px 12px;">';
  html += '<div style="font-size:10px;color:var(--muted);margin-bottom:2px;">- Valore magazzino</div>';
  html += '<div style="font-size:18px;font-weight:900;color:#68d391;">- '+valMag+'</div>';
  if(costoMag!=='-') html += '<div style="font-size:10px;color:#555;">costo: - '+costoMag+'</div>';
  html += '</div>';

  html += '</div>';

  // -- Statistiche movimenti
  html += '<div style="background:#1e1e1e;border:1px solid var(--border);border-radius:8px;padding:10px 14px;margin-bottom:12px;">';
  html += '<div style="font-size:11px;font-weight:700;color:var(--accent);margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px;">- Statistiche movimenti</div>';
  html += '<div style="display:flex;gap:16px;flex-wrap:wrap;">';
  html += '<div><div style="font-size:11px;color:var(--muted);">Totale movimenti</div><div style="font-size:18px;font-weight:900;color:var(--text);">'+movProd.length+'</div></div>';
  html += '<div><div style="font-size:11px;color:#fc8181;">Totale venduto</div><div style="font-size:18px;font-weight:900;color:#fc8181;">'+totVenduto+' '+(m.unit||'pz')+'</div></div>';
  html += '<div><div style="font-size:11px;color:#68d391;">Totale caricato</div><div style="font-size:18px;font-weight:900;color:#68d391;">'+totCaricato+' '+(m.unit||'pz')+'</div></div>';
  if(primoMov) html += '<div><div style="font-size:11px;color:var(--muted);">Primo movimento</div><div style="font-size:12px;font-weight:700;color:var(--text);">'+primoMov.data+'</div></div>';
  if(ultimoMov) html += '<div><div style="font-size:11px;color:var(--muted);">Ultimo movimento</div><div style="font-size:12px;font-weight:700;color:var(--text);">'+ultimoMov.data+' '+ultimoMov.ora+'</div></div>';
  html += '</div>';
  html += '</div>';

  // -- Storico prezzi
  if(r.priceHistory && r.priceHistory.length){
    html += '<div style="background:#1e1e1e;border:1px solid var(--border);border-radius:8px;padding:10px 14px;margin-bottom:12px;">';
    html += '<div style="font-size:11px;font-weight:700;color:var(--accent);margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px;">- Storico prezzi</div>';
    var history = r.priceHistory.slice().reverse();
    history.forEach(function(h){
      html += '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #2a2a2a;font-size:12px;">';
      html += '<span style="color:var(--muted);">'+esc(h.data||'')+'</span>';
      html += '<span style="color:var(--text);font-weight:700;">- '+esc(h.prezzo||'')+'</span>';
      html += '</div>';
    });
    html += '</div>';
  }

  // -- Ultimi movimenti di questo prodotto
  if(movProd.length){
    html += '<div style="background:#1e1e1e;border:1px solid var(--border);border-radius:8px;padding:10px 14px;">';
    html += '<div style="font-size:11px;font-weight:700;color:var(--accent);margin-bottom:8px;text-transform:uppercase;letter-spacing:.5px;">- Ultimi movimenti</div>';
    movProd.slice(0,20).forEach(function(mv){
      var isV = mv.tipo==='vendita'||mv.tipo==='ordine';
      var col = isV ? '#fc8181' : mv.tipo==='carico' ? '#68d391' : '#888';
      var icon = isV ? '-' : mv.tipo==='carico' ? '-' : '--';
      var dStr = (mv.delta>0?'+':'')+mv.delta;
      html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid #2a2a2a;font-size:12px;">';
      html += '<div>';
      html += '<span style="color:var(--muted);font-size:10px;">'+mv.data+' '+mv.ora+'</span>';
      if(mv.note) html += ' <span style="color:var(--muted);font-size:10px;font-style:italic;">- '+esc(mv.note)+'</span>';
      html += '</div>';
      html += '<div style="text-align:right;">';
      html += '<span style="color:'+col+';font-weight:900;">'+icon+' '+dStr+'</span>';
      html += '<span style="color:var(--muted);font-size:10px;margin-left:6px;">'+(mv.qtyPrima!==null&&mv.qtyPrima!==undefined?mv.qtyPrima:'?')+' - '+(mv.qtyDopo!==null&&mv.qtyDopo!==undefined?mv.qtyDopo:'?')+'</span>';
      html += '</div>';
      html += '</div>';
    });
    html += '</div>';
  } else {
    html += '<div style="text-align:center;padding:16px;color:var(--muted);font-size:12px;">Nessun movimento registrato per questo articolo.</div>';
  }

  // -- Bottone modifica
  html += '<div style="margin-top:14px;">';
  html += '<button onclick="closeMovDetail();openEditProdotto('+rowIdx+')" '+
    'style="width:100%;padding:10px;border-radius:10px;border:none;background:var(--accent);color:#111;font-size:13px;font-weight:900;cursor:pointer;">-- Modifica articolo</button>';
  html += '</div>';

  body.innerHTML = html;
  document.getElementById('mov-detail').classList.add('open');
}


// -- Popup verticale Cartellin. ----------------------------------------
var _cartellinTapTimer = null;
var _cartellinPopupOpen = false;

function handleCartellinTap(btn){
  if(_cartellinTapTimer){
    // Secondo tap: apri popup
    clearTimeout(_cartellinTapTimer);
    _cartellinTapTimer = null;
    toggleCartellinPopup(btn);
  } else {
    // Primo tap: aspetta 320ms per vedere se arriva il secondo
    _cartellinTapTimer = setTimeout(function(){
      _cartellinTapTimer = null;
      // Tap singolo confermato - vai ai cartellini
      goTab('t1');
    }, 320);
  }
}

function toggleCartellinPopup(btn){
  var popup = document.getElementById('cartellin-popup');
  var backdrop = document.getElementById('cartellin-popup-backdrop');
  if(!popup) return;
  if(_cartellinPopupOpen){
    closeCartellinPopup();
  } else {
    // Posiziona il popup sopra il bottone
    var rect = btn.getBoundingClientRect();
    popup.style.left = Math.max(4, rect.left - (popup.offsetWidth||110)/2 + rect.width/2) + 'px';
    popup.classList.add('open');
    backdrop.style.display = 'block';
    _cartellinPopupOpen = true;
    // Sincronizza badge pb2
    var pb = document.getElementById('pb2');
    var pbp = document.getElementById('pb2-pop');
    if(pb && pbp){ pbp.textContent=pb.textContent; pbp.style.display=pb.style.display; }
  }
}

function closeCartellinPopup(){
  var popup = document.getElementById('cartellin-popup');
  var backdrop = document.getElementById('cartellin-popup-backdrop');
  if(popup) popup.classList.remove('open');
  if(backdrop) backdrop.style.display = 'none';
  _cartellinPopupOpen = false;
}

// -- Popup verticale Fatture (doppio tap) -----------------------------
var _fattureTapTimer = null;
var _fatturePopupOpen = false;

function handleFattureTap(btn){
  if(_fattureTapTimer){
    clearTimeout(_fattureTapTimer);
    _fattureTapTimer = null;
    toggleFatturePopup(btn);
  } else {
    _fattureTapTimer = setTimeout(function(){
      _fattureTapTimer = null;
      goTab('tfat');
    }, 320);
  }
}

function toggleFatturePopup(btn){
  var popup = document.getElementById('fatture-popup');
  var backdrop = document.getElementById('fatture-popup-backdrop');
  if(!popup) return;
  if(_fatturePopupOpen){
    closeFatturePopup();
  } else {
    var rect = btn.getBoundingClientRect();
    popup.style.left = Math.max(4, rect.left - (popup.offsetWidth||130)/2 + rect.width/2) + 'px';
    popup.classList.add('open');
    backdrop.style.display = 'block';
    _fatturePopupOpen = true;
  }
}

function closeFatturePopup(){
  var popup = document.getElementById('fatture-popup');
  var backdrop = document.getElementById('fatture-popup-backdrop');
  if(popup) popup.classList.remove('open');
  if(backdrop) backdrop.style.display = 'none';
  _fatturePopupOpen = false;
}

// ------------------------------------------------------------------
//  FEATURE 5 - Duplica articolo
// ------------------------------------------------------------------
function duplicaArticolo(i) {
  if (i === null || !rows[i]) return;
  showConfirm('⚠️ Duplicare "' + (rows[i].desc||'Articolo') + '" come NUOVO articolo nel database?', function(){
    var nr = JSON.parse(JSON.stringify(rows[i]));
    nr.desc = (nr.desc || 'Articolo') + ' (copia)';
    nr.codM = '';
    nr.priceHistory = [];
    rows.push(nr);
    var ni = rows.length - 1;
    if (magazzino[i]) {
      magazzino[ni] = JSON.parse(JSON.stringify(magazzino[i]));
      magazzino[ni].qty = 0;
      magazzino[ni].correlati = [];
    } else {
      magazzino[ni] = { qty: 0, unit: 'pz' };
    }
    lsSet(SK, rows);
    lsSet(MAGK, magazzino);
    renderInventario();
    cancelEditProdotto();
    setTimeout(function () { openEditProdotto(ni); }, 80);
    showToastGen('green', '\u2705 Articolo duplicato — modifica la copia');
  });
}

// ------------------------------------------------------------------
//  Toast generico (color = 'green' | 'purple' | 'blue')
// ------------------------------------------------------------------
var _toastGenTimer = null;
var _TOAST_COLORS = { green: '#38a169', purple: '#805ad5', blue: '#3182ce', red: '#e53e3e' };
function showToastGen(color, msg) {
  var el = document.getElementById('scorta-toast');
  if (!el) return;
  el.textContent = msg;
  el.style.background = _TOAST_COLORS[color] || _TOAST_COLORS.red;
  el.classList.add('show');
  if (_toastGenTimer) clearTimeout(_toastGenTimer);
  _toastGenTimer = setTimeout(function () {
    el.classList.remove('show');
    el.style.background = _TOAST_COLORS.red;
  }, 3800);
}

// -- Dialogo di conferma custom (confirm() bloccato in WebView) ----------
// [dedup rimosso]
function showConfirm(msg, onOk){
  _confirmCb=onOk;
  var ov=document.getElementById('confirm-overlay');
  var txt=document.getElementById('confirm-msg');
  if(!ov) return; // fallback
  if(txt) txt.textContent=msg;
  ov.classList.add('open');
}
function _confirmOk(){
  var ov=document.getElementById('confirm-overlay');
  if(ov) ov.classList.remove('open');
  if(_confirmCb){ _confirmCb(); _confirmCb=null; }
}
function _confirmCancel(){
  var ov=document.getElementById('confirm-overlay');
  if(ov) ov.classList.remove('open');
  _confirmCb=null;
}

// ------------------------------------------------------------------
//  FEATURE 7 - Backup automatico
// ------------------------------------------------------------------
var BAK_INT_K = 'cp4_backup_interval';
var BAK_LAST_K = 'cp4_backup_last';

function getBackupInterval() {
  var v = localStorage.getItem(BAK_INT_K);
  return v !== null ? parseInt(v) : 7;
}
function setBackupInterval(days) {
  localStorage.setItem(BAK_INT_K, String(days));
  renderBackupSettings();
}
function getLastBackupDate() { return localStorage.getItem(BAK_LAST_K) || null; }
function markBackupDone() { localStorage.setItem(BAK_LAST_K, new Date().toISOString().split('T')[0]); }

function checkAutoBackup() {
  var interval = getBackupInterval();
  if (interval === 0) return;
  var last = getLastBackupDate();
  if (!last) { markBackupDone(); return; }
  var days = Math.floor((Date.now() - new Date(last).getTime()) / 86400000);
  if (days >= interval) {
    showToastGen('purple', '\uD83D\uDCBE Backup automatico in corso\u2026');
    setTimeout(function () { eseguiBackup(true); }, 800);
  }
}

function eseguiBackup(silent) {
  var data = {
    version: 4, date: new Date().toISOString(),
    rows: rows, magazzino: magazzino, categorie: categorie,
    movimenti: movimenti, ordini: ordini, carrelli: carrelli
  };
  var blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  var d = new Date();
  var ds = d.getFullYear() + '-' + String(d.getMonth()+1).padStart(2,'0') + '-' + String(d.getDate()).padStart(2,'0');
  a.href = url; a.download = 'rattazzi_backup_' + ds + '.json';
  document.body.appendChild(a); a.click();
  document.body.removeChild(a); URL.revokeObjectURL(url);
  markBackupDone();
  showToastGen('green', silent ? '\u2705 Backup automatico completato' : '\u2705 Backup scaricato!');
  renderBackupSettings();
}

function renderBackupSettings() {
  var el = document.getElementById('backup-auto-settings');
  if (!el) return;
  var interval = getBackupInterval();
  var last = getLastBackupDate();
  var opts = [
    { v: 0, l: 'Disabilitato' }, { v: 1, l: '1 giorno' }, { v: 3, l: '3 giorni' },
    { v: 7, l: '7 giorni' }, { v: 14, l: '14 giorni' }, { v: 30, l: '30 giorni' }
  ];
  var selHtml = opts.map(function (o) {
    return '<option value="' + o.v + '"' + (interval === o.v ? ' selected' : '') + '>' + o.l + '</option>';
  }).join('');
  el.innerHTML =
    '<div style="background:#1e1e1e;border:1px solid var(--border);border-radius:10px;padding:12px;margin-bottom:16px;">' +
    '<div style="font-size:11px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px;">\uD83D\uDCBE Backup automatico</div>' +
    '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">' +
    '<span style="font-size:12px;color:var(--text);">Frequenza:</span>' +
    '<select onchange="setBackupInterval(parseInt(this.value))" style="padding:6px 8px;border:1px solid var(--border);border-radius:6px;background:#111;color:var(--text);font-size:12px;">' +
    selHtml + '</select>' +
    '<button onclick="eseguiBackup(false)" style="padding:7px 14px;border-radius:8px;border:none;background:var(--accent);color:#111;font-size:12px;font-weight:700;cursor:pointer;">\u2B07\uFE0F Scarica ora</button>' +
    '</div>' +
    (last ? '<div style="font-size:10px;color:var(--muted);margin-top:6px;">Ultimo backup: ' + last + '</div>' : '<div style="font-size:10px;color:#777;margin-top:6px;">Nessun backup ancora effettuato</div>') +
    '</div>';
}

// ------------------------------------------------------------------
//  FEATURE 1 - Stampa lista riordino (apre finestra stampabile)
// ------------------------------------------------------------------
function stampaListaRiordino() {
  var sotto = [];
  rows.forEach(function (r, i) {
    if (removed.has(String(i))) return;
    var m = magazzino[i] || {};
    var qty = m.qty !== undefined && m.qty !== '' ? Number(m.qty) : null;
    var soglia = getSoglia(i);
    if (qty !== null && qty <= soglia) sotto.push({ r: r, m: m, i: i, qty: qty, soglia: soglia });
  });
  if (!sotto.length) { showToastGen('green', '\u2705 Nessun prodotto sotto scorta!'); return; }

  var gruppi = {};
  sotto.forEach(function (item) {
    var k = item.m.nomeFornitore || '(Fornitore non specificato)';
    if (!gruppi[k]) gruppi[k] = [];
    gruppi[k].push(item);
  });

  var oggi = new Date().toLocaleDateString('it-IT');
  var H = [];
  H.push('<!DOCTYPE html><html><head><meta charset="utf-8">');
  H.push('<title>Lista Riordino - ' + oggi + '</title>');
  H.push('<style>body{font-family:Arial,sans-serif;font-size:12px;color:#111;margin:20px}');
  H.push('h1{font-size:18px;margin-bottom:2px}h2{font-size:13px;margin:14px 0 5px;color:#555;border-bottom:1px solid #ccc;padding-bottom:3px}');
  H.push('table{width:100%;border-collapse:collapse;margin-bottom:10px}');
  H.push('th{background:#f0f0f0;padding:5px 7px;text-align:left;font-size:10px;border:1px solid #ccc}');
  H.push('td{padding:5px 7px;border:1px solid #ddd;vertical-align:top}');
  H.push('tr:nth-child(even){background:#fafafa}.qty{font-weight:bold;color:#c00}');
  H.push('@media print{@page{margin:15mm}button{display:none}}</style></head><body>');
  H.push('<div style="display:flex;justify-content:space-between;align-items:flex-start">');
  H.push('<div><h1>\uD83D\uDD34 Lista Riordino \u2014 Ferramenta Rattazzi</h1>');
  H.push('<p style="color:#777;margin:2px 0">' + oggi + '</p></div>');
  H.push('<div style="text-align:right;font-size:11px;color:#888"><b>' + sotto.length + '</b> articoli &nbsp; <b>' + Object.keys(gruppi).length + '</b> fornitori</div></div>');
  H.push('<button onclick="window.print()" style="margin:10px 0;padding:8px 16px;background:#c00;color:#fff;border:none;border-radius:6px;font-size:13px;cursor:pointer;">\uD83D\uDDA8\uFE0F Stampa</button>');
  H.push('<hr style="margin:8px 0">');

  Object.keys(gruppi).sort().forEach(function (forn) {
    H.push('<h2>\uD83C\uDFE2 ' + forn + '</h2>');
    H.push('<table><thead><tr>');
    H.push('<th>Descrizione</th><th>Cod. Forn.</th><th>Mio Cod.</th><th>Specifiche</th><th>Posizione</th>');
    H.push('<th style="text-align:center">Qt&agrave; att.</th><th style="text-align:center">Scorta min.</th><th style="text-align:center">Da ordinare</th>');
    H.push('</tr></thead><tbody>');
    gruppi[forn].forEach(function (item) {
      var da = Math.max(0, item.soglia * 3 - item.qty);
      H.push('<tr>');
      H.push('<td>' + (item.r.desc || '&mdash;') + '</td>');
      H.push('<td style="color:#c00">' + (item.r.codF || '&mdash;') + '</td>');
      H.push('<td>' + (item.r.codM || '') + '</td>');
      H.push('<td style="color:#0a7a7a;font-style:italic">' + (item.m.specs || '') + '</td>');
      H.push('<td style="color:#888">' + (item.m.posizione || '') + '</td>');
      H.push('<td class="qty" style="text-align:center">' + item.qty + '&nbsp;' + (item.m.unit || 'pz') + '</td>');
      H.push('<td style="text-align:center">' + item.soglia + '</td>');
      H.push('<td style="text-align:center;font-weight:bold">' + da + '&nbsp;' + (item.m.unit || 'pz') + '</td>');
      H.push('</tr>');
    });
    H.push('</tbody></table>');
  });

  H.push('<div style="margin-top:16px;font-size:10px;color:#aaa">Generato da Ferramenta Rattazzi &mdash; ' + new Date().toLocaleString('it-IT') + '</div>');
  H.push('</body></html>');

  var w = window.open('', '_blank');
  if (!w) { showToastGen('blue', '\u26A0\uFE0F Abilita i popup nel browser per stampare'); return; }
  w.document.write(H.join(''));
  w.document.close();
  w.focus();
}

// ------------------------------------------------------------------
//  FEATURE 6 - Articoli correlati
// ------------------------------------------------------------------
function renderCorrelati(i) {
  var listEl = document.getElementById('ep-correlati-list');
  var selEl  = document.getElementById('ep-correlati-add');
  if (!listEl || !selEl) return;
  var m = magazzino[i] || {};
  var corr = m.correlati || [];
  var html = '';
  corr.forEach(function (ri) {
    if (!rows[ri]) return;
    html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:4px 8px;background:#1a1a1a;border-radius:6px;margin-bottom:4px;">';
    html += '<span style="font-size:12px;color:var(--text)">' + esc(rows[ri].desc || '-') + '</span>';
    html += '<span style="font-size:10px;color:#fc8181;margin-left:6px">' + esc(rows[ri].codF || '') + '</span>';
    html += '<button onclick="rimuoviCorrelato(' + i + ',' + ri + ')" style="background:none;border:none;color:#e53e3e;cursor:pointer;font-size:15px;padding:0 4px;margin-left:auto">\u00D7</button>';
    html += '</div>';
  });
  if (!html) html = '<div style="font-size:11px;color:#555;font-style:italic">Nessun articolo correlato</div>';
  listEl.innerHTML = html;

  selEl.innerHTML = '<option value="">+ Aggiungi correlato\u2026</option>';
  rows.forEach(function (r, ri) {
    if (removed.has(String(ri))) return;
    if (ri === i) return;
    if (corr.indexOf(ri) >= 0) return;
    var opt = document.createElement('option');
    opt.value = ri;
    opt.textContent = (r.desc || '-') + (r.codF ? ' [' + r.codF + ']' : '');
    selEl.appendChild(opt);
  });
}

function aggiungiCorrelato(i) {
  var selEl = document.getElementById('ep-correlati-add');
  if (!selEl || !selEl.value) return;
  var ri = parseInt(selEl.value);
  if (!magazzino[i]) magazzino[i] = {};
  if (!magazzino[i].correlati) magazzino[i].correlati = [];
  if (magazzino[i].correlati.indexOf(ri) < 0) {
    magazzino[i].correlati.push(ri);
    if (!magazzino[ri]) magazzino[ri] = {};
    if (!magazzino[ri].correlati) magazzino[ri].correlati = [];
    if (magazzino[ri].correlati.indexOf(i) < 0) magazzino[ri].correlati.push(i);
    lsSet(MAGK, magazzino);
  }
  selEl.value = '';
  renderCorrelati(i);
}

function rimuoviCorrelato(i, ri) {
  if (!magazzino[i] || !magazzino[i].correlati) return;
  magazzino[i].correlati = magazzino[i].correlati.filter(function (x) { return x !== ri; });
  if (magazzino[ri] && magazzino[ri].correlati) {
    magazzino[ri].correlati = magazzino[ri].correlati.filter(function (x) { return x !== i; });
  }
  lsSet(MAGK, magazzino);
  renderCorrelati(i);
}

// ------------------------------------------------------------------
//  FEATURE 3 - Prezzi a scaglioni
// ------------------------------------------------------------------
function renderScaglioni(i) {
  var el = document.getElementById('ep-scaglioni-list');
  if (!el) return;
  var m = magazzino[i] || {};
  var sc = m.scaglioni || [];
  var html = '';
  sc.forEach(function (s, si) {
    html += '<div style="display:flex;gap:5px;align-items:center;margin-bottom:5px;flex-wrap:wrap;">';
    html += '<span style="font-size:11px;color:var(--muted)">da</span>';
    html += '<input type="number" min="1" value="' + (s.da || '') + '" '
      + 'onchange="updSc(' + i + ',' + si + ',\'da\',this.value)" '
      + 'style="width:46px;padding:4px;border:1px solid var(--border);border-radius:5px;background:#111;color:var(--text);font-size:12px;text-align:center">';
    html += '<span style="font-size:11px;color:var(--muted)">a</span>';
    html += '<input type="number" min="1" placeholder="\u221E" value="' + (s.a || '') + '" '
      + 'onchange="updSc(' + i + ',' + si + ',\'a\',this.value)" '
      + 'style="width:46px;padding:4px;border:1px solid var(--border);border-radius:5px;background:#111;color:var(--text);font-size:12px;text-align:center">';
    html += '<span style="font-size:11px;color:var(--muted)">pz &rarr; &euro;</span>';
    html += '<input type="text" value="' + esc(s.prezzo || '') + '" '
      + 'onchange="updSc(' + i + ',' + si + ',\'prezzo\',this.value)" '
      + 'style="width:62px;padding:4px;border:1px solid var(--border);border-radius:5px;background:#111;color:var(--accent);font-size:13px;font-weight:700;text-align:right">';
    html += '<button onclick="delSc(' + i + ',' + si + ')" '
      + 'style="background:none;border:none;color:#e53e3e;cursor:pointer;font-size:16px;padding:0 2px">&times;</button>';
    html += '</div>';
  });
  el.innerHTML = html || '<div style="font-size:10px;color:#555;font-style:italic">Nessuno scaglione - cliccate + per aggiungerne uno</div>';
}

function addSc(i) {
  if (!magazzino[i]) magazzino[i] = {};
  if (!magazzino[i].scaglioni) magazzino[i].scaglioni = [];
  var sc = magazzino[i].scaglioni;
  var prevA = sc.length ? (sc[sc.length - 1].a || null) : null;
  sc.push({ da: prevA ? prevA + 1 : 1, a: null, prezzo: '' });
  lsSet(MAGK, magazzino);
  renderScaglioni(i);
}

function delSc(i, si) {
  if (!magazzino[i] || !magazzino[i].scaglioni) return;
  magazzino[i].scaglioni.splice(si, 1);
  lsSet(MAGK, magazzino);
  renderScaglioni(i);
}

function updSc(i, si, field, val) {
  if (!magazzino[i] || !magazzino[i].scaglioni) return;
  if (field === 'da' || field === 'a') {
    magazzino[i].scaglioni[si][field] = val === '' ? null : parseInt(val);
  } else {
    magazzino[i].scaglioni[si][field] = val;
  }
  lsSet(MAGK, magazzino);
}

function getPrezzoScaglione(i, qty) {
  var m = magazzino[i] || {};
  var sc = m.scaglioni || [];
  var q = parseFloat(qty) || 1;
  for (var si = 0; si < sc.length; si++) {
    var s = sc[si];
    if ((s.da === null || q >= s.da) && (s.a === null || q <= s.a) && s.prezzo) {
      return s.prezzo;
    }
  }
  return null;
}

// aggiungiScaglione / rimuoviScaglione / updateScaglione rimossi:
// usare addSc() / delSc() / updSc() definiti nella sezione FEATURE 3 sopra


// applicaScaglione(cartId,idx) rimossa - chiamava renderCartItems() non esistente

// -- Sistema ricerca globale (pannello #rg-panel - bottone - in header) ----
var _rGlobaleOpen = false;

function toggleRicercaGlobale() {
  var panel = document.getElementById('rg-panel');
  if (!panel) return;
  _rGlobaleOpen = !_rGlobaleOpen;
  panel.style.display = _rGlobaleOpen ? 'block' : 'none';
  if (_rGlobaleOpen) {
    var inp = document.getElementById('rg-input');
    if (inp) { inp.value = ''; inp.focus(); }
    var res = document.getElementById('rg-results');
    if (res) res.innerHTML = '<div style="color:#555;font-size:12px;font-style:italic;padding:12px">Scrivi almeno 2 caratteri-</div>';
  }
}

function eseguiRicercaGlobale() {
  var inp = document.getElementById('rg-input');
  if (!inp) return;
  var q = inp.value.trim().toLowerCase();
  var el = document.getElementById('rg-results');
  if (!el) return;
  if (q.length < 2) {
    el.innerHTML = '<div style="color:#555;font-size:12px;font-style:italic;padding:12px">Scrivi almeno 2 caratteri-</div>';
    return;
  }
  var hits = [];
  // - Inventario -
  rows.forEach(function (r, i) {
    if (removed.has(String(i))) return;
    var m = magazzino[i] || {};
    var hay = [r.desc, r.codF, r.codM, m.marca, m.specs, m.posizione, m.nomeFornitore].join(' ').toLowerCase();
    if (hay.indexOf(q) < 0) return;
    hits.push({ tipo: 'inv', label: r.desc || '-', sub: (r.codF || '') + (m.nomeFornitore ? ' - ' + m.nomeFornitore : ''), action: 'openSchedaProdotto(' + i + ');toggleRicercaGlobale()' });
  });
  // - Ordini -
  ordini.forEach(function (o) {
    var hay = [o.nomeCliente, o.nota].concat((o.items || []).map(function (it) { return (it.desc || '') + ' ' + (it.codF || ''); })).join(' ').toLowerCase();
    if (hay.indexOf(q) < 0) return;
    hits.push({ tipo: 'ord', label: 'Ordine ' + (o.nomeCliente || 'senza nome'), sub: o.data || '', action: 'goTab(\'to\');toggleRicercaGlobale()' });
  });
  // - Movimenti -
  movimenti.forEach(function (mv) {
    var hay = [mv.desc, mv.codF, mv.note, mv.tipo].join(' ').toLowerCase();
    if (hay.indexOf(q) < 0) return;
    hits.push({ tipo: 'mov', label: mv.desc || '-', sub: mv.data + ' - ' + mv.tipo + ' ' + (mv.delta >= 0 ? '+' : '') + mv.delta, action: 'goTab(\'tmov\');toggleRicercaGlobale()' });
  });
  if (!hits.length) {
    el.innerHTML = '<div style="color:#555;font-size:12px;padding:12px">Nessun risultato per "<b>' + esc(q) + '</b>"</div>';
    return;
  }
  var groupOrder = { inv: 0, ord: 1, mov: 2 };
  var groupLabel = { inv: '- Inventario', ord: '- Ordini', mov: '- Movimenti' };
  var sections = {};
  hits.forEach(function (h) { if (!sections[h.tipo]) sections[h.tipo] = []; sections[h.tipo].push(h); });
  var hhtml = '';
  Object.keys(sections).sort(function (a, b) { return groupOrder[a] - groupOrder[b]; }).forEach(function (tipo) {
    hhtml += '<div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;padding:6px 10px 3px;border-top:1px solid var(--border);">' + groupLabel[tipo] + ' (' + sections[tipo].length + ')</div>';
    sections[tipo].slice(0, 20).forEach(function (h) {
      hhtml += '<div onclick="' + h.action + '" style="padding:7px 10px;cursor:pointer;border-bottom:1px solid #222;display:flex;flex-direction:column;gap:1px;" onmouseover="this.style.background=\'#2a2a2a\'" onmouseout="this.style.background=\'\'">'; 
      hhtml += '<span style="font-size:12px;color:var(--text);font-weight:600">' + esc(h.label) + '</span>';
      if (h.sub) hhtml += '<span style="font-size:10px;color:var(--muted)">' + esc(h.sub) + '</span>';
      hhtml += '</div>';
    });
  });
  el.innerHTML = '<div style="font-size:10px;color:var(--muted);padding:6px 10px;">' + hits.length + ' risultati</div>' + hhtml;
}



// ------------------------------------------------------------------
//  FEATURE 4 - Import da foto (AI OCR)
// ------------------------------------------------------------------
function apriFotoImport() {
  document.getElementById('foto-import-overlay').classList.add('open');
  document.getElementById('fi-preview').innerHTML = '<span style="color:#555">Nessuna foto selezionata</span>';
  document.getElementById('fi-result').innerHTML = '';
  document.getElementById('fi-file').value = '';
  document.getElementById('fi-url-input').value = '';
}

function chiudiFotoImport() {
  document.getElementById('foto-import-overlay').classList.remove('open');
}

function fotoImportPreview(input) {
  var file = input.files[0];
  if (!file) return;
  var reader = new FileReader();
  reader.onload = function (e) {
    document.getElementById('fi-preview').innerHTML =
      '<img src="' + e.target.result + '" style="max-width:100%;max-height:200px;border-radius:8px;border:1px solid var(--border)">';
    document.getElementById('fi-imgdata').value = e.target.result;
  };
  reader.readAsDataURL(file);
}

function analisiFotoAI() {
  var imgData = document.getElementById('fi-imgdata') ? document.getElementById('fi-imgdata').value : '';
  if (!imgData) { showToastGen('blue', '\u26A0\uFE0F Prima seleziona una foto'); return; }
  var resultEl = document.getElementById('fi-result');
  resultEl.innerHTML = '<div style="color:#888;font-size:12px;padding:8px">\uD83E\uDD16 Analisi in corso\u2026</div>';

  var base64 = imgData.split(',')[1];
  var mediaType = imgData.split(';')[0].replace('data:', '');

  fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 600,
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
          { type: 'text', text: 'Sei un assistente per una ferramenta italiana. Analizza questa immagine di un cartellino/etichetta/prodotto e estrai le seguenti informazioni. Rispondi SOLO con un JSON valido senza nessun testo prima o dopo:\n{"desc":"descrizione prodotto","codF":"codice fornitore","codM":"mio codice","prezzo":"prezzo vendita (solo numero)","specs":"specifiche tecniche (misure, materiale...)","marca":"marca/produttore","nomeFornitore":"nome del fornitore se visibile"}\nSe un campo non e\' visibile usa stringa vuota.' }
        ]
      }]
    })
  })
  .then(function (res) { return res.json(); })
  .then(function (data) {
    var testo = (data.content || []).map(function (c) { return c.type === 'text' ? c.text : ''; }).join('');
    var clean = testo.replace(/```json|```/g, '').trim();
    var parsed;
    try { parsed = JSON.parse(clean); } catch (e) { throw new Error('JSON non valido: ' + clean.slice(0, 100)); }

    var fields = ['desc','codF','codM','prezzo','specs','marca','nomeFornitore'];
    var labels = { desc:'Descrizione', codF:'Cod. Fornitore', codM:'Mio Codice', prezzo:'Prezzo', specs:'Specifiche', marca:'Marca', nomeFornitore:'Fornitore' };
    var html = '<div style="font-size:11px;color:var(--muted);margin-bottom:8px">\u2705 Dati estratti \u2014 modifica se necessario poi clicca <b>Crea articolo</b></div>';
    fields.forEach(function (k) {
      html += '<div style="display:flex;gap:6px;align-items:center;margin-bottom:5px;">';
      html += '<label style="font-size:10px;color:var(--muted);width:90px;flex-shrink:0">' + labels[k] + '</label>';
      html += '<input type="text" id="fi-f-' + k + '" value="' + esc(parsed[k] || '') + '" ';
      html += 'style="flex:1;padding:5px 7px;border:1px solid var(--border);border-radius:6px;background:#111;color:var(--text);font-size:12px">';
      html += '</div>';
    });
    html += '<button onclick="creaArticoloDaFoto()" style="width:100%;padding:10px;margin-top:8px;border-radius:8px;border:none;background:var(--accent);color:#111;font-size:14px;font-weight:900;cursor:pointer">\u2795 Crea articolo</button>';
    resultEl.innerHTML = html;
  })
  .catch(function (e) {
    resultEl.innerHTML = '<div style="color:#e53e3e;font-size:12px;padding:8px">\u274C Errore: ' + esc(String(e)) + '</div>';
  });
}

function creaArticoloDaFoto() {
  function gfi(k) { var el = document.getElementById('fi-f-' + k); return el ? el.value.trim() : ''; }
  var descNew = gfi('desc') || 'Nuovo articolo';
  showConfirm('⚠️ Aggiungere "' + descNew + '" come NUOVO articolo al database?', function(){
    var nr = {
      desc: descNew,
      codF: gfi('codF'), codM: gfi('codM'),
      prezzo: gfi('prezzo'), prezzoOld: '', note: '',
      giornalino: '', priceHistory: [],
      data: new Date().toLocaleDateString('it-IT'),
      size: autoSize(gfi('prezzo'))
    };
    rows.push(nr);
    var ni = rows.length - 1;
    magazzino[ni] = {
      specs: gfi('specs'), marca: gfi('marca'), nomeFornitore: gfi('nomeFornitore'),
      qty: 0, unit: 'pz', posizione: '', soglia: '', prezzoAcquisto: ''
    };
    lsSet(SK, rows); lsSet(MAGK, magazzino);
    chiudiFotoImport();
    renderInventario();
    setTimeout(function () { openEditProdotto(ni); }, 80);
    showToastGen('green', '\u2705 Articolo creato da foto!');
  });
}

document.addEventListener('keydown', function(e){
  if(e.key === 'Escape') {
    if(_rGlobaleOpen) { toggleRicercaGlobale(); return; }
    if(_globalSearchOpen) { closeGlobalSearch(); return; }
  }
});

// --- Ricerca Globale -------------------------------------------------------
var _globalSearchOpen = false;
var _globalSearchTimer = null;

function openGlobalSearch(){
  _globalSearchOpen = true;
  var overlay = document.getElementById('global-search-overlay');
  var inp = document.getElementById('global-search-input');
  if(overlay){ overlay.classList.add('open'); }
  if(inp){ inp.value=''; inp.focus(); }
  document.getElementById('global-search-results').innerHTML = '<div style="text-align:center;color:#555;padding:20px;font-size:13px;">Digita almeno 2 caratteri...</div>';
}

function closeGlobalSearch(){
  _globalSearchOpen = false;
  var overlay = document.getElementById('global-search-overlay');
  if(overlay) overlay.classList.remove('open');
}

function onGlobalSearchInput(val){
  if(_globalSearchTimer) clearTimeout(_globalSearchTimer);
  _globalSearchTimer = setTimeout(function(){ doGlobalSearch(val); }, 200);
}

function doGlobalSearch(q){
  q = (q||'').trim();
  var el = document.getElementById('global-search-results');
  if(!el) return;
  if(q.length < 2){
    el.innerHTML = '<div style="text-align:center;color:#555;padding:20px;font-size:13px;">Digita almeno 2 caratteri...</div>';
    return;
  }

  var html = '';
  var totale = 0;

  // -- Inventario -- (early-exit indexOf prima di fuzzyMatch per performance su 14k articoli)
  var invResults = [];
  var qLow = q.toLowerCase();
  rows.forEach(function(r,i){
    if(removed.has(String(i))) return;
    var m = magazzino[i] || {};
    var hay = [r.desc, r.codF, r.codM, m.marca, m.specs, m.posizione, m.nomeFornitore].join(' ');
    if(hay.toLowerCase().indexOf(qLow) < 0) return; // early exit veloce
    if(fuzzyMatch(q, hay)){
      invResults.push({r:r, m:m, i:i});
    }
  });

  if(invResults.length){
    html += '<div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">- Inventario ('+invResults.length+')</div>';
    invResults.slice(0,8).forEach(function(item){
      var qty = item.m.qty !== undefined && item.m.qty !== '' ? Number(item.m.qty) : '-';
      var soglia = getSoglia(item.i);
      var isLow = qty !== '-' && qty <= soglia;
      html += '<div data-gi="'+item.i+'" onclick="gsGoArticolo(this)" style="display:flex;justify-content:space-between;align-items:center;padding:7px 10px;background:#1e1e1e;border-radius:8px;margin-bottom:4px;cursor:pointer;border-left:3px solid '+(isLow?'#e53e3e':'transparent')+';">';
      html += '<div>';
      html += '<div style="font-size:12px;font-weight:600;color:var(--text);">'+ esc(item.r.desc||'-') +'</div>';
      html += '<div style="font-size:10px;color:var(--muted);">'+esc(item.r.codF||'')+(item.m.marca?' - '+esc(item.m.marca):'')+'</div>';
      html += '</div>';
      html += '<div style="text-align:right;">';
      html += '<div style="font-size:12px;font-weight:700;color:var(--accent);">- '+(item.r.prezzo||'-')+'</div>';
      html += '<div style="font-size:10px;color:'+(isLow?'#e53e3e':'#555')+';">Qta: '+qty+(isLow?' --':'')+'</div>';
      html += '</div></div>';
    });
    if(invResults.length > 8) html += '<div style="font-size:10px;color:#555;text-align:center;padding:4px;">...e altri '+(invResults.length-8)+' articoli</div>';
    totale += invResults.length;
  }

  // -- Ordini --
  var ordResults = [];
  ordini.forEach(function(o){
    if(!o||!o.items) return;
    var hay = [o.id, o.stato, o.note].join(' ');
    o.items.forEach(function(item){ hay += ' ' + (item.desc||'') + ' ' + (item.codF||''); });
    if(fuzzyMatch(q, hay)) ordResults.push(o);
  });

  if(ordResults.length){
    html += '<div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin:10px 0 6px;">- Ordini ('+ordResults.length+')</div>';
    ordResults.slice(0,4).forEach(function(o){
      html += '<div onclick="closeGlobalSearch();goTab(&apos;to&apos;)" style="display:flex;justify-content:space-between;align-items:center;padding:7px 10px;background:#1e1e1e;border-radius:8px;margin-bottom:4px;cursor:pointer;">';
      html += '<div><div style="font-size:12px;font-weight:600;color:var(--text);">Ordine #'+esc(o.id)+'</div>';
      html += '<div style="font-size:10px;color:var(--muted);">'+(o.items||[]).length+' articoli</div></div>';
      var stCol = o.stato==='inviato'?'#f5c400':o.stato==='ricevuto'?'#38a169':'#fc8181';
      html += '<span style="font-size:11px;color:'+stCol+';font-weight:600;">'+(o.stato||'-')+'</span>';
      html += '</div>';
    });
    totale += ordResults.length;
  }

  // -- Movimenti --
  var movResults = [];
  movimenti.forEach(function(mv){
    var hay = [mv.desc, mv.codF, mv.tipo, mv.note, mv.data].join(' ');
    if(fuzzyMatch(q, hay)) movResults.push(mv);
  });

  if(movResults.length){
    html += '<div style="font-size:10px;color:var(--muted);text-transform:uppercase;letter-spacing:.5px;margin:10px 0 6px;">- Movimenti ('+movResults.length+')</div>';
    movResults.slice(0,5).forEach(function(mv){
      var tipoC = mv.tipo==='vendita'?'#fc8181':mv.tipo==='carico'?'#68d391':'#63b3ed';
      html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:6px 10px;background:#1e1e1e;border-radius:8px;margin-bottom:4px;">';
      html += '<div><div style="font-size:12px;color:var(--text);">'+esc(mv.desc||'-')+'</div>';
      html += '<div style="font-size:10px;color:var(--muted);">'+esc(mv.data||'')+' - '+esc(mv.tipo||'')+'</div></div>';
      html += '<span style="font-size:12px;font-weight:700;color:'+tipoC+';">'+(mv.delta>0?'+':'')+mv.delta+'</span>';
      html += '</div>';
    });
    if(movResults.length > 5) html += '<div style="font-size:10px;color:#555;text-align:center;padding:4px;">...e altri '+(movResults.length-5)+' movimenti</div>';
    totale += movResults.length;
  }

  if(!html){
    html = '<div style="text-align:center;padding:30px;">' +
      '<div style="font-size:30px;margin-bottom:8px;">-</div>' +
      '<div style="color:#555;font-size:13px;">Nessun risultato per <b>'+esc(q)+'</b></div></div>';
  } else {
    html = '<div style="font-size:10px;color:var(--muted);margin-bottom:12px;">'+totale+' risultati per "'+esc(q)+'"</div>' + html;
  }

  el.innerHTML = html;
}


function gsGoArticolo(el){
  var idx = parseInt(el.getAttribute('data-gi'));
  closeGlobalSearch();
  goTab('t0');
  setTimeout(function(){ openSchedaProdotto(idx); }, 80);
}


// --- Import da foto AI -----------------------------------------------------
var _fotoBase64 = null;

