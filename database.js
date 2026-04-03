/**
 * -----------------------------------------------------------------------
 *  RATTAZZI - database.js
 *  - IndexedDB foto - Undo/Redo - Chiavi localStorage (SK, HK -)
 *  - lsGet / lsSet  - rows / magazzino / categorie / movimenti
 *  - UTILS: parsePriceIT, gf, esc, norm, fuzzy -
 *  - CARTELLINI: renderTable, makeTag, genTags, stampa -
 *  - IMPORT/CSV: parser, drop-zone -
 *  - MAGAZZINO: render, edit, filtri, scorte -
 * -----------------------------------------------------------------------
 */
// --- Error handling -------------------------------------------
window.addEventListener('unhandledrejection', function(e){ console.error('Promise:', e.reason); });
'use strict';

// -----------------------------------------------------------
//  INDEXEDDB PER FOTO ARTICOLI
//  Le foto non vanno in localStorage (limite ~5MB) ma in IndexedDB
//  che supporta decine di GB senza problemi
// -----------------------------------------------------------
var _idb = null;
var _idbCache = {}; // cache in memoria: rowIdx - dataURL

function _idbOpen(){
  return new Promise(function(resolve, reject){
    if(_idb){ resolve(_idb); return; }
    var req = indexedDB.open('cp4_foto', 1);
    req.onupgradeneeded = function(e){
      e.target.result.createObjectStore('foto');
    };
    req.onsuccess = function(e){
      _idb = e.target.result;
      resolve(_idb);
    };
    req.onerror = function(){ reject(req.error); };
  });
}

function idbSalvaFoto(rowIdx, dataURL){
  _idbCache[rowIdx] = dataURL;
  _idbOpen().then(function(db){
    var tx = db.transaction('foto','readwrite');
    tx.objectStore('foto').put(dataURL, String(rowIdx));
  });
}

function idbRimoviFoto(rowIdx){
  delete _idbCache[rowIdx];
  _idbOpen().then(function(db){
    var tx = db.transaction('foto','readwrite');
    tx.objectStore('foto').delete(String(rowIdx));
  });
}

function idbGetFoto(rowIdx){
  if(_idbCache[rowIdx] !== undefined) return Promise.resolve(_idbCache[rowIdx]||null);
  return _idbOpen().then(function(db){
    return new Promise(function(resolve){
      var tx = db.transaction('foto','readonly');
      var req = tx.objectStore('foto').get(String(rowIdx));
      req.onsuccess = function(){
        _idbCache[rowIdx] = req.result||null;
        resolve(_idbCache[rowIdx]);
      };
      req.onerror = function(){ resolve(null); };
    });
  });
}

// Precarica tutte le foto in cache all'avvio (per render veloce)
function idbPreloadAll(){
  return _idbOpen().then(function(db){
    return new Promise(function(resolve){
      var tx = db.transaction('foto','readonly');
      var req = tx.objectStore('foto').openCursor();
      req.onsuccess = function(e){
        var cursor = e.target.result;
        if(cursor){
          _idbCache[cursor.key] = cursor.value;
          cursor.continue();
        } else {
          resolve();
        }
      };
      req.onerror = function(){ resolve(); };
    });
  }).catch(function(){ return Promise.resolve(); });
}


// [SECTION: UNDO/REDO] -----------------------------------------------------
//  Snapshot globale prima di ogni salvataggio (max 20 step)
var _undoStack = [];
var _redoStack = [];
var _undoLock  = false; // evita snapshot ricorsivi durante restore

var _undoReady = false;

function _updateUndoButtons(){
  var btnB = document.getElementById('back-btn');
  var btnF = document.getElementById('forward-btn');
  if(btnB){
    btnB.style.opacity       = _undoStack.length ? '1' : '0.25';
    btnB.style.pointerEvents = _undoStack.length ? 'auto' : 'none';
  }
  if(btnF){
    btnF.style.opacity       = _redoStack.length ? '1' : '0.25';
    btnF.style.pointerEvents = _redoStack.length ? 'auto' : 'none';
  }
}

function _takeSnapshot(){
  if(_undoLock || !_undoReady) return;
  var snap = {
    rows:       JSON.stringify(rows||[]),
    magazzino:  JSON.stringify(magazzino||[]),
    ordini:     JSON.stringify(ordini||[]),
    carrelli:   JSON.stringify(carrelli||[]),
    categorie:  JSON.stringify(typeof categorie!=='undefined'?categorie:[]),
  };
  // Non salvare duplicati consecutivi
  if(_undoStack.length){
    var last = _undoStack[_undoStack.length-1];
    if(last.rows===snap.rows && last.ordini===snap.ordini && last.carrelli===snap.carrelli) return;
  }
  _undoStack.push(snap);
  if(_undoStack.length > 20) _undoStack.shift();
  _redoStack = []; // nuova modifica azzera il redo
  _updateUndoButtons();
}

function _restoreSnapshot(snap){
  _undoLock = true;
  rows       = JSON.parse(snap.rows);
  magazzino  = JSON.parse(snap.magazzino);
  ordini     = JSON.parse(snap.ordini);
  carrelli   = JSON.parse(snap.carrelli);
  if(snap.categorie) categorie = JSON.parse(snap.categorie);
  lsSet(SK,    rows);
  lsSet(MAGK,  magazzino);
  lsSet(ORDK,  ordini);
  lsSet(CARTK, carrelli);
  lsSet(CATK,  categorie);
  _undoLock = false;
  // Aggiorna la UI della tab attiva
  var active = document.querySelector('.tab-content.active');
  var aid = active ? active.id : '';
  if(aid==='t0') renderInventario();
  if(aid==='tc') renderCartTabs();
  if(aid==='to') renderOrdini();
  if(aid==='t11') renderMagazzino();
  if(aid==='t1'){ renderTable(); genTags(); }
  updateStats(); updateCartBadge(); updateOrdBadge();
  _updateUndoButtons();
}

function undoAction(){
  if(!_undoStack.length) return;
  var snap = _undoStack.pop();
  _redoStack.push({
    rows:      JSON.stringify(rows),
    magazzino: JSON.stringify(magazzino),
    ordini:    JSON.stringify(ordini),
    carrelli:  JSON.stringify(carrelli),
    categorie: JSON.stringify(categorie),
  });
  _restoreSnapshot(snap);
  showToastGen('green','- Modifica annullata');
}

function redoAction(){
  if(!_redoStack.length) return;
  var snap = _redoStack.pop();
  _undoStack.push({
    rows:      JSON.stringify(rows),
    magazzino: JSON.stringify(magazzino),
    ordini:    JSON.stringify(ordini),
    carrelli:  JSON.stringify(carrelli),
    categorie: JSON.stringify(categorie),
  });
  _restoreSnapshot(snap);
  showToastGen('green','- Modifica ripristinata');
}


// [SECTION: DATABASE] ------------------------------------------------------
//  Costanti chiavi localStorage, variabili globali, dati di default
var SK='cp4_current',HK='cp4_history',RK='cp4_removed',CK='cp4_cestino',CATK='cp4_categorie',MAGK='cp4_magazzino',MOVK='cp4_movimenti';
// CTK: chiave separata per i cartellini (NON sovrascritta da Firebase/rows)
var CTK='cp4_cartellini';
var ctRows=[]; // array SOLO cartellini — separato da rows[] che è il database Firebase
var MAGEXT_K='magazzino_ext'; // nodo Firebase per i 14.000 articoli
var _magExtLoaded=false; // flag: articoli gi- caricati da Firebase
var lsGet=function(k,d){try{var v=localStorage.getItem(k);return v!=null?JSON.parse(v):d;}catch(e){return d;}};
var lsSet=function(k,v){try{localStorage.setItem(k,JSON.stringify(v));}catch(e){}};

// [SECTION: UTILS] ---------------------------------------------------------
/** Converte stringa prezzo italiana (es. "12,50") in float */
function parsePriceIT(s){ return parseFloat(String(s||'0').replace(',','.'))||0; }

// Sconti forbice: rotolo = % fissa sul listino (non azzerare)
var SCONTO_ROTOLO_DEFAULT_PCT = 10;
var SCONTO_SCAMPOLO_DEFAULT_PCT = 30;
var SCONTO_SCAGLIONI_DEFAULT_PCT = 5;

/** Prezzo listino (numerico): mai il prezzo già scontato se esiste _prezzoOriginale o rows[rowIdx] */
function listinoPrezzoNum(it){
  if(it._prezzoOriginale != null && String(it._prezzoOriginale).trim() !== ''){
    var po = parsePriceIT(it._prezzoOriginale);
    if(po > 0) return po;
  }
  if(it.rowIdx != null && it.rowIdx !== '' && typeof rows !== 'undefined' && rows && rows[it.rowIdx] != null){
    var rn = parsePriceIT(rows[it.rowIdx].prezzo);
    if(rn > 0) return rn;
  }
  var pu = parsePriceIT(it.prezzoUnit);
  if(pu > 0) return pu;
  return 0;
}

/** Stringa da salvare in _prezzoOriginale (formato listino) */
function listinoPrezzoString(it){
  if(it.rowIdx != null && it.rowIdx !== '' && typeof rows !== 'undefined' && rows && rows[it.rowIdx] != null){
    var rp = rows[it.rowIdx].prezzo;
    if(rp != null && String(rp).trim() !== '' && parsePriceIT(rp) > 0) return String(rp);
  }
  if(it._prezzoOriginale != null && String(it._prezzoOriginale).trim() !== '' && parsePriceIT(it._prezzoOriginale) > 0) return String(it._prezzoOriginale);
  if(it.prezzoUnit != null && String(it.prezzoUnit).trim() !== '' && parsePriceIT(it.prezzoUnit) > 0) return String(it.prezzoUnit);
  return '';
}

/**
 * Garantisce _prezzoOriginale dal listino (rows → prezzoUnit). Non modifica rows[] / Firebase.
 * @param fillPrezzoUnit se true e prezzoUnit è vuoto/0, lo imposta al listino.
 */
function ensurePrezzoOriginaleDaListino(it, fillPrezzoUnit){
  var str = listinoPrezzoString(it);
  if(!str) return false;
  if(!it._prezzoOriginale || parsePriceIT(it._prezzoOriginale) <= 0) it._prezzoOriginale = str;
  if(fillPrezzoUnit && (!it.prezzoUnit || parsePriceIT(it.prezzoUnit) <= 0)) it.prezzoUnit = str;
  return true;
}

/** €/unità mostrato in totale riga ordine: usa prezzoUnit se valido, altrimenti listino + forbice */
function ordItemLineUnitSelling(it){
  var u = parsePriceIT(it.prezzoUnit);
  if(u > 0) return u;
  var p = listinoPrezzoNum(it);
  if(p <= 0) return 0;
  var sc = it._scontoApplicato || 0;
  if((it.scampolo || it.fineRotolo) && sc > 0) return p * (1 - sc / 100);
  if(it._scaglionato && sc > 0){
    var q = parseFloat(it.qty || 0);
    if(q >= (it._scaglioneQta || 10)) return p * (1 - sc / 100);
  }
  return p;
}
/** Legge e trimma il valore di un input per id */
function gf(id){ var el=document.getElementById(id); return el?(el.value||'').trim():''; }
var rows=[], removed=new Set(lsGet(RK,[])), cestino=lsGet(CK,[]);
var movimenti=lsGet(MOVK)||[];
var sortCol=null, sortDir=1, noteIdx=null, pendingImport=[];
var categorie=[], magazzino={};
var _epIdx=null, _epSnapshot=null, _epIsNew=false, _epFromCart=false;

var DEF=[]; // Cartellini partono sempre vuoti — si aggiungono via CSV o ricerca


// -- Scorta minima default = 1 ------------------------------
function getSoglia(i){
  var m=magazzino[i]||{};
  if(m.soglia!==undefined && m.soglia!=='' && m.soglia!==null) return Number(m.soglia);
  return 1; // default
}

function getQty(i){
  var m=magazzino[i]||{};
  return m.qty!==undefined&&m.qty!==''?Number(m.qty):null;
}

// Toast "sotto scorta"
var _toastTimer=null;
function showScortaToast(desc, qty, soglia){
  var el=document.getElementById('scorta-toast');
  if(!el) return;
  el.textContent='- SCORTA BASSA\n' + desc + '\nRimasti: ' + qty + ' | Min: ' + soglia;
  el.classList.add('show');
  if(_toastTimer) clearTimeout(_toastTimer);
  _toastTimer=setTimeout(function(){ el.classList.remove('show'); },4000);
}

// Controlla scorta dopo modifica qty e mostra toast se necessario
function checkScorta(i, nuovaQty, prevQty){
  var soglia=getSoglia(i);
  var desc=(rows[i]&&rows[i].desc)||'Articolo';
  // Avvisa solo se: nuova qty - sotto soglia E stava scendendo (vendita)
  if(nuovaQty !== null && nuovaQty <= soglia){
    if(prevQty === null || nuovaQty < prevQty || nuovaQty === 0){
      showScortaToast(desc, nuovaQty, soglia);
    }
  }
}

function autoSize(p){return parsePriceIT(p)<100?'small':'large';}

// Categorie default ferramenta
var CAT_DEFAULT=[
  {id:'vit',nome:'Viteria & Bulloneria',sub:['Viti autofilettanti','Viti per legno','Bulloni','Dadi e rondelle','Tirafondi','Ganci e occhielli']},
  {id:'chi',nome:'Chiodi & Ancoraggi',sub:['Chiodi lisci','Chiodi ramati','Tasselli','Ancore chimiche','Staffe']},
  {id:'ele',nome:'Elettrico',sub:['Cavi e fili','Prese e interruttori','Quadri elettrici','Lampadine','Fascette e passacavi','Nastro isolante','Tubi corrugati']},
  {id:'idr',nome:'Idraulica',sub:['Tubi e raccordi','Valvole e rubinetti','Sifoni e scarichi','Guarnizioni','Pompe']},
  {id:'edi',nome:'Edilizia',sub:['Cemento e malte','Reti e griglie','Teli e impermeabilizzanti','Viti da cartongesso','Profili']},
  {id:'ute',nome:'Utensileria',sub:['Utensili manuali','Utensili elettrici','Punte e frese','Accessori utensili','Misura e tracciatura']},
  {id:'ver',nome:'Verniciatura',sub:['Smalti e vernici','Primer e fondi','Pennelli e rulli','Carta vetrata','Nastro da carrozziere']},
  {id:'fis',nome:'Fissaggi & Colla',sub:['Siliconi','Colle bicomponenti','Nastri biadesivi','Schiume poliuretaniche','Sigillanti']},
  {id:'sic',nome:'Sicurezza & DPI',sub:['Mascherine','Guanti','Occhiali','Scarpe antinfortunio','Caschi']},
  {id:'gia',nome:'Giardinaggio',sub:['Decespugliatori','Tagliaerba','Tubi irrigazione','Attrezzi giardino']},
  {id:'fco',nome:'Ferramenta Comune',sub:['Cerniere','Serrature','Maniglie','Ganci e supporti','Guida e binari']},
  {id:'aut',nome:'Auto & Moto',sub:['Oli e lubrificanti','Accessori auto','Catene e cavi','Shampoo e pulizia']},
  {id:'alt',nome:'Altro',sub:['Varie']},
];

// --- TOGGLE TEMA CHIARO/SCURO -------------------------------------------
function toggleTheme(){
  var body=document.body;
  var isLight=body.classList.toggle('light-mode');
  localStorage.setItem('cp4_theme', isLight?'light':'dark');
  _updateThemeBtn(isLight);
}
function _updateThemeBtn(isLight){
  var icon=document.getElementById('theme-icon');
  var label=document.getElementById('theme-label');
  if(icon)icon.textContent=isLight?'--':'-';
  if(label)label.textContent=isLight?'Tema scuro':'Tema chiaro';
}
function initTheme(){
  var t=localStorage.getItem('cp4_theme');
  var isLight=(t==='light');
  if(isLight) document.body.classList.add('light-mode');
  _updateThemeBtn(isLight);
}

// --- CREA NUOVO ARTICOLO DAL CARRELLO -----------------------------------
// --- NUOVO ARTICOLO DA CARRELLO -------------------------------
function openNuovoArticoloDaCarrello(){
  ['nac-desc','nac-prezzo','nac-codf','nac-codm','nac-nota'].forEach(function(id){
    var el=document.getElementById(id);if(el)el.value='';
  });
  var qty=document.getElementById('nac-qty');if(qty)qty.value=1;
  var unit=document.getElementById('nac-unit');if(unit)unit.value='pz';
  document.getElementById('nac-overlay').classList.add('open');
  setTimeout(function(){var d=document.getElementById('nac-desc');if(d)d.focus();},150);
}
function nacChiudi(){document.getElementById('nac-overlay').classList.remove('open');}
function nacConferma(){
  if(!activeCartId)return;
  var cart=carrelli.find(function(c){return c.id===activeCartId;});if(!cart)return;
  var desc=(document.getElementById('nac-desc')||{}).value||'';
  if(!desc.trim()){showToastGen('red','-- Inserisci una descrizione');return;}
  var prezzo=(document.getElementById('nac-prezzo')||{}).value||'0';
  var qty=parseFloat((document.getElementById('nac-qty')||{}).value)||1;
  var unit=(document.getElementById('nac-unit')||{}).value||'pz';
  var codF=(document.getElementById('nac-codf')||{}).value||'';
  var codM=(document.getElementById('nac-codm')||{}).value||'';
  var nota=(document.getElementById('nac-nota')||{}).value||'';
  (cart.items=cart.items||[]).push({desc:desc.trim(),codF:codF,codM:codM,prezzoUnit:prezzo,qty:qty,unit:unit,nota:nota,scampolo:false,hasScaglioni:false,scaglioni:[],_scaglioniAperti:false});
  saveCarrelli();nacChiudi();renderCartTabs();
  showToastGen('green','- Articolo aggiunto');
}


function init(){
  // rows = database Firebase (caricato da loadMagazzinoFB, non da SK)
  // ctRows = cartellini (chiave separata CTK)
  var savedCt = lsGet(CTK, null);
  ctRows = (savedCt && savedCt.length) ? savedCt : [];

  // SK era usato per i cartellini nelle versioni precedenti.
  // Se contiene dati vecchi e sono pochi (cartellini), migra a CTK poi svuota SK.
  var savedSK = lsGet(SK, null);
  if(savedSK && savedSK.length > 0 && savedSK.length <= 500 && !ctRows.length){
    // Migrazione: vecchi cartellini da SK -> CTK
    ctRows = savedSK;
    lsSet(CTK, ctRows);
    lsSet(SK, []);
    console.log('init: migrati '+ctRows.length+' cartellini da SK a CTK');
  } else if(savedSK && savedSK.length > 500){
    // SK corrotto (erano i 19.000 articoli Firebase salvati per errore) — azzera
    console.warn('init: SK corrotto ('+savedSK.length+' righe), azzerato');
    lsSet(SK, []);
  }

  // rows parte vuoto — verrà popolato da loadMagazzinoFB (Firebase)
  rows = [];

  categorie=lsGet(CATK,null)||CAT_DEFAULT.map(function(c){return Object.assign({},c,{sub:c.sub.slice()});});
  magazzino=lsGet(MAGK,{});
  // Precarica tutte le foto da IndexedDB in cache (poi ri-renderizza)
  idbPreloadAll().then(function(){ renderTable(); renderMagazzino(); renderCartTabs(); renderOrdini(); });
  renderTable(); genTags(); updateStats(); updateBadge(); updateStockBadge(); renderInventario(); updateCartBadge(); updateOrdBadge(); updateMovBadge();
  _undoReady = true; // da qui in poi _takeSnapshot - attiva
  setTimeout(checkAutoBackup, 2500);
  loadFatture();
  loadOrdFor();
  // Avvia sull'inventario
  goTab('t0');
}
function esc(s){return (String(s===null||s===undefined?'':s)).replace(/&/g,'&amp;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');}
function sel(id,val,opts,onch){
  return '<select id="'+id+'" onchange="'+onch+'">'+opts.map(function(o){return '<option value="'+o[0]+'"'+(o[0]===val?' selected':'')+'>'+o[1]+'</option>';}).join('')+'</select>';
}

var GIORNALINI=[
  {val:'',label:'-',color:'#e5e7eb',text:'#666',nastro:'#6b7280'},
  {val:'rosso',label:'-',color:'#fee2e2',text:'#dc2626',nastro:'#dc2626'},
  {val:'giallo',label:'-',color:'#fef9c3',text:'#ca8a04',nastro:'#ca8a04'},
  {val:'verde',label:'-',color:'#dcfce7',text:'#15803d',nastro:'#15803d'},
  {val:'blu',label:'-',color:'#dbeafe',text:'#1d4ed8',nastro:'#1d4ed8'},
  {val:'viola',label:'-',color:'#f3e8ff',text:'#7c3aed',nastro:'#7c3aed'},
  {val:'arancio',label:'-',color:'#ffedd5',text:'#ea580c',nastro:'#ea580c'},
];

