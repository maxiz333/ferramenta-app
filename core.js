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

var _fb=null,_fbDb=null,_fbReady=false,_fbSyncing=false,_fbSyncingCart=false;

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

function saveCarrelli(){
  _takeSnapshot();
  lsSet(CARTK, carrelli);
  updateCartBadge();
  // Su Firebase vanno SOLO i carrelli attivi (non inviati e non eliminati)
  // I carrelli "inviato" restano solo in localStorage — su Firebase spariscono
  // Questo è lo stesso comportamento degli ordini: una volta processato, esce dalla coda condivisa
  var daCondividere = carrelli.filter(function(c){
    return c.stato !== 'inviato';
  });
  if(_fbReady && _fbDb && !_fbSyncingCart){
    try{
      _fbDb.ref('carrelli').set(daCondividere.length ? daCondividere : null);
      console.log('[CART] saveCarrelli — Firebase aggiornato, attivi:', daCondividere.length, 'totale locale:', carrelli.length);
    }catch(e){ console.error('[CART] saveCarrelli Firebase FALLITO:', e); }
  }
}
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


// ══ SALVATAGGIO SINGOLO ARTICOLO SU FIREBASE ═════════════════════
// Salva solo l'articolo modificato (non tutti i 14.000)
function _fbSaveArticolo(idx){
  if(!_fbReady || !_fbDb || !rows[idx]) return;
  try{
    _fbDb.ref(MAGEXT_K + '/' + idx).set(rows[idx]);
  }catch(e){ console.error('Firebase save articolo:', e); }
}

// Traccia ultimo articolo modificato per sync automatico
var _lastModifiedIdx = null;

// Wrappa save() di database.js per sincronizzare su Firebase
// Viene eseguito dopo che database.js è caricato
document.addEventListener('DOMContentLoaded', function(){
  setTimeout(function(){
    if(typeof save === 'function'){
      var _origSave = save;
      save = function(){
        _origSave();
        // Se c'è un articolo appena modificato, salvalo su Firebase
        if(_lastModifiedIdx !== null){
          _fbSaveArticolo(_lastModifiedIdx);
          _lastModifiedIdx = null;
        }
      };
    }
    // Wrappa quickEditPrice per tracciare l'indice modificato
    if(typeof quickEditPrice === 'function'){
      var _origQEP = quickEditPrice;
      quickEditPrice = function(idx){
        _lastModifiedIdx = idx;
        _origQEP(idx);
      };
    }
  }, 100);
});

