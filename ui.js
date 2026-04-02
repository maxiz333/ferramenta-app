// ══ UI & NAVIGAZIONE ═════════════════════════════════════════════
// [SECTION: AI/FOTO] -------------------------------------------------------
//  Import articoli da foto (Gemini AI), overlay foto, API key
function openFotoOverlay(){
  fotoReset();
  document.getElementById('foto-overlay').classList.add('open');
  // Carica API key salvata
  var inp = document.getElementById('foto-apikey');
  if(inp){ inp.value = getMiaApiKey(); }
}
function closeFotoOverlay(){
  document.getElementById('foto-overlay').classList.remove('open');
  _fotoBase64 = null;
}
function fotoReset(){
  document.getElementById('foto-step1').style.display = '';
  document.getElementById('foto-step2').style.display = 'none';
  document.getElementById('foto-step3').style.display = 'none';
  var inp = document.getElementById('foto-input');
  if(inp) inp.value = '';
  _fotoBase64 = null;
}

function onFotoSelected(input){
  if(!input.files || !input.files[0]) return;
  var file = input.files[0];
  var reader = new FileReader();
  reader.onload = function(e){
    _fotoBase64 = e.target.result.split(',')[1];
    var mediaType = file.type || 'image/jpeg';
    document.getElementById('foto-preview').src = e.target.result;
    document.getElementById('foto-step1').style.display = 'none';
    document.getElementById('foto-step2').style.display = '';
    document.getElementById('foto-status').textContent = '- Analisi AI in corso...';
    elaboraFotoAI(_fotoBase64, mediaType);
  };
  reader.readAsDataURL(file);
}

async function elaboraFotoAI(base64, mediaType){
  var statusEl = document.getElementById('foto-status');
  try {
    var apiKey = getMiaApiKey();
    if(!apiKey){
      statusEl.textContent = '-- Inserisci la tua API key Google Gemini qui sopra';
      statusEl.style.color = '#f5c400';
      return;
    }
    statusEl.textContent = '- Analisi AI in corso...';
    statusEl.style.color = 'var(--muted)';

    var prompt = 'Sei un assistente per una ferramenta italiana. Analizza questa immagine (cartellino, etichetta o appunto) ed estrai le informazioni del prodotto. Rispondi SOLO con un JSON valido, senza testo aggiuntivo n- backtick, con questi campi (stringa vuota se non trovato): {"desc":"descrizione prodotto","prezzo":"es 1.50","codF":"codice fornitore","codM":"mio codice","marca":"marca","specs":"specifiche tecniche es M6x20 inox","note":"altre info utili"}';

    var url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + apiKey;

    var body = {
      contents: [{
        parts: [
          { inline_data: { mime_type: mediaType, data: base64 } },
          { text: prompt }
        ]
      }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 512 }
    };

    var resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if(!resp.ok){
      var errData = await resp.json().catch(function(){ return {}; });
      var msg = (errData.error && errData.error.message) || ('HTTP ' + resp.status);
      throw new Error(msg);
    }

    var data = await resp.json();
    var text = '';
    try { text = data.candidates[0].content.parts[0].text || ''; } catch(e){}

    var clean = text.replace(/```json|```/g,'').trim();
    // Trova il primo { e l'ultimo }
    var start = clean.indexOf('{');
    var end   = clean.lastIndexOf('}');
    if(start >= 0 && end > start) clean = clean.slice(start, end+1);

    var obj = JSON.parse(clean);
    document.getElementById('foto-desc').value   = obj.desc   || '';
    document.getElementById('foto-prezzo').value = obj.prezzo || '';
    document.getElementById('foto-codf').value   = obj.codF   || '';
    document.getElementById('foto-codm').value   = obj.codM   || '';
    document.getElementById('foto-marca').value  = obj.marca  || '';
    document.getElementById('foto-specs').value  = obj.specs  || '';
    document.getElementById('foto-note').value   = obj.note   || '';
    document.getElementById('foto-step2').style.display = 'none';
    document.getElementById('foto-step3').style.display = '';
  } catch(err){
    statusEl.textContent = '- ' + (err.message || 'Impossibile analizzare. Riprova.');
    statusEl.style.color = '#e53e3e';
  }
}
function confermaDaFoto(){
    var desc = gf('foto-desc');
  if(!desc){ showToastOk('-- Inserisci almeno una descrizione'); return; }
  showConfirm('⚠️ Aggiungere "'+desc+'" come NUOVO articolo al database?', function(){
    var newRow = {
      desc: desc,
      codF: gf('foto-codf'),
      codM: gf('foto-codm'),
      prezzo: gf('foto-prezzo'),
      prezzoOld: '',
      note: gf('foto-note'),
      giornalino: '',
      priceHistory: [],
      data: new Date().toLocaleDateString('it-IT'),
      size: autoSize(gf('foto-prezzo'))
    };
    var ni = rows.length;
    rows.push(newRow);
    magazzino[ni] = {
      marca: gf('foto-marca'),
      specs: gf('foto-specs'),
      qty: 0,
      unit: 'pz',
      soglia: ''
    };
    lsSet(SK, rows);
    lsSet(MAGK, magazzino);
    closeFotoOverlay();
    renderInventario();
    updateStockBadge();
    showToastOk('✅ Articolo creato da foto!');
    setTimeout(function(){ openEditProdotto(ni); }, 200);
  });
}