function getGiornalino(val){return GIORNALINI.find(function(g){return g.val===val;})||GIORNALINI[0];}

function selGiornalino(id,val,i){
  var g=getGiornalino(val);
  var opts=GIORNALINI.map(function(g){return '<option value="'+g.val+'"'+(g.val===val?' selected':'')+'>'+g.label+'</option>';}).join('');
  return '<select id="'+id+'" onchange="upd('+i+')" style="background:'+g.color+';color:'+g.text+';font-size:14px;padding:2px;">'+opts+'</select>';
}

// Paginazione tabella - performance con cataloghi grandi
var _tablePageSize = 300;
var _tableShowAll  = false;
var _filterIndices = null; // null = mostra tutto; array = indici filtrati

// [SECTION: CARTELLINI] ----------------------------------------------------
//  Render tabella dati, genera cartellini, stampa, storico fatture
function renderTable(){
  var tb=document.getElementById('vb');
  if(!tb) return; // (DOM = Document Object Model) elemento non ancora pronto, skip
  tb.innerHTML='';

  // Rimuovi banner precedente
  var oldBanner=document.getElementById('_rt_banner_row');
  if(oldBanner) oldBanner.remove();

  // Quali indici renderizzare
  var idx = _filterIndices !== null ? _filterIndices : null;
  var total = idx !== null ? idx.length : rows.length;
  var limit = (!_tableShowAll && total > _tablePageSize) ? _tablePageSize : total;

  // Banner se la tabella - cappata
  if(!_tableShowAll && total > _tablePageSize){
    var banner=document.createElement('tr');
    banner.id='_rt_banner_row';
    banner.innerHTML='<td colspan="12" style="text-align:center;padding:10px;background:#1a1a1a;border-bottom:2px solid var(--accent);">'+
      '<span style="color:var(--muted);font-size:12px;">- Mostrati i primi <b style="color:var(--accent)">'+_tablePageSize+'</b> di <b style="color:var(--accent)">'+total+'</b> articoli. '+
      'Usa la - ricerca per trovare altri oppure '+
      '<button onclick="_tableShowAll=true;renderTable();" style="background:var(--accent);color:#111;border:none;padding:4px 10px;border-radius:6px;cursor:pointer;font-size:11px;font-weight:700;margin-left:6px;">Mostra tutti</button></span>'+
      '</td>';
    tb.appendChild(banner);
  }

  for(var _li=0;_li<limit;_li++){
    var i = idx !== null ? idx[_li] : _li;
    var r=rows[i];
    if(!r) continue;
var isRem=removed.has(String(i));
    var m=magazzino[i]||{};
    var g=r.giornalino?getGiornalino(r.giornalino):null;
    var gBg=(!isRem&&g&&g.val)?g.color:'';
    var gText=(!isRem&&g&&g.val)?g.text:'var(--text)';
    var borderL=isRem?'border-left:3px solid #e53e3e44;':'border-left:3px solid '+(g&&g.val?g.nastro:'transparent')+';';
    var opacity=isRem?'opacity:.45;':'';
    var specs=m.specs||'';
    var hasSpecs=!!(m.specs||m.posizione);
    var soglia=getSoglia(i);
    var qty=m.qty!==undefined&&m.qty!==''?Number(m.qty):null;
    var isLow=qty!==null&&qty<=soglia;
    var unit=m.unit||'pz';

    var tr=document.createElement('tr');
    tr.dataset.idx=i;
    tr.style.cssText='border-bottom:1px solid var(--border);'+borderL+opacity+(gBg?'background:'+gBg+';':'');

    tr.innerHTML=
      // Data
      '<td style="padding:6px 5px;white-space:nowrap;">'+
        '<input type="text" id="d'+i+'" value="'+esc(r.data)+'" onchange="upd('+i+')" style="width:74px;padding:4px 5px;border:1px solid var(--border);border-radius:5px;background:#111;color:var(--muted);font-size:11px;">'+
      '</td>'+
      // Descrizione
      '<td style="padding:6px 5px;">'+
        '<input type="text" id="e'+i+'" value="'+esc(r.desc)+'" onchange="upd('+i+')" placeholder="Descrizione..." '+
          'style="width:100%;min-width:130px;padding:4px 6px;border:1px solid var(--border);border-radius:5px;background:#111;color:var(--text);font-size:12px;font-weight:600;">'+
      '</td>'+
      // Specifiche turchine (click apre overlay)
      '<td style="padding:6px 5px;max-width:160px;cursor:pointer;" onclick="openEditProdotto('+i+')" title="Modifica articolo">'+
        '<div style="font-size:11px;color:#2dd4bf;font-style:italic;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:155px;">'+
          (specs?(specs.length>40?esc(specs.substring(0,40))+'-':esc(specs)):'<span style="color:#444;font-size:10px;">- -</span>')+
        '</div>'+
        (m.posizione?'<div style="font-size:9px;color:#888;margin-top:1px;">- '+esc(m.posizione)+'</div>':'')+
      '</td>'+
      // Cod Fornitore
      '<td style="padding:6px 5px;">'+
        '<input type="text" id="f'+i+'" value="'+esc(r.codF)+'" onchange="upd('+i+')" placeholder="-" '+
          'style="width:82px;padding:4px 5px;border:1px solid #e53e3e44;border-radius:5px;background:#111;color:#fc8181;font-size:11px;font-weight:600;">'+
      '</td>'+
      // Mio Codice
      '<td style="padding:6px 5px;">'+
        '<input type="text" id="m'+i+'" value="'+esc(r.codM)+'" onchange="upd('+i+')" placeholder="-" '+
          'style="width:70px;padding:4px 5px;border:1px solid var(--accent)44;border-radius:5px;background:#111;color:var(--accent);font-size:11px;font-weight:600;">'+
      '</td>'+
      // Prezzo vecchio
      '<td style="padding:6px 5px;text-align:right;">'+
        '<input type="text" id="po'+i+'" value="'+esc(r.prezzoOld)+'" placeholder="-" onchange="upd('+i+')" '+
          'style="width:54px;padding:4px 5px;border:1px solid var(--border);border-radius:5px;background:#111;color:#888;font-size:11px;text-align:right;text-decoration:'+(r.prezzoOld?'line-through':'none')+';opacity:.7;">'+
      '</td>'+
      // Prezzo nuovo + storico
      '<td style="padding:6px 5px;text-align:right;white-space:nowrap;">'+
        '<input type="text" id="p'+i+'" value="'+esc(r.prezzo)+'" onchange="updPrice('+i+')" '+
          'style="width:50px;padding:4px 5px;border:1px solid var(--accent)44;border-radius:5px;background:#111;color:var(--accent);font-size:13px;font-weight:900;text-align:right;">'+
        ' <button onclick="showPriceHistory('+i+')" title="Storico prezzi" style="background:none;border:none;cursor:pointer;font-size:11px;vertical-align:middle;">-</button>'+
      '</td>'+
      // Giornalino
      '<td style="padding:6px 4px;text-align:center;">'+selGiornalino('gi'+i,r.giornalino||'',i)+'</td>'+
      // Dimensione
      '<td style="padding:6px 4px;text-align:center;">'+sel('s'+i,r.size,[['small','Piccolo'],['large','Grande']],'upd('+i+')')+'</td>'+
      // Quantit-
      '<td style="padding:6px 4px;text-align:center;white-space:nowrap;">'+
        '<button onclick="deltaQta('+i+',-1)" style="background:#333;border:none;color:var(--text);width:20px;height:20px;border-radius:4px;cursor:pointer;font-size:13px;font-weight:bold;line-height:1;vertical-align:middle;">-</button>'+
        '<input type="number" min="0" value="'+(qty!==null?qty:'')+'" placeholder="-" '+
          'style="width:38px;padding:3px 2px;border:1px solid '+(isLow?'#e53e3e':'var(--border)')+';border-radius:5px;background:#111;color:'+(isLow?'#e53e3e':'var(--accent)')+';font-size:12px;font-weight:900;text-align:center;margin:0 2px;vertical-align:middle;" '+
          'onchange="saveQta('+i+',this.value)" id="tb-qty-'+i+'">'+
        '<button onclick="deltaQta('+i+',1)" style="background:#333;border:none;color:var(--text);width:20px;height:20px;border-radius:4px;cursor:pointer;font-size:13px;font-weight:bold;line-height:1;vertical-align:middle;">+</button>'+
        (isLow?'<div style="font-size:9px;color:#e53e3e;margin-top:1px;">-- min:'+soglia+'</div>':'<div style="font-size:9px;color:var(--muted);margin-top:1px;">'+esc(unit)+'</div>')+
      '</td>'+
      // Note
      '<td style="padding:6px 4px;text-align:center;">'+
        '<button class="ni" onclick="openNote('+i+')" title="Note" style="font-size:16px;">'+(r.note?'--':'-')+'</button>'+
      '</td>'+
      // Azioni
      '<td style="padding:6px 4px;text-align:center;white-space:nowrap;">'+
        '<button class="dup-btn" onclick="dupRow('+i+')" title="Duplica" style="font-size:14px;">-</button> '+
        '<button class="del-btn" onclick="delRow('+i+')" style="font-size:13px;">-</button>'+
      '</td>';

    tb.appendChild(tr);
  }
  updateStats();
}

function readRow(i){
  if(!rows[i]) return;
  rows[i]={
    data: (document.getElementById('d'+i)||{}).value||'',
    desc: (document.getElementById('e'+i)||{}).value||'',
    codF: (document.getElementById('f'+i)||{}).value||'',
    codM: (document.getElementById('m'+i)||{}).value||'',
    prezzoOld:(document.getElementById('po'+i)||{}).value||'',
    prezzo:(document.getElementById('p'+i)||{}).value||'',
    size:(document.getElementById('s'+i)||{}).value||'small',
    note:rows[i].note||'',
    priceHistory:rows[i].priceHistory||[],
    giornalino:(document.getElementById('gi'+i)||{value:rows[i].giornalino||''}).value,
  };
}

function upd(i){readRow(i);save();updateStats();updRowColor(i);}
function updRowColor(i){
  var tr=document.querySelector('#tb tr[data-idx="'+i+'"]');
  if(!tr) return;
  if(rows[i]&&rows[i].giornalino){
    var g=getGiornalino(rows[i].giornalino);
    tr.style.background=g.color;
    tr.classList.remove('promo-row');
  } else {
    tr.style.background='';
    tr.classList.remove('promo-row');
  }
  var s=document.getElementById('gi'+i);
  if(s&&rows[i]){
    var g=getGiornalino(rows[i].giornalino||'');
    s.style.background=g.color; s.style.color=g.text;
  }
}
function updPrice(i){
  var oldPrezzo=rows[i]?rows[i].prezzo:'';
  readRow(i);
  if(oldPrezzo && oldPrezzo!==rows[i].prezzo){
    if(!rows[i].priceHistory) rows[i].priceHistory=[];
    rows[i].priceHistory.unshift({prezzo:oldPrezzo, data:new Date().toLocaleDateString('it-IT')});
  }
  var s=document.getElementById('s'+i);
  if(s){s.value=autoSize(rows[i].prezzo);rows[i].size=s.value;}
  save();updateStats();
}

function clearAll(){
  var d=document.createElement('div');
  d.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;';
  d.innerHTML='<div style="background:#fff;border-radius:10px;padding:24px;max-width:320px;text-align:center;box-shadow:0 8px 32px rgba(0,0,0,.3);">'+
    '<div style="font-size:32px;margin-bottom:12px;">--</div>'+
    '<p style="font-size:14px;font-weight:bold;margin-bottom:8px;">Eliminare tutto?</p>'+
    '<p style="font-size:12px;color:#666;margin-bottom:16px;">Tutti gli articoli verranno spostati nel cestino.</p>'+
    '<div style="display:flex;gap:8px;justify-content:center;">'+
    '<button id="cancel-clear" style="background:#6b7280;color:#fff;border:none;padding:8px 18px;border-radius:5px;cursor:pointer;font-size:13px;">Annulla</button>'+
    '<button id="confirm-clear" style="background:#dc2626;color:#fff;border:none;padding:8px 18px;border-radius:5px;cursor:pointer;font-size:13px;">Elimina tutto</button>'+
    '</div></div>';
  document.body.appendChild(d);
  document.getElementById('cancel-clear').onclick=function(){d.remove();};
  document.getElementById('confirm-clear').onclick=function(){
    d.remove();
    rows.forEach(function(r){cestino.unshift(Object.assign({},r,{deletedAt:new Date().toLocaleString('it-IT')}));});
    rows=[]; removed=new Set(); lsSet(RK,[]); lsSet(CK,cestino);
    save(); renderTable(); genTags(); updateBadge();
  };
}

function addRow(){
  showConfirm('⚠️ Stai aggiungendo un NUOVO articolo al database. Continuare?', function(){
    var firstDate=rows.length>0?rows[0].data:'04-03-2026';
    rows.push({data:firstDate,desc:'',codF:'',codM:'',prezzoOld:'',prezzo:'',size:'small',note:'',giornalino:''});
    renderTable();save();
  });
}

function delRow(i){
  if(!rows[i]) return;
  _takeSnapshot();
  cestino.unshift(Object.assign({},rows[i],{deletedAt:new Date().toLocaleString('it-IT')}));
  lsSet(CK,cestino);
  rows.splice(i,1);
  var newRem=new Set();
  removed.forEach(function(idx){
    var n=Number(idx);
    if(n<i) newRem.add(String(n));
    else if(n>i) newRem.add(String(n-1));
  });
  removed=newRem; lsSet(RK,removed.slice());
  // Salva SENZA leggere dal DOM (il DOM - disallineato dopo splice)
  if(rows.length<=5000) lsSet(SK,rows); lsSet(MAGK,magazzino); updateStats();
  renderTable(); genTags(); updateBadge();
  showToastGen('red','- Eliminato');
}

function save(){
  _takeSnapshot();
  rows.forEach(function(_,i){if(document.getElementById('d'+i)) readRow(i);});
  // Salta localStorage se il catalogo è troppo grande (limite ~5MB)
  if(rows.length <= 5000) lsSet(SK,rows);
  lsSet(MAGK,magazzino);
  updateStats();
}

function updateStats(){
  var stEl=document.getElementById('st');
  if(!stEl) return; // DOM non ancora pronto
  var total=rows.length, rem=removed.size;
  var conGiornalino=rows.filter(function(r,i){return r.giornalino&&!removed.has(String(i));}).length;
  stEl.textContent=total;
  document.getElementById('sa').textContent=total-rem;
  document.getElementById('sr').textContent=rem;
  document.getElementById('sp').textContent=conGiornalino;
  document.getElementById('sc2').textContent=cestino.length;
  updatePromoBadge();
}

function updateBadge(){
  var b=document.getElementById('cb');
  if(!b) return;
  b.textContent=cestino.length;
  b.style.display=cestino.length>0?'inline':'none';
  updateStats();
}

function norm(s){return (s||'').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9\s]/g,' ').replace(/\s+/g,' ').trim();}
function stem(w){
  if(w.length<5) return w;
  var rules=[/zioni$/,/zione$/,/tori$/,/tore$/,/elli$/,/ella$/,/ello$/,/etti$/,/etta$/,/etto$/,/ali$/,/ale$/,/ori$/,/ore$/,/ari$/,/are$/,/ici$/,/ico$/,/ica$/,/osi$/,/oso$/,/nti$/,/nte$/,/oli$/,/ola$/,/olo$/];
  var stems=['zion','zion','tor','tor','ell','ell','ell','ett','ett','ett','al','al','or','or','ar','ar','ic','ic','ic','os','os','nt','nt','ol','ol','ol'];
  for(var j=0;j<rules.length;j++) if(rules[j].test(w)) return w.replace(rules[j],stems[j]);
  return w.replace(/[aeiou]$/,'');
}
function lev(a,b){
  if(a===b) return 0;
  var dp=[];
  for(var i=0;i<=b.length;i++){dp[i]=[i];for(var j=1;j<=a.length;j++) dp[i][j]=i===0?j:0;}
  for(var i=1;i<=b.length;i++) for(var j=1;j<=a.length;j++)
    dp[i][j]=b[i-1]===a[j-1]?dp[i-1][j-1]:1+Math.min(dp[i-1][j-1],dp[i][j-1],dp[i-1][j]);
  return dp[b.length][a.length];
}
function wordScore(qw,tw){
  if(qw===tw) return 100;
  if(tw.startsWith(qw)) return 85;
  if(qw.startsWith(tw)&&tw.length>=3) return 78;
  var qs=stem(qw),ts=stem(tw);
  if(qs&&ts&&qs===ts) return 72;
  if(qs&&ts&&ts.startsWith(qs)&&qs.length>=4) return 62;
  if(qw.length>=5&&tw.length>=4){
    var tol=qw.length<=6?1:2;
    if(lev(qw,tw)<=tol) return 55;
    if(qs.length>=4&&ts.length>=4&&lev(qs,ts)<=1) return 45;
  }
  return 0;
}
function fuzzyScore(query,text){
  var q=norm(query),t=norm(text);
  if(!q) return 100;
  if(t.includes(q)) return 100;
  var qw=q.split(' ').filter(function(w){return w.length>1;});
  var tw=t.split(' ').filter(Boolean);
  if(!qw.length) return 0;
  var tot=0;
  for(var wi=0;wi<qw.length;wi++){
    var best=0;
    for(var ti=0;ti<tw.length;ti++){best=Math.max(best,wordScore(qw[wi],tw[ti]));if(best===100) break;}
    if(best===0) return 0;
    tot+=best;
  }
  return tot/qw.length;
}
function doFilter(){
  var q=(document.getElementById('si')||{value:''}).value.trim();
  var hint=document.getElementById('sh');

  if(!q){
    _filterIndices=null;
    _tableShowAll=false;
    renderTable();
    if(hint) hint.textContent='';
    return;
  }

  // Cerca su TUTTI i rows[] (non solo quelli renderizzati)
  var qn=norm(q);
  var matches=[];
  for(var i=0;i<rows.length;i++){
    var r=rows[i];
    if(!r) continue;
    var text=[r.data,r.desc,r.codF,r.codM,r.prezzo,r.prezzoOld,r.note].join(' ');
    if(fuzzyScore(qn,text)>=60) matches.push(i);
  }

  _filterIndices=matches;
  _tableShowAll=(matches.length<=_tablePageSize);
  renderTable();

  if(hint){
    if(matches.length===0) hint.textContent='-- Nessun risultato';
    else hint.textContent=matches.length+' risultat'+(matches.length===1?'o':'i')+' su '+rows.length;
  }
}

function doSort(col){
  if(sortCol===col) sortDir*=-1; else{sortCol=col;sortDir=1;}
  rows.sort(function(a,b){
    var va=a[col]||'',vb=b[col]||'';
    if(col==='prezzo'||col==='prezzoOld'){
      va=parseFloat(va.replace(',','.'))||0;vb=parseFloat(vb.replace(',','.'))||0;
      return (va-vb)*sortDir;
    }
    return va.localeCompare(vb)*sortDir;
  });
  removed.clear();lsSet(RK,[]);
  save();renderTable();
  document.querySelectorAll('th .si').forEach(function(s){s.textContent='-';});
  var cols=['data','desc','codF','codM','prezzoOld','prezzo'];
  var idx=cols.indexOf(col);
  if(idx>=0){var icons=document.querySelectorAll('th .si');if(icons[idx])icons[idx].textContent=sortDir===1?'-':'-';}
}

function openNote(i){
  noteIdx=i;
  _noteSnapshot=rows[i]?rows[i].note||'':null;
  document.getElementById('nd').textContent=rows[i]?rows[i].desc||'':'';
  var full=rows[i]?rows[i].note||'':'';
  document.getElementById('nt').value=full.split('|||')[0];
  var npEl=document.getElementById('np');
  if(npEl) npEl.style.display='none';
  document.getElementById('nm').classList.add('open');
}
function saveNote(){
  if(noteIdx===null) return;
  var txt=document.getElementById('nt').value.trim();
  if(rows[noteIdx]) rows[noteIdx].note=txt;
  save(); updateNoteBadge();
  var btn=document.querySelector('#tb tr[data-idx="'+noteIdx+'"] .ni');
  if(btn) btn.textContent=rows[noteIdx].note?'--':'-';
  _noteSnapshot=null; // conferma: non ripristinare
  document.getElementById('nm').classList.remove('open');
  noteIdx=null;
}
function closeNote(){
  // ripristina snapshot se esiste (Annulla)
  if(_noteSnapshot!==null && noteIdx!==null && rows[noteIdx]){
    rows[noteIdx].note=_noteSnapshot;
    save(); updateNoteBadge();
  }
  _noteSnapshot=null;
  document.getElementById('nm').classList.remove('open');
  noteIdx=null;
}

