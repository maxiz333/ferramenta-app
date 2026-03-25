/**
 * -----------------------------------------------------------------------
 *  RATTAZZI - app.js
 *  - CARRELLO: ricerca, numpad, sconto, scaglioni, DDT
 *  - ORDINI: lista, dettaglio, cassa, auto-refresh
 *  - MOVIMENTI: registrazione, filtri, report
 *  - AI/FOTO: import articoli da foto
 *  - UI: tema, ricerca globale, popup, backup, correlati
 *  - FORNITORI: ordini, fatture
 *  - FIREBASE: sync real-time
 * -----------------------------------------------------------------------
 */

// ══ VARIABILI GLOBALI ══════════════════════════════════════════════
var CARTK='cp4_carrelli', ORDK='cp4_ordini', CART_CK='cp4_carrelli_cestino';
var carrelli=lsGet(CARTK)||[], ordini=lsGet(ORDK)||[];
var carrelliCestino=lsGet(CART_CK)||[];
// Pulizia giornaliera: rimuovi carrelli creati prima di oggi (tranne inviati/modifica)
(function(){
  var oggi=new Date().toISOString().slice(0,10);
  var prima=carrelli.length;
  carrelli=carrelli.filter(function(c){
    if(c.stato==='inviato'||c.stato==='modifica') return true;
    var cData='';
    if(c.creatoAtISO) cData=c.creatoAtISO.slice(0,10);
    else if(c.dataCreazione) cData=new Date(c.dataCreazione).toISOString().slice(0,10);
    if(!cData) return true;
    return cData>=oggi;
  });
  if(carrelli.length<prima){ lsSet(CARTK,carrelli); }
})();
var activeCartId=carrelli.length?carrelli[carrelli.length-1].id:null;
var ordFiltro='nuovo';
var ORDK_ARCH='cp4_ordini_archivio';
var ordiniArchivio=lsGet(ORDK_ARCH)||[];

// Archivia ordini completati da 7+ giorni
(function(){
  var now=Date.now();
  var SETTE_GG=7*24*60*60*1000;
  var daArch=[];
  ordini=ordini.filter(function(o){
    if(o.stato!=='completato') return true;
    var compAt=o.completatoAtISO?new Date(o.completatoAtISO).getTime():
               (o.createdAt?new Date(o.createdAt).getTime():0);
    if(!compAt) return true;
    if(now-compAt>SETTE_GG){ daArch.push(o); return false; }
    return true;
  });
  if(daArch.length){
    ordiniArchivio=daArch.concat(ordiniArchivio);
    lsSet(ORDK,ordini);
    lsSet(ORDK_ARCH,ordiniArchivio);
  }
})();

var _fb=null,_fbDb=null,_fbReady=false,_fbSyncing=false;

// Ripara dati da Firebase (converte oggetti in array)
function _fbFix(data){
  if(!data)return[];
  var arr=Array.isArray(data)?data:Object.values(data);
  arr=arr.filter(function(x){return x!=null;});
  arr.forEach(function(item){
    if(!item)return;
    if(!item.items)item.items=[];
    if(!Array.isArray(item.items))item.items=Object.values(item.items).filter(function(x){return x!=null;});
    item.items.forEach(function(it){
      if(it&&it.scaglioni&&!Array.isArray(it.scaglioni)){
        it.scaglioni=Object.values(it.scaglioni).filter(function(x){return x!=null;});
      }
    });
  });
  return arr;
}

function _fbPush(ref,data){if(!_fbReady||_fbSyncing)return;try{_fbDb.ref(ref).set(data);}catch(e){}}

function saveCarrelli(){ _takeSnapshot(); lsSet(CARTK,carrelli); updateCartBadge(); _fbPush('carrelli',carrelli); }
function saveOrdini(){ _takeSnapshot(); lsSet(ORDK,ordini); updateOrdBadge(); _fbPush('ordini',ordini); }