// --- Gestione API key per Import da foto ----------------------------------
var APIKEY_K = 'cp4_foto_apikey';

function getMiaApiKey(){
  return localStorage.getItem(APIKEY_K) || '';
}
function salvaMiaApiKey(v){
  localStorage.setItem(APIKEY_K, v);
}
function mostraApiKey(){
  var inp = document.getElementById('foto-apikey');
  if(!inp) return;
  inp.type = inp.type === 'password' ? 'text' : 'password';
}


// [SECTION: UI GENERICA] ---------------------------------------------------
//  Navigazione tab, toast, confirm dialog, backup, tema chiaro/scuro
var _altroOpen = false;

function toggleAltroMenu(btn){
  _altroOpen ? closeAltroMenu() : openAltroMenu(btn);
}

function openAltroMenu(btn){
  _altroOpen = true;
  var pp=document.getElementById('altro-popup');
  var bd=document.getElementById('altro-popup-backdrop');
  var ar=document.getElementById('altro-arrow');
  var tb=document.getElementById('tbb-taltro');
  if(pp) pp.classList.add('open');
  if(bd) bd.style.display='block';
  if(ar) ar.textContent='-';
  if(tb) tb.classList.add('active');
}

function closeAltroMenu(){
  _altroOpen = false;
  var pp=document.getElementById('altro-popup');
  var bd=document.getElementById('altro-popup-backdrop');
  var ar=document.getElementById('altro-arrow');
  var tb=document.getElementById('tbb-taltro');
  if(pp) pp.classList.remove('open');
  if(bd) bd.style.display='none';
  if(ar) ar.textContent='-';
  var cur=document.querySelector('.tab-content.active');
  var secondarie=['t2','t3','t4','t6','t10','t12'];
  var isSecondaria=cur&&secondarie.indexOf(cur.id)>=0;
  if(!isSecondaria&&tb) tb.classList.remove('active');
}

function updateAltroBadge(){
  // Mostra ! se ci sono notifiche nelle tab secondarie (es. cestino pieno, note)
  var hasBadge = false;
  var nbEl = document.getElementById('note-badge');
  if(nbEl && nbEl.style.display !== 'none') hasBadge = true;
  var cbEl = document.getElementById('cb');
  if(cbEl && cbEl.style.display !== 'none') hasBadge = true;
  var ab = document.getElementById('altro-badge');
  if(ab) ab.style.display = hasBadge ? '' : 'none';
}


// --- Notifiche Ordine -----------------------------------------------------
var _notifPermesso = false;
var _pendingOrdineModal = null;

function isPC(){
  // Pi- permissivo: considera PC anche touch con schermo grande
  return window.innerWidth > 700;
}