function makeTag(r,idx){
  var cls=r.size==='large'?'tag-large':'tag-small';
  var cp=r.giornalino?' cp':'';
  var g=getGiornalino(r.giornalino||'');
  var showBarrato=editorSettings.barrato?(r.barrato==='si'||r.prezzoOld):false;
  var oldH=showBarrato&&r.prezzoOld?'<span class="top2">&euro;&nbsp;'+r.prezzoOld+'</span>':'';
  var clickAttr=(idx!==undefined)?'onclick="quickEditPrice('+idx+')" title="Tocca per modificare il prezzo" style="cursor:pointer;"':'';
  var promoStyle=r.giornalino?'--promo-color:'+g.nastro+';':'';
  return '<div class="'+cls+cp+'" style="'+promoStyle+'"><div class="th2"><span class="td2">'+r.data+'</span></div><div class="tpa">'+oldH+'<span class="tpr" '+clickAttr+'>&euro;&nbsp;'+r.prezzo+'</span></div><div class="tf2"><span class="tcf">'+r.codF+'</span><span class="tcm">'+r.codM+'</span></div></div>';
}
function buildTagsHTML(data,withIdx){
  var active=data.filter(function(r,i){return !removed.has(String(i));});
  var sm=active.filter(function(r){return r.size==='small';});
  var lg=active.filter(function(r){return r.size==='large';});
  var h='';
  // calcola indici originali
  function origIdx(r){ return rows.indexOf(r); }
  for(var i=0;i<sm.length;i+=3) h+='<div class="tag-row">'+sm.slice(i,i+3).map(function(r){return makeTag(r,withIdx?origIdx(r):undefined);}).join('')+'</div>';
  for(var i=0;i<lg.length;i+=2) h+='<div class="tag-row">'+lg.slice(i,i+2).map(function(r){return makeTag(r,withIdx?origIdx(r):undefined);}).join('')+'</div>';
  return h;
}
function genTags(){
  save();
  var printArea=document.getElementById('print-area');
  if(!printArea) return; // DOM non ancora pronto
  var html=buildTagsHTML(rows,true);
  printArea.innerHTML=html;
  var t1area=document.getElementById('print-area-t1');
  if(t1area) t1area.innerHTML=html;
}
function showPrev(){
  genTags();
  document.getElementById('pc').innerHTML=buildTagsHTML(rows,false);
  document.getElementById('pov').classList.add('open');
  // Scala l'anteprima in modo che 1mm corrisponda visivamente alle proporzioni reali
  _scalePrevContainer();
}
function showPrevPromoScaled(){
  var promo=rows.filter(function(r,i){return r.giornalino&&!removed.has(String(i));});
  if(!promo.length){showToastGen('red','-- Nessun articolo con giornalino');return;}
  document.getElementById('pc').innerHTML=buildTagsHTML(promo);
  document.getElementById('pov').classList.add('open');
  _scalePrevContainer();
}
function _scalePrevContainer(){
  // Calcola quanti px = 1mm sul dispositivo reale
  var mmPx = (function(){
    var d=document.createElement('div');
    d.style.cssText='position:absolute;width:100mm;height:0;visibility:hidden;';
    document.body.appendChild(d);
    var px=d.getBoundingClientRect().width;
    document.body.removeChild(d);
    return px/100;
  })();
  var pc=document.getElementById('pc');
  if(!pc)return;
  // Larghezza disponibile del pannello (pb) meno padding 6mm-2
  var pb=document.getElementById('pb');
  var availW=(pb?pb.getBoundingClientRect().width:window.innerWidth) - 12*mmPx;
  // Larghezza A4 reale in mm = 210mm, meno margini 4mm-2 = 202mm
  var a4W=202*mmPx;
  var scale=Math.min(1, availW/a4W);
  pc.style.transformOrigin='top left';
  pc.style.transform='scale('+scale.toFixed(4)+')';
  pc.style.width=(a4W)+'px';
  pc.style.marginBottom=((a4W*(scale-1)))+'px'; // compensa lo spazio perso
}
function closePrev(){document.getElementById('pov').classList.remove('open');}

function quickEditPrice(idx){
  if(!rows[idx]) return;
  var r=rows[idx];
  var d=document.createElement('div');
  d.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;';
  d.innerHTML='<div style="background:#fff;border-radius:10px;padding:24px;max-width:320px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,.3);">'+
    '<p style="font-size:13px;font-weight:bold;color:#1e3a5f;margin-bottom:4px;">-- Modifica prezzo</p>'+
    '<p style="font-size:11px;color:var(--muted);margin-bottom:12px;">'+esc(r.desc)+'</p>'+
    '<label style="font-size:11px;color:var(--muted);">Nuovo prezzo (-)</label>'+
    '<input id="qep-val" type="text" value="'+esc(r.prezzo)+'" style="width:100%;padding:10px;border:2px solid #1e3a5f;border-radius:6px;font-size:18px;font-weight:bold;text-align:center;margin:6px 0 14px;">'+
    '<div style="display:flex;gap:8px;justify-content:center;">'+
    '<button id="qep-cancel" style="background:#6b7280;color:#fff;border:none;padding:8px 18px;border-radius:5px;cursor:pointer;font-size:13px;">Annulla</button>'+
    '<button id="qep-ok" style="background:#1d4ed8;color:#fff;border:none;padding:8px 18px;border-radius:5px;cursor:pointer;font-size:13px;">- Salva</button>'+
    '</div></div>';
  document.body.appendChild(d);
  var inp=document.getElementById('qep-val');
  inp.focus(); inp.select();
  document.getElementById('qep-cancel').onclick=function(){d.remove();};
  document.getElementById('qep-ok').onclick=function(){
    var newP=inp.value.trim();
    if(!newP){d.remove();return;}
    // salva storico
    if(!rows[idx].priceHistory) rows[idx].priceHistory=[];
    if(rows[idx].prezzo && rows[idx].prezzo!==newP){
      rows[idx].priceHistory.unshift({prezzo:rows[idx].prezzo, data:new Date().toLocaleDateString('it-IT')});
    }
    rows[idx].prezzo=newP;
    rows[idx].size=autoSize(newP);
    // aggiorna input nella tabella se visibile
    var inp2=document.getElementById('p'+idx);
    if(inp2) inp2.value=newP;
    var sel=document.getElementById('s'+idx);
    if(sel) sel.value=rows[idx].size;
    save(); genTags(); updateStats();
    d.remove();
  };
}

function showPriceHistory(idx){
  if(!rows[idx]) return;
  var r=rows[idx];
  var hist=r.priceHistory||[];
  var d=document.createElement('div');
  d.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center;';
  var histH=hist.length?hist.map(function(h){
    return '<tr><td style="padding:5px 8px;color:var(--muted);">'+h.data+'</td><td style="padding:5px 8px;font-weight:bold;">- '+h.prezzo+'</td></tr>';
  }).join(''):'<tr><td colspan="2" style="padding:10px;color:#aaa;text-align:center;">Nessuno storico</td></tr>';
  d.innerHTML='<div style="background:#fff;border-radius:10px;padding:24px;max-width:340px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,.3);">'+
    '<p style="font-size:13px;font-weight:bold;color:#1e3a5f;margin-bottom:4px;">- Storico prezzi</p>'+
    '<p style="font-size:11px;color:var(--muted);margin-bottom:12px;">'+esc(r.desc)+'</p>'+
    '<p style="font-size:12px;margin-bottom:6px;">Prezzo attuale: <b style="color:#dc2626;">- '+esc(r.prezzo)+'</b></p>'+
    '<table style="width:100%;border-collapse:collapse;font-size:12px;">'+
    '<tr style="background:#f0f4ff;"><th style="padding:5px 8px;text-align:left;">Data modifica</th><th style="padding:5px 8px;text-align:left;">Prezzo precedente</th></tr>'+
    histH+'</table>'+
    '<div style="margin-top:14px;text-align:right;">'+
    '<button id="ph-close" style="background:#6b7280;color:#fff;border:none;padding:8px 18px;border-radius:5px;cursor:pointer;font-size:13px;">Chiudi</button>'+
    '</div></div>';
  document.body.appendChild(d);
  document.getElementById('ph-close').onclick=function(){d.remove();};
}

function showList(){
  var al=document.getElementById('al');al.innerHTML='';
  rows.forEach(function(r,i){
    var isRem=removed.has(String(i));
    var li=document.createElement('li');
    if(isRem) li.classList.add('r');
    li.innerHTML='<input type="checkbox"'+(isRem?' checked':'')+' onchange="toggleRem('+i+',this)">'+
      '<span class="ld">'+(r.desc||'(senza desc.)')+(r.note?'<span class="ln">- '+r.note+'</span>':'')+'</span>'+
      '<span class="lp">- '+r.prezzo+'</span><span class="lc">'+r.codF+'</span>';
    al.appendChild(li);
  });
  document.getElementById('lo').classList.add('open');
}
function closeList(){document.getElementById('lo').classList.remove('open');}
function toggleRem(i,cb){
  if(cb.checked){removed.add(String(i));cb.closest('li').classList.add('r');}
  else{removed.delete(String(i));cb.closest('li').classList.remove('r');}
  lsSet(RK,removed.slice());updateStats();
}
function clearChecked(){
  showConfirm('Rimuovere dalla tabella tutti gli articoli spuntati?', function(){

  var toRemove=removed.slice().map(Number).sort(function(a,b){return b-a;});
  toRemove.forEach(function(i){
    if(rows[i]){cestino.unshift(Object.assign({},rows[i],{deletedAt:new Date().toLocaleString('it-IT')}));rows.splice(i,1);}
  });
  lsSet(CK,cestino);removed.clear();lsSet(RK,[]);
  save();renderTable();closeList();updateBadge();

  });
}
function buildListHTML(){
  var nome=document.getElementById('fn').value;
  var tot=rows.length,rem=removed.size;
  var h='<html><head><title>Lista</title><style>body{font-family:Arial;padding:15mm;font-size:11pt;}h1{font-size:14pt;margin-bottom:4px;}.sub{color:var(--muted);font-size:10pt;margin-bottom:14px;}table{width:100%;border-collapse:collapse;font-size:10pt;}th{background:#1e3a5f;color:#fff;padding:5px 6px;text-align:left;}td{padding:4px 6px;border-bottom:1px solid #ddd;}.r{opacity:.4;text-decoration:line-through;}.price{font-weight:bold;color:#c00;}.note{font-size:9pt;color:var(--muted);font-style:italic;}.rb{background:#fee2e2;color:#c00;padding:1px 6px;border-radius:4px;font-size:8pt;}.ab{background:#dcfce7;color:#166534;padding:1px 6px;border-radius:4px;font-size:8pt;}</style></head><body>';
  h+='<h1>- Lista Articoli - '+nome+'</h1><p class="sub">Generato il '+new Date().toLocaleDateString('it-IT')+' - Totale: '+tot+' - Attivi: '+(tot-rem)+' - Rimossi: '+rem+'</p>';
  h+='<table><thead><tr><th>#</th><th>Descrizione</th><th>Cod.Forn.</th><th>Mio Cod.</th><th>Prezzo</th><th>Stato</th></tr></thead><tbody>';
  rows.forEach(function(r,i){
    var isR=removed.has(String(i));
    h+='<tr class="'+(isR?'r':'')+'"><td>'+(i+1)+'</td><td>'+(r.desc||'')+(r.note?'<br><span class="note">- '+r.note+'</span>':'')+'</td><td>'+r.codF+'</td><td>'+r.codM+'</td><td class="price">- '+r.prezzo+'</td><td>'+(isR?'<span class="rb">Rimosso</span>':'<span class="ab">Attivo</span>')+'</td></tr>';
  });
  return h+'</tbody></table></body></html>';
}
function exportPDF(){
  var w=window.open('');
  if(!w){showToastGen('red','-- Popup bloccato - usa Stampa - Salva come PDF.');return;}
  w.document.write(buildListHTML());
  w.document.close();
  setTimeout(function(){w.print();},600);
}
function printList(){exportPDF();}

function saveHist(){
  var name=document.getElementById('fn').value||'Fattura';
  save();
  if(!rows.length){showToastGen('red','-- Nessun dato da salvare');return;}
  var hist=lsGet(HK,[]);
  hist.unshift({id:Date.now(),name:name,date:new Date().toLocaleDateString('it-IT'),rows:rows.map(function(r){return Object.assign({},r);})});
  lsSet(HK,hist);showToastGen('green','- "'+name+'" salvata nello storico!');
}
function renderHist(){
  var hist=lsGet(HK,[]);
  var el=document.getElementById('hl');
  if(!hist.length){el.innerHTML='<p style="color:#aaa;font-size:13px;">Nessuna fattura salvata.</p>';return;}
  el.innerHTML=hist.map(function(h){
    return '<div class="hi"><div class="hi-info"><b>'+h.name+'</b><span>'+h.date+'</span><span>- '+h.rows.length+' articoli</span></div>'+
      '<div style="display:flex;gap:4px;flex-wrap:wrap;">'+
      '<button class="btn btn-teal" onclick="viewHist('+h.id+')">-- Visualizza</button>'+
      '<button class="btn" onclick="loadHist('+h.id+')">- Carica</button>'+
      '<button class="btn btn-red" onclick="delHist('+h.id+')">--</button></div></div>';
  }).join('');
}
function loadHist(id){
  var hist=lsGet(HK,[]);var e=hist.find(function(h){return h.id===id;});
  if(!e) return;
  showConfirm('Caricare "'+e.name+'"? I dati correnti andranno persi.', function(){
    document.getElementById('fn').value=e.name;
    rows=e.rows.map(function(r){return Object.assign({},r);});
    removed.clear();lsSet(RK,[]);
    save();renderTable();genTags();goTab('t1');
    showToastGen('green','- "'+e.name+'" caricata!');
  });
}
function delHist(id){
  showConfirm('Eliminare questa fattura dallo storico?', function(){

  var hist=lsGet(HK,[]).filter(function(h){return h.id!==id;});
  lsSet(HK,hist);renderHist();

  });
}
function viewHist(id){
  var hist=lsGet(HK,[]);var e=hist.find(function(h){return h.id===id;});
  if(!e) return;
  document.getElementById('vt').textContent='-- '+e.name+' - '+e.date;
  var tot=e.rows.length;
  var lg=e.rows.filter(function(r){return r.size==='large';}).length;
  var pr=e.rows.filter(function(r){return r.giornalino;}).length;
  document.getElementById('vs').innerHTML=
    '<div class="sc"><span class="n">'+tot+'</span>Articoli</div>'+
    '<div class="sc g"><span class="n">'+(tot-lg)+'</span>Piccoli</div>'+
    '<div class="sc o"><span class="n">'+lg+'</span>Grandi</div>'+
    '<div class="sc p"><span class="n">'+pr+'</span>Con Giornalino</div>';
  document.getElementById('vb').innerHTML=e.rows.map(function(r,i){
    var g=getGiornalino(r.giornalino||'');
    return '<tr style="background:'+(r.giornalino?g.color:(i%2?'#f9f9f9':''))+';border-bottom:1px solid #eee;">' +
      '<td style="padding:4px 5px;color:#888">'+(i+1)+'</td>'+
      '<td style="padding:4px 5px;font-weight:500">'+(r.desc||'-')+'</td>'+
      '<td style="padding:4px 5px;font-size:11px;color:#555">'+(r.codF||'-')+'</td>'+
      '<td style="padding:4px 5px;font-size:11px;color:#555">'+(r.codM||'-')+'</td>'+
      '<td style="padding:4px 5px;color:#aaa">'+(r.prezzoOld?'- '+r.prezzoOld:'-')+'</td>'+
      '<td style="padding:4px 5px;font-weight:bold;color:#dc2626">- '+r.prezzo+'</td>'+
      '<td style="padding:4px 5px;text-align:center">'+(r.giornalino?g.label:'-')+'</td>'+
      '<td style="padding:4px 5px;font-size:11px">'+(r.size==='large'?'Grande':'Piccolo')+'</td></tr>';
  }).join('');
  document.getElementById('vl').onclick=function(){closeView();loadHist(id);};
  document.getElementById('vo').classList.add('open');
}
function closeView(){document.getElementById('vo').classList.remove('open');}
function printView(){
  var title=document.getElementById('vt').textContent;
  var tbl=document.getElementById('vta').outerHTML;
  var w=window.open('','_blank');if(!w){showToastGen('red','-- Popup bloccato');return;}
  w.document.write('<html><head><title>'+title+'</title><style>body{font-family:Arial;padding:12mm;font-size:10pt;}h1{font-size:13pt;margin-bottom:10px;}table{width:100%;border-collapse:collapse;}th{background:#1e3a5f;color:#fff;padding:5px;}td{padding:4px 5px;border-bottom:1px solid #ddd;}</style></head><body><h1>'+title+'</h1>'+tbl+'</body></html>');
  w.document.close();w.print();
}

function renderCestino(){
  var el=document.getElementById('cl');var ca=document.getElementById('ca');
  if(!cestino.length){el.innerHTML='<p style="color:#aaa;font-size:13px;">Il cestino - vuoto.</p>';ca.style.display='none';}
  else {
    ca.style.display='block';
    el.innerHTML=cestino.map(function(r,i){
      return '<div style="border:1px solid #fee2e2;border-radius:6px;padding:10px 14px;margin-bottom:8px;background:#fff8f8;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;">'+
        '<div style="flex:1;min-width:0;"><div style="font-size:13px;font-weight:bold;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+(r.desc||'(senza descrizione)')+'</div>'+
        '<div style="font-size:11px;color:var(--muted);margin-top:2px;"><span style="color:#dc2626;font-weight:bold">- '+r.prezzo+'</span> - <span style="color:#fc8181;font-weight:600;">'+r.codF+'</span> / <span style="color:var(--accent);font-weight:600;">'+r.codM+'</span> - <i>Eliminato: '+r.deletedAt+'</i>'+(r.note?' - - '+r.note:'')+'</div></div>'+
        '<div style="display:flex;gap:5px;flex-shrink:0;"><button class="btn btn-green" onclick="restoreOne('+i+')">-- Ripristina</button><button class="btn btn-red" onclick="permDel('+i+')">- Elimina</button></div></div>';
    }).join('');
  }
  // Cestino carrelli/ordini
  var ccEl=document.getElementById('cart-cestino-list');
  if(!ccEl) return;
  if(!carrelliCestino.length){
    ccEl.innerHTML='<p style="color:#aaa;font-size:13px;">Nessun ordine nel cestino.</p>';
    return;
  }
  ccEl.innerHTML=carrelliCestino.map(function(cart,i){
    var tot=(cart.items||[]).reduce(function(s,it){return s+(parsePriceIT(it.prezzoUnit)*parseFloat(it.qty||0));},0);
    var items=(cart.items||[]).map(function(it){return '<div style="font-size:11px;color:#aaa;padding:2px 0;">- '+esc(it.desc||'')+'  -'+it.qty+'  -'+(parsePriceIT(it.prezzoUnit)*parseFloat(it.qty||0)).toFixed(2)+'</div>';}).join('');
    return '<div style="border:1px solid #333;border-radius:10px;padding:12px;margin-bottom:10px;background:#1e1e1e;">'+
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;">'+
      '<div style="font-size:13px;font-weight:800;color:var(--text);">- '+esc(cart.nome)+'</div>'+
      '<div style="font-size:14px;font-weight:900;color:var(--accent);">- '+tot.toFixed(2)+'</div></div>'+
      items+
      '<div style="font-size:10px;color:#555;margin:6px 0;">Eliminato: '+esc(cart.deletedAt||'')+'</div>'+
      '<div style="display:flex;gap:8px;margin-top:8px;">'+
      '<button onclick="ripristinaCarrello('+i+')" style="flex:1;padding:8px;border-radius:8px;border:1px solid #38a169;background:transparent;color:#68d391;font-size:12px;font-weight:700;cursor:pointer;touch-action:manipulation;">-- Ripristina</button>'+
      '<button onclick="eliminaCartCestino('+i+')" style="padding:8px 14px;border-radius:8px;border:1px solid #555;background:transparent;color:#888;font-size:12px;cursor:pointer;touch-action:manipulation;">- Elimina def.</button>'+
      '</div></div>';
  }).join('');
}