// ══ FEEDBACK / TOAST / CONFIRM / BADGES ═══════════════════════════
// --- FEEDBACK (vibra + suono) ---------------------------------
function feedbackAdd(){
  // Vibrazione breve
  if(navigator.vibrate)navigator.vibrate(50);
  // Beep sottile
  try{
    var ctx=new(window.AudioContext||window.webkitAudioContext)();
    var osc=ctx.createOscillator();var gain=ctx.createGain();
    osc.connect(gain);gain.connect(ctx.destination);
    osc.frequency.value=1200;
    gain.gain.setValueAtTime(0.12,ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0,ctx.currentTime+0.1);
    osc.start();osc.stop(ctx.currentTime+0.1);
  }catch(e){}
}
function feedbackSend(){
  if(navigator.vibrate)navigator.vibrate([100,50,100]);
  try{
    var ctx=new(window.AudioContext||window.webkitAudioContext)();
    [0,150,300].forEach(function(d){
      var osc=ctx.createOscillator();var gain=ctx.createGain();
      osc.connect(gain);gain.connect(ctx.destination);
      osc.frequency.value=880;
      gain.gain.setValueAtTime(0,ctx.currentTime+d/1000);
      gain.gain.linearRampToValueAtTime(0.15,ctx.currentTime+d/1000+0.04);
      gain.gain.linearRampToValueAtTime(0,ctx.currentTime+d/1000+0.15);
      osc.start(ctx.currentTime+d/1000);osc.stop(ctx.currentTime+d/1000+0.2);
    });
  }catch(e){}
}

// --- NUMERO ORDINE PROGRESSIVO --------------------------------
function getNextOrdNum(){
  var num=parseInt(localStorage.getItem('cp4_ord_counter')||'0')+1;
  localStorage.setItem('cp4_ord_counter',String(num));
  return num;
}

// --- ULTIMO ARTICOLO AGGIUNTO (per ripeti) --------------------
var _lastAddedItem=null;

// --- TOAST ---------------------------------------------------
// _toastTimer gi- dichiarato nella sezione Magazzino (riusato qui)
var _TOAST_COLORS={green:'#38a169',purple:'#805ad5',blue:'#3182ce',red:'#e53e3e',orange:'#dd6b20'};

// --- CONFIRM DIALOG -------------------------------------------
var _confirmCb=null;

// --- BADGES ---------------------------------------------------
function updateCartBadge(){
  var b=document.getElementById('cart-badge');
  if(!b||!Array.isArray(carrelli))return;
  var n=carrelli.reduce(function(s,c){return s+((c&&c.items)?c.items.length:0);},0);
  b.textContent=n;b.style.display=n?'':'none';
}
function updateOrdBadge(){
  var n=ordini.filter(function(o){return o.stato==='nuovo';}).length;
  var b=document.getElementById('ord-badge');
  if(b){b.textContent=n;b.style.display=n?'':'none';}
}


// ══ NUMPAD GENERICO ═══════════════════════════════════════════════
// --- NUMPAD ---------------------------------------------------
var _numpadValue='';
var _numpadCallback=null;
var _numpadUnit='';

function openNumpad(label,currentVal,unit,callback){
  _numpadValue=String(currentVal||'');
  _numpadCallback=callback;
  _numpadUnit=unit||'';
  document.getElementById('numpad-label').textContent=label||'Quantit-';
  document.getElementById('numpad-display').textContent=_numpadValue||'0';
  document.getElementById('numpad-unit').textContent=_numpadUnit;
  document.getElementById('numpad-overlay').classList.add('open');
}
function closeNumpad(){
  document.getElementById('numpad-overlay').classList.remove('open');
  _numpadCallback=null;
}
function numpadPress(key){
  if(key==='C'){_numpadValue='';} 
  else if(key==='.'){if(_numpadValue.indexOf('.')<0)_numpadValue+='.';} 
  else{_numpadValue+=key;}
  document.getElementById('numpad-display').textContent=_numpadValue||'0';
}
function numpadConfirm(){
  var val=parseFloat(_numpadValue)||0;
  if(_numpadCallback)_numpadCallback(val);
  closeNumpad();
}


// ══ FIREBASE INIT & CARICAMENTO ═══════════════════════════════════
// --- FIREBASE ---
// Mostra indicatore di caricamento subito, prima ancora di connettersi
document.addEventListener('DOMContentLoaded', function(){
  _showLoadingBar('Connessione al database...');
});