function richediNotifPermesso(){
  if(!('Notification' in window)) return;
  if(Notification.permission === 'granted'){
    _notifPermesso = true;
  } else if(Notification.permission !== 'denied'){
    Notification.requestPermission().then(function(p){
      _notifPermesso = (p === 'granted');
      if(p === 'granted') showToastGen('green','- Notifiche attivate!');
    });
  }
}

function mostraNotificaOrdine(ord){
  // -- 1. Notifica di sistema -------------------------------------------
  if(_notifPermesso && 'Notification' in window && Notification.permission === 'granted'){
    var righeText = (ord.items||[]).map(function(it){
      return it.qty + ' - ' + it.desc;
    }).join('\n');
    try {
      var notif = new Notification('- Nuovo Ordine - ' + (ord.nomeCliente||'Cliente'), {
        body: righeText + '\n\nTotale: - ' + ord.totale,
        tag:  ord.id,
        requireInteraction: true
      });
      notif.onclick = function(){
        window.focus();
        goTab('to');
        notif.close();
      };
    } catch(e){ console.warn('Notifica sistema fallita:', e); }
  }

  // -- 2. Modal in-app (sempre, su qualsiasi dispositivo) ---------------
  if(document.hidden){
    _pendingOrdineModal = ord;
  } else {
    _apriOrdineModal(ord);
  }
}

// ── Notifica Bozza (stessa struttura di mostraNotificaOrdine, stile blu) ──
var _pendingBozzaModal = null;

function mostraNotificaBozza(bozza){
  // -- 1. Notifica di sistema (browser) -----------------------------------
  if(_notifPermesso && 'Notification' in window && Notification.permission === 'granted'){
    var righeText = (bozza.items||[]).map(function(it){
      return it.qty + ' × ' + it.desc;
    }).join('\n');
    try {
      var notif = new Notification('📡 Bozza in costruzione — ' + (bozza.nomeCliente||'Cliente'), {
        body: righeText + (bozza.nota ? '\n📝 ' + bozza.nota : '') + '\n\nIl banco sta preparando l\'ordine',
        tag:  'bozza_' + bozza.id,
        requireInteraction: true
      });
      notif.onclick = function(){
        window.focus();
        goTab('to');
        if(typeof filterOrdini === 'function') filterOrdini('bozza');
        notif.close();
      };
    } catch(e){ console.warn('Notifica bozza fallita:', e); }
  }

  // -- 2. Modal in-app (sempre) -------------------------------------------
  if(document.hidden){
    _pendingBozzaModal = bozza;
  } else {
    _apriBozzaModal(bozza);
  }
}

function _apriBozzaModal(bozza){
  var bd = document.getElementById('bozza-modal-backdrop');
  if(!bd) return;

  document.getElementById('bmd-cliente').textContent = bozza.nomeCliente || 'Cliente';
  document.getElementById('bmd-ora').textContent = bozza.data + ' — ' + bozza.ora;

  var righeEl = document.getElementById('bmd-righe');
  righeEl.innerHTML = (bozza.items||[]).map(function(it){
    return '<div class="ordine-riga">' +
      '<span style="color:var(--text);font-weight:600;">' +
        '<span style="color:#63b3ed;font-size:14px;font-weight:900;">' + it.qty + '</span>' +
        ' × ' + (it.desc||'—') +
      '</span>' +
    '</div>';
  }).join('');

  var notaEl = document.getElementById('bmd-nota');
  if(bozza.nota && bozza.nota.trim()){
    notaEl.textContent = '📝 ' + bozza.nota;
    notaEl.style.display = '';
  } else {
    notaEl.style.display = 'none';
  }

  bd.classList.add('open');

  // Suono — tono più basso e dolce rispetto all'ordine
  try {
    var ctx = new (window.AudioContext||window.webkitAudioContext)();
    [0,200].forEach(function(delay){
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = 660;
      gain.gain.setValueAtTime(0, ctx.currentTime + delay/1000);
      gain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + delay/1000 + 0.04);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + delay/1000 + 0.25);
      osc.start(ctx.currentTime + delay/1000);
      osc.stop(ctx.currentTime + delay/1000 + 0.3);
    });
  } catch(e){}
}

