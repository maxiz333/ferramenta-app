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
}

function ordUnlock(ordId){
  var key = _lockKey(ordId);
  delete _ordLocks[key];
  if(_fbReady && _fbDb) try{ _fbDb.ref('locks/' + key).remove(); }catch(e){}
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


// ══ ACCOUNT / RUOLI CON PIN ═════════════════════════════════════
var AUTH_K = 'cp4_auth';
var _currentUser = null;

// Ruoli e permessi
var _roles = {
  prop1: { nome:'Proprietario 1', ruolo:'proprietario', pin:'', tabs:'*' },
  prop2: { nome:'Proprietario 2', ruolo:'proprietario', pin:'', tabs:'*' },
  comm1: { nome:'Commesso 1', ruolo:'commesso', pin:'',
    tabs:['tc','to','t0','t11','t10','t1','t7','t9','t-ordfor'],
    altro:['atb-t11','atb-t10','atb-t12'],
    bottom:['tbb-tc','tbb-to','tbb-t0','tbb-t1','tbb-taltro']
  },
  comm2: { nome:'Commesso 2', ruolo:'commesso', pin:'',
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
          }
        });
        _authSaveLocal();
        // Aggiorna nomi sulla schermata login se visibile
        _authRenderLogin();
      }
    });
  }
}

function _authSaveLocal(){
  var data = {};
  Object.keys(_roles).forEach(function(k){
    data[k] = { pin: _roles[k].pin, nome: _roles[k].nome };
  });
  lsSet(AUTH_K, data);
}

function _authSaveFirebase(){
  _authSaveLocal();
  if(_fbReady && _fbDb){
    var data = {};
    Object.keys(_roles).forEach(function(k){
      data[k] = { pin: _roles[k].pin, nome: _roles[k].nome };
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
    var color = r.ruolo === 'proprietario' ? 'var(--accent)' : '#888';
    h += '<button onclick="_authSelectUser(\''+k+'\')" style="display:flex;align-items:center;gap:12px;width:100%;padding:14px 18px;margin-bottom:8px;border-radius:12px;border:1px solid #2a2a2a;background:#1a1a1a;cursor:pointer;touch-action:manipulation;text-align:left;">';
    h += '<span style="font-size:24px;">'+icon+'</span>';
    h += '<div style="flex:1"><div style="font-size:14px;font-weight:800;color:'+color+';">'+esc(r.nome)+'</div>';
    h += '<div style="font-size:10px;color:#555;text-transform:uppercase;">'+r.ruolo+'</div></div>';
    h += '</button>';
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
      // Login OK
      _currentUser = { key:key, nome:r.nome, ruolo:r.ruolo };
      _deviceName = r.nome;
      localStorage.setItem('cp4_deviceName', r.nome);
      localStorage.setItem('cp4_lastUser', key);
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

// Applica visibilità tab in base al ruolo
function _authUpdateHeader(){
  var el = document.getElementById('app-header-subtitle');
  if(!el) return;
  if(_currentUser){
    el.textContent = _currentUser.nome;
    el.style.color = (_currentUser.ruolo === 'proprietario') ? 'var(--accent)' : '#aaa';
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

// Auto-login se ultimo utente salvato
function _authInit(){
  _authLoad();
  var last = localStorage.getItem('cp4_lastUser');
  if(last && _roles[last] && _roles[last].pin){
    // Mostra login con ultimo utente pre-selezionato
    _authShowLogin();
  } else {
    _authShowLogin();
  }
}