// ══ FIREBASE INIT & CARICAMENTO ═══════════════════════════════════
// --- FIREBASE ---
// Mostra indicatore di caricamento subito, prima ancora di connettersi
document.addEventListener('DOMContentLoaded', function(){
  _showLoadingBar('Connessione al database...');
  // Mostra login dopo un attimo (aspetta che Firebase carichi i PIN)
  setTimeout(_authInit, 800);
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
    _initLockListener();
    _initAccountBusyListener();
    // Snapshot degli ID gi- presenti PRIMA di connettersi - cos- al primo sync non scattano notifiche
    var _idKnown={};
    var _bozzaKnown={};
    var _bozzaSnap={}; // snapshot JSON delle bozze per rilevare aggiornamenti
    ordini.forEach(function(o){if(o&&o.id){_idKnown[o.id]=true; if(o.stato==='bozza'){_bozzaKnown[o.id]=true; _bozzaSnap[o.id]=JSON.stringify(o);}}});
    var _first=true;
    _fbDb.ref('ordini').on('value',function(snap){
      if(_fbSyncing)return;
      var d=snap.val();if(!d)return;
      var fresh=_fbFix(d);
      // Aggiorna sempre _idKnown al primo sync (prima di confrontare)
      if(_first){
        fresh.forEach(function(o){if(o&&o.id){_idKnown[o.id]=true; if(o.stato==='bozza'){_bozzaKnown[o.id]=true; _bozzaSnap[o.id]=JSON.stringify(o);}}});
        _first=false;
      }
      if(JSON.stringify(fresh)===JSON.stringify(ordini))return;
      _fbSyncing=true;
      try{
        ordini=fresh;lsSet(ORDK,ordini);updateOrdBadge();updateOrdCounter();
        var t=document.getElementById('to');if(t&&t.classList.contains('active')&&!document.querySelector('.ord-inline-input'))renderOrdini();
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
        // Bozze nuove — notifica browser + modal (come per gli ordini normali)
        var nuoveBozze=fresh.filter(function(o){return o.stato==='bozza'&&!_bozzaKnown[o.id];});
        if(nuoveBozze.length){
          nuoveBozze.forEach(function(o){_bozzaKnown[o.id]=true; _bozzaSnap[o.id]=JSON.stringify(o);});
          if(typeof mostraNotificaBozza === 'function'){
            mostraNotificaBozza(nuoveBozze[nuoveBozze.length-1]);
          }
        }
        // Bozze aggiornate — toast in-app per chi sta nella tab ordini
        fresh.forEach(function(o){
          if(o.stato==='bozza' && _bozzaKnown[o.id]){
            var newSnap=JSON.stringify(o);
            if(_bozzaSnap[o.id] && _bozzaSnap[o.id]!==newSnap){
              _bozzaSnap[o.id]=newSnap;
              if(typeof mostraBozzaAggiornata === 'function') mostraBozzaAggiornata(o);
            }
            _bozzaSnap[o.id]=newSnap;
          }
        });
      }catch(e){console.error('FB ordini:',e);}
      setTimeout(function(){_fbSyncing=false;},500);
    });
    _fbDb.ref('carrelli').on('value',function(snap){
      // Flag SEPARATO: non interferisce con la sync degli ordini
      if(_fbSyncingCart) return;
      var d = snap.val();
      // Firebase manda null se non ci sono carrelli attivi — normale
      var fresh = d ? _fbFix(d) : [];
      // Fonde i carrelli Firebase con quelli locali già inviati (che non sono su Firebase)
      // Mantiene i carrelli "inviato" che ho già localmente — non li perde
      var inviatiLocali = carrelli.filter(function(c){ return c.stato === 'inviato'; });
      var merged = fresh.concat(inviatiLocali.filter(function(inv){
        return !fresh.find(function(f){ return f.id === inv.id; });
      }));
      if(JSON.stringify(merged) === JSON.stringify(carrelli)) return;
      _fbSyncingCart = true;
      try{
        console.log('[CART] sync Firebase — attivi:', fresh.length, 'inviati locali:', inviatiLocali.length);
        carrelli = merged;
        lsSet(CARTK, carrelli);
        updateCartBadge();
        // Se activeCartId non esiste più tra i carrelli attivi, prendi l'ultimo attivo
        var cartAttivoEsiste = carrelli.find(function(c){ return c.id === activeCartId && c.stato !== 'inviato'; });
        if(!cartAttivoEsiste){
          var attivi = carrelli.filter(function(c){ return c.stato !== 'inviato'; });
          activeCartId = attivi.length ? attivi[attivi.length-1].id : (carrelli.length ? carrelli[carrelli.length-1].id : null);
          console.log('[CART] activeCartId corretto a:', activeCartId);
        }
        var t = document.getElementById('tc');
        if(t && t.classList.contains('active')) renderCartTabs();
      }catch(e){ console.error('[CART] sync Firebase errore:', e); }
      setTimeout(function(){ _fbSyncingCart = false; }, 300);
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


// ══ LOCK COLLABORATIVO ORDINI ═══════════════════════════════════
var LOCK_EXPIRE = 5 * 60 * 1000; // 5 minuti
var _ordLocks = {};
var _deviceId = localStorage.getItem('cp4_deviceId') || ('dev_' + Date.now() + '_' + Math.random().toString(36).substr(2,6));
localStorage.setItem('cp4_deviceId', _deviceId);
var _deviceName = localStorage.getItem('cp4_deviceName') || _deviceId;

function _lockKey(ordId){ return String(ordId).replace(/[.#$/\[\]]/g, '_'); }

function ordLock(ordId){
  if(!_fbReady || !_fbDb) return;
  var key = _lockKey(ordId);
  var lockBy = (_currentUser ? _currentUser.key : _deviceId);
  var lockName = (_currentUser ? _currentUser.nome : _deviceName);
  var lock = { by: lockBy, name: lockName, at: Date.now() };
  _ordLocks[key] = lock;
  try{ _fbDb.ref('locks/' + key).set(lock); }catch(e){ console.error('ordLock err:', e); }
  // Aggiorna anche il nodo accountBusy (lock per-account: segnala che questo account è occupato)
  _accountBusySet(ordId);
}

function ordUnlock(ordId){
  var key = _lockKey(ordId);
  delete _ordLocks[key];
  if(_fbReady && _fbDb) try{ _fbDb.ref('locks/' + key).remove(); }catch(e){}
  // Rilascia anche il lock per-account
  _accountBusyClear();
}

// ── LOCK PER-ACCOUNT: segnala su Firebase che questo account è occupato ──────
// Struttura Firebase: accountBusy/{accountKey} = { ordId, name, at }
var _myAccountBusyOrdId = null; // traccia l'ordine su cui siamo occupati

function _accountBusySet(ordId){
  if(!_fbReady || !_fbDb || !_currentUser) return;
  _myAccountBusyOrdId = ordId;
  var data = {
    ordId: ordId,
    name: _currentUser.nome,
    ruolo: _currentUser.ruolo,
    at: Date.now()
  };
  try{ _fbDb.ref('accountBusy/' + _currentUser.key).set(data); }catch(e){}
}

function _accountBusyClear(){
  _myAccountBusyOrdId = null;
  if(!_fbReady || !_fbDb || !_currentUser) return;
  try{ _fbDb.ref('accountBusy/' + _currentUser.key).remove(); }catch(e){}
}

// Restituisce info su account occupati (esclude il proprio)
// Ritorna array di { key, name, ordId } oppure [] se nessuno occupato
var _accountBusyMap = {};

function _initAccountBusyListener(){
  if(!_fbReady || !_fbDb) return;
  _fbDb.ref('accountBusy').on('value', function(snap){
    _accountBusyMap = snap.val() || {};
  });
}

// Ritorna stringa "⚠️ Banco 1 è occupato su Ordine #X" se l'ordine è in lavorazione da un altro account
// Usato nell'UI per mostrare avvisi contestuali (non blocca, solo informa)
function getAccountBusyWarning(ordId){
  var myKey = _currentUser ? _currentUser.key : null;
  var warnings = [];
  Object.keys(_accountBusyMap).forEach(function(k){
    if(k === myKey) return; // ignora se stesso
    var b = _accountBusyMap[k];
    if(!b) return;
    // Avvisa solo se è sullo stesso ordine O se vuoi vedere tutti gli occupati
    if(b.ordId === ordId){
      warnings.push('⚠️ ' + (b.name || k) + ' sta lavorando su questo ordine');
    }
  });
  return warnings.join(' · ');
}

function ordIsLockedByOther(ordId){
  var key = _lockKey(ordId);
  var lock = _ordLocks[key];
  if(!lock) return false;
  var myId = (_currentUser ? _currentUser.key : _deviceId);
  if(lock.by === myId) return false;
  if(Date.now() - lock.at > LOCK_EXPIRE) return false;
  return lock;
}

function _initLockListener(){
  if(!_fbReady || !_fbDb) return;
  _fbDb.ref('locks').on('value', function(snap){
    var d = snap.val();
    _ordLocks = d || {};
    // NON re-renderizzare se c'è un editing inline attivo
    if(document.querySelector('.ord-inline-input')) return;
    var t = document.getElementById('to');
    if(t && t.classList.contains('active')){
      try{ renderOrdini(); }catch(e){}
    }
  });
}


// ── Cleanup automatico lock alla chiusura della pagina ───────────────────────
// Se l'utente chiude il browser o cambia pagina, rilascia lock e accountBusy
window.addEventListener('beforeunload', function(){
  _accountBusyClear();
  // Rilascia tutti i lock acquisiti da questo account
  if(_fbReady && _fbDb && _currentUser){
    try{ _fbDb.ref('accountBusy/' + _currentUser.key).remove(); }catch(e){}
  }
});


var AUTH_K = 'cp4_auth';
var _currentUser = null;

// Ruoli e permessi
var _defaultColors = { prop1:'#f5c400', prop2:'#f5c400', comm1:'#63b3ed', comm2:'#68d391' };
var _roles = {
  prop1: { nome:'Proprietario 1', ruolo:'proprietario', pin:'', colore:'#f5c400', tabs:'*' },
  prop2: { nome:'Proprietario 2', ruolo:'proprietario', pin:'', colore:'#f5c400', tabs:'*' },
  comm1: { nome:'Commesso 1', ruolo:'commesso', pin:'', colore:'#63b3ed',
    tabs:['tc','to','t0','t11','t10','t1','t7','t9','t-ordfor'],
    altro:['atb-t11','atb-t10','atb-t12'],
    bottom:['tbb-tc','tbb-to','tbb-t0','tbb-t1','tbb-taltro']
  },
  comm2: { nome:'Commesso 2', ruolo:'commesso', pin:'', colore:'#68d391',
    tabs:['tc','to','t0','t11','t10','t1','t7','t9','t-ordfor'],
    altro:['atb-t11','atb-t10','atb-t12'],
    bottom:['tbb-tc','tbb-to','tbb-t0','tbb-t1','tbb-taltro']
  }
};

// Carica PIN e nomi salvati da Firebase
function _authLoad(){
  var saved = lsGet(AUTH_K, null);
  if(saved){
    Object.keys(saved).forEach(function(k){
      if(_roles[k]){
        if(saved[k].pin) _roles[k].pin = saved[k].pin;
        if(saved[k].nome) _roles[k].nome = saved[k].nome;
        if(saved[k].colore) _roles[k].colore = saved[k].colore;
      }
    });
  }
  // Carica anche da Firebase
  if(_fbReady && _fbDb){
    _fbDb.ref('auth').once('value', function(snap){
      var d = snap.val();
      if(d){
        Object.keys(d).forEach(function(k){
          if(_roles[k]){
            if(d[k].pin) _roles[k].pin = d[k].pin;
            if(d[k].nome) _roles[k].nome = d[k].nome;
            if(d[k].colore) _roles[k].colore = d[k].colore;
          }
        });
        _authSaveLocal();
        // Aggiorna nomi sulla schermata login se visibile
        _authRenderLogin();
        // Aggiorna header se loggato (potrebbe aver cambiato nome/colore da altro device)
        if(_currentUser && _roles[_currentUser.key]){
          _currentUser.nome = _roles[_currentUser.key].nome;
          _currentUser.colore = _roles[_currentUser.key].colore;
          _authUpdateHeader();
        }
      }
    });
  }
}

function _authSaveLocal(){
  var data = {};
  Object.keys(_roles).forEach(function(k){
    data[k] = { pin: _roles[k].pin, nome: _roles[k].nome, colore: _roles[k].colore || '' };
  });
  lsSet(AUTH_K, data);
}

function _authSaveFirebase(){
  _authSaveLocal();
  if(_fbReady && _fbDb){
    var data = {};
    Object.keys(_roles).forEach(function(k){
      data[k] = { pin: _roles[k].pin, nome: _roles[k].nome, colore: _roles[k].colore || '' };
    });
    try{ _fbDb.ref('auth').set(data); }catch(e){}
  }
}

// Schermata login
function _authShowLogin(){
  var ov = document.getElementById('auth-login-ov');
  if(!ov){
    ov = document.createElement('div');
    ov.id = 'auth-login-ov';
    ov.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#111;display:flex;flex-direction:column;align-items:center;justify-content:center;';
    document.body.appendChild(ov);
  }
  ov.style.display = 'flex';
  _authRenderLogin();
}

function _authRenderLogin(){
  var ov = document.getElementById('auth-login-ov');
  if(!ov || ov.style.display === 'none') return;
  var h = '<div style="text-align:center;max-width:340px;width:90%;">';
  h += '<div style="font-size:28px;font-weight:900;color:var(--accent);margin-bottom:6px;">RATTAZZI</div>';
  h += '<div style="font-size:12px;color:#555;margin-bottom:30px;">Seleziona il tuo account</div>';
  
  Object.keys(_roles).forEach(function(k){
    var r = _roles[k];
    var icon = r.ruolo === 'proprietario' ? '👑' : '👤';
    var col = r.colore || (r.ruolo === 'proprietario' ? '#f5c400' : '#888');
    h += '<div style="display:flex;gap:6px;margin-bottom:8px;align-items:stretch;">';
    // Pulsante account
    h += '<button onclick="_authSelectUser(\''+k+'\')" style="display:flex;align-items:center;gap:12px;flex:1;padding:14px 18px;border-radius:12px;border:1px solid #2a2a2a;background:#1a1a1a;cursor:pointer;touch-action:manipulation;text-align:left;">';
    h += '<span style="font-size:24px;">'+icon+'</span>';
    h += '<div style="flex:1"><div style="font-size:14px;font-weight:800;color:'+col+';">'+esc(r.nome)+'</div>';
    h += '<div style="font-size:10px;color:#555;text-transform:uppercase;">'+r.ruolo+'</div></div>';
    h += '<div style="width:8px;height:8px;border-radius:50%;background:'+col+';align-self:center;"></div>';
    h += '</button>';
    // Tasto modifica (solo se ha PIN, quindi account configurato)
    if(r.pin){
      h += '<button onclick="_authEditAccount(\''+k+'\')" style="padding:0 12px;border-radius:12px;border:1px solid #2a2a2a;background:#1a1a1a;cursor:pointer;color:#666;font-size:16px;" title="Modifica account">⚙️</button>';
    }
    h += '</div>';
  });
  
  h += '</div>';
  ov.innerHTML = h;
}

// Utente selezionato — mostra numpad PIN
function _authSelectUser(key){
  var r = _roles[key];
  if(!r) return;
  
  // Se non ha PIN, chiedi di crearlo
  if(!r.pin){
    _authSetupPin(key);
    return;
  }
  
  var ov = document.getElementById('auth-login-ov');
  var h = '<div style="text-align:center;max-width:300px;width:90%;">';
  h += '<div style="font-size:20px;font-weight:800;color:var(--accent);margin-bottom:4px;">'+esc(r.nome)+'</div>';
  h += '<div style="font-size:11px;color:#555;margin-bottom:20px;">Inserisci PIN</div>';
  h += '<div id="auth-pin-dots" style="display:flex;justify-content:center;gap:12px;margin-bottom:20px;">';
  h += '<span class="auth-dot"></span><span class="auth-dot"></span><span class="auth-dot"></span><span class="auth-dot"></span>';
  h += '</div>';
  h += '<div id="auth-pin-error" style="font-size:11px;color:#e53e3e;min-height:18px;margin-bottom:10px;"></div>';
  h += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;max-width:220px;margin:0 auto;">';
  for(var i=1;i<=9;i++) h += '<button class="auth-key" onclick="_authPinKey(\''+i+'\')">'+i+'</button>';
  h += '<button class="auth-key" onclick="_authBack()" style="font-size:12px;">←</button>';
  h += '<button class="auth-key" onclick="_authPinKey(\'0\')">0</button>';
  h += '<button class="auth-key" onclick="_authPinKey(\'del\')" style="font-size:11px;">⌫</button>';
  h += '</div>';
  h += '</div>';
  ov.innerHTML = h;
  
  ov._authKey = key;
  ov._authPin = '';
}

var _authPinBuffer = '';

function _authPinKey(k){
  var ov = document.getElementById('auth-login-ov');
  if(!ov) return;
  
  if(k === 'del'){
    _authPinBuffer = _authPinBuffer.slice(0,-1);
  } else {
    if(_authPinBuffer.length >= 4) return;
    _authPinBuffer += k;
  }
  
  // Aggiorna pallini
  var dots = document.querySelectorAll('.auth-dot');
  dots.forEach(function(d,i){ d.classList.toggle('auth-dot--on', i < _authPinBuffer.length); });
  
  // Se 4 cifre, verifica
  if(_authPinBuffer.length === 4){
    var key = ov._authKey;
    var r = _roles[key];
    if(_authPinBuffer === r.pin){
      // Login OK — salva sessione per auto-login al refresh
      _currentUser = { key:key, nome:r.nome, ruolo:r.ruolo, colore:r.colore||'' };
      _deviceName = r.nome;
      localStorage.setItem('cp4_deviceName', r.nome);
      localStorage.setItem('cp4_lastUser', key);
      _authSaveSession(key);
      ov.style.display = 'none';
      _authApplyRole();
      _authUpdateHeader();
      showToastGen('green','Benvenuto '+r.nome+'!');
    } else {
      // PIN errato
      var err = document.getElementById('auth-pin-error');
      if(err) err.textContent = 'PIN errato';
      _authPinBuffer = '';
      setTimeout(function(){
        var dots2 = document.querySelectorAll('.auth-dot');
        dots2.forEach(function(d){ d.classList.remove('auth-dot--on'); });
      }, 300);
    }
  }
}

function _authBack(){
  _authPinBuffer = '';
  _authRenderLogin();
}

// Setup PIN per la prima volta
function _authSetupPin(key){
  var r = _roles[key];
  var nome = prompt('Nome per questo account:', r.nome);
  if(!nome) return;
  r.nome = nome.trim();
  
  var pin = prompt('Crea un PIN a 4 cifre:');
  if(!pin || pin.length !== 4 || !/^\d{4}$/.test(pin)){ showToastGen('red','PIN deve essere 4 cifre'); return; }
  r.pin = pin;
  
  _authSaveFirebase();
  showToastGen('green','Account "'+r.nome+'" creato!');
  _authRenderLogin();
}

// ── Modifica Account (nome + colore) ──────────────────────────────────────
var _authColorPalette = [
  '#f5c400','#f6ad55','#fc8181','#e53e3e','#f687b3','#d53f8c',
  '#b794f4','#805ad5','#63b3ed','#3182ce','#4fd1c5','#38b2ac',
  '#68d391','#38a169','#a0aec0','#e2e8f0'
];

function _authEditAccount(key){
  var r = _roles[key];
  if(!r) return;
  var ov = document.getElementById('auth-login-ov');
  if(!ov) return;

  var col = r.colore || _defaultColors[key] || '#aaa';

  var h = '<div style="text-align:center;max-width:340px;width:90%;">';
  h += '<div style="font-size:18px;font-weight:900;color:'+col+';margin-bottom:4px;">⚙️ Modifica Account</div>';
  h += '<div style="font-size:10px;color:#555;text-transform:uppercase;margin-bottom:24px;">'+r.ruolo+'</div>';

  // Nome
  h += '<div style="text-align:left;margin-bottom:16px;">';
  h += '<label style="font-size:11px;color:#888;font-weight:700;display:block;margin-bottom:6px;">NOME</label>';
  h += '<input id="auth-edit-nome" type="text" value="'+esc(r.nome)+'" maxlength="20" style="width:100%;padding:12px 14px;border-radius:10px;border:1px solid #333;background:#1a1a1a;color:#fff;font-size:15px;font-weight:700;box-sizing:border-box;">';
  h += '</div>';

  // Colore
  h += '<div style="text-align:left;margin-bottom:20px;">';
  h += '<label style="font-size:11px;color:#888;font-weight:700;display:block;margin-bottom:8px;">COLORE</label>';
  h += '<div id="auth-color-grid" style="display:grid;grid-template-columns:repeat(8,1fr);gap:6px;">';
  _authColorPalette.forEach(function(c){
    var sel = (c.toLowerCase() === col.toLowerCase());
    h += '<div onclick="_authPickColor(\''+c+'\')" style="width:100%;aspect-ratio:1;border-radius:50%;background:'+c+';cursor:pointer;border:3px solid '+(sel?'#fff':'transparent')+';box-sizing:border-box;transition:border .15s;"></div>';
  });
  h += '</div>';
  h += '<div id="auth-color-preview" style="margin-top:10px;text-align:center;font-size:16px;font-weight:900;color:'+col+';">'+esc(r.nome)+'</div>';
  h += '</div>';

  // Pulsanti
  h += '<div style="display:flex;gap:10px;margin-top:8px;">';
  h += '<button onclick="_authBack()" style="flex:1;padding:12px;border-radius:10px;border:1px solid #333;background:transparent;color:#888;font-size:13px;cursor:pointer;">← Indietro</button>';
  h += '<button onclick="_authSaveEdit(\''+key+'\')" style="flex:1;padding:12px;border-radius:10px;border:none;background:#38a169;color:#fff;font-size:13px;font-weight:800;cursor:pointer;">✅ Salva</button>';
  h += '</div>';

  h += '</div>';
  ov.innerHTML = h;

  // Salva key e colore corrente
  ov._editKey = key;
  ov._editColor = col;
}

function _authPickColor(c){
  var ov = document.getElementById('auth-login-ov');
  if(!ov) return;
  ov._editColor = c;

  // Aggiorna bordi pallini
  var dots = document.querySelectorAll('#auth-color-grid > div');
  dots.forEach(function(d){
    d.style.borderColor = (d.style.background === c || d.style.backgroundColor === c) ? '#fff' : 'transparent';
  });
  // Workaround: match per valore esatto
  dots.forEach(function(d){
    var bg = d.style.background || d.style.backgroundColor;
    // Normalizza hex
    var match = (bg.toLowerCase().replace(/\s/g,'') === c.toLowerCase().replace(/\s/g,''));
    if(!match){
      // Prova rgb
      var tmpDiv = document.createElement('div');
      tmpDiv.style.color = c;
      document.body.appendChild(tmpDiv);
      var rgb = getComputedStyle(tmpDiv).color;
      document.body.removeChild(tmpDiv);
      match = (bg === rgb);
    }
    d.style.borderColor = match ? '#fff' : 'transparent';
  });

  // Preview
  var prev = document.getElementById('auth-color-preview');
  if(prev){
    prev.style.color = c;
    var inp = document.getElementById('auth-edit-nome');
    if(inp) prev.textContent = inp.value || '...';
  }
}

function _authSaveEdit(key){
  var ov = document.getElementById('auth-login-ov');
  if(!ov) return;
  var r = _roles[key];
  if(!r) return;

  var inp = document.getElementById('auth-edit-nome');
  var newNome = inp ? inp.value.trim() : r.nome;
  if(!newNome){ showToastGen('red','Inserisci un nome'); return; }

  var newColore = ov._editColor || r.colore;

  r.nome = newNome;
  r.colore = newColore;

  // Se è l'utente attualmente loggato, aggiorna anche _currentUser
  if(_currentUser && _currentUser.key === key){
    _currentUser.nome = newNome;
    _currentUser.colore = newColore;
    _deviceName = newNome;
    localStorage.setItem('cp4_deviceName', newNome);
    _authUpdateHeader();
  }

  _authSaveFirebase();
  showToastGen('green','Account aggiornato!');
  _authRenderLogin();
}

// Applica visibilità tab in base al ruolo
function _authUpdateHeader(){
  var el = document.getElementById('app-header-subtitle');
  if(!el) return;
  if(_currentUser){
    var role = _roles[_currentUser.key];
    var col = (role && role.colore) ? role.colore : (_currentUser.ruolo === 'proprietario' ? '#f5c400' : '#aaa');
    el.textContent = _currentUser.nome;
    el.style.color = col;
  } else {
    el.textContent = 'Cartellini Prezzi';
    el.style.color = '';
  }
}

function _authApplyRole(){
  if(!_currentUser) return;
  var role = _roles[_currentUser.key];
  if(!role) return;
  _authUpdateHeader();
  
  // Proprietario vede tutto
  if(role.tabs === '*') return;
  
  // Nascondi tab nella bottom bar
  var allBottom = document.querySelectorAll('.tab-bottom-btn');
  allBottom.forEach(function(btn){
    var id = btn.id;
    if(role.bottom && role.bottom.indexOf(id) >= 0){
      btn.style.display = '';
    } else if(role.bottom){
      btn.style.display = 'none';
    }
  });
  
  // Nascondi bottoni nel menu Altro
  var allAltro = document.querySelectorAll('.altro-btn');
  allAltro.forEach(function(btn){
    var id = btn.id;
    if(!id) return;
    if(role.altro && role.altro.indexOf(id) >= 0){
      btn.style.display = '';
    } else if(role.altro){
      btn.style.display = 'none';
    }
  });
  
  // Theme toggle sempre visibile
  var themeBtn = document.getElementById('theme-toggle-btn');
  if(themeBtn) themeBtn.style.display = '';
}

// Auto-login se sessione attiva salvata
var _AUTH_SESSION_K = 'cp4_auth_session';

function _authInit(){
  _authLoad();

  // Controlla se c'è una sessione attiva salvata
  var session = lsGet(_AUTH_SESSION_K, null);
  if(session && session.key && _roles[session.key] && _roles[session.key].pin){
    // Auto-login — salta la schermata PIN
    _currentUser = { key: session.key, nome: _roles[session.key].nome, ruolo: _roles[session.key].ruolo, colore: _roles[session.key].colore||'' };
    _deviceName = _currentUser.nome;
    localStorage.setItem('cp4_deviceName', _currentUser.nome);
    _authApplyRole();
    _authUpdateHeader();
    // Nascondi overlay login se presente
    var ov = document.getElementById('auth-login-ov');
    if(ov) ov.style.display = 'none';
    return;
  }

  // Nessuna sessione — mostra login
  _authShowLogin();
}

function _authSaveSession(key){
  lsSet(_AUTH_SESSION_K, { key: key, at: new Date().toISOString() });
}

function _authClearSession(){
  localStorage.removeItem(_AUTH_SESSION_K);
}

function authLogout(){
  _authClearSession();
  _currentUser = null;
  _authUpdateHeader();
  // Ripristina visibilità di tutte le tab (reset permessi)
  var allBottom = document.querySelectorAll('.tab-bottom-btn');
  allBottom.forEach(function(btn){ btn.style.display = ''; });
  var allAltro = document.querySelectorAll('.altro-btn');
  allAltro.forEach(function(btn){ btn.style.display = ''; });
  // Chiudi menu Altro se aperto
  if(typeof closeAltroMenu === 'function') closeAltroMenu();
  // Mostra login
  _authShowLogin();
  showToastGen('blue','👋 Disconnesso');
}