function closeBozzaModal(){
  var bd = document.getElementById('bozza-modal-backdrop');
  if(bd) bd.classList.remove('open');
}

function bozzaModalVaiOrdini(){
  closeBozzaModal();
  goTab('to');
  if(typeof filterOrdini === 'function') filterOrdini('bozza');
}

// Chiudi bozza modal cliccando fuori
document.addEventListener('click', function(e){
  var bd = document.getElementById('bozza-modal-backdrop');
  if(bd && e.target === bd) closeBozzaModal();
});

// ── Notifica aggiornamento bozza (piccola, in-app) ──────────────────────
function mostraBozzaAggiornata(bozza){
  var nome = bozza.nomeCliente || 'Banco';
  var nArt = (bozza.items||[]).length;
  showToastGen('blue', '📡 ' + nome + ' — bozza aggiornata (' + nArt + ' art.)');

  // Blip sonoro discreto — un singolo "blop" corto e basso
  try {
    var ctx = new (window.AudioContext||window.webkitAudioContext)();
    var osc = ctx.createOscillator();
    var gain = ctx.createGain();
    osc.connect(gain); gain.connect(ctx.destination);
    osc.frequency.value = 520;
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.03);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.12);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + 0.15);
  } catch(e){}

  // Flash + mini-banner sulla card della bozza se visibile nella tab ordini
  var toTab = document.getElementById('to');
  if(toTab && toTab.classList.contains('active')){
    var card = document.querySelector('.ord-card--bozza[data-bozza-id="'+bozza.id+'"]');
    if(card){
      // Flash bordo blu
      card.style.transition = 'box-shadow .3s, border-color .3s';
      card.style.boxShadow = '0 0 20px #3182ce88';
      card.style.borderColor = '#3182ce';
      setTimeout(function(){ card.style.boxShadow = ''; card.style.borderColor = ''; }, 3000);

      // Mini-banner animato in cima alla card
      var oldBanner = card.querySelector('.bozza-update-banner');
      if(oldBanner) oldBanner.remove();
      var banner = document.createElement('div');
      banner.className = 'bozza-update-banner';
      banner.innerHTML = '⚡ Aggiornato ora — ' + nArt + ' articol' + (nArt===1?'o':'i');
      card.insertBefore(banner, card.firstChild);

      // Sparisce dopo 4 secondi
      setTimeout(function(){
        banner.style.opacity = '0';
        banner.style.transform = 'translateY(-100%)';
        setTimeout(function(){ if(banner.parentNode) banner.remove(); }, 300);
      }, 4000);
    }
  }
}

// Ascolta quando la tab torna in focus
document.addEventListener('visibilitychange', function(){
  if(!document.hidden && _pendingOrdineModal){
    var ord = _pendingOrdineModal;
    _pendingOrdineModal = null;
    setTimeout(function(){ _apriOrdineModal(ord); }, 300);
  }
  if(!document.hidden && _pendingBozzaModal){
    var bozza = _pendingBozzaModal;
    _pendingBozzaModal = null;
    setTimeout(function(){ _apriBozzaModal(bozza); }, 400);
  }
});