function ripristinaCarrello(i){
  var cart=carrelliCestino.splice(i,1)[0];
  if(!cart) return;
  delete cart.deletedAt;
  carrelli.push(cart);
  activeCartId=cart.id;
  lsSet(CART_CK, carrelliCestino);
  saveCarrelli();
  renderCestino();
  goTab('tc');
  showToastGen('green','-- Ordine ripristinato');
}

function eliminaCartCestino(i){
  carrelliCestino.splice(i,1);
  lsSet(CART_CK, carrelliCestino);
  renderCestino();
}
function restoreOne(i){
  var r=cestino[i];if(!r) return;
  var obj=Object.assign({},r);delete obj.deletedAt;
  rows.push(obj);cestino.splice(i,1);lsSet(CK,cestino);
  save();renderTable();renderCestino();updateBadge();
}
function restoreAll(){
  cestino.forEach(function(r){var obj=Object.assign({},r);delete obj.deletedAt;rows.push(obj);});
  cestino=[];lsSet(CK,cestino);save();renderTable();renderCestino();updateBadge();goTab('t1');
}
function permDel(i){
  showConfirm('Eliminare definitivamente? Non sar- pi- recuperabile.', function(){

  cestino.splice(i,1);lsSet(CK,cestino);renderCestino();updateBadge();

  });
}
function emptyTrash(){
  showConfirm('Svuotare il cestino? ' + cestino.length + ' articoli eliminati definitivamente.', function(){

  cestino=[];lsSet(CK,cestino);renderCestino();updateBadge();

  });
}

function dupRow(i){
  if(!rows[i]) return;
  // leggi valori aggiornati prima di duplicare
  if(document.getElementById('d'+i)) readRow(i);
  var copy=Object.assign({},rows[i]);
  rows.splice(i+1,0,copy);
  // shifta removed e cestino
  var newRem=new Set();
  removed.forEach(function(idx){
    var n=Number(idx);
    if(n<=i) newRem.add(String(n));
    else newRem.add(String(n+1));
  });
  removed=newRem; lsSet(RK,removed.slice());
  save(); renderTable();
  // evidenzia la riga duplicata
  setTimeout(function(){
    var tr=document.querySelector('#tb tr[data-idx="'+(i+1)+'"]');
    if(tr){tr.style.background='#fef9c3';setTimeout(function(){tr.style.background='';},1200);}
  },50);
}

function backupJSON(){
  var data={
    version:1,
    date:new Date().toISOString(),
    nome:document.getElementById('fn').value,
    rows:rows,
    removed:removed.slice(),
    cestino:cestino,
    history:lsGet(HK,[])
  };
  var a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
  a.download='backup_cartellini_'+new Date().toISOString().slice(0,10)+'.json';
  a.click();
}

function restoreJSON(e){
  var f=e.target.files[0]; if(!f) return;
  var r=new FileReader();
  r.onload=function(ev){
    try{
      var data=JSON.parse(ev.target.result);
      if(!data.rows||!Array.isArray(data.rows)) throw new Error('File non valido');
      showConfirm('Ripristinare il backup del '+new Date(data.date).toLocaleDateString('it-IT')+'?\nSovrascriver- i dati correnti.', function(){
        rows=data.rows;
        removed=new Set(data.removed||[]);
        cestino=data.cestino||[];
        if(data.history) lsSet(HK,data.history);
        if(data.nome) document.getElementById('fn').value=data.nome;
        lsSet(RK,removed.slice());
        lsSet(CK,cestino);
        save(); renderTable(); genTags(); updateBadge(); goTab('t1');
        showToastGen('green','- Backup ripristinato! '+rows.length+' articoli caricati');
      });
    }catch(err){ showToastGen('red','- Errore: '+err.message); }
  };
  r.readAsText(f,'UTF-8');
  e.target.value='';
}

// [SECTION: IMPORT/CSV] ----------------------------------------------------
//  Importazione CSV/TXT cartellini e magazzino, parser RFC4180, padding codici
function onDrop(e,sezione){
  e.preventDefault();
  var dz=sezione==='magazzino'?document.getElementById('drop-zone-mag'):document.getElementById('drop-zone');
  if(dz)dz.classList.remove('over');
  var f=e.dataTransfer.files[0];
  if(f) readCSV(f,sezione||'cartellini');
}
function onFileIn(e,sezione){
  var f=e.target.files[0];
  if(f) readCSV(f,sezione||'cartellini');
}
var _csvSezione='cartellini'; // traccia quale sezione sta importando
function readCSV(f,sezione){
  _csvSezione=sezione||'cartellini';
  var name=f.name.toLowerCase();
  if(!name.endsWith('.csv')&&!name.endsWith('.txt')){showToastGen('red','-- Carica un file .csv o .txt');return;}
  showToastGen('blue','- Lettura file in corso-');
  var r=new FileReader();
  r.onload=function(ev){
    setTimeout(function(){ parseCSV(ev.target.result); },50);
  };
  // Prova UTF-8, poi fallback ISO-8859-1 (Windows italiani)
  r.onerror=function(){showToastGen('red','- Errore lettura file');};
  r.readAsText(f,'UTF-8');
}

// Parser CSV RFC 4180 robusto: gestisce virgolette, separatori ; e ,
function _parseCSVLine(line, sep){
  var result=[], cur='', inQ=false;
  for(var i=0;i<line.length;i++){
    var c=line[i];
    if(inQ){
      if(c==='"'){
        if(i+1<line.length&&line[i+1]==='"'){cur+='"';i++;}
        else inQ=false;
      } else { cur+=c; }
    } else {
      if(c==='"'){inQ=true;}
      else if(c===sep){result.push(cur.trim());cur='';}
      else {cur+=c;}
    }
  }
  result.push(cur.trim());
  return result;
}
function _padCodF(cod){
  if(!cod)return cod;
  var trimmed=cod.trim();
  // Trova il primo trattino - tutto prima - il prefisso numerico da paddare
  var dashIdx=trimmed.indexOf('-');
  if(dashIdx>=0){
    var prefix=trimmed.slice(0,dashIdx).replace(/^0*/,'');
    var suffix=trimmed.slice(dashIdx+1);
    return prefix.padStart(5,'0')+'-'+suffix;
  }
  // Nessun trattino: se - tutto numerico, padda comunque a 5 cifre
  if(/^\d+$/.test(trimmed)){
    return trimmed.replace(/^0*/,'').padStart(5,'0');
  }
  return trimmed;
}

function parseCSV(text){
  // Normalizza line endings e rimuove BOM UTF-8
  text=text.replace(/^\uFEFF/,'').replace(/\r\n/g,'\n').replace(/\r/g,'\n');
  var allLines=text.split('\n');
  // Rileva separatore: punto e virgola o virgola
  var headerRaw=allLines[0]||'';
  var sep=headerRaw.indexOf(';')>=0?';':',';
  var header=headerRaw.toLowerCase();

  // Filtra righe vuote rispettando RFC4180 (virgolette multiriga non supportate nel split)
  var lines=allLines.filter(function(l){return l.trim();});
  if(lines.length<2){showToastGen('red','- File vuoto o non valido');return;}

  // -- Formato pipe | (gestionale inventario) --
  // Riconosce file con righe tipo: |00001|A|0201002|N|*|BTE MA ...|PZ|000000,00|N|
  var firstDataLine = lines.find(function(l){ return l.trim() && !l.startsWith('#'); }) || '';
  if(firstDataLine.trim().startsWith('|') || (firstDataLine.split('|').length > 5)){
    pendingImportDB=[];pendingImportCartellini=[];
    var pipeRows = lines.filter(function(l){ return l.trim() && !l.startsWith('#'); });
    var CHUNK=500, idx=0;
    function processPipeChunk(){
      var end=Math.min(idx+CHUNK, pipeRows.length);
      for(;idx<end;idx++){
        var l=pipeRows[idx].trim();
        if(!l.startsWith('|')) continue;
        // Rimuove il | iniziale e finale, poi splitta
        var parts=l.replace(/^\||\|$/g,'').split('|');
        // Struttura: [0]=indice [1]=tipo [2]=codM [3]=gruppo [4]=carSpec [5]=desc [6]=unit [7]=qty [8]=inventariato
        if(parts.length < 7) continue;
        var codM    = parts[2].trim();
        var desc    = parts[5].replace(/\*/g,'').replace(/\^/g,'').trim();
        var unit    = (parts[6]||'PZ').trim();
        var qtyRaw  = (parts[7]||'0').trim().replace(',','.');
        var qty     = parseFloat(qtyRaw)||0;
        if(!desc && !codM) continue;
        pendingImportDB.push({
          desc: desc,
          codF: '',        // non presente nel file
          codM: codM,
          qty:  qty,
          pa:   '',        // non presente
          pv:   '',        // non presente
          unit: unit,
          giornalino: ''
        });
      }
      if(idx < pipeRows.length){
        showToastGen('blue','- Elaborazione- '+idx+'/'+pipeRows.length);
        setTimeout(processPipeChunk, 10);
      } else {
        _finalizzaImportPipe();
      }
    }
    processPipeChunk();
    return;
  }

  // -- Nuovo formato (con colonna Giornalino) --
  if(header.indexOf('giornalino')>=0){
    var cols=_parseCSVLine(lines[0],sep).map(function(c){return c.toLowerCase().replace(/\s+/g,'');});
    var ci={};cols.forEach(function(c,i){ci[c]=i;});
    var iNome=ci['nomeprodotto']!=null?ci['nomeprodotto']:0;
    var iCodF=ci['codicefornitore']!=null?ci['codicefornitore']:1;
    var iCodM=ci['codicemagazzino']!=null?ci['codicemagazzino']:2;
    var iQty=ci['quantit-']!=null?ci['quantit-']:(ci['quantita']!=null?ci['quantita']:3);
    var iPA=ci['prezzoacquisto']!=null?ci['prezzoacquisto']:4;
    var iPV=ci['prezzovendita']!=null?ci['prezzovendita']:5;
    var iG=ci['giornalino']!=null?ci['giornalino']:6;
    var iUnit=ci['unitamisura']!=null?ci['unitamisura']:(ci['unita']!=null?ci['unita']:-1);

    pendingImportDB=[];pendingImportCartellini=[];
    var dataRows=lines.slice(1);
    // Processing a chunk per non bloccare UI su file grandi
    var CHUNK=500, idx=0;
    function processChunk(){
      var end=Math.min(idx+CHUNK,dataRows.length);
      for(;idx<end;idx++){
        var c=_parseCSVLine(dataRows[idx],sep);
        var nome=(c[iNome]||'').trim();
        if(!nome)continue;
        var codF=_padCodF((c[iCodF]||'').trim());
        var codM=(c[iCodM]||'').trim();
        var qty=parseFloat((c[iQty]||'0').replace(',','.'))||0;
        var pa=(c[iPA]||'').trim().replace(',','.');
        var pv=(c[iPV]||'').trim().replace(',','.');
        var giorn=(c[iG]||'').trim().toLowerCase();
        var unit=(iUnit>=0 && c[iUnit]) ? (c[iUnit]||'').trim().toLowerCase() : '';
        pendingImportDB.push({desc:nome,codF:codF,codM:codM,qty:qty,pa:pa,pv:pv,giornalino:giorn,unit:unit});
        if(giorn==='si'||giorn==='s-'){
          var colonParts=giorn.split(':');
          var coloreGiorn=(colonParts.length>1&&colonParts[1].trim())?colonParts[1].trim():'rosso';
          pendingImportCartellini.push({
            data:new Date().toLocaleDateString('it-IT'),
            desc:nome,codF:codF,codM:codM,
            prezzoOld:'',prezzo:pv||'0',
            note:'',barrato:'no',promo:'no',size:'',
            giornalino:coloreGiorn
          });
        }
      }
      if(idx<dataRows.length){
        showToastGen('blue','- Elaborazione- '+idx+'/'+dataRows.length);
        setTimeout(processChunk,10);
      } else {
        _finalizzaImportNuovo();
      }
    }
    processChunk();
    return;
  }

  // -- Vecchio formato (punto e virgola, solo cartellini) --
  pendingImportDB=null;pendingImportCartellini=null;
  pendingImport=lines.slice(1).map(function(l){
    var c=_parseCSVLine(l,sep);
    var prezzoOld=(c[4]||'').trim();
    return {data:(c[0]||'').trim(),desc:(c[1]||'').trim(),codF:_padCodF((c[2]||'').trim()),codM:(c[3]||'').trim(),prezzoOld:prezzoOld,prezzo:(c[5]||'').trim(),note:(c[6]||'').trim(),barrato:prezzoOld?'si':'no',promo:'no',size:''};
  }).filter(function(r){return r.prezzo;});
  pendingImport.forEach(function(r){if(!r.size) r.size=autoSize(r.prezzo);});
  if(!pendingImport.length){showToastGen('red','- Nessun dato valido');return;}
  var h='<table style="width:100%;border-collapse:collapse;font-size:11px;"><tr style="background:#1e3a5f;color:#fff;"><th style="padding:4px">Data</th><th>Descrizione</th><th>Cod.Forn.</th><th>Mio Cod.</th><th>- Vec.</th><th>- Nuovo</th><th>Note</th></tr>';
  pendingImport.forEach(function(r){h+='<tr style="border-bottom:1px solid #eee"><td style="padding:3px">'+r.data+'</td><td>'+r.desc+'</td><td>'+r.codF+'</td><td>'+r.codM+'</td><td>'+r.prezzoOld+'</td><td><b>'+r.prezzo+'</b></td><td style="color:var(--muted);font-size:10px">'+r.note+'</td></tr>';});
  document.getElementById('imp-wrap').innerHTML=h+'</table>';
  document.getElementById('imp-prev').style.display='block';
}

function _finalizzaImportPipe(){
  if(!pendingImportDB||!pendingImportDB.length){showToastGen('red','- Nessun dato valido nel file');return;}
  var h='<div style="margin-bottom:8px;font-size:12px;color:#68d391;font-weight:700;">- '+pendingImportDB.length+' articoli trovati</div>';
  h+='<div style="font-size:11px;color:#f6ad55;background:#2a1800;border-left:3px solid #f6ad55;padding:6px 10px;border-radius:6px;margin-bottom:8px;">-- Solo giacenze - i prezzi vanno aggiunti manualmente. Gli articoli gi- presenti verranno aggiornati.</div>';
  h+='<table style="width:100%;border-collapse:collapse;font-size:10px;"><tr style="background:#0d2a0d;color:#68d391;"><th style="padding:4px;text-align:left;">Cod. Magazzino</th><th style="text-align:left;">Descrizione</th><th>U.M.</th><th>Giacenza</th></tr>';
  pendingImportDB.slice(0,200).forEach(function(r){
    h+='<tr style="border-bottom:1px solid #1a3a1a;"><td style="padding:3px;color:var(--accent);">'+esc(r.codM)+'</td><td style="color:var(--text);">'+esc(r.desc)+'</td><td style="color:#aaa;text-align:center;">'+esc(r.unit||'PZ')+'</td><td style="color:#68d391;font-weight:700;text-align:center;">'+r.qty+'</td></tr>';
  });
  if(pendingImportDB.length>200) h+='<tr><td colspan="4" style="padding:6px;color:#555;text-align:center;">-e altri '+(pendingImportDB.length-200)+' articoli</td></tr>';
  h+='</table>';
  // Mostra nella sezione magazzino
  document.getElementById('imp-wrap-mag').innerHTML=h;
  document.getElementById('imp-prev-mag').style.display='block';
  pendingImport=null;
  showToastGen('green','- '+pendingImportDB.length+' articoli pronti - premi Importa in Magazzino');
}

function _finalizzaImportNuovo(){
  if(!pendingImportDB.length){showToastGen('red','⚠ Nessun dato valido');return;}
  pendingImportCartellini.forEach(function(r){if(!r.size)r.size=autoSize(r.prezzo);});
  var tot = pendingImportDB.length;
  var h='<div style="margin-bottom:8px;font-size:12px;color:var(--accent);font-weight:700;">📋 '+tot+' prodotti &nbsp;|&nbsp; 🏷️ '+pendingImportCartellini.length+' cartellini &nbsp; <span style="font-size:10px;color:#555;font-weight:400;">— clicca una cella per modificare</span></div>';
  var inpStyle = 'background:transparent;border:none;color:inherit;font-size:10px;width:100%;padding:2px 0;font-family:inherit;';
  h+='<table style="width:100%;border-collapse:collapse;font-size:10px;"><tr style="background:#1e3a5f;color:#fff;"><th style="padding:4px;text-align:left;">Nome</th><th>Cod.F</th><th>Cod.M</th><th>U.M.</th><th>Qty</th><th>€ Acq.</th><th>€ Vend.</th><th>🏷️</th><th></th></tr>';
  var max = Math.min(tot, 200);
  for(var ri = 0; ri < max; ri++){
    var r = pendingImportDB[ri];
    var gColor = r.giornalino || '';
    var bg = gColor ? '#1a2a00' : 'transparent';
    h+='<tr id="csv-row-'+ri+'" style="border-bottom:1px solid #333;background:'+bg+';">';
    h+='<td style="padding:3px;"><input style="'+inpStyle+'color:var(--text);" value="'+esc(r.desc)+'" onchange="pendingImportDB['+ri+'].desc=this.value"></td>';
    h+='<td><input style="'+inpStyle+'color:#fc8181;" value="'+esc(r.codF)+'" onchange="pendingImportDB['+ri+'].codF=this.value"></td>';
    h+='<td><input style="'+inpStyle+'color:var(--accent);" value="'+esc(r.codM)+'" onchange="pendingImportDB['+ri+'].codM=this.value"></td>';
    h+='<td><input style="'+inpStyle+'color:#63b3ed;width:30px;" value="'+esc(r.unit||'pz')+'" onchange="pendingImportDB['+ri+'].unit=this.value"></td>';
    h+='<td><input type="number" style="'+inpStyle+'color:var(--text);width:40px;" value="'+r.qty+'" onchange="pendingImportDB['+ri+'].qty=parseFloat(this.value)||0"></td>';
    h+='<td><input style="'+inpStyle+'color:var(--text);width:45px;" value="'+esc(r.pa)+'" onchange="pendingImportDB['+ri+'].pa=this.value"></td>';
    h+='<td><input style="'+inpStyle+'color:var(--text);font-weight:700;width:45px;" value="'+esc(r.pv)+'" onchange="pendingImportDB['+ri+'].pv=this.value"></td>';
    h+='<td><input style="'+inpStyle+'color:#38a169;width:40px;" value="'+esc(gColor)+'" onchange="pendingImportDB['+ri+'].giornalino=this.value"></td>';
    h+='<td><button onclick="_csvRemoveRow('+ri+')" style="background:transparent;border:none;color:#e53e3e;font-size:14px;cursor:pointer;padding:0 4px;" title="Rimuovi riga">✕</button></td>';
    h+='</tr>';
  }
  if(tot>200) h+='<tr><td colspan="9" style="padding:6px;color:#888;text-align:center;">…e altri '+(tot-200)+' prodotti (non modificabili)</td></tr>';
  h+='</table>';
  document.getElementById('imp-wrap').innerHTML=h;
  document.getElementById('imp-prev').style.display='block';
  pendingImport=null;
  showToastGen('green','📋 '+tot+' righe lette — modifica se necessario, poi conferma');
}

// Rimuove una riga dalla preview CSV e rigenera la tabella
function _csvRemoveRow(idx){
  if(!pendingImportDB || idx < 0 || idx >= pendingImportDB.length) return;
  pendingImportDB.splice(idx, 1);
  // Rimuovi anche da pendingImportCartellini se c'era
  if(pendingImportCartellini && pendingImportCartellini.length){
    pendingImportCartellini = pendingImportCartellini.filter(function(c){
      return pendingImportDB.some(function(r){ return r.codM === c.codM; });
    });
  }
  if(!pendingImportDB.length){
    cancelImp();
    showToastGen('yellow','Tutte le righe rimosse');
    return;
  }
  _finalizzaImportNuovo();
}
var pendingImportDB=null;
var pendingImportCartellini=null;

