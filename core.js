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
// Salva l'articolo modificato CON i dati magazzino (qty, prezzoAcquisto, ecc.)
var _MAG_FIELDS = ['qty','unit','soglia','prezzoAcquisto','marca','specs',
                   'posizione','cat','subcat','nomeFornitore'];

function _fbSaveArticolo(idx){
  if(!_fbReady || !_fbDb || !rows[idx]) return;
  try{
    var obj = JSON.parse(JSON.stringify(rows[idx]));
    var m = magazzino[idx];
    if(m){
      _MAG_FIELDS.forEach(function(f){
        if(m[f] !== undefined && m[f] !== '') obj['_m_' + f] = m[f];
      });
    }
    _fbDb.ref(MAGEXT_K + '/' + idx).set(obj);
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
        // Estrai campi _m_* da Firebase → magazzino[] (in background, non blocca)
        setTimeout(_extractMagFromRows, 200);
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
// Nodo Firebase: ordiniLocks/{sanitizedOrdId} = { by, name, at } (at = server timestamp)
var LOCK_EXPIRE = 5 * 60 * 1000; // lock altrui considerato valido se più recente di 5 min
var ORD_LOCKS_FB = 'ordiniLocks';
var _ordLocks = {};
var _ordLocksSnapshotJson = '';
/** Dopo acquisizione lock (transaction): maschera solo se lo snapshot non mostra già un altro titolare */
var _ordLockUiGrace = {};
var LOCK_UI_GRACE_MS = 2500;
/** Dopo forzatura: il listener può essere in ritardo — breve periodo in cui non mostriamo overlay al dispositivo che ha scritto */
var _ordForceLockGrace = {};
var LOCK_FORCE_GRACE_MS = 3000;
var _deviceId = localStorage.getItem('cp4_deviceId') || ('dev_' + Date.now() + '_' + Math.random().toString(36).substr(2,6));
localStorage.setItem('cp4_deviceId', _deviceId);
var _deviceName = localStorage.getItem('cp4_deviceName') || _deviceId;

function _lockKey(ordId){ return String(ordId).replace(/[.#$/\[\]]/g, '_'); }

function _ordLockPayload(){
  var lockBy = (_currentUser ? _currentUser.key : _deviceId);
  var lockName = (_currentUser ? _currentUser.nome : _deviceName);
  return { by: lockBy, name: lockName, at: firebase.database.ServerValue.TIMESTAMP };
}

function _ordLockLocalCopy(){
  var lockBy = (_currentUser ? _currentUser.key : _deviceId);
  var lockName = (_currentUser ? _currentUser.nome : _deviceName);
  return { by: lockBy, name: lockName, at: Date.now() };
}

/**
 * Acquisisce il lock su Firebase (ordiniLocks). Non modifica rows/ordini[].
 * @param force se true sovrascrive sempre (triplo tap). Se false = first-come: transaction, fallisce se lock fresco altrui.
 * @param callback(ok) opzionale
 */
function ordAcquireOrderLock(ordId, options, callback){
  if(typeof options === 'function'){ callback = options; options = {}; }
  options = options || {};
  var force = !!options.force;
  var cb = typeof callback === 'function' ? callback : function(){};
  var key = _lockKey(ordId);
  var lockBy = (_currentUser ? _currentUser.key : _deviceId);
  var refPath = ORD_LOCKS_FB + '/' + key;

  function finish(ok, isForce){
    if(ok){
      if(isForce) _ordForceLockGrace[key] = Date.now() + LOCK_FORCE_GRACE_MS;
      else _ordLockUiGrace[key] = Date.now() + LOCK_UI_GRACE_MS;
      _accountBusySet(ordId);
    }
    cb(ok);
  }

  if(!_fbReady || !_fbDb){
    if(force || !ordIsLockedByOther(ordId)){
      _ordLocks[key] = _ordLockLocalCopy();
      finish(true, !!force);
    } else {
      finish(false, false);
    }
    return;
  }

  var ref = _fbDb.ref(refPath);

  if(force){
    var pay = _ordLockPayload();
    _ordLocks[key] = _ordLockLocalCopy();
    ref.set(pay, function(err){
      if(err){
        console.error('[LOCK] ordAcquireOrderLock force err:', err);
        delete _ordLocks[key];
        finish(false, false);
        return;
      }
      finish(true, true);
    });
    return;
  }

  ref.transaction(function(current){
    var now = Date.now();
    if(!current) return _ordLockPayload();
    var at = current.at;
    if(typeof at !== 'number' || isNaN(at) || (now - at) > LOCK_EXPIRE) return _ordLockPayload();
    if(String(current.by) === String(lockBy)) return _ordLockPayload();
    return undefined;
  }, function(error, committed, snapshot){
    if(error){
      console.error('[LOCK] transaction err:', error);
      finish(false, false);
      return;
    }
    if(!committed){
      finish(false, false);
      return;
    }
    var v = snapshot.val();
    if(v && typeof v.at === 'number') _ordLocks[key] = v;
    else _ordLocks[key] = _ordLockLocalCopy();
    finish(true, false);
  });
}

/** @deprecated Usare ordAcquireOrderLock; mantenuto per compat: forza lock senza callback */
function ordLock(ordId){
  ordAcquireOrderLock(ordId, { force: true });
}

function ordUnlock(ordId){
  var key = _lockKey(ordId);
  delete _ordLockUiGrace[key];
  delete _ordForceLockGrace[key];
  delete _ordLocks[key];
  if(_fbReady && _fbDb){
    try{ _fbDb.ref(ORD_LOCKS_FB + '/' + key).remove(); }catch(e){}
  }
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
  var myId = (_currentUser ? _currentUser.key : _deviceId);
  var fg = _ordForceLockGrace[key];
  if(fg && Date.now() < fg) return false;
  var gu = _ordLockUiGrace[key];
  if(gu && Date.now() < gu && (!lock || String(lock.by) === String(myId))) return false;
  if(!lock) return false;
  if(String(lock.by) === String(myId)) return false;
  var at = lock.at;
  if(typeof at !== 'number' || isNaN(at)) return false;
  if(Date.now() - at > LOCK_EXPIRE) return false;
  return lock;
}

function _initLockListener(){
  if(!_fbReady || !_fbDb) return;
  _fbDb.ref(ORD_LOCKS_FB).on('value', function(snap){
    var d = snap.val();
    var flat = d || {};
    var js = JSON.stringify(flat);
    if(js === _ordLocksSnapshotJson) return;
    _ordLocksSnapshotJson = js;
    _ordLocks = flat;
    if(document.querySelector('.ord-inline-input')) return;
    var t = document.getElementById('to');
    if(t && t.classList.contains('active')){
      try{ renderOrdini(); }catch(e){}
    }
  });
}

/** Dopo forzatura lock: refresh UI subito (tab ordini attiva) */
function ordRefreshLockUI(){
  var t = document.getElementById('to');
  if(t && t.classList.contains('active') && !document.querySelector('.ord-inline-input')){
    try{ renderOrdini(); }catch(e){}
  }
  requestAnimationFrame(function(){
    if(document.querySelector('.ord-inline-input')) return;
    try{ if(typeof renderOrdini === 'function') renderOrdini(); }catch(e){}
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
  
  // Bottone CASSA — accesso diretto senza PIN
  h += '<div style="margin-top:24px;border-top:1px solid #2a2a2a;padding-top:20px;">';
  h += '<button onclick="_cassaModeOpen()" style="display:flex;align-items:center;justify-content:center;gap:12px;width:100%;padding:16px 18px;border-radius:14px;border:2px solid #38a169;background:#38a16915;cursor:pointer;touch-action:manipulation;">';
  h += '<span style="font-size:28px;">💰</span>';
  h += '<div style="text-align:left;"><div style="font-size:16px;font-weight:900;color:#68d391;">CASSA</div>';
  h += '<div style="font-size:10px;color:#555;">Visualizza ordini e fai scontrini</div></div>';
  h += '</button></div>';

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


// ══ ESTRAI CAMPI MAGAZZINO DA FIREBASE (background) ══════════════════════════
// Dopo loadMagazzinoFB, se su Firebase ci sono campi _m_* li sposta in magazzino[]
function _extractMagFromRows(){
  if(!rows || !rows.length) return;
  var changed = false;
  for(var i = 0; i < rows.length; i++){
    var r = rows[i];
    if(!r) continue;
    for(var j = 0; j < _MAG_FIELDS.length; j++){
      var fbKey = '_m_' + _MAG_FIELDS[j];
      if(r[fbKey] !== undefined){
        if(!magazzino[i]) magazzino[i] = {};
        magazzino[i][_MAG_FIELDS[j]] = r[fbKey];
        delete r[fbKey];
        changed = true;
      }
    }
  }
  if(changed) lsSet(MAGK, magazzino);
}


// ══ ESPORTA DATABASE CSV ══════════════════════════════════════════════════════
function esportaDatabaseCSV(){
  if(!rows || !rows.length){ showToastGen('red','❌ Database vuoto'); return; }
  var sep = ';';
  var headers = ['Descrizione','CodMagazzino','CodFornitore','Prezzo','PrezzoOld1','PrezzoOld2','PrezzoOld3','PrezzoAcquisto','Quantita','Unita','Marca','Fornitore'];
  var csvLines = [headers.join(sep)];
  rows.forEach(function(r, i){
    if(!r) return;
    var m = magazzino[i] || {};
    var ph = r.priceHistory || [];
    var old1, old2, old3;
    if(r.prezzoOld){
      old1 = r.prezzoOld;
      old2 = ph[0] ? ph[0].prezzo : '';
      old3 = ph[1] ? ph[1].prezzo : '';
    } else {
      old1 = ph[0] ? ph[0].prezzo : '';
      old2 = ph[1] ? ph[1].prezzo : '';
      old3 = ph[2] ? ph[2].prezzo : '';
    }
    var cols = [
      (r.desc || '').replace(/;/g, ','),
      r.codM || '', r.codF || '', r.prezzo || '',
      old1 || '', old2 || '', old3 || '',
      m.prezzoAcquisto || '',
      m.qty !== undefined && m.qty !== '' ? String(m.qty) : '',
      m.unit || 'pz', m.marca || '', m.nomeFornitore || ''
    ];
    csvLines.push(cols.join(sep));
  });
  var blob = new Blob(['\uFEFF' + csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
  var a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'rattazzi_database_' + new Date().toISOString().slice(0,10) + '.csv';
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  showToastGen('green', '✅ ' + rows.length + ' articoli esportati!');
}


// ══ SYNC BATCH: salva TUTTO su Firebase con dati magazzino ═══════════════════
function fbSyncTuttoMagazzino(){
  if(!_fbReady || !_fbDb || !rows.length){
    showToastGen('red','❌ Firebase non pronto o database vuoto'); return;
  }
  var updates = {};
  rows.forEach(function(r, idx){
    if(!r) return;
    var obj = JSON.parse(JSON.stringify(r));
    var m = magazzino[idx];
    if(m){
      _MAG_FIELDS.forEach(function(f){
        if(m[f] !== undefined && m[f] !== '') obj['_m_' + f] = m[f];
      });
    }
    updates[MAGEXT_K + '/' + idx] = obj;
  });
  showToastGen('blue', '⏳ Sincronizzazione in corso...');
  _fbDb.ref().update(updates, function(err){
    if(err) showToastGen('red', '❌ Errore: ' + err.message);
    else showToastGen('green', '✅ ' + rows.length + ' articoli sincronizzati!');
  });
}

// ══ MODALITÀ CASSA ══════════════════════════════════════════════════
var _cassaModeActive = false;

function _cassaModeOpen(){
  _cassaModeActive = true;
  // Nascondi overlay login
  var ov = document.getElementById('auth-login-ov');
  if(ov) ov.style.display = 'none';
  // Nascondi header, bottom bar, tutte le tab
  document.getElementById('app-header').style.display = 'none';
  document.getElementById('tab-bottom').style.display = 'none';
  document.querySelectorAll('.tab-content').forEach(function(t){ t.classList.remove('active'); });
  // Crea/mostra overlay cassa-mode
  var cm = document.getElementById('cassa-mode-ov');
  if(!cm){
    cm = document.createElement('div');
    cm.id = 'cassa-mode-ov';
    document.body.appendChild(cm);
  }
  cm.style.display = 'flex';
  // Carica database articoli se non ancora caricato (serve per sync prezzi al completamento)
  if(!rows.length && typeof loadMagazzinoFB === 'function'){
    _magExtLoaded = false;
    loadMagazzinoFB();
  }
  // Avvia auto-refresh ordini in cassa
  _cassaModeRender();
  _cassaModeStartRefresh();
}

function _cassaModeClose(){
  _cassaModeActive = false;
  _cassaModeStopRefresh();
  var cm = document.getElementById('cassa-mode-ov');
  if(cm) cm.style.display = 'none';
  // Ripristina header e bottom bar
  document.getElementById('app-header').style.display = '';
  document.getElementById('tab-bottom').style.display = '';
  // Torna alla schermata login
  _authShowLogin();
}

// Auto-refresh cassa (polling localStorage ogni 3s)
var _cassaRefreshInt = null;
var _cassaLastJson = '';

function _cassaModeStartRefresh(){
  _cassaLastJson = JSON.stringify(ordini);
  _cassaRefreshInt = setInterval(function(){
    var fresh = lsGet(ORDK, []);
    var freshJson = JSON.stringify(fresh);
    if(freshJson !== _cassaLastJson){
      _cassaLastJson = freshJson;
      ordini = fresh;
      _cassaModeRender();
    }
  }, 3000);
}

function _cassaModeStopRefresh(){
  if(_cassaRefreshInt){ clearInterval(_cassaRefreshInt); _cassaRefreshInt = null; }
}

// Render lista ordini per la cassa
function _cassaModeRender(){
  var cm = document.getElementById('cassa-mode-ov');
  if(!cm) return;
  // Filtra ordini da mostrare: nuovo + lavorazione + pronto (non completati, non bozze)
  var lista = ordini.filter(function(o){
    return o.stato === 'nuovo' || o.stato === 'lavorazione' || o.stato === 'pronto';
  });
  lista.sort(function(a,b){ return (b.createdAt||'').localeCompare(a.createdAt||''); });

  var h = '';
  // Header cassa
  h += '<div class="cassa-mode-header">';
  h += '<div style="display:flex;align-items:center;gap:12px;">';
  h += '<span style="font-size:28px;">💰</span>';
  h += '<div><div style="font-size:20px;font-weight:900;color:#68d391;">CASSA</div>';
  h += '<div style="font-size:11px;color:#555;">' + lista.length + ' ordin' + (lista.length===1?'e':'i') + '</div></div>';
  h += '</div>';
  h += '<button onclick="_cassaModeClose()" style="padding:10px 16px;border-radius:10px;border:1px solid #333;background:#1a1a1a;color:#888;font-size:13px;font-weight:700;cursor:pointer;">🔓 Esci</button>';
  h += '</div>';

  // Lista ordini
  h += '<div class="cassa-mode-list">';
  if(!lista.length){
    h += '<div style="text-align:center;padding:60px 20px;color:#555;">';
    h += '<div style="font-size:48px;margin-bottom:12px;">✅</div>';
    h += '<div style="font-size:16px;font-weight:700;">Nessun ordine da fare</div>';
    h += '<div style="font-size:12px;margin-top:6px;color:#444;">Gli ordini completati non appaiono qui</div>';
    h += '</div>';
  }
  lista.forEach(function(ord){
    var gi = ordini.indexOf(ord);
    var nArt = (ord.items||[]).length;
    var tot = 0;
    (ord.items||[]).forEach(function(it){ tot += parsePriceIT(it.prezzoUnit) * parseFloat(it.qty||0); });
    var SC_C = {nuovo:'#f5c400', lavorazione:'#3182ce', pronto:'#dd6b20'};
    var SL_C = {nuovo:'NUOVO', lavorazione:'IN CORSO', pronto:'PRONTO'};
    var sc = (ord.promozione && ord.stato==='nuovo') ? '#805ad5' : (SC_C[ord.stato]||'#555');
    var sl = (ord.promozione && ord.stato==='nuovo') ? '📡 DA BOZZA' : (SL_C[ord.stato]||'');

    h += '<div class="cassa-mode-card" onclick="_cassaModeApri('+gi+')" style="border-left:5px solid '+sc+';">';
    h += '<div style="display:flex;justify-content:space-between;align-items:center;">';
    h += '<div>';
    h += '<div style="font-size:17px;font-weight:900;color:var(--text);">'+esc(ord.nomeCliente||'—')+'</div>';
    h += '<div style="font-size:11px;color:#666;margin-top:2px;">' + sl;
    if(ord.numero) h += ' #'+ord.numero;
    h += ' · '+nArt+' art. · '+esc(ord.data||'')+' '+esc(ord.ora||'')+'</div>';
    h += '</div>';
    h += '<div style="text-align:right;">';
    h += '<div style="font-size:22px;font-weight:900;color:var(--accent);">€ '+tot.toFixed(2)+'</div>';
    h += '</div>';
    h += '</div>';
    h += '</div>';
  });
  h += '</div>';

  cm.innerHTML = h;
}

// Apri dettaglio ordine nella cassa
function _cassaModeApri(gi){
  var ord = ordini[gi];
  if(!ord) return;
  var cm = document.getElementById('cassa-mode-ov');
  if(!cm) return;

  var nArt = (ord.items||[]).length;
  var tot = 0;
  (ord.items||[]).forEach(function(it){ tot += parsePriceIT(it.prezzoUnit) * parseFloat(it.qty||0); });

  var h = '';
  // Header con tasto indietro
  h += '<div class="cassa-mode-header">';
  h += '<div style="display:flex;align-items:center;gap:12px;">';
  h += '<button onclick="_cassaModeRender()" style="background:none;border:none;color:var(--accent);font-size:24px;cursor:pointer;padding:4px 8px;">←</button>';
  h += '<div>';
  h += '<div style="font-size:18px;font-weight:900;color:var(--text);">'+esc(ord.nomeCliente||'—')+'</div>';
  h += '<div style="font-size:11px;color:#666;">';
  if(ord.numero) h += 'Ordine #'+ord.numero+' · ';
  h += esc(ord.data||'')+' '+esc(ord.ora||'')+' · '+nArt+' articol'+(nArt===1?'o':'i');
  h += '</div></div></div>';
  h += '<button onclick="_cassaModeClose()" style="padding:8px 12px;border-radius:10px;border:1px solid #333;background:#1a1a1a;color:#888;font-size:12px;cursor:pointer;">🔓 Esci</button>';
  h += '</div>';

  // Lista articoli
  h += '<div class="cassa-mode-list">';
  (ord.items||[]).forEach(function(it, i){
    var pu = parsePriceIT(it.prezzoUnit);
    var q = parseFloat(it.qty||0);
    var sub = (pu*q).toFixed(2);
    h += '<div class="cassa-mode-item">';
    h += '<div style="flex:1;min-width:0;">';
    h += '<div style="font-size:15px;font-weight:700;color:var(--text);">'+esc(it.desc||'—')+'</div>';
    h += '<div style="font-size:11px;color:#666;margin-top:2px;">';
    h += q + ' ' + esc(it.unit||'pz') + ' × €' + pu.toFixed(2);
    if(it.codM) h += ' · <span style="color:var(--accent);">'+esc(it.codM)+'</span>';
    if(it.codF) h += ' <span style="color:#888;">'+esc(it.codF)+'</span>';
    h += ' <span class="ord-item-del" onclick="event.stopPropagation();_cassaModeDelItem(this,'+gi+','+i+')" title="Rimuovi">×</span>';
    h += '</div>';
    if(it.nota) h += '<div style="font-size:10px;color:#f6ad55;margin-top:2px;">📝 '+esc(it.nota)+'</div>';
    if(it.scampolo) h += '<div style="font-size:10px;color:var(--accent);font-weight:700;">✂ SCAMPOLO</div>';
    if(it.fineRotolo) h += '<div style="font-size:10px;color:#f6ad55;font-weight:700;">🔄 FINE ROTOLO</div>';
    h += '</div>';
    h += '<div style="text-align:right;flex-shrink:0;">';
    h += '<div style="font-size:18px;font-weight:900;color:var(--accent);">€ '+sub+'</div>';
    h += '</div></div>';
  });
  // Nota ordine
  if(ord.nota){
    h += '<div style="padding:12px 0;font-size:13px;color:#f6ad55;border-top:1px solid #222;margin-top:8px;">📋 '+esc(ord.nota)+'</div>';
  }
  h += '</div>';

  // Footer: totale + tasto FATTO
  h += '<div class="cassa-mode-footer">';
  h += '<div>';
  h += '<div style="font-size:32px;font-weight:900;color:var(--accent);">€ '+tot.toFixed(2)+'</div>';
  h += '<div style="font-size:12px;color:#666;">'+nArt+' articol'+(nArt===1?'o':'i');
  if(ord.scontoGlobale) h += ' · sconto -'+ord.scontoGlobale+'%';
  h += '</div></div>';
  h += '<button class="cassa-mode-fatto-btn" onclick="_cassaModeFatto(this,'+gi+')" data-taps="0">✅ FATTO</button>';
  h += '</div>';

  cm.innerHTML = h;
}

// Doppio tap per completare
function _cassaModeFatto(btn, gi){
  var taps = parseInt(btn.getAttribute('data-taps')||'0') + 1;
  btn.setAttribute('data-taps', taps);
  if(taps === 1){
    btn.textContent = '⚠️ TAP ANCORA';
    btn.style.background = '#dd6b20';
    setTimeout(function(){
      if(btn.getAttribute('data-taps') === '1'){
        btn.setAttribute('data-taps', '0');
        btn.textContent = '✅ FATTO';
        btn.style.background = '#38a169';
      }
    }, 2000);
    return;
  }
  // Secondo tap — completa
  var ord = ordini[gi];
  if(ord){
    if(ord.id && typeof ordUnlock === 'function') ordUnlock(ord.id);
    ord.stato = 'completato';
    if(!ord.statiLog) ord.statiLog = {};
    ord.statiLog.completato = {
      ora: new Date().toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'}),
      data: new Date().toLocaleDateString('it-IT')
    };
    ord.completatoAtISO = new Date().toISOString();
    // Sync prezzi al database
    if(typeof _syncPrezziOrdineAlDB === 'function') _syncPrezziOrdineAlDB(ord);
    saveOrdini();
  }
  _cassaLastJson = JSON.stringify(ordini);
  _cassaModeRender();
  showToastGen('green', '✅ Ordine completato!');
}

// Elimina articolo dalla cassa — doppio tap
function _cassaModeDelItem(el, gi, ii){
  if(el._confirm){
    // Secondo tap — elimina
    var ord = ordini[gi];
    if(!ord || !ord.items[ii]) return;
    ord.items.splice(ii, 1);
    var tot = ord.items.reduce(function(s,x){ return s + parsePriceIT(x.prezzoUnit)*parseFloat(x.qty||0); }, 0);
    ord.totale = tot.toFixed(2);
    ord.modificato = true;
    ord.modificatoAt = new Date().toLocaleString('it-IT');
    saveOrdini();
    _cassaLastJson = JSON.stringify(ordini);
    // Se non ci sono più articoli, torna alla lista
    if(!ord.items.length){
      _cassaModeRender();
    } else {
      _cassaModeApri(gi);
    }
    showToastGen('red', 'Articolo rimosso');
    return;
  }
  // Primo tap — conferma
  el._confirm = true;
  el.textContent = '?';
  el.classList.add('ord-item-del--confirm');
  setTimeout(function(){
    el._confirm = false;
    el.textContent = '×';
    el.classList.remove('ord-item-del--confirm');
  }, 2500);
}