function _apriOrdineModal(ord){
  // Mostra il modal su qualsiasi dispositivo (rimossa restrizione isPC)
  var bd = document.getElementById('ordine-modal-backdrop');
  if(!bd) return;

  // Popola
  document.getElementById('omd-cliente').textContent = ord.nomeCliente || 'Cliente';
  document.getElementById('omd-ora').textContent = ord.data + ' - ' + ord.ora;
  document.getElementById('omd-totale').textContent = '- ' + ord.totale;

  var righeEl = document.getElementById('omd-righe');
  righeEl.innerHTML = (ord.items||[]).map(function(it){
    var prezzo = (parsePriceIT(it.prezzoUnit) * parseFloat(it.qty||0)).toFixed(2);
    return '<div class="ordine-riga">' +
      '<span style="color:var(--text);font-weight:600;">' +
        '<span style="color:var(--accent);font-size:14px;font-weight:900;">' + it.qty + '</span>' +
        ' - ' + (it.desc||'-') +
      '</span>' +
      '<span style="color:var(--accent);font-weight:700;">- ' + prezzo + '</span>' +
    '</div>';
  }).join('');

  var notaEl = document.getElementById('omd-nota');
  if(ord.nota && ord.nota.trim()){
    notaEl.textContent = '- ' + ord.nota;
    notaEl.style.display = '';
  } else {
    notaEl.style.display = 'none';
  }

  bd.classList.add('open');

  // Suono (beep sottile) solo se supportato
  try {
    var ctx = new (window.AudioContext||window.webkitAudioContext)();
    [0,150,300].forEach(function(delay){
      var osc = ctx.createOscillator();
      var gain = ctx.createGain();
      osc.connect(gain); gain.connect(ctx.destination);
      osc.frequency.value = 880;
      gain.gain.setValueAtTime(0, ctx.currentTime + delay/1000);
      gain.gain.linearRampToValueAtTime(0.18, ctx.currentTime + delay/1000 + 0.04);
      gain.gain.linearRampToValueAtTime(0, ctx.currentTime + delay/1000 + 0.18);
      osc.start(ctx.currentTime + delay/1000);
      osc.stop(ctx.currentTime + delay/1000 + 0.2);
    });
  } catch(e){}
}

function closeOrdineModal(){
  var bd = document.getElementById('ordine-modal-backdrop');
  if(bd) bd.classList.remove('open');
}

function ordineModalVaiOrdini(){
  closeOrdineModal();
  goTab('to');
}

// Chiudi cliccando fuori
document.addEventListener('click', function(e){
  var bd = document.getElementById('ordine-modal-backdrop');
  if(bd && e.target === bd) closeOrdineModal();
});

// --- Dettaglio Ordine -----------------------------------------------------
var _ordDetailId=null;
// -------------------------------------------------------
//  FATTURE
// -------------------------------------------------------
var FATK = 'cp4_fatture';
var fatture = [];
var fatFiltro = 'tutte';
var _fatEditId = null;

function loadFatture(){ fatture = lsGet(FATK,[]); }
function saveFatture(){ lsSet(FATK, fatture); }

function filterFatture(f){
  fatFiltro = f;
  ['tutte','emessa','ricevuta','scaduta'].forEach(x=>{
    var b = document.getElementById('fat-f-'+x);
    if(!b) return;
    var on = x===f;
    b.style.background = on ? 'var(--accent)' : 'transparent';
    b.style.color = on ? '#111' : (x==='scaduta' ? '#e53e3e' : 'var(--muted)');
    b.style.borderColor = on ? 'var(--accent)' : (x==='scaduta' ? '#e53e3e44' : 'var(--border)');
  });
  renderFatture();
}