// -- Conferma import SOLO MAGAZZINO (formato pipe) --
function confirmImpMag(){
  if(!pendingImportDB||!pendingImportDB.length){showToastGen('red','-- Nessun dato da importare');return;}
  if(!_fbReady){showToastGen('red','-- Firebase non connesso - ricarica la pagina');return;}

  // Salva i dati PRIMA di chiamare cancelImpMag (che azzera pendingImportDB)
  var daImportare=pendingImportDB.slice();
  cancelImpMag();

  showToastGen('blue','- Caricamento su Firebase in corso-');

  // Costruisce l'array completo da salvare
  var existing={};
  rows.forEach(function(r){if(r.codM)existing[r.codM]=r;});

  var totali=daImportare.length;
  daImportare.forEach(function(r){
    if(existing[r.codM]){
      // Aggiorna esistente
      var old=existing[r.codM];
      if(r.desc&&!old.desc)old.desc=r.desc;
      if(r.unit)old.unit=r.unit.toLowerCase();
    } else {
      // Nuovo articolo
      existing[r.codM]={
        desc:r.desc,codF:'',codM:r.codM,
        prezzo:'',prezzoOld:'',barrato:'no',promo:'no',
        size:'small',data:new Date().toLocaleDateString('it-IT'),
        note:'',giornalino:'',
        unit:(r.unit||'pz').toLowerCase()
      };
    }
  });

  var finalArr=Object.values(existing);

  // Carica su Firebase a chunk da 500 per non bloccare
  var CHUNK=500, idx=0;
  var updates={};

  function uploadChunk(){
    var end=Math.min(idx+CHUNK, finalArr.length);
    for(;idx<end;idx++){
      updates[MAGEXT_K+'/'+idx]=finalArr[idx];
    }
    if(idx<finalArr.length){
      showToastGen('blue','- Upload- '+idx+'/'+finalArr.length);
      setTimeout(uploadChunk,20);
    } else {
      // Scrivi tutto in un colpo su Firebase
      _fbDb.ref().update(updates,function(err){
        if(err){
          showToastGen('red','- Errore Firebase: '+err.message);
        } else {
          rows=finalArr;
          _magExtLoaded=true;
          lsSet(SK,rows);
          renderInventario();updateStats();updateStockBadge();
          goTab('t0');
          showToastGen('green','- '+finalArr.length+' articoli salvati su Firebase!');
        }
      });
    }
  }
  uploadChunk();
}
function cancelImpMag(){
  pendingImportDB=null;
  document.getElementById('imp-prev-mag').style.display='none';
  var fi=document.getElementById('fi-mag');if(fi)fi.value='';
}