(function(){
  try{
    _fb=firebase.initializeApp({
      apiKey:"AIzaSyAOCzTjXWAkYEsCkHEMNYQCdnzf6HGaDWY",
      authDomain:"ferramenta-2b546.firebaseapp.com",
      databaseURL:"https://ferramenta-2b546-default-rtdb.europe-west1.firebasedatabase.app",
      projectId:"ferramenta-2b546",
      storageBucket:"ferramenta-2b546.firebasestorage.app",
      messagingSenderId:"103703473598",
      appId:"1:103703473598:web:8f505c79eea852f324ddef"
    });
    _fbDb=firebase.database();
    _fbReady=true;
    // Snapshot degli ID gi- presenti PRIMA di connettersi - cos- al primo sync non scattano notifiche
    var _idKnown={};
    ordini.forEach(function(o){if(o&&o.id)_idKnown[o.id]=true;});
    var _first=true;
    _fbDb.ref('ordini').on('value',function(snap){
      if(_fbSyncing)return;
      var d=snap.val();if(!d)return;
      var fresh=_fbFix(d);
      // Aggiorna sempre _idKnown al primo sync (prima di confrontare)
      if(_first){
        fresh.forEach(function(o){if(o&&o.id)_idKnown[o.id]=true;});
        _first=false;
      }
      if(JSON.stringify(fresh)===JSON.stringify(ordini))return;
      _fbSyncing=true;
      try{
        ordini=fresh;lsSet(ORDK,ordini);updateOrdBadge();updateOrdCounter();
        var t=document.getElementById('to');if(t&&t.classList.contains('active'))renderOrdini();
        // Solo ordini con stato 'nuovo' che NON erano gi- noti
        var nuovi=fresh.filter(function(o){return o.stato==='nuovo'&&!_idKnown[o.id];});
        if(nuovi.length){
          nuovi.forEach(function(o){_idKnown[o.id]=true;});
          feedbackSend();
          // Notifica solo per l'ULTIMO ordine arrivato
          mostraNotificaOrdine(nuovi[nuovi.length-1]);
        }
        // Aggiorna _idKnown anche per ordini non-nuovi appena arrivati
        fresh.forEach(function(o){if(o&&o.id)_idKnown[o.id]=true;});
      }catch(e){console.error('FB ordini:',e);}
      setTimeout(function(){_fbSyncing=false;},500);
    });
    _fbDb.ref('carrelli').on('value',function(snap){
      if(_fbSyncing)return;
      var d=snap.val();if(!d)return;
      var fresh=_fbFix(d);
      if(JSON.stringify(fresh)===JSON.stringify(carrelli))return;
      _fbSyncing=true;
      carrelli=fresh;lsSet(CARTK,carrelli);updateCartBadge();
      var t=document.getElementById('tc');if(t&&t.classList.contains('active'))renderCartTabs();
      setTimeout(function(){_fbSyncing=false;},500);
    });

    // ── Avvia caricamento catalogo IMMEDIATAMENTE all'apertura ──
    // Nessuna attesa di click: il database si carica subito al DOMContentLoaded
    // Usiamo setTimeout(0) solo per non bloccare il paint iniziale
    if(document.readyState === 'loading'){
      document.addEventListener('DOMContentLoaded', function(){ setTimeout(loadMagazzinoFB, 50); });
    } else {
      setTimeout(loadMagazzinoFB, 50);
    }

    console.log('Firebase connesso');
  }catch(e){console.error('Firebase:',e);_hideLoadingBar();}
})();