function renderFatture(){
  var list = document.getElementById('fat-list');
  var statsEl = document.getElementById('fat-stats');
  if(!list) return;
  loadFatture();
  var oggi = new Date().toISOString().slice(0,10);
  // Calcola stats
  var emesse   = fatture.filter(function(f){return f.tipo==='emessa';});
  var ricevute = fatture.filter(function(f){return f.tipo==='ricevuta';});
  var scadute  = fatture.filter(function(f){return f.statoPag!=='pagata' && f.scadenza && f.scadenza < oggi;});
  var daIncass = emesse.filter(function(f){return f.statoPag!=='pagata';}).reduce((s,f)=>s+parseFloat(f.importo||0),0);
  var daPagare = ricevute.filter(function(f){return f.statoPag!=='pagata';}).reduce((s,f)=>s+parseFloat(f.importo||0),0);
  if(statsEl) statsEl.innerHTML =
    '<div style="background:#1e1e1e;border:1px solid #2a2a2a;border-radius:10px;padding:10px 12px;text-align:center;">' +
      '<div style="font-size:10px;color:#555;text-transform:uppercase;margin-bottom:3px;">Da incassare</div>' +
      '<div style="font-size:18px;font-weight:900;color:#38a169;">- '+daIncass.toFixed(2)+'</div></div>' +
    '<div style="background:#1e1e1e;border:1px solid #2a2a2a;border-radius:10px;padding:10px 12px;text-align:center;">' +
      '<div style="font-size:10px;color:#555;text-transform:uppercase;margin-bottom:3px;">Da pagare</div>' +
      '<div style="font-size:18px;font-weight:900;color:#e53e3e;">- '+daPagare.toFixed(2)+'</div></div>' +
    '<div style="background:#1e1e1e;border:1px solid #2a2a2a;border-radius:10px;padding:10px 12px;text-align:center;">' +
      '<div style="font-size:10px;color:#555;text-transform:uppercase;margin-bottom:3px;">Scadute</div>' +
      '<div style="font-size:18px;font-weight:900;color:'+(scadute.length?'#e53e3e':'#555')+';">'+scadute.length+'</div></div>';
  // Filtra
  var filtered = fatture.slice();
  if(fatFiltro==='emessa') filtered = filtered.filter(function(f){return f.tipo==='emessa';});
  else if(fatFiltro==='ricevuta') filtered = filtered.filter(function(f){return f.tipo==='ricevuta';});
  else if(fatFiltro==='scaduta') filtered = filtered.filter(function(f){return f.statoPag!=='pagata' && f.scadenza && f.scadenza < oggi;});
  // Ordina: pi- recente prima
  filtered.sort((a,b)=> (b.data||'').localeCompare(a.data||''));
  if(!filtered.length){
    list.innerHTML = '<div style="text-align:center;padding:40px;color:#3a3a3a;"><div style="font-size:32px;margin-bottom:8px;">-</div><div>Nessuna fattura</div></div>';
    return;
  }
  var PAG_LABEL = {da_pagare:'Da pagare', pagata:'Pagata', parziale:'Parziale'};
  var PAG_COL   = {da_pagare:'#e53e3e', pagata:'#38a169', parziale:'#f5c400'};
  var h = '';
  filtered.forEach(fat=>{
    var isScaduta = fat.statoPag!=='pagata' && fat.scadenza && fat.scadenza < oggi;
    var tipoCol = fat.tipo==='emessa' ? '#38a169' : '#3182ce';
    var tipoLabel = fat.tipo==='emessa' ? '- Emessa' : '- Ricevuta';
    var pagCol = PAG_COL[fat.statoPag]||'#888';
    var pagLabel = PAG_LABEL[fat.statoPag]||fat.statoPag;
    h += '<div style="background:#1a1a1a;border:1px solid #262626;border-left:3px solid '+tipoCol+';border-radius:12px;padding:12px 14px;margin-bottom:8px;">';
    h += '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:6px;">';
    h += '<div style="flex:1;min-width:0;">';
    h += '<div style="font-size:13px;font-weight:800;color:var(--text);">'+esc(fat.soggetto||'-')+'</div>';
    h += '<div style="font-size:10px;color:#555;margin-top:1px;">'+tipoLabel+(fat.numero?' - n-'+esc(fat.numero):'')+(fat.data?' - '+fat.data:'')+'</div>';
    if(fat.scadenza) h += '<div style="font-size:10px;color:'+(isScaduta?'#e53e3e':'#666')+';margin-top:1px;">'+(isScaduta?'-- SCADUTA - ':'Scade: ')+fat.scadenza+'</div>';
    h += '</div>';
    h += '<div style="text-align:right;flex-shrink:0;">';
    h += '<div style="font-size:17px;font-weight:900;color:var(--accent);">- '+parseFloat(fat.importo||0).toFixed(2)+'</div>';
    h += '<div style="font-size:9px;font-weight:700;color:'+pagCol+';">'+pagLabel+'</div>';
    h += '</div></div>';
    h += '<div style="display:flex;gap:5px;flex-wrap:wrap;">';
    if(fat.statoPag!=='pagata') h += '<button class="ord-act-btn" onclick="segnaFatturaPagata(\''+fat.id+'\')" style="color:#38a169;border-color:rgba(56,161,105,.3);">- Pagata</button>';
    h += '<button class="ord-act-btn" onclick="editFattura(\''+fat.id+'\')" style="color:#63b3ed;border-color:rgba(99,179,237,.3);">-- Modifica</button>';
    h += '<button class="ord-act-btn" onclick="stampaFattura(\''+fat.id+'\')" style="color:#888;border-color:#2a2a2a;">- Stampa</button>';
    h += '<button class="ord-act-btn" onclick="deleteFattura(\''+fat.id+'\')" style="color:#555;border-color:#222;margin-left:auto;">-</button>';
    h += '</div></div>';
  });
  list.innerHTML = h;
}