function confirmImp(){
  // -- Nuovo formato (database + cartellini) --
  if(pendingImportDB&&pendingImportDB.length){
    // 1. Aggiorna/aggiungi al database (base: desc, codM, codF)
    pendingImportDB.forEach(function(r){
      var existIdx=-1;
      rows.forEach(function(row,i){
        if(removed.has(String(i)))return;
        if(r.codM&&row.codM===r.codM){existIdx=i;return;}
        if(r.codF&&row.codF===r.codF){existIdx=i;return;}
      });

      if(existIdx>=0){
        var old=rows[existIdx];
        if(r.pv)old.prezzo=r.pv;
        old.codF=r.codF||old.codF;
        old.codM=r.codM||old.codM;
        old.desc=r.desc||old.desc;
        var m=magazzino[existIdx]||{};
        if(r.qty>0)m.qty=r.qty;
        if(r.pa)m.prezzoAcquisto=r.pa;
        magazzino[existIdx]=m;
      } else {
        // Articolo NON trovato nel database — NON aggiungere (database protetto)
        console.warn('[IMPORT] Articolo non trovato, saltato:', r.codM, r.desc);
      }
    });
    lsSet(SK,rows);lsSet(MAGK,magazzino);

    // 2. Cartellini (solo Giornalino=S-) - mantiene il colore giornalino dal CSV
    if(pendingImportCartellini&&pendingImportCartellini.length){
      pendingImportCartellini.forEach(function(r){
        // Il colore giornalino - gi- memorizzato in r.giornalino (es. 'rosso', 'verde', 'blu'-)
        // Se non - un colore valido tra quelli noti, usa 'rosso' come fallback
        var coloreValido=['rosso','verde','blu','giallo','viola','arancio'];
        var colore=r.giornalino&&coloreValido.indexOf(r.giornalino)>=0?r.giornalino:'rosso';
        rows.forEach(function(row,i){
          if(!removed.has(String(i))&&(row.codM===r.codM||row.codF===r.codF)){
            // Assegna solo se non aveva gi- un colore giornalino
            if(!row.giornalino) row.giornalino=colore;
          }
        });
      });
    }

    save();renderTable();genTags();updateStats();updateStockBadge();
    var msg='- Database: '+pendingImportDB.length+' prodotti aggiornati';
    if(pendingImportCartellini&&pendingImportCartellini.length){
      msg+=' | -- '+pendingImportCartellini.length+' nei cartellini';
    }
    showToastGen('green',msg);
    cancelImp();goTab('t0');
    return;
  }

  // -- Vecchio formato (solo cartellini) --
  rows=pendingImport.map(function(r){return Object.assign({},r);});
  removed.clear();lsSet(RK,[]);save();renderTable();genTags();cancelImp();goTab('t1');updateStats();
  showToastGen('green','- Importati '+rows.length+' articoli');
}
function cancelImp(){pendingImport=[];document.getElementById('imp-prev').style.display='none';var fi=document.getElementById('fi');if(fi)fi.value='';var fi2=document.getElementById('fi-ct');if(fi2)fi2.value='';var ip2=document.getElementById('imp-prev-ct');if(ip2)ip2.style.display='none';}
function dlTemplate(){
  var csv='NomeProdotto;CodiceFornitore;CodiceMagazzino;UnitaMisura;Quantita;PrezzoAcquisto;PrezzoVendita;Giornalino\nVite 4x40 inox;00020-13/8;0329013;pz;100;1,20;3,50;\nTubo rame 22mm;04170-14/3;0308114;mt;50;2,80;6,90;rosso\n';
  var a=document.createElement('a');a.href=URL.createObjectURL(new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'}));a.download='template_cartellini.csv';a.click();
}

// ══ SINCRONIZZA CSV → DATABASE ═══════════════════════════════════════════════
// Prende i dati dal CSV caricato (pendingImportDB) e aggiorna il database:
// codF, prezzo (con storico max 5), prezzoAcquisto, qty — con data modifica
function syncCsvAlDatabase(){
  if(!pendingImportDB || !pendingImportDB.length){
    showToastGen('red','⚠️ Nessun CSV caricato — carica prima un file');
    return;
  }
  var oggi = new Date().toLocaleDateString('it-IT');
  var stats = { prezzi:0, codF:0, qty:0, acq:0, nuovi:0, unit:0, nonTrovati:0 };

  pendingImportDB.forEach(function(r){
    if(!r.codM && !r.codF) return;
    // Cerca articolo nel database
    var dbIdx = -1;
    for(var i = 0; i < rows.length; i++){
      if(!rows[i]) continue;
      if(r.codM && rows[i].codM === r.codM){ dbIdx = i; break; }
      if(r.codF && rows[i].codF === r.codF){ dbIdx = i; break; }
    }

    if(dbIdx >= 0){
      var row = rows[dbIdx];
      var m = magazzino[dbIdx] || {};
      var changed = false;

      // 1. Codice fornitore
      if(r.codF && r.codF !== row.codF){
        row.codF = r.codF;
        changed = true;
        stats.codF++;
      }

      // 2. Prezzo vendita (con storico)
      var pv = r.pv || '';
      if(pv && pv !== row.prezzo){
        if(row.prezzo){
          // Archivia prezzo corrente
          row.prezzoOld = row.prezzo;
          if(!row.priceHistory) row.priceHistory = [];
          row.priceHistory.unshift({ prezzo: row.prezzo, data: row.data || '' });
          if(row.priceHistory.length > 5) row.priceHistory.length = 5;
        }
        row.prezzo = pv;
        row.data = oggi;
        row.size = (typeof autoSize === 'function') ? autoSize(pv) : row.size;
        changed = true;
        stats.prezzi++;
      }

      // 3. Prezzo acquisto
      var pa = r.pa || '';
      if(pa && pa !== (m.prezzoAcquisto||'')){
        m.prezzoAcquisto = pa;
        m.prezzoAcquistoData = oggi;
        changed = true;
        stats.acq++;
      }

      // 4. Quantità
      if(r.qty > 0 && r.qty !== m.qty){
        m.qty = r.qty;
        m.qtyData = oggi;
        changed = true;
        stats.qty++;
      }

      // 5. Unità di misura
      if(r.unit && r.unit !== (m.unit||'pz')){
        m.unit = r.unit;
        changed = true;
        stats.unit++;
      }

      // 6. Giornalino
      if(r.giornalino && r.giornalino !== row.giornalino){
        row.giornalino = r.giornalino;
        changed = true;
        if(!stats.giorn) stats.giorn = 0;
        stats.giorn++;
      }

      if(changed){
        magazzino[dbIdx] = m;
        if(typeof _fbSaveArticolo === 'function') _fbSaveArticolo(dbIdx);
      }
    } else {
      // Articolo NON trovato — NON aggiungere (database protetto)
      stats.nonTrovati++;
    }
  });

  lsSet(SK, rows);
  lsSet(MAGK, magazzino);
  updateStats(); updateStockBadge();

  // Messaggio riepilogo
  var parts = [];
  if(stats.prezzi) parts.push(stats.prezzi + ' prezzi');
  if(stats.codF) parts.push(stats.codF + ' cod.forn.');
  if(stats.qty) parts.push(stats.qty + ' quantità');
  if(stats.acq) parts.push(stats.acq + ' pr.acquisto');
  if(stats.nuovi) parts.push(stats.nuovi + ' nuovi articoli');
  if(stats.unit) parts.push(stats.unit + ' unità misura');
  if(stats.nonTrovati) parts.push('⚠️ ' + stats.nonTrovati + ' non trovati (saltati)');
  if(stats.giorn) parts.push(stats.giorn + ' giornalino');
  if(parts.length){
    showToastGen('green', '✅ Database aggiornato: ' + parts.join(' · '));
  } else {
    showToastGen('yellow', 'Nessuna modifica — i dati erano già aggiornati');
  }
}

// Tab primarie (nav bar visibile)
var _PRIMARY_TABS = ['t0','t1','tc','to','tfat'];

function _updateBackBtn(id){ _updateUndoButtons(); }
function goBack(){ undoAction(); }
function goForward(){ redoAction(); }

function goTab(id){
  goTabDirect(id);
}
function goTabDirect(id){
  if(_PRIMARY_TABS.indexOf(id)>=0) _lastPrimaryTab=id;
  if((id==='t0'||id==='t1') && typeof loadMagazzinoFB==='function') loadMagazzinoFB();
  _updateBackBtn(id);
  document.querySelectorAll('.tab-content').forEach(function(t){t.classList.remove('active');});
  document.querySelectorAll('.tab-bottom-btn').forEach(function(b){b.classList.remove('active');});
  document.querySelectorAll('.altro-btn').forEach(function(b){b.classList.remove('active-tab');});
  var el=document.getElementById(id);
  if(el) el.classList.add('active');
  closeAltroMenu();
  if(['tfor','t2','t3'].indexOf(id) >= 0){
    // Dal popup Fatture - evidenzia Fatture nella tab bar
    var fatBtn = document.getElementById('tbb-tfat');
    if(fatBtn) fatBtn.classList.add('active');
  } else if(['t4','t6','t10','t11','t12','tmov'].indexOf(id) >= 0){
    // Tab secondaria - evidenzia -- Altro nella tab bar
    var altroBtn = document.getElementById('tbb-taltro');
    if(altroBtn) altroBtn.classList.add('active');
    var atbEl = document.getElementById('atb-'+id);
    if(atbEl) atbEl.classList.add('active-tab');
  } else if(['t7','t9'].indexOf(id) >= 0){
    // Dal popup Cartellini - evidenzia Cartellini nella tab bar
    var cartBtn = document.getElementById('tbb-t1');
    if(cartBtn) cartBtn.classList.add('active');
  } else {
    var tbb=document.getElementById('tbb-'+id);
    if(tbb) tbb.classList.add('active');
  }
  if(window.scrollTo) window.scrollTo(0,0);
  if(id==='t2') renderHist();
  if(id==='t4') renderCestino();
  if(id==='t7') renderPromo();
  if(id==='t9'){renderEditorPreview();renderGiornaliniRename();}
  if(id==='t10') renderNoteTab();
  if(id==='t0') renderInventario();
  if(id==='t1'){ renderTable(); genTags(); }
  if(id==='t11') renderMagazzino();
  if(id==='tc') renderCartTabs();
  if(id==='to'){renderOrdini();}
  if(id==='tmov'){renderMovimenti();}
  if(id==='t6'){renderBackupSettings();}
  if(id==='t12') renderCatTree();
  if(id==='tfat') renderFatture();
  if(id==='tfor') renderFornitori();
}

function renderPromo(){
  var conGiorn=rows.filter(function(r,i){return r.giornalino&&!removed.has(String(i));});
  var empty=document.getElementById('promo-empty');
  var listaEl=document.getElementById('giorn-lista');
  var tbl=document.getElementById('promo-table');
  var tags=document.getElementById('promo-tags');
  var badge=document.getElementById('pb2');
  badge.textContent=conGiorn.length;
  badge.style.display=conGiorn.length>0?'inline':'none';
  if(!conGiorn.length){
    empty.style.display='block';
    listaEl.innerHTML=''; tbl.innerHTML=''; tags.innerHTML='';
    return;
  }
  empty.style.display='none';

  // raggruppa per giornalino
  var gruppi={};
  rows.forEach(function(r,i){
    if(!r.giornalino||removed.has(String(i))) return;
    if(!gruppi[r.giornalino]) gruppi[r.giornalino]=[];
    gruppi[r.giornalino].push({r:r,i:i});
  });

  var listaH='<p style="font-size:12px;font-weight:bold;color:#1e3a5f;margin-bottom:10px;">-- Lista articoli - spunta quando hai messo il cartellino</p>';
  var tagsH='';

  Object.keys(gruppi).forEach(function(k){
    var g=getGiornalino(k);
    var items=gruppi[k];
    var label=g.label+' '+getNomeGiornalino(k);
    var idxArr=items.map(function(x){return x.i;});

    // -- LISTA SPUNTE --
    listaH+='<div style="margin-bottom:16px;border-radius:8px;overflow:hidden;border:2px solid '+g.text+'40;">';
    listaH+='<div style="background:'+g.color+';border-left:4px solid '+g.text+';padding:10px 14px;display:flex;justify-content:space-between;align-items:center;">';
    listaH+='<span style="font-size:13px;font-weight:bold;color:'+g.text+';">'+label+'</span>';
    listaH+='<span id="cnt-'+k+'" style="font-size:11px;color:'+g.text+';background:white;padding:2px 10px;border-radius:10px;font-weight:bold;">0 / '+items.length+'</span>';
    listaH+='</div><ul style="list-style:none;padding:0;margin:0;">';

    items.forEach(function(item){
      var r=item.r, idx=item.i;
      listaH+='<li id="li-'+k+'-'+idx+'" style="padding:10px 14px;border-bottom:1px solid '+g.color+';display:flex;align-items:center;gap:10px;background:white;">'+
        '<input type="checkbox" id="sp-'+k+'-'+idx+'" onchange="toggleSpunta(\''+k+'\','+idx+',this)" '+
        'style="width:22px;height:22px;flex-shrink:0;cursor:pointer;accent-color:'+g.text+';">'+
        '<label for="sp-'+k+'-'+idx+'" style="flex:1;cursor:pointer;">'+
          '<span style="font-size:13px;font-weight:500;display:block;">'+esc(r.desc)+'</span>'+
          '<span style="font-size:11px;color:var(--muted);">'+esc(r.codF)+(r.codM?' - '+esc(r.codM):'')+'</span>'+
        '</label>'+
        '<span style="font-size:15px;font-weight:bold;color:'+g.text+';white-space:nowrap;">- '+esc(r.prezzo)+'</span>'+
      '</li>';
    });

    listaH+='</ul><div style="background:'+g.color+'88;padding:8px 12px;display:flex;gap:6px;flex-wrap:wrap;">'+
      '<button onclick="spuntaTutti(\''+k+'\',['+idxArr.join(',')+'])" '+
      'style="background:'+g.text+';color:#fff;border:none;padding:7px 12px;border-radius:5px;cursor:pointer;font-size:12px;min-height:36px;">- Spunta tutti</button>'+
      '<button onclick="deSpuntaTutti(\''+k+'\',['+idxArr.join(',')+'])" '+
      'style="background:#6b7280;color:#fff;border:none;padding:7px 12px;border-radius:5px;cursor:pointer;font-size:12px;min-height:36px;">- Azzera</button>'+
      '</div></div>';

    // -- CARTELLINI --
    tagsH+='<div style="margin-bottom:16px;">'+
      '<div style="background:'+g.color+';border-left:4px solid '+g.text+';padding:6px 12px;border-radius:6px;font-size:12px;font-weight:bold;color:'+g.text+';margin-bottom:6px;">'+label+'</div>'+
      buildTagsHTML(items.map(function(x){return x.r;}))+'</div>';
  });

  listaEl.innerHTML=listaH;
  tbl.innerHTML='';
  tags.innerHTML='<p style="font-size:12px;font-weight:bold;color:#1e3a5f;margin:20px 0 8px;border-top:2px solid #e5e7eb;padding-top:16px;">-- Cartellini per giornalino:</p>'+tagsH;

  // Ripristina spunte da sessionStorage
  Object.keys(gruppi).forEach(function(k){
    var saved=JSON.parse(sessionStorage.getItem('sp_'+k)||'[]');
    saved.forEach(function(idx){
      var cb=document.getElementById('sp-'+k+'-'+idx);
      if(cb){cb.checked=true; applicaSpunta(k,idx,true);}
    });
    aggiornaContatore(k, gruppi[k].length);
  });
}

function toggleSpunta(colore,idx,cb){
  applicaSpunta(colore,idx,cb.checked);
  var saved=JSON.parse(sessionStorage.getItem('sp_'+colore)||'[]');
  if(cb.checked){ if(!saved.includes(idx)) saved.push(idx); }
  else { saved=saved.filter(function(x){return x!==idx;}); }
  sessionStorage.setItem('sp_'+colore,JSON.stringify(saved));
  var totale=rows.filter(function(r,i){return r.giornalino===colore&&!removed.has(String(i));}).length;
  aggiornaContatore(colore,totale);
}

function applicaSpunta(colore,idx,checked){
  var li=document.getElementById('li-'+colore+'-'+idx);
  if(!li) return;
  if(checked){
    li.style.background='#f0fdf4';
    li.style.opacity='0.55';
    var lbl=li.querySelector('label');
    if(lbl) lbl.style.textDecoration='line-through';
  } else {
    li.style.background='white';
    li.style.opacity='1';
    var lbl=li.querySelector('label');
    if(lbl) lbl.style.textDecoration='none';
  }
}

function aggiornaContatore(colore,totale){
  var cnt=document.getElementById('cnt-'+colore);
  if(!cnt) return;
  var spuntati=document.querySelectorAll('[id^="sp-'+colore+'-"]:checked').length;
  cnt.textContent=spuntati+' / '+totale;
  var g=getGiornalino(colore);
  cnt.style.background=spuntati===totale&&totale>0?'#dcfce7':'white';
  cnt.style.color=spuntati===totale&&totale>0?'#15803d':g.text;
}

function spuntaTutti(colore,idxArr){
  idxArr.forEach(function(idx){
    var cb=document.getElementById('sp-'+colore+'-'+idx);
    if(cb&&!cb.checked){cb.checked=true; applicaSpunta(colore,idx,true);}
  });
  sessionStorage.setItem('sp_'+colore,JSON.stringify(idxArr));
  aggiornaContatore(colore,idxArr.length);
}

function deSpuntaTutti(colore,idxArr){
  idxArr.forEach(function(idx){
    var cb=document.getElementById('sp-'+colore+'-'+idx);
    if(cb&&cb.checked){cb.checked=false; applicaSpunta(colore,idx,false);}
  });
  sessionStorage.removeItem('sp_'+colore);
  aggiornaContatore(colore,idxArr.length);
}

function removeGiornalino(idx){
  if(!rows[idx]) return;
  rows[idx].giornalino='';
  var s=document.getElementById('gi'+idx);
  if(s) s.value='';
  updRowColor(idx);
  save(); renderPromo(); updateStats();
}

function showPrevPromo(){
  var promo=rows.filter(function(r,i){return r.giornalino&&!removed.has(String(i));});
  if(!promo.length){showToastGen('red','-- Nessun articolo con giornalino');return;}
  document.getElementById('pc').innerHTML=buildTagsHTML(promo);
  document.getElementById('pov').classList.add('open');
  _scalePrevContainer();
}

function updatePromoBadge(){
  var promo=rows.filter(function(r,i){return r.giornalino&&!removed.has(String(i));});
  var badge=document.getElementById('pb2');
  if(!badge) return;
  badge.textContent=promo.length;
  badge.style.display=promo.length>0?'inline':'none';
}

// -- CERCA STORICO -------------------
function searchHistory(){
  var q=(document.getElementById('sh-query')||{}).value||'';
  var res=document.getElementById('sh-results');
  if(!res) return;
  var allRows=rows.concat(cestino);
  var filtered=q.trim()?allRows.filter(function(r){
    var t=[r.desc,r.codF,r.codM].join(' ').toLowerCase();
    return t.includes(q.toLowerCase());
  }):allRows;
  if(!filtered.length){res.innerHTML='<p style="color:#aaa;font-size:12px;text-align:center;padding:20px;">Nessun risultato.</p>';return;}
  var h='';
  filtered.forEach(function(r){
    var hist=r.priceHistory||[];
    var histH=hist.length?hist.map(function(h){
      return '<span style="font-size:10px;color:var(--muted);background:#f0f0f0;padding:2px 6px;border-radius:4px;margin-right:4px;">'+h.data+': <b>-'+h.prezzo+'</b></span>';
    }).join(''):'<span style="font-size:10px;color:#ccc;">Nessuna modifica</span>';
    h+='<div style="border:1px solid #e5e7eb;border-radius:8px;padding:12px;margin-bottom:8px;">'+
      '<div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:6px;">'+
      '<div><b style="font-size:12px;color:#1e3a5f;">'+esc(r.desc)+'</b><br>'+
      '<span style="font-size:11px;color:var(--muted);">Cod.Forn: '+esc(r.codF)+'&nbsp;&nbsp;Mio Cod: '+esc(r.codM)+'</span></div>'+
      '<span style="font-size:18px;font-weight:900;color:#dc2626;">- '+esc(r.prezzo)+'</span></div>'+
      '<div style="margin-top:8px;"><span style="font-size:10px;color:#666;font-weight:bold;">Storico: </span>'+histH+'</div>'+
      '</div>';
  });
  res.innerHTML=h;
}

// -- EDITOR CARTELLINI -------------------
var editorSettings={priceColor:'#000000',borderColor:'#aaaaaa',smW:67,smH:38,lgW:94,lgH:39,barrato:false,shape:'',frame:'',frameColor:'#aaaaaa',promoText:'PROMO',bg:'#ffffff'};

function loadEditorSettings(){
  var s=lsGet('cp4_editor',null);
  if(s) editorSettings=Object.assign(editorSettings,s);
  document.getElementById('ec-price-color').value=editorSettings.priceColor;
  document.getElementById('ec-border-color').value=editorSettings.borderColor;
  document.getElementById('ec-sm-w').value=editorSettings.smW;
  document.getElementById('ec-sm-h').value=editorSettings.smH;
  document.getElementById('ec-lg-w').value=editorSettings.lgW;
  document.getElementById('ec-lg-h').value=editorSettings.lgH;
  document.getElementById('ec-barrato').checked=editorSettings.barrato;
  var fc=document.getElementById('ec-frame-color');
  if(fc) fc.value=editorSettings.frameColor||'#aaaaaa';
  var pt=document.getElementById('ec-promo-text');
  if(pt) pt.value=editorSettings.promoText||'PROMO';
  // Aggiorna stato bottoni shape
  document.querySelectorAll('.ec-shape-btn').forEach(function(b){
    b.classList.toggle('active', b.getAttribute('data-shape')===(editorSettings.shape||''));
  });
  // Aggiorna stato bottoni frame
  document.querySelectorAll('.ec-frame-btn').forEach(function(b){
    b.classList.toggle('active', b.getAttribute('data-frame')===(editorSettings.frame||''));
  });
  // Aggiorna stato bottoni promo text
  document.querySelectorAll('.ec-promo-txt-btn').forEach(function(b){
    b.classList.toggle('active', b.getAttribute('data-val')===(editorSettings.promoText||'PROMO'));
  });
  // Aggiorna stato bottoni bg
  document.querySelectorAll('.ec-bg-btn').forEach(function(b){
    b.classList.toggle('active', b.getAttribute('data-val')===(editorSettings.bg||'#ffffff'));
  });
  // Aggiorna slider font/border
  var sliders=[
    {id:'ec-price-font-sm',label:'ec-price-font-sm-val',unit:'pt',def:26},
    {id:'ec-price-font-lg',label:'ec-price-font-lg-val',unit:'pt',def:32},
    {id:'ec-promo-font',label:'ec-promo-font-val',unit:'pt',def:6},
    {id:'ec-oldprice-font',label:'ec-oldprice-font-val',unit:'pt',def:10},
    {id:'ec-border-width',label:'ec-border-width-val',unit:'px',def:0.5}
  ];
  sliders.forEach(function(sl){
    var inp=document.getElementById(sl.id);
    var lbl=document.getElementById(sl.label);
    var val=editorSettings[sl.id]!==undefined?editorSettings[sl.id]:sl.def;
    if(inp) inp.value=val;
    if(lbl) lbl.textContent=val+sl.unit;
  });
}

function applyEditor(){
  editorSettings.priceColor=document.getElementById('ec-price-color').value;
  editorSettings.borderColor=document.getElementById('ec-border-color').value;
  editorSettings.smW=parseInt(document.getElementById('ec-sm-w').value)||67;
  editorSettings.smH=parseInt(document.getElementById('ec-sm-h').value)||38;
  editorSettings.lgW=parseInt(document.getElementById('ec-lg-w').value)||94;
  editorSettings.lgH=parseInt(document.getElementById('ec-lg-h').value)||39;
  editorSettings.barrato=document.getElementById('ec-barrato').checked;
  var fc=document.getElementById('ec-frame-color');
  if(fc) editorSettings.frameColor=fc.value;
  lsSet('cp4_editor',editorSettings);
  applyEditorCSS();
  renderEditorPreview();
  genTags();
}

function applyEditorCSS(){
  var s=document.getElementById('editor-style');
  if(!s){s=document.createElement('style');s.id='editor-style';document.head.appendChild(s);}
  var smW=editorSettings.smW, smH=editorSettings.smH;
  var lgW=editorSettings.lgW, lgH=editorSettings.lgH;
  var smRatio=(smW/smH).toFixed(4);
  var lgRatio=(lgW/lgH).toFixed(4);
  var shape=editorSettings.shape||'';
  var frame=editorSettings.frame||'';
  var fCol=editorSettings.frameColor||editorSettings.borderColor||'#aaaaaa';
  var promoTxt=editorSettings.promoText||'PROMO';
  var bg=editorSettings.bg||'#ffffff';
  // Slider values
  var priceFontSm=editorSettings['ec-price-font-sm']||26;
  var priceFontLg=editorSettings['ec-price-font-lg']||32;
  var promoFont=editorSettings['ec-promo-font']||6;
  var oldPriceFont=editorSettings['ec-oldprice-font']||10;
  var borderW=editorSettings['ec-border-width']!=null?editorSettings['ec-border-width']:0.5;

  var css='';
  // Bordo, colore prezzo, sfondo, spessore bordo
  css+='.tag-small,.tag-large{border:'+borderW+'px solid '+editorSettings.borderColor+'!important;background:'+bg+'!important;}';
  css+='.tpr{color:'+editorSettings.priceColor+'!important;}';
  // Font sizes da slider
  css+='.tag-small .tpr{font-size:'+priceFontSm+'pt!important;}';
  css+='.tag-large .tpr{font-size:'+priceFontLg+'pt!important;}';
  css+='.top2{font-size:'+oldPriceFont+'pt!important;}';
  // Dimensioni
  css+='.tag-small{width:'+smW+'mm!important;height:'+smH+'mm!important;aspect-ratio:'+smRatio+'!important;}';
  css+='.tag-large{width:'+lgW+'mm!important;height:'+lgH+'mm!important;aspect-ratio:'+lgRatio+'!important;}';
  // Prezzo centrato
  css+='.tpa{display:flex;flex-direction:column;align-items:center;justify-content:center;flex:1;gap:.5mm;padding:0 2mm;}';
  css+='.tpr{display:block;text-align:center;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}';

  // ── Forma ──
  css+='.tag-small,.tag-large{border-radius:0!important;clip-path:none!important;}';
  if(shape==='rounded'){
    css+='.tag-small,.tag-large{border-radius:4mm!important;}';
  } else if(shape==='pill'){
    css+='.tag-small,.tag-large{border-radius:12mm!important;padding-left:5mm!important;padding-right:5mm!important;}';
  } else if(shape==='ticket'){
    // Ticket: punta a sinistra — NO clip-path, usa SVG-like via bordo + inset
    // Metodo: nascondi overflow, aggiungi padding sinistro, disegna la punta con ::after
    css+='.tag-small,.tag-large{border-left:none!important;border-radius:0 2mm 2mm 0!important;padding-left:6mm!important;position:relative!important;}';
    css+='.tag-small::after,.tag-large::after{content:"";position:absolute;left:0;top:0;width:0;height:0;border-style:solid;border-color:transparent '+editorSettings.borderColor+' transparent transparent;z-index:5;pointer-events:none;}';
    css+='.tag-small::after{border-width:'+((smH/2))+'mm 3.5mm '+((smH/2))+'mm 0;}';
    css+='.tag-large::after{border-width:'+((lgH/2))+'mm 3.5mm '+((lgH/2))+'mm 0;}';
  }

  // ── Cornice ──
  if(frame==='double'){
    css+='.tag-small,.tag-large{outline:1px solid '+fCol+';outline-offset:-2.5mm;}';
  } else if(frame==='dotted'){
    css+='.tag-small,.tag-large{outline:1.5px dotted '+fCol+';outline-offset:-2mm;}';
  } else if(frame==='elegant'){
    css+='.tag-small,.tag-large{outline:0.8px solid '+fCol+';outline-offset:-2mm;box-shadow:inset 0 0 0 1mm '+bg+',inset 0 0 0 1.4mm '+fCol+';}';
  } else if(frame==='deco'){
    css+='.tag-small,.tag-large{outline:1.2px solid '+fCol+';outline-offset:-1.8mm;}';
  }

  // ── Ribbon PROMO — resta dentro il tag (overflow:hidden) ──
  // Il ribbon è ruotato a 35deg nell'angolo in alto a destra.
  // Più il font cresce, più il ribbon è alto → serve più spazio diagonale.
  // Calcoliamo width e posizione per restare sempre nel rettangolo.
  var txtLen=promoTxt.length;
  var smPromoFont= promoFont;
  var lgPromoFont= promoFont+1;
  // Padding verticale del ribbon proporzionale al font
  var ribbonPad = Math.max(0.8, promoFont * 0.18);
  // Larghezza ribbon: deve coprire la diagonale — più larga con font grandi
  // e con testi lunghi, ma limitata alla diagonale del tag
  var smDiag = Math.sqrt(smW*smW + smH*smH);
  var lgDiag = Math.sqrt(lgW*lgW + lgH*lgH);
  var smRibbonW = Math.min(smDiag * 0.55, Math.max(20, txtLen * promoFont * 0.5));
  var lgRibbonW = Math.min(lgDiag * 0.55, Math.max(24, txtLen * (promoFont+1) * 0.5));
  // Right offset: centra il testo sulla diagonale, si sposta verso dentro con font grandi
  var smRight = -(smRibbonW * 0.22) + (promoFont - 6) * 0.3;
  var lgRight = -(lgRibbonW * 0.22) + (promoFont - 6) * 0.3;
  // Top: scende un po' con font grandi per restare dentro
  var smTop = Math.max(1, 5 - (promoFont - 6) * 0.5);
  var lgTop = Math.max(1.5, 5.5 - (promoFont - 6) * 0.5);

  css+='.tag-small.cp::before,.tag-large.cp::before{content:"'+promoTxt.replace(/"/g,'\\"')+'"!important;padding:'+ribbonPad.toFixed(1)+'mm 0!important;}';
  css+='.tag-small.cp::before{font-size:'+smPromoFont+'pt!important;width:'+smRibbonW.toFixed(1)+'mm!important;right:'+smRight.toFixed(1)+'mm!important;top:'+smTop.toFixed(1)+'mm!important;}';
  css+='.tag-large.cp::before{font-size:'+lgPromoFont+'pt!important;width:'+lgRibbonW.toFixed(1)+'mm!important;right:'+lgRight.toFixed(1)+'mm!important;top:'+lgTop.toFixed(1)+'mm!important;}';

  // Stampa
  css+='@media print{';
  css+='.tag-small{width:'+smW+'mm!important;height:'+smH+'mm!important;max-width:'+smW+'mm!important;max-height:'+smH+'mm!important;}';
  css+='.tag-large{width:'+lgW+'mm!important;height:'+lgH+'mm!important;max-width:'+lgW+'mm!important;max-height:'+lgH+'mm!important;}';
  css+='}';

  s.textContent=css;
}

function renderEditorPreview(){
  var prev=document.getElementById('ec-preview');
  if(!prev) return;
  var sample=[
    {data:'09-03-2026',desc:'Esempio Articolo',codF:'00020-13/8',codM:'0329013',prezzoOld:'5,00',prezzo:'3,20',barrato:editorSettings.barrato?'si':'no',promo:'si',size:'small',note:'',giornalino:'rosso'},
    {data:'09-03-2026',desc:'Articolo Grande',codF:'04170-14/3',codM:'0308114',prezzoOld:'',prezzo:'139,00',barrato:'no',promo:'no',size:'large',note:''}
  ];
  prev.innerHTML=buildTagsHTML(sample);
}

function resetEditor(){
  editorSettings={priceColor:'#000000',borderColor:'#aaaaaa',smW:67,smH:38,lgW:94,lgH:39,barrato:false,shape:'',frame:'',frameColor:'#aaaaaa',promoText:'PROMO',bg:'#ffffff'};
  lsSet('cp4_editor',editorSettings);
  loadEditorSettings();
  applyEditorCSS();
  renderEditorPreview();
  genTags();
}

// ── Funzioni editor: Forma, Cornice, Testo Promo, Sfondo ────────────
function ec_setShape(val){
  editorSettings.shape=val;
  document.querySelectorAll('.ec-shape-btn').forEach(function(b){
    b.classList.toggle('active', b.getAttribute('data-shape')===val);
  });
  lsSet('cp4_editor',editorSettings);
  applyEditorCSS();
  renderEditorPreview();
  genTags();
}

function ec_setFrame(val){
  editorSettings.frame=val;
  document.querySelectorAll('.ec-frame-btn').forEach(function(b){
    b.classList.toggle('active', b.getAttribute('data-frame')===val);
  });
  lsSet('cp4_editor',editorSettings);
  applyEditorCSS();
  renderEditorPreview();
  genTags();
}

function ec_setPromoText(val){
  editorSettings.promoText=val||'PROMO';
  var inp=document.getElementById('ec-promo-text');
  if(inp && inp.value!==val) inp.value=val;
  document.querySelectorAll('.ec-promo-txt-btn').forEach(function(b){
    b.classList.toggle('active', b.getAttribute('data-val')===val);
  });
  lsSet('cp4_editor',editorSettings);
  applyEditorCSS();
  renderEditorPreview();
  genTags();
}

function ec_setBg(val){
  editorSettings.bg=val||'#ffffff';
  document.querySelectorAll('.ec-bg-btn').forEach(function(b){
    b.classList.toggle('active', b.getAttribute('data-val')===val);
  });
  lsSet('cp4_editor',editorSettings);
  applyEditorCSS();
  renderEditorPreview();
  genTags();
}

// ── Slider font size / border width ─────────────────────────────────
function ec_updateSliderVal(sliderId, labelId, unit){
  var slider=document.getElementById(sliderId);
  var label=document.getElementById(labelId);
  if(!slider||!label) return;
  label.textContent=slider.value+unit;
  // Salva nei settings
  editorSettings[sliderId]=parseFloat(slider.value);
  lsSet('cp4_editor',editorSettings);
  applyEditorCSS();
  renderEditorPreview();
  genTags();
}

// resetAI rimossa - stub vuoto non pi- necessario

// -- RINOMINA GIORNALINI -------------------
var giornaliniNomi={};

function loadGiornaliniNomi(){
  var s=lsGet('cp4_giornomi',null);
  if(s) giornaliniNomi=s;
}

function getNomeGiornalino(val){
  return giornaliniNomi[val]||val.charAt(0).toUpperCase()+val.slice(1);
}

function renderGiornaliniRename(){
  var div=document.getElementById('giornalini-rename');
  if(!div) return;
  var h='';
  GIORNALINI.filter(function(g){return g.val;}).forEach(function(g){
    var nome=giornaliniNomi[g.val]||'';
    h+='<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">'+
      '<span style="font-size:18px;">'+g.label+'</span>'+
      '<input type="text" placeholder="'+g.val.charAt(0).toUpperCase()+g.val.slice(1)+'" value="'+esc(nome)+'" '+
      'oninput="saveGiornaliniNome(\''+g.val+'\',this.value)" '+
      'style="flex:1;padding:5px 8px;border:1px solid #ccc;border-radius:4px;font-size:13px;">'+
      '</div>';
  });
  div.innerHTML=h;
}

function saveGiornaliniNome(val,nome){
  if(nome.trim()) giornaliniNomi[val]=nome.trim();
  else delete giornaliniNomi[val];
  lsSet('cp4_giornomi',giornaliniNomi);
  // aggiorna label nella tab promo se aperta
  renderPromo();
}

function autoW(el){
  var canvas=autoW._c||(autoW._c=document.createElement('canvas'));
  var ctx=canvas.getContext('2d');
  ctx.font='16px Arial';
  var w=ctx.measureText(el.value||'').width;
  el.style.width=Math.max(120,w+20)+'px';
}

function renderNoteTab(){
  var list=document.getElementById('note-list');
  var empty=document.getElementById('note-empty');
  // raccoglie articoli con nota, esclude cestino
  var withNote=rows.map(function(r,i){return {r:r,i:i};}).filter(function(o){
    return o.r.note && o.r.note.trim() && !removed.has(String(o.i));
  });
  updateNoteBadge();
  if(withNote.length===0){
    empty.style.display='block';
    list.innerHTML='';
    return;
  }
  empty.style.display='none';
  list.innerHTML=withNote.map(function(o){
    var r=o.r, i=o.i;
    // Separa nota da posizione: formato "nota|||posizione"
    var parts=(r.note||'').split('|||');
    var notaTxt=parts[0]||'';
    var posTxt=parts[1]||'';
    var giorn=r.giornalino?'<span style="font-size:10px;background:rgba(245,196,0,.15);color:var(--accent);border-radius:5px;padding:1px 6px;margin-left:6px;">- '+r.giornalino+'</span>':'';
    return '<div class="note-card" id="nc-'+i+'">'
      +'<div class="note-card-header">'
        +'<div style="flex:1">'
          +'<div class="note-card-title">'+(r.desc||'(senza descrizione)')+giorn+'</div>'
          +'<div class="note-card-meta">'+
            (r.codF?'<span style="color:var(--accent)">'+r.codF+'</span> - ':'')
            +(r.codM?r.codM+' - ':'')
            +'<span style="color:var(--muted)">'+r.data+'</span>'
          +'</div>'
        +'</div>'
        +'<div class="note-card-price">- '+r.prezzo+'</div>'
      +'</div>'
      // NOTA principale
      +'<textarea class="note-textarea" id="nt-'+i+'" placeholder="Nota articolo..." onchange="autoSaveNote('+i+')" oninput="autoSaveNote('+i+')">'+escHtml(notaTxt)+'</textarea>'
      // POSIZIONE (sotto-nota piccola)
      +'<input type="text" class="note-pos" id="np-'+i+'" value="'+escHtml(posTxt)+'" placeholder="- Posizione (es: Scaffale A3, Corsia 2...)" onchange="autoSaveNote('+i+')" oninput="autoSaveNote('+i+')">'
      +'<div style="display:flex;align-items:center;margin-top:8px;">'
        +'<button class="note-save-btn" onclick="saveNoteCard('+i+')">- Salva</button>'
        +'<span class="note-saved" id="ns-'+i+'">- Salvato!</span>'
        +'<button style="margin-left:auto;background:none;border:none;color:#e53e3e;font-size:12px;cursor:pointer;padding:4px 8px;" onclick="deleteNoteCard('+i+')">-- Cancella nota</button>'
      +'</div>'
    +'</div>';
  }).join('');
}

function escHtml(s){return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}

var _noteTimer={};
function autoSaveNote(i){
  clearTimeout(_noteTimer[i]);
  _noteTimer[i]=setTimeout(function(){saveNoteCard(i,true);},800);
}

function saveNoteCard(i,silent){
  var ta=document.getElementById('nt-'+i);
  var pos=document.getElementById('np-'+i);
  if(!ta||!rows[i]) return;
  var nota=ta.value.trim();
  var posizione=(pos?pos.value.trim():'');
  rows[i].note=nota+(posizione?'|||'+posizione:'');
  save();
  // aggiorna icona nella tabella principale
  var btn=document.querySelector('#tb tr[data-idx="'+i+'"] .ni');
  if(btn) btn.textContent=rows[i].note?'--':'-';
  updateNoteBadge();
  if(!silent){
    var ns=document.getElementById('ns-'+i);
    if(ns){ns.style.opacity='1';setTimeout(function(){ns.style.opacity='0';},1800);}
  }
}

function deleteNoteCard(i){
  if(!rows[i]) return;
  rows[i].note='';
  save();
  var btn=document.querySelector('#tb tr[data-idx="'+i+'"] .ni');
  if(btn) btn.textContent='-';
  renderNoteTab();
}

function updateNoteBadge(){
  var n=rows.filter(function(r,i){return r.note&&r.note.trim()&&!removed.has(String(i));}).length;
  var b=document.getElementById('note-badge');
  if(b){b.textContent=n;b.style.display=n?'inline':'none';}
}



// -----------------------------------------------
//  POSIZIONE (overlay - dalla tab Dati)
// -----------------------------------------------
var posIdx=null;
var _noteSnapshot=null;
var _posSnapshot=null;
var _sogliaSnapshot=null;

function openPos(i){
  posIdx=i;
  var m=magazzino[i]||{};
  _posSnapshot={specs:m.specs||'',posizione:m.posizione||'',soglia:m.soglia,prezzoAcquisto:m.prezzoAcquisto||''};
  document.getElementById('pm-desc').textContent=rows[i]?rows[i].desc||'':'';
  document.getElementById('pm-specs').value=m.specs||'';
  document.getElementById('pm-pos').value=m.posizione||'';
  var sqEl=document.getElementById('pm-soglia');if(sqEl) sqEl.value=m.soglia!==undefined?m.soglia:'';
  var acqEl=document.getElementById('pm-acq');if(acqEl) acqEl.value=m.prezzoAcquisto||'';
  document.getElementById('pm').classList.add('open');
}

function savePos(){
  if(posIdx===null) return;
  if(!magazzino[posIdx]) magazzino[posIdx]={};
  magazzino[posIdx].specs=document.getElementById('pm-specs').value.trim();
  magazzino[posIdx].posizione=document.getElementById('pm-pos').value.trim();
  var sqEl=document.getElementById('pm-soglia');if(sqEl){var sv=sqEl.value.trim();magazzino[posIdx].soglia=sv===''?'':Number(sv);}
  var acqEl=document.getElementById('pm-acq');if(acqEl) magazzino[posIdx].prezzoAcquisto=acqEl.value.trim();
  lsSet(MAGK,magazzino);
  updateStockBadge();
  renderInventario();
  // aggiorna icona nella tabella
  var btn=document.querySelector('#tb tr[data-idx="'+posIdx+'"] button[title="Specifiche / Posizione"]');
  if(btn) btn.textContent=(magazzino[posIdx].specs||magazzino[posIdx].posizione)?'--':'-';
  _posSnapshot=null;
  document.getElementById('pm').classList.remove('open');
  posIdx=null;
}

function closePos(){
  if(_posSnapshot!==null && posIdx!==null){
    if(!magazzino[posIdx]) magazzino[posIdx]={};
    magazzino[posIdx].specs=_posSnapshot.specs;
    magazzino[posIdx].posizione=_posSnapshot.posizione;
    magazzino[posIdx].soglia=_posSnapshot.soglia;
    magazzino[posIdx].prezzoAcquisto=_posSnapshot.prezzoAcquisto;
    lsSet(MAGK,magazzino);
    updateStockBadge();
  }
  _posSnapshot=null;
  document.getElementById('pm').classList.remove('open');
  posIdx=null;
}

// [SECTION: MAGAZZINO] -----------------------------------------------------
//  Inventario, scorte, soglie, movimenti qty, categorie, magazzino
var invSottoScorta=false;
var invGiornalino=false;

function filterSottoScorta(){
  invSottoScorta=!invSottoScorta;
  var btn=document.getElementById('inv-scorta-btn');
  if(btn){
    btn.style.background=invSottoScorta?'#e53e3e':'#1e1e1e';
    btn.style.color=invSottoScorta?'#fff':'var(--muted)';
    btn.style.borderColor=invSottoScorta?'#e53e3e':'var(--border)';
  }
  renderInventario();
}

function filterGiornalino(){
  invGiornalino=!invGiornalino;
  var btn=document.getElementById('inv-giorn-btn');
  if(btn){
    btn.style.background=invGiornalino?'#805ad5':'#1e1e1e';
    btn.style.color=invGiornalino?'#fff':'var(--muted)';
    btn.style.borderColor=invGiornalino?'#805ad5':'var(--border)';
  }
  renderInventario();
}

function renderInventario(){
  var search=(document.getElementById('inv-search')||{}).value||'';
  var catFilter=(document.getElementById('inv-cat-filter')||{}).value||'';
  var body=document.getElementById('inv-body');
  var statsEl=document.getElementById('inv-stats');
  if(!body) return;

  // Popola filtro cat se vuoto
  var sel=document.getElementById('inv-cat-filter');
  if(sel && sel.options.length<=1){
    categorie.forEach(function(cat){
      var opt=document.createElement('option');
      opt.value=cat.id; opt.textContent=cat.nome; sel.appendChild(opt);
    });
  }

  var tot=0,totVal=0,sottoScorta=0;
  var html='';
  var _invShown=0;
  var _invCap=300;

  // Se il database non è ancora caricato da Firebase, mostra messaggio
  if(!rows || !rows.length){
    body.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:30px;color:var(--accent);font-size:14px;">⏳ Database in caricamento, attendere...</td></tr>';
    return;
  }

  rows.forEach(function(r,i){
    if(!r)return;
    if(removed.has(String(i))) return;
    var m=magazzino[i]||{};
    var catId=m.cat||'';

    // filtri
    if(catFilter && catId!==catFilter) return;
    // Protezione null/undefined su codF, codM, desc
    var haystack=[r.desc||'',String(r.codF||''),String(r.codM||''),m.marca||'',m.specs||''].join(' ');
    if(search && !fuzzyMatch(search,haystack)) return;

    var soglia=getSoglia(i);
    var qty=m.qty!==undefined&&m.qty!==''?Number(m.qty):null;
    var isLow=qty!==null&&qty<=soglia;
    if(invSottoScorta && !isLow) return;

    tot++;
    var prezzo=(r.prezzo);
    if(qty!==null) totVal+=prezzo*qty;
    if(isLow) sottoScorta++;

    var catLabel='';
    if(catId){var cf=categorie.find(function(x){return x.id===catId;});catLabel=cf?cf.nome:'';}
    var sub=m.subcat||'';
    var unit=m.unit||'pz';
    var specs=m.specs||'';
    var pos=m.posizione||'';
    var marca=m.marca||'';
    var rowBg=isLow?'rgba(229,62,62,0.08)':'';
    var borderL=isLow?'border-left:3px solid #e53e3e;':'border-left:3px solid transparent;';

    var prezzoAcq=m.prezzoAcquisto||'';
    if(_invShown>=_invCap && !search && !catFilter) return;
    _invShown++;
    html+='<tr style="border-bottom:1px solid var(--border);'+borderL+'background:'+rowBg+';cursor:pointer;" onclick="openSchedaProdotto('+i+')" title="Clicca per modificare">';
    // 1. Descrizione + marca
    html+='<td style="padding:8px 6px;">';
    html+='<div style="font-size:12px;font-weight:600;color:var(--text);">'+(r.desc||'-')+'</div>';
    if(marca) html+='<div style="font-size:10px;color:var(--muted);">- '+esc(marca)+'</div>';
    html+='</td>';
    // 2. Specifiche tecniche
    html+='<td style="padding:8px 6px;font-size:11px;color:#2dd4bf;font-style:italic;">'+esc(specs)+'</td>';
    // 3. Codice fornitore
    html+='<td style="padding:8px 6px;font-size:11px;color:#fc8181;font-weight:600;">'+esc(r.codF||'-')+'</td>';
    // 4. Mio codice
    html+='<td style="padding:8px 6px;font-size:11px;color:var(--accent);font-weight:600;">'+esc(r.codM||'-')+'</td>';
    // 5. Quantit- + e -
    html+='<td style="padding:8px 6px;text-align:center;white-space:nowrap;">';
    html+='<button onclick="event.stopPropagation();deltaQta('+i+',-1)" style="background:#333;border:none;color:var(--text);width:22px;height:22px;border-radius:4px;cursor:pointer;font-size:14px;font-weight:bold;line-height:1;">-</button> ';
    html+='<input type="number" min="0" value="'+(qty!==null?qty:'')+'" placeholder="-" onclick="event.stopPropagation()" '+
      'style="width:44px;padding:3px 2px;border:1px solid '+(isLow?'#e53e3e':'var(--border)')+';border-radius:5px;background:#111;color:'+(isLow?'#e53e3e':'var(--accent)')+';font-size:13px;font-weight:900;text-align:center;" '+
      'onchange="event.stopPropagation();saveQta('+i+',this.value)" id="inv-qty-'+i+'"> ';
    html+='<button onclick="event.stopPropagation();deltaQta('+i+',1)" style="background:#333;border:none;color:var(--text);width:22px;height:22px;border-radius:4px;cursor:pointer;font-size:14px;font-weight:bold;line-height:1;">+</button>';
    html+='<div style="font-size:10px;color:var(--muted);margin-top:2px;">'+ '<button onclick="event.stopPropagation();openMovProdotto('+i+')" style="background:none;border:none;color:#3182ce;font-size:10px;cursor:pointer;padding:0;" title="Storico movimenti">-</button> ' +esc(unit)+(isLow?' <span style="color:#e53e3e;font-weight:700;">-- min:'+soglia+'</span>':'')+'</div>';
    html+='</td>';
    // 6. Prezzo vendita
    html+='<td style="padding:8px 6px;text-align:right;font-size:13px;font-weight:900;color:var(--accent);">- '+esc(r.prezzo)+'</td>';
    // 7. Prezzo acquisto - discreto, non visibile a occhi estranei
    html+='<td style="padding:8px 6px;text-align:right;" onclick="event.stopPropagation();">';
    html+='<input type="text" value="'+esc(prezzoAcq)+'" placeholder="-" onclick="event.stopPropagation()" '+
      'style="width:52px;padding:3px 5px;border:1px solid #333;border-radius:5px;background:#0d0d0d;color:#555;font-size:11px;text-align:right;font-style:italic;" '+
      'title="Prezzo acquisto (riservato)" '+
      'onchange="event.stopPropagation();saveMagRow('+i+',\'prezzoAcquisto\',this.value)">';
    html+='</td>';
    // 8. Posizione
    html+='<td style="padding:8px 6px;font-size:11px;color:#888;font-style:italic;">'+esc(pos)+'</td>';
    // 9. Categoria in fondo piccola
    html+='<td style="padding:8px 6px;">';
    if(catLabel) html+='<div style="font-size:10px;color:var(--accent);">'+esc(catLabel)+'</div>';
    if(sub) html+='<div style="font-size:10px;color:#555;">'+esc(sub)+'</div>';
    html+='</td>';
    html+='</tr>';
  });

  if(!html) html='<tr><td colspan="9" style="padding:30px;text-align:center;color:var(--muted);">- Nessun prodotto trovato.</td></tr>';
  body.innerHTML=html;

  if(statsEl) statsEl.innerHTML=
    '<div class="sc"><span class="n">'+tot+'</span>Prodotti</div>'+
    '<div class="sc g"><span class="n" style="color:#68d391">- '+totVal.toFixed(2)+'</span>Valore</div>'+
    (sottoScorta?'<div class="sc r"><span class="n" style="color:#e53e3e">'+sottoScorta+'</span>Sotto scorta</div>':'');
}

function deltaQta(i,delta){
  if(!magazzino[i]) magazzino[i]={};
  var cur=magazzino[i].qty!==undefined&&magazzino[i].qty!==''?Number(magazzino[i].qty):0;
  var nv=Math.max(0,cur+delta);
  var prevQty=cur;
  magazzino[i].qty=nv;
  lsSet(MAGK,magazzino);
  updateStockBadge();
  checkScorta(i, nv, prevQty);
  var tipoMov = delta < 0 ? 'vendita' : 'carico';
  registraMovimento(i, tipoMov, delta, prevQty, nv, '');
  var soglia=getSoglia(i);
  var isLow=nv<=soglia;
  // aggiorna input in entrambe le tabelle
  ['inv-qty-'+i,'tb-qty-'+i].forEach(function(id){
    var inp=document.getElementById(id);
    if(inp){
      inp.value=nv;
      inp.style.color=isLow?'#e53e3e':'var(--accent)';
      inp.style.borderColor=isLow?'#e53e3e':'var(--border)';
    }
  });
  // re-render solo la tab attiva
  var t0=document.getElementById('t0');
  if(t0&&t0.classList.contains('active')) renderInventario();
}

// -- SCHEDA PRODOTTO dal Magazzino -----------------------------------------
function openSchedaProdotto(i){
  openEditProdotto(i);
}

// Filtro sotto scorta nel magazzino
var magSottoScorta=false;
function toggleMagSottoScorta(){
  magSottoScorta=!magSottoScorta;
  var btn=document.getElementById('mag-scorta-btn');
  if(btn){
    btn.style.background=magSottoScorta?'#e53e3e':'#1e1e1e';
    btn.style.color=magSottoScorta?'#fff':'var(--muted)';
    btn.style.borderColor=magSottoScorta?'#e53e3e':'var(--border)';
  }
  renderMagazzino();
}

// -----------------------------------------------
//  MAGAZZINO
// -----------------------------------------------

function getCatLabel(r){
  // magazzino[idx].cat e magazzino[idx].subcat
  var m=magazzino[r._idx]||{};
  var cat=m.cat||'';
  var sub=m.subcat||'';
  return cat?(sub?cat+' - '+sub:cat):'-';
}

var magMode='prod'; // 'prod' o 'spec'
function setMagMode(mode){
  magMode=mode;
  var bp=document.getElementById('mag-mode-prod');
  var bs=document.getElementById('mag-mode-spec');
  if(bp&&bs){
    if(mode==='prod'){
      bp.style.background='var(--accent)'; bp.style.color='#111'; bp.style.borderColor='var(--accent)';
      bs.style.background='#1e1e1e'; bs.style.color='var(--muted)'; bs.style.borderColor='var(--border)';
      document.getElementById('mag-search').placeholder='- Cerca prodotto, codice...';
    } else {
      bs.style.background='var(--accent)'; bs.style.color='#111'; bs.style.borderColor='var(--accent)';
      bp.style.background='#1e1e1e'; bp.style.color='var(--muted)'; bp.style.borderColor='var(--border)';
      document.getElementById('mag-search').placeholder='- Cerca nelle specifiche tecniche...';
    }
  }
  renderMagazzino();
}

// Ricerca fuzzy intelligente: matcha anche parole parziali e ordine diverso
function fuzzyMatch(query, target){
  if(!query) return true;
  var q=query.toLowerCase().trim();
  var t=(target||'').toLowerCase();
  // Match esatto sottostringa
  if(t.indexOf(q)>=0) return true;
  // Match per parole singole: ogni parola della query deve apparire nel testo
  var words=q.split(/\s+/).filter(Boolean);
  return words.every(function(w){ return t.indexOf(w)>=0; });
}

function renderMagazzino(){
  var search=(document.getElementById('mag-search')||{}).value||'';
  var catFilter=(document.getElementById('mag-cat-filter')||{}).value||'';
  var list=document.getElementById('mag-list');
  var statsEl=document.getElementById('mag-stats');
  if(!list) return;

  // Popola filtro categorie
  var sel=document.getElementById('mag-cat-filter');
  if(sel && sel.options.length<=1){
    categorie.forEach(function(cat){
      var opt=document.createElement('option');
      opt.value=cat.id; opt.textContent=cat.nome;
      sel.appendChild(opt);
    });
  }

  // Raggruppa per categoria
  var grouped={};
  var totalProd=0, totalCat=new Set();

  // Database non ancora caricato
  if(!rows||!rows.length){
    list.innerHTML='<div style="text-align:center;padding:40px;color:var(--accent);font-size:14px;">⏳ Database in caricamento, attendere...</div>';
    return;
  }

  rows.forEach(function(r,i){
    if(!r)return;
    if(removed.has(String(i))) return;
    var m=magazzino[i]||{};
    var catId=m.cat||'__nessuna__';
    // Filtro intelligente per modalit-
    if(search){
      if(magMode==='prod'){
        // Cerca in descrizione + codici — protezione null
        var haystack=[r.desc||'',String(r.codF||''),String(r.codM||''),m.marca||''].join(' ');
        if(!fuzzyMatch(search, haystack)) return;
      } else {
        // Cerca solo nelle specifiche tecniche
        var haystack=m.specs||'';
        if(!fuzzyMatch(search, haystack)) return;
      }
    }
    if(catFilter && catId!==catFilter) return;
    if(!grouped[catId]) grouped[catId]=[];
    var soglia=getSoglia(i);
    var qty=m.qty!==undefined&&m.qty!==''?Number(m.qty):null;
    var isLow=qty!==null&&qty<=soglia;
    grouped[catId].push({r:r,i:i,m:m,isLow:isLow});
    totalProd++;
    if(catId!=='__nessuna__') totalCat.add(catId);
  });

  // Stats
  statsEl.innerHTML=
    '<div class="sc"><span class="n">'+totalProd+'</span>Prodotti</div>'+
    '<div class="sc g"><span class="n" style="color:#68d391">'+totalCat.size+'</span>Categorie</div>'+
    '<div class="sc o"><span class="n" style="color:#f6ad55">'+(grouped['__nessuna__']?grouped['__nessuna__'].length:0)+'</span>Senza cat.</div>';

  if(totalProd===0){
    list.innerHTML='<div style="text-align:center;padding:40px;color:var(--muted);">- Nessun prodotto trovato.</div>';
    return;
  }

  var html='';
  // Prima le categorie note, poi __nessuna__
  var orderedKeys=Object.keys(grouped).filter(function(k){return k!=='__nessuna__';});
  orderedKeys.sort(function(a,b){
    var na=catNome(a), nb=catNome(b);
    return na.localeCompare(nb);
  });
  if(grouped['__nessuna__']) orderedKeys.push('__nessuna__');

  orderedKeys.forEach(function(catId){
    var items=grouped[catId];
    var catLabel=catId==='__nessuna__'?'- Senza categoria':('- '+catNome(catId));
    html+='<div style="margin-bottom:18px;">';
    html+='<div style="font-size:13px;font-weight:700;color:var(--accent);padding:6px 0 8px;border-bottom:1px solid var(--border);margin-bottom:8px;">'+catLabel+' <span style="font-size:11px;color:var(--muted);font-weight:400;">('+items.length+')</span></div>';
    items.forEach(function(o){
      var r=o.r,i=o.i,m=o.m,isLow=o.isLow;
      var qty=m.qty||'';
      var unit=m.unit||'pz';
      var sub=m.subcat||'';
      var marca=m.marca||'';
      var specs=m.specs||'';
      var borderCol=isLow?'#e53e3e':'var(--border)';
      html+='<div style="background:#1e1e1e;border:1px solid '+borderCol+';border-radius:8px;padding:10px 12px;margin-bottom:8px;'+( isLow?'box-shadow:0 0 0 1px #e53e3e33;':'')+'">';
      html+='<div id="mag-scorta-badge-'+i+'" style="background:#e53e3e;color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;margin-bottom:6px;display:'+(isLow?'inline-block':'none')+';">'+(isLow?'- SCORTA BASSA - '+qty+' '+unit+' (min: '+m.soglia+')':'')+'</div>';
      html+='<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">';
      html+='<div style="flex:1;min-width:0;">';
      html+='<div style="font-size:12px;font-weight:700;color:var(--text);">'+(r.desc||'')+'</div>';
      html+='<div style="font-size:10px;color:var(--muted);margin-top:2px;">';
      if(sub) html+='<span style="color:var(--accent);font-size:10px;">'+sub+'</span> - ';
      if(marca) html+='- '+marca+' - ';
      html+='<span style="color:#fc8181;font-weight:600;">'+(r.codF||'-')+'</span>'+'<span style="color:#888;"> / </span>'+'<span style="color:var(--accent);font-weight:600;">'+(r.codM||'-')+'</span>';
      html+='</div>';
      if(specs) html+='<div style="font-size:11px;color:#aaa;margin-top:4px;font-style:italic;">- '+specs+'</div>';
      html+='</div>';
      // Colonna destra: foto (sempre visibile in cima) + prezzo + qt-
      var hasFotoTop=Object.prototype.hasOwnProperty.call(_idbCache,i)&&!!_idbCache[i];
      html+='<div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px;flex-shrink:0;">';
      // FOTO in cima a destra - sempre visibile
      if(hasFotoTop){
        html+='<img src="'+_idbCache[i]+'" onclick="magZoomFoto('+i+')" style="width:52px;height:52px;object-fit:cover;border-radius:8px;border:2px solid var(--accent);cursor:pointer;" title="Tocca per ingrandire">';
        html+='<button onclick="magRimoviFoto('+i+')" style="font-size:9px;color:#e53e3e;background:transparent;border:none;cursor:pointer;padding:0;">- rimuovi</button>';
      } else {
        html+='<button onclick="document.getElementById(\'mag-foto-inp-'+i+'\').click()" style="width:52px;height:52px;border-radius:8px;border:1px dashed #444;background:#111;color:#555;font-size:10px;cursor:pointer;line-height:1.3;">-<br>foto</button>';
        html+='<input type="file" id="mag-foto-inp-'+i+'" accept="image/*" capture="environment" style="display:none;" onchange="magSalvaFoto('+i+',this)">';
      }
      html+='<div style="font-size:15px;font-weight:900;color:var(--accent);">- '+r.prezzo+'</div>';
      html+='<div style="display:flex;gap:3px;align-items:center;">';
      html+='<input type="number" min="0" value="'+esc(qty)+'" placeholder="Qt-" '+
        'style="width:58px;padding:4px 6px;border:1px solid var(--border);border-radius:5px;background:#111;color:var(--text);font-size:13px;font-weight:700;text-align:center;" '+
        'onchange="saveQta('+i+',this.value)" oninput="saveQta('+i+',this.value)">';
      html+='<select style="width:52px;padding:4px 4px;border:1px solid var(--border);border-radius:5px;background:#111;color:var(--accent);font-size:11px;margin-left:3px;" onchange="saveMagRow('+i+',\'unit\',this.value)">';
      ['pz','mt','kg','lt','conf','rot','sc'].forEach(function(u){
        html+='<option'+(unit===u?' selected':'')+'>'+u+'</option>';
      });
      html+='</select>';
      html+='</div>'; // fine flex qt-+unit-
      html+='</div>'; // fine colonna destra
      html+='</div>'; // fine flex principale card
      // Riga dettagli
      html+='<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;align-items:center;">';
      html+='<select style="flex:1;min-width:130px;padding:5px 8px;border:1px solid var(--border);border-radius:6px;background:#111;color:var(--text);font-size:11px;" onchange="saveMagRow('+i+',\'cat\',this.value);renderMagazzino();">';
      html+='<option value="">- Categoria -</option>';
      categorie.forEach(function(cat){
        html+='<option value="'+cat.id+'"'+(m.cat===cat.id?' selected':'')+'>'+cat.nome+'</option>';
      });
      html+='</select>';
      // Sotto-categoria dinamica
      var subsForCat=[];
      if(m.cat){var cf=categorie.find(function(x){return x.id===m.cat;});if(cf)subsForCat=cf.sub||[];}
      html+='<select style="flex:1;min-width:130px;padding:5px 8px;border:1px solid var(--border);border-radius:6px;background:#111;color:var(--text);font-size:11px;" onchange="saveMagRow('+i+',\'subcat\',this.value)">';
      html+='<option value="">- Sotto-categoria -</option>';
      subsForCat.forEach(function(s){
        html+='<option'+(m.subcat===s?' selected':'')+'>'+s+'</option>';
      });
      html+='</select>';
      html+='<input type="text" placeholder="- Marca" value="'+esc(marca)+'" '+
        'style="width:100px;padding:5px 8px;border:1px solid var(--border);border-radius:6px;background:#111;color:var(--text);font-size:11px;" '+
        'onchange="saveMagRow('+i+',\'marca\',this.value)">';
      html+='</div>';
      html+='<input type="text" placeholder="- Specifiche tecniche (es: M6x30, IP44, 1000W...)" value="'+esc(specs)+'" '+
        'style="width:100%;margin-top:6px;padding:5px 10px;border:1px solid var(--border);border-radius:6px;background:#111;color:#aaa;font-size:11px;font-style:italic;" '+
        'onchange="saveMagRow('+i+',\'specs\',this.value)">';
      html+='<button onclick="openEditProdotto('+i+')" style="margin-top:8px;width:100%;padding:7px;border-radius:7px;border:1px solid var(--accent)44;background:transparent;color:var(--accent);font-size:12px;font-weight:700;cursor:pointer;">-- Modifica articolo</button>';
          });
    html+='</div>';
  });

  list.innerHTML=html;
}

function catNome(id){
  var c=categorie.find(function(x){return x.id===id;});
  return c?c.nome:id;
}

var _saveMagTimer=null;
// -- FOTO ARTICOLO ---------------------------------------------------------
function magSalvaFoto(i, input){
  if(!input.files||!input.files[0]) return;
  var reader=new FileReader();
  reader.onload=function(e){
    var img=new Image();
    img.onload=function(){
      var MAX=400;
      var w=img.width, h=img.height;
      if(w>MAX||h>MAX){ var r=Math.min(MAX/w,MAX/h); w=Math.round(w*r); h=Math.round(h*r); }
      var cv=document.createElement('canvas');
      cv.width=w; cv.height=h;
      cv.getContext('2d').drawImage(img,0,0,w,h);
      var dataURL=cv.toDataURL('image/jpeg',0.75);
      idbSalvaFoto(i, dataURL); // IndexedDB, non localStorage
      renderMagazzino();
      showToastGen('green','- Foto salvata');
    };
    img.src=e.target.result;
  };
  reader.readAsDataURL(input.files[0]);
}
function magRimoviFoto(i){
  idbRimoviFoto(i);
  renderMagazzino();
  showToastGen('green','- Foto rimossa');
}
function magZoomFoto(i){
  idbGetFoto(i).then(function(foto){
    if(!foto) return;
    _mostraOverlayFotoSpecifiche(i, foto);
  });
}

function _mostraOverlayFotoSpecifiche(i, foto){
  var m=magazzino[i]||{};
  var r=rows[i]||{};
  var ov=document.getElementById('_foto-zoom-ov');
  if(!ov){
    ov=document.createElement('div');
    ov.id='_foto-zoom-ov';
    ov.style.cssText='position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.88);display:flex;flex-direction:column;align-items:center;justify-content:center;padding:16px;';
    ov.addEventListener('click',function(e){ if(e.target===ov) ov.remove(); });
    document.body.appendChild(ov);
  }
  ov.innerHTML='';
  // Bottone chiudi
  var closeBtn=document.createElement('button');
  closeBtn.textContent='-';
  closeBtn.style.cssText='position:absolute;top:12px;right:16px;background:transparent;border:none;color:#fff;font-size:24px;cursor:pointer;z-index:2;';
  closeBtn.onclick=function(){ ov.remove(); };
  ov.appendChild(closeBtn);
  // Immagine (se presente)
  if(foto){
    var img=document.createElement('img');
    img.src=foto;
    img.style.cssText='max-width:100%;max-height:45vh;object-fit:contain;border-radius:10px;margin-bottom:14px;';
    ov.appendChild(img);
  } else {
    // Bottone aggiunta foto
    var addFotoLbl=document.createElement('label');
    addFotoLbl.style.cssText='display:flex;align-items:center;gap:8px;padding:12px 20px;border-radius:8px;border:1px dashed #444;color:#555;font-size:13px;cursor:pointer;margin-bottom:14px;';
    addFotoLbl.innerHTML='- Aggiungi foto';
    var addFotoInp=document.createElement('input');
    addFotoInp.type='file'; addFotoInp.accept='image/*'; addFotoInp.capture='environment';
    addFotoInp.style.display='none';
    addFotoInp.onchange=function(){ magSalvaFoto(i, addFotoInp); ov.remove(); };
    addFotoLbl.appendChild(addFotoInp);
    ov.appendChild(addFotoLbl);
  }
  // Scheda specifiche
  var info=document.createElement('div');
  info.style.cssText='width:100%;max-width:400px;background:#1c1c1c;border-radius:10px;padding:12px 14px;';
  var specs=[
    r.desc?('<b style="font-size:14px;color:#f0f0f0;">'+esc(r.desc)+'</b>'):'',
    r.codM?('<span style="color:var(--accent);font-size:11px;">'+esc(r.codM)+'</span>'):'',
    r.codF?('<span style="color:#fc8181;font-size:11px;">'+esc(r.codF)+'</span>'):'',
    m.marca?('<span style="color:#a0aec0;font-size:11px;">- '+esc(m.marca)+'</span>'):'',
    m.specs?('<div style="color:#2dd4bf;font-size:12px;margin-top:6px;">'+esc(m.specs)+'</div>'):'',
    m.subcat?('<span style="color:#888;font-size:11px;">- '+esc(m.subcat)+'</span>'):'',
    r.prezzo?('<div style="color:var(--accent);font-size:16px;font-weight:900;margin-top:8px;">- '+esc(r.prezzo)+'</div>'):'',
    m.qty!==undefined&&m.qty!==''?('<span style="color:#68d391;font-size:11px;">- Scorta: '+m.qty+' '+(m.unit||'pz')+'</span>'):'',
  ].filter(Boolean).join('<br>');
  info.innerHTML=specs;
  ov.appendChild(info);
}

// Mostra overlay foto+specifiche da carrello/ordini (passa rowIdx)
function mostraFotoSpecifiche(rowIdx){
  idbGetFoto(rowIdx).then(function(foto){
    _mostraOverlayFotoSpecifiche(rowIdx, foto||null);
  });
}

function saveMagRow(i,field,val){
  if(!magazzino[i]) magazzino[i]={};
  _takeSnapshot();
  if(field==='qty'){
    var prevQty = magazzino[i].qty!==undefined&&magazzino[i].qty!=='' ? Number(magazzino[i].qty) : null;
    var newQty  = val!=='' ? parseFloat(val) : null;
    magazzino[i].qty = newQty;
    lsSet(MAGK,magazzino);
    updateStockBadge();
    if(newQty!==null && prevQty!==null && newQty!==prevQty){
      var delta=newQty-prevQty;
      var tipo=delta<0?'vendita':'carico';
      checkScorta(i, newQty, prevQty);
      registraMovimento(i, tipo, delta, prevQty, newQty, 'modifica magazzino');
    } else if(newQty!==null && prevQty===null){
      checkScorta(i, newQty, null);
    }
    // Aggiorna visuale scorta nella riga senza perdere il focus
    _updateMagQtyRow(i, newQty);
  } else {
    magazzino[i][field]=val;
    lsSet(MAGK,magazzino);
    if(field==='cat'){
      // ri-render dopo cambio categoria (gi- chiamato nel template)
    }
  }
}

function _updateMagQtyRow(i, qty){
  // Aggiorna solo l'indicatore scorta nella riga senza re-render completo
  var soglia=getSoglia(i);
  var isLow = qty!==null && qty<=soglia;
  var badge = document.getElementById('mag-scorta-badge-'+i);
  if(badge){
    if(isLow){
      badge.textContent='- SCORTA BASSA - '+qty+' '+(magazzino[i].unit||'pz')+' (min: '+(magazzino[i].soglia||0)+')';
      badge.style.display='inline-block';
    } else {
      badge.style.display='none';
    }
  }
}

// -- QUANTIT- NELLA TAB DATI ----------------------------------------------
function buildQtaCell(i){
  var m=magazzino[i]||{};
  var qty=m.qty!==undefined&&m.qty!==''?m.qty:'';
  var unit=m.unit||'pz';
  var soglia=m.soglia!==undefined&&m.soglia!==''?Number(m.soglia):null;
  var isLow=soglia!==null && qty!=='' && Number(qty)<=soglia && Number(qty)>=0;
  var col=isLow?'#e53e3e':'var(--accent)';
  var html='<input type="number" min="0" value="'+esc(String(qty))+'" placeholder="-" '+
    'style="width:42px;padding:3px 4px;border:1px solid '+(isLow?'#e53e3e':'var(--border)')+';border-radius:5px;'+
    'background:#111;color:'+col+';font-size:12px;font-weight:700;text-align:center;" '+
    'onchange="saveQta('+i+',this.value)" oninput="saveQta('+i+',this.value)"> '+
    '<button onclick="openSoglia('+i+')" title="Imposta soglia scorta minima" '+
    'style="background:none;border:none;cursor:pointer;font-size:11px;padding:1px 2px;">'+
    (isLow?'-':(soglia!==null?'-':'-'))+'</button>';
  return html;
}

function saveQta(i,val){
  if(!magazzino[i]) magazzino[i]={};
  var prevQty=magazzino[i].qty!==undefined&&magazzino[i].qty!==''?Number(magazzino[i].qty):null;
  magazzino[i].qty=val;
  lsSet(MAGK,magazzino);
  updateStockBadge();
  var numVal=val!==''?Number(val):null;
  checkScorta(i, numVal, prevQty);
  if(numVal !== null){
    var prevForMov = prevQty !== null ? prevQty : 0;
    var deltaMov = numVal - prevForMov;
    if(deltaMov !== 0){
      var tipoSQ = deltaMov < 0 ? 'vendita' : 'carico';
      registraMovimento(i, tipoSQ, deltaMov, prevQty, numVal, 'modifica manuale');
    }
  }
  var soglia=getSoglia(i);
  var isLow=numVal!==null&&numVal<=soglia;
  ['inv-qty-'+i,'tb-qty-'+i].forEach(function(id){
    var inp=document.getElementById(id);
    if(inp){
      inp.value=val;
      inp.style.color=isLow?'#e53e3e':'var(--accent)';
      inp.style.borderColor=isLow?'#e53e3e':'var(--border)';
    }
  });
}

// -- SOGLIA SCORTA MINIMA -------------------------------------------------
var sogliaIdx=null;
function openSoglia(i){
  sogliaIdx=i;
  var m=magazzino[i]||{};
  _sogliaSnapshot=m.soglia;
  document.getElementById('sq-desc').textContent=rows[i]?rows[i].desc||'':'';
  document.getElementById('sq-val').value=m.soglia!==undefined?m.soglia:'';
  document.getElementById('sq').classList.add('open');
}
function saveSoglia(){
  if(sogliaIdx===null) return;
  if(!magazzino[sogliaIdx]) magazzino[sogliaIdx]={};
  var v=document.getElementById('sq-val').value.trim();
  magazzino[sogliaIdx].soglia=v===''?'':Number(v);
  lsSet(MAGK,magazzino);
  updateStockBadge();
  // aggiorna cella qt- nella tabella
  // aggiorna colore input qt- se sotto soglia
  var sv2=magazzino[sogliaIdx].soglia;
  var qv=magazzino[sogliaIdx].qty;
  var isLow2=sv2!==''&&sv2!==undefined&&qv!==undefined&&qv!==''&&Number(qv)<=Number(sv2);
  ['tb-qty-'+sogliaIdx,'inv-qty-'+sogliaIdx].forEach(function(id){
    var inp=document.getElementById(id);
    if(inp){
      inp.style.color=isLow2?'#e53e3e':'var(--accent)';
      inp.style.borderColor=isLow2?'#e53e3e':'var(--border)';
    }
  });
  _sogliaSnapshot=null;
  document.getElementById('sq').classList.remove('open');
  sogliaIdx=null;
}
function closeSoglia(){
  if(_sogliaSnapshot!==undefined && sogliaIdx!==null){
    if(!magazzino[sogliaIdx]) magazzino[sogliaIdx]={};
    magazzino[sogliaIdx].soglia=_sogliaSnapshot;
    lsSet(MAGK,magazzino);
    updateStockBadge();
  }
  _sogliaSnapshot=null;
  document.getElementById('sq').classList.remove('open');
  sogliaIdx=null;
}

// -- BADGE SCORTE BASSE ---------------------------------------------------
function updateStockBadge(){
  var count=0;
  rows.forEach(function(r,i){
    if(removed.has(String(i))) return;
    var m=magazzino[i]||{};
    var soglia=m.soglia!==undefined&&m.soglia!==''?Number(m.soglia):null;
    var qty=m.qty!==undefined&&m.qty!==''?Number(m.qty):null;
    if(soglia!==null && qty!==null && qty<=soglia) count++;
  });
  var badge=document.getElementById('stock-badge');
  if(badge){
    if(count>0){badge.textContent=count;badge.style.display='';}
    else{badge.style.display='none';}
  }
}

// -----------------------------------------------
//  CATEGORIE - ALBERO
// -----------------------------------------------

function renderCatTree(){
  var el=document.getElementById('cat-tree');
  if(!el) return;
  var html='';
  categorie.forEach(function(cat,ci){
    html+='<div style="background:#1e1e1e;border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin-bottom:10px;">';
    html+='<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px;">';
    html+='<span style="font-size:14px;">-</span>';
    html+='<input type="text" value="'+esc(cat.nome)+'" '+
      'style="flex:1;font-size:13px;font-weight:700;background:transparent;border:none;border-bottom:1px solid var(--border);color:var(--text);padding:2px 4px;" '+
      'onchange="renameCategoria('+ci+',this.value)">';
    html+='<button style="background:none;border:none;color:#e53e3e;font-size:16px;cursor:pointer;padding:4px;" onclick="deleteCategoria('+ci+')" title="Elimina categoria">--</button>';
    html+='</div>';
    // Sotto-categorie
    html+='<div style="padding-left:20px;">';
    cat.sub.forEach(function(sub,si){
      html+='<div style="display:flex;align-items:center;gap:6px;margin-bottom:5px;">';
      html+='<span style="color:var(--muted);font-size:12px;">-</span>';
      html+='<input type="text" value="'+esc(sub)+'" '+
        'style="flex:1;font-size:12px;background:transparent;border:none;border-bottom:1px solid #333;color:#aaa;padding:2px 4px;" '+
        'onchange="renameSub('+ci+','+si+',this.value)">';
      html+='<button style="background:none;border:none;color:#e53e3e;font-size:13px;cursor:pointer;padding:2px 5px;" onclick="deleteSub('+ci+','+si+')">-</button>';
      html+='</div>';
    });
    html+='<div style="display:flex;gap:6px;margin-top:8px;">';
    html+='<input type="text" id="newsub-'+ci+'" placeholder="Nuova sotto-categoria..." '+
      'style="flex:1;font-size:12px;padding:5px 8px;border:1px solid #333;border-radius:6px;background:#111;color:var(--text);">';
    html+='<button style="background:var(--accent);color:#111;border:none;padding:5px 10px;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;" onclick="addSub('+ci+')">+ Sub</button>';
    html+='</div>';
    html+='</div>';
    html+='</div>';
  });
  el.innerHTML=html;
}

function addCategoria(){
  var inp=document.getElementById('new-cat-nome');
  var nome=(inp.value||'').trim();
  if(!nome){inp.focus();return;}
  var id='cat_'+Date.now();
  categorie.push({id:id,nome:nome,sub:[]});
  lsSet(CATK,categorie);
  inp.value='';
  renderCatTree();
}

function deleteCategoria(ci){
  showConfirm('Eliminare la categoria "' + categorie[ci].nome + '"?', function(){

  var id=categorie[ci].id;
  categorie.splice(ci,1);
  lsSet(CATK,categorie);
  // rimuovi dai magazzino
  Object.keys(magazzino).forEach(function(k){if(magazzino[k].cat===id){magazzino[k].cat='';magazzino[k].subcat='';}});
  lsSet(MAGK,magazzino);
  renderCatTree();

  });
}

function renameCategoria(ci,val){
  categorie[ci].nome=val.trim();
  lsSet(CATK,categorie);
}

function addSub(ci){
  var inp=document.getElementById('newsub-'+ci);
  var nome=(inp.value||'').trim();
  if(!nome){inp.focus();return;}
  categorie[ci].sub.push(nome);
  lsSet(CATK,categorie);
  renderCatTree();
}

function deleteSub(ci,si){
  categorie[ci].sub.splice(si,1);
  lsSet(CATK,categorie);
  renderCatTree();
}

function renameSub(ci,si,val){
  categorie[ci].sub[si]=val.trim();
  lsSet(CATK,categorie);
}



// -----------------------------------------------------------------------