// ── Barra di caricamento database ────────────────────────────────────────────
function _showLoadingBar(msg){
  var bar = document.getElementById('_db-loading-bar');
  if(!bar){
    bar = document.createElement('div');
    bar.id = '_db-loading-bar';
    bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;height:4px;background:rgba(0,0,0,.4);';
    bar.innerHTML = '<div id="_db-loading-fill" style="height:100%;width:5%;background:linear-gradient(90deg,var(--accent),#ff9800);transition:width .4s ease;border-radius:0 2px 2px 0;box-shadow:0 0 8px rgba(245,196,0,.5);"></div>';
    document.body.appendChild(bar);
  }
  bar.style.display = 'block';
  // Pannello testo caricamento — appare sotto l'header
  var lbl = document.getElementById('_db-loading-lbl');
  if(!lbl){
    lbl = document.createElement('div');
    lbl.id = '_db-loading-lbl';
    lbl.style.cssText = [
      'position:fixed;top:60px;left:50%;transform:translateX(-50%);z-index:9998;',
      'background:rgba(0,0,0,.82);border:1px solid var(--accent);border-radius:12px;',
      'padding:10px 20px;display:flex;align-items:center;gap:10px;',
      'color:var(--accent);font-size:13px;font-weight:700;letter-spacing:.4px;',
      'box-shadow:0 4px 20px rgba(0,0,0,.6);pointer-events:none;white-space:nowrap;'
    ].join('');
    lbl.innerHTML = '<span id="_db-spin" style="font-size:18px;animation:_dbspin 1s linear infinite;display:inline-block;">⏳</span> <span id="_db-msg">Caricamento database...</span>';
    // Aggiungi animazione spin
    if(!document.getElementById('_db-spin-style')){
      var st = document.createElement('style');
      st.id = '_db-spin-style';
      st.textContent = '@keyframes _dbspin{from{transform:rotate(0deg);}to{transform:rotate(360deg);}}';
      document.head.appendChild(st);
    }
    document.body.appendChild(lbl);
  }
  lbl.style.display = 'flex';
  var msgEl = document.getElementById('_db-msg');
  if(msgEl) msgEl.textContent = msg || 'Caricamento database...';
}
function _updateLoadingBar(pct){
  var fill = document.getElementById('_db-loading-fill');
  if(fill) fill.style.width = Math.max(5, pct) + '%';
  var msgEl = document.getElementById('_db-msg');
  if(msgEl) msgEl.textContent = 'Database: ' + pct + '% — attendere...';
}
function _hideLoadingBar(){
  var fill = document.getElementById('_db-loading-fill');
  if(fill) fill.style.width = '100%';
  setTimeout(function(){
    var bar = document.getElementById('_db-loading-bar');
    var lbl = document.getElementById('_db-loading-lbl');
    if(bar) bar.style.display = 'none';
    if(lbl){ lbl.style.display = 'none'; }
  }, 700);
}

// ── Carica articoli Firebase on-demand (lazy + chunked per Chrome) ───────────
function loadMagazzinoFB(){
  if(_magExtLoaded || !_fbReady || !_fbDb) return;
  _magExtLoaded = true;
  // Mostra barra di caricamento
  _showLoadingBar('⏳ Caricamento database articoli...');
  _fbDb.ref(MAGEXT_K).once('value', function(snap){
    var d = snap.val();
    if(!d){ showToastGen('yellow','⚠ Nessun articolo su Firebase'); _magExtLoaded=false; _hideLoadingBar(); return; }
    var keys = Object.keys(d);
    var total = keys.length;
    var arr = [];
    var pos = 0;
    var CHUNK = 500;
    function nextChunk(){
      var end = Math.min(pos + CHUNK, total);
      for(var i = pos; i < end; i++){
        var v = d[keys[i]];
        if(v != null) arr.push(v);
      }
      pos = end;
      if(pos < total){
        // Aggiorna barra ogni 1000 articoli
        if(pos % 1000 === 0 || pos === CHUNK){
          var pct = Math.round(pos/total*100);
          _updateLoadingBar(pct);
        }
        setTimeout(nextChunk, 0);
      } else {
        rows = arr;
        _tableShowAll = false;
        _filterIndices = null;
        // Invalida l'indice vecchio e ne costruisce uno nuovo in background
        _invIdxBuilt = false;
        setTimeout(_invBuildIndex, 0);
        _hideLoadingBar();
        showToastGen('green','✅ ' + rows.length + ' articoli pronti');
        renderTable();
        updateStats();
        updateStockBadge();
      }
    }
    nextChunk();
  }, function(err){
    _magExtLoaded = false;
    _hideLoadingBar();
    showToastGen('red','❌ Errore Firebase: '+(err?err.message:'sconosciuto'));
  });
}