function openNuovaFattura(tipo){
  _fatEditId = null;
  document.getElementById('fat-ov-title').textContent = 'Nuova fattura';
  var oggi = new Date().toISOString().slice(0,10);
  document.getElementById('fat-tipo').value = tipo||'emessa';
  document.getElementById('fat-numero').value = '';
  document.getElementById('fat-soggetto').value = '';
  document.getElementById('fat-data').value = oggi;
  document.getElementById('fat-scadenza').value = '';
  document.getElementById('fat-importo').value = '';
  document.getElementById('fat-iva').value = '22';
  document.getElementById('fat-stato-pag').value = 'da_pagare';
  document.getElementById('fat-note').value = '';
  var ov = document.getElementById('fat-overlay');
  if(ov){ ov.style.display='flex'; }
}
function editFattura(id){
  loadFatture();
  var fat = fatture.find(function(f){return f.id===id;});
  if(!fat) return;
  _fatEditId = id;
  document.getElementById('fat-ov-title').textContent = 'Modifica fattura';
  document.getElementById('fat-tipo').value = fat.tipo||'emessa';
  document.getElementById('fat-numero').value = fat.numero||'';
  document.getElementById('fat-soggetto').value = fat.soggetto||'';
  document.getElementById('fat-data').value = fat.data||'';
  document.getElementById('fat-scadenza').value = fat.scadenza||'';
  document.getElementById('fat-importo').value = fat.importo||'';
  document.getElementById('fat-iva').value = fat.iva||'22';
  document.getElementById('fat-stato-pag').value = fat.statoPag||'da_pagare';
  document.getElementById('fat-note').value = fat.note||'';
  var ov = document.getElementById('fat-overlay');
  if(ov) ov.style.display='flex';
}
function closeFatOverlay(){
  var ov = document.getElementById('fat-overlay');
  if(ov) ov.style.display='none';
}
function salvaFattura(){
  var tipo = document.getElementById('fat-tipo').value;
  var numero = document.getElementById('fat-numero').value.trim();
  var soggetto = document.getElementById('fat-soggetto').value.trim();
  var data = document.getElementById('fat-data').value;
  var scadenza = document.getElementById('fat-scadenza').value;
  var importo = parseFloat(document.getElementById('fat-importo').value)||0;
  var iva = document.getElementById('fat-iva').value;
  var statoPag = document.getElementById('fat-stato-pag').value;
  var note = document.getElementById('fat-note').value.trim();
  if(!soggetto){ showToastGen('red','Inserisci cliente/fornitore'); return; }
  if(!importo){ showToastGen('red','Inserisci importo'); return; }
  loadFatture();
  if(_fatEditId){
    var idx = fatture.findIndex(function(f){return f.id===_fatEditId;});
    if(idx>=0) fatture[idx] = Object.assign(fatture[idx],{tipo,numero,soggetto,data,scadenza,importo,iva,statoPag,note});
  } else {
    fatture.unshift({id:'fat_'+Date.now(),tipo,numero,soggetto,data,scadenza,importo,iva,statoPag,note});
  }
  saveFatture(); closeFatOverlay(); renderFatture();
  showToastGen('green', _fatEditId ? 'Fattura aggiornata' : 'Fattura salvata');
}
function segnaFatturaPagata(id){
  loadFatture();
  var fat = fatture.find(function(f){return f.id===id;});
  if(fat){ fat.statoPag='pagata'; saveFatture(); renderFatture(); showToastGen('green','Pagamento registrato'); }
}
function deleteFattura(id){
  showConfirm('Eliminare questa fattura?', function(){

  loadFatture();
  fatture = fatture.filter(function(f){return f.id!==id;});
  saveFatture(); renderFatture();

  });
}
function stampaFattura(id){
  loadFatture();
  var fat = fatture.find(function(f){return f.id===id;});
  if(!fat) return;
  var imponibile = parseFloat(fat.importo)||0;
  var ivaPerc = parseFloat(fat.iva)||0;
  var ivaImporto = (imponibile * ivaPerc/100).toFixed(2);
  var totale = (imponibile + parseFloat(ivaImporto)).toFixed(2);
  var w = window.open('','_blank');
  if(!w){showToastGen('red','-- Popup bloccato');return;}
  w.document.write('<html><head><title>Fattura '+esc(fat.numero||'')+'</title>');
  w.document.write('<style>body{font-family:Arial;padding:20mm;font-size:11pt;}h1{font-size:18pt;}.row{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #eee;}.tot{font-size:14pt;font-weight:bold;margin-top:12px;text-align:right;}</style>');
  w.document.write('</head><body>');
  w.document.write('<h1>Ferramenta Rattazzi</h1>');
  w.document.write('<p>Fattura '+(fat.tipo==='emessa'?'emessa':'ricevuta')+(fat.numero?' n- '+esc(fat.numero):'')+'<br>Data: '+esc(fat.data||'')+'<br>Scadenza: '+esc(fat.scadenza||'-')+'</p>');
  w.document.write('<p><b>'+(fat.tipo==='emessa'?'Cliente:':'Fornitore:')+'</b> '+esc(fat.soggetto||'')+'</p>');
  w.document.write('<div class="row"><span>Imponibile</span><span>- '+imponibile.toFixed(2)+'</span></div>');
  w.document.write('<div class="row"><span>IVA '+ivaPerc+'%</span><span>- '+ivaImporto+'</span></div>');
  w.document.write('<div class="tot">TOTALE: - '+totale+'</div>');
  if(fat.note) w.document.write('<p style="margin-top:16px;color:#666;font-size:10pt;">Note: '+esc(fat.note)+'</p>');
  w.document.write('</body></html>');
  w.document.close(); w.print();
}


// ══ EXPORT CATALOGO CSV ══════════════════════════════════════════
// Scarica tutti gli articoli (rows[] + magazzino[]) come CSV con prezzi
function exportCatalogoCSV(){
  if(!rows || !rows.length){
    showToastGen('red','⚠️ Nessun articolo caricato — apri prima l\'inventario');
    return;
  }
  var sep = ';';
  var header = ['Descrizione','Cod.Fornitore','Cod.Magazzino','Prezzo','PrezzoVecchio','Quantita','Unita','Posizione','Marca','Fornitore','Specs','Categoria','Sottocategoria','Size','Giornalino','Note'].join(sep);
  var lines = [header];
  
  for(var i = 0; i < rows.length; i++){
    var r = rows[i] || {};
    var m = (typeof magazzino !== 'undefined' && magazzino[i]) ? magazzino[i] : {};
    var fields = [
      (r.desc || '').replace(/;/g, ','),
      (r.codF || '').replace(/;/g, ','),
      (r.codM || '').replace(/;/g, ','),
      r.prezzo || '',
      r.prezzoOld || '',
      m.qty !== undefined && m.qty !== '' ? m.qty : '',
      m.unit || 'pz',
      (m.posizione || '').replace(/;/g, ','),
      (m.marca || '').replace(/;/g, ','),
      (m.nomeFornitore || '').replace(/;/g, ','),
      (m.specs || '').replace(/;/g, ',').replace(/\n/g, ' '),
      m.cat || '',
      m.subcat || '',
      r.size || 'small',
      r.giornalino || '',
      (r.note || '').replace(/;/g, ',').replace(/\n/g, ' ')
    ];
    lines.push(fields.join(sep));
  }

  var csv = '\uFEFF' + lines.join('\n'); // BOM UTF-8 per Excel
  var blob = new Blob([csv], {type: 'text/csv;charset=utf-8;'});
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url;
  var oggi = new Date().toISOString().slice(0,10);
  a.download = 'catalogo_rattazzi_' + oggi + '.csv';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  showToastGen('green','✅ CSV scaricato — ' + rows.length + ' articoli');
}
