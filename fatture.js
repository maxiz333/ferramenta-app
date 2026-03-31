// ══ FATTURE ══════════════════════════════════════════════════════
// [SECTION: FORNITORI] -----------------------------------------------------
//  Fatture (emesse/ricevute) e Ordini a Fornitori
var ORFK = 'cp4_ordfornitori';
var ordFornitori = [];
var ordForFiltro = 'tutti';
var _ofRighe = [];

function loadOrdFor(){ ordFornitori = lsGet(ORFK,[]); }
function saveOrdFor(){ lsSet(ORFK, ordFornitori); }

function filterOrdFor(f){
  ordForFiltro = f;
  ['tutti','atteso','ricevuto','annullato'].forEach(x=>{
    var b = document.getElementById('for-f-'+x);
    if(!b) return;
    var on = x===f;
    b.style.background = on ? 'var(--accent)' : 'transparent';
    b.style.color = on ? '#111' : 'var(--muted)';
    b.style.borderColor = on ? 'var(--accent)' : 'var(--border)';
  });
  renderFornitori();
}

function renderFornitori(){
  var list = document.getElementById('ordfor-list');
  if(!list) return;
  loadOrdFor();
  var oggi = new Date().toISOString().slice(0,10);
  var filtered = ordFornitori.slice();
  if(ordForFiltro!=='tutti') filtered = filtered.filter(function(o){return o.stato===ordForFiltro;});
  filtered.sort((a,b)=>(b.dataOrdine||'').localeCompare(a.dataOrdine||''));
  if(!filtered.length){
    list.innerHTML = '<div style="text-align:center;padding:40px;color:#3a3a3a;"><div style="font-size:32px;margin-bottom:8px;">-</div><div>Nessun ordine fornitore</div></div>';
    return;
  }
  var SC = {atteso:'#f5c400', ricevuto:'#38a169', annullato:'#e53e3e'};
  var SL = {atteso:'In attesa', ricevuto:'Ricevuto', annullato:'Annullato'};
  var h = '';
  filtered.forEach(ord=>{
    var sc = SC[ord.stato]||'#888';
    var inRitardo = ord.stato==='atteso' && ord.consegna && ord.consegna < oggi;
    h += '<div style="background:#1a1a1a;border:1px solid #262626;border-left:3px solid '+sc+';border-radius:12px;padding:12px 14px;margin-bottom:8px;">';
    h += '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px;">';
    h += '<div style="flex:1;min-width:0;">';
    h += '<div style="font-size:14px;font-weight:800;color:var(--text);">- '+esc(ord.fornitore||'-')+'</div>';
    h += '<div style="font-size:10px;color:#555;margin-top:1px;">Ordinato: '+esc(ord.dataOrdine||'')+(ord.consegna?' - Consegna: '+ord.consegna:'')+'</div>';
    if(inRitardo) h += '<div style="font-size:10px;color:#e53e3e;margin-top:1px;">-- In ritardo</div>';
    if(ord.note) h += '<div style="font-size:10px;color:#555;font-style:italic;margin-top:1px;">'+esc(ord.note)+'</div>';
    h += '</div>';
    h += '<div style="text-align:right;flex-shrink:0;">';
    h += '<div style="font-size:12px;font-weight:800;color:'+sc+';">'+SL[ord.stato]+'</div>';
    h += '<div style="font-size:10px;color:#555;">'+((ord.righe||[]).length)+' art.</div>';
    h += '</div></div>';
    // Articoli
    if(ord.righe && ord.righe.length){
      h += '<div style="background:#111;border-radius:8px;padding:6px 10px;margin-bottom:8px;">';
      ord.righe.forEach(function(r){
        h += '<div style="display:flex;justify-content:space-between;font-size:11px;padding:3px 0;border-bottom:1px solid #1a1a1a;">';
        h += '<span style="color:#bbb;flex:1;">'+esc(r.desc||'')+'</span>';
        h += '<span style="color:#63b3ed;flex-shrink:0;">'+esc(r.qty||'')+''+esc(r.unit||'pz')+'</span>';
        if(r.prezzoUnit) h += '<span style="color:var(--accent);font-weight:700;flex-shrink:0;margin-left:8px;">-'+esc(r.prezzoUnit)+'</span>';
        h += '</div>';
      });
      h += '</div>';
    }
    h += '<div style="display:flex;gap:5px;flex-wrap:wrap;">';
    if(ord.stato==='atteso'){
      h += '<button class="ord-act-btn" onclick="setStatoOrdFor(\''+ord.id+'\',\'ricevuto\')" style="color:#38a169;border-color:rgba(56,161,105,.3);">- Ricevuto</button>';
      h += '<button class="ord-act-btn" onclick="setStatoOrdFor(\''+ord.id+'\',\'annullato\')" style="color:#e53e3e;border-color:rgba(229,62,62,.2);">Annulla</button>';
    }
    if(ord.stato==='ricevuto'){
      h += '<button class="ord-act-btn" onclick="caricaArticoliDaOrdFor(\''+ord.id+'\')" style="color:var(--accent);border-color:rgba(245,196,0,.3);">- Carica in magazzino</button>';
    }
    h += '<button class="ord-act-btn" onclick="deleteOrdFor_(\''+ord.id+'\')" style="color:#555;border-color:#222;margin-left:auto;">-</button>';
    h += '</div></div>';
  });
  list.innerHTML = h;
}

function openNuovoOrdFor(){
  _ofRighe = [{desc:'',qty:1,unit:'pz',prezzoUnit:''}];
  var oggi = new Date().toISOString().slice(0,10);
  document.getElementById('of-fornitore').value = '';
  document.getElementById('of-data').value = oggi;
  document.getElementById('of-consegna').value = '';
  document.getElementById('of-note').value = '';
  renderOfRighe();
  var ov = document.getElementById('ordfor-overlay');
  if(ov) ov.style.display='flex';
}
function closeOrdForOverlay(){
  var ov = document.getElementById('ordfor-overlay');
  if(ov) ov.style.display='none';
}
function ofAddRiga(){
  _ofRighe.push({desc:'',qty:1,unit:'pz',prezzoUnit:''});
  renderOfRighe();
}
function renderOfRighe(){
  var el = document.getElementById('of-righe');
  if(!el) return;
  var h = '';
  _ofRighe.forEach(function(r,i){
    h += '<div style="display:flex;gap:6px;align-items:center;margin-bottom:6px;">';
    h += '<input value="'+esc(r.desc)+'" placeholder="Articolo..." onchange="_ofRighe['+i+'].desc=this.value" style="flex:1;padding:7px;border-radius:7px;border:1px solid #2a2a2a;background:#111;color:var(--text);font-size:12px;font-family:inherit;">';
    h += '<input type="number" value="'+esc(r.qty)+'" min="1" onchange="_ofRighe['+i+'].qty=this.value" style="width:48px;padding:7px;border-radius:7px;border:1px solid #2a2a2a;background:#111;color:var(--accent);font-size:12px;font-weight:700;text-align:center;font-family:inherit;">';
    h += '<select onchange="_ofRighe['+i+'].unit=this.value" style="padding:7px 4px;border-radius:7px;border:1px solid #2a2a2a;background:#111;color:var(--text);font-size:11px;font-family:inherit;">';
    ['pz','mt','kg','lt','conf'].forEach(function(u){ h += '<option'+(r.unit===u?' selected':'')+'>'+u+'</option>'; });
    h += '</select>';
    h += '<input value="'+esc(r.prezzoUnit)+'" placeholder="-" onchange="_ofRighe['+i+'].prezzoUnit=this.value" style="width:54px;padding:7px;border-radius:7px;border:1px solid #2a2a2a;background:#111;color:var(--accent);font-size:12px;font-weight:700;text-align:right;font-family:inherit;">';
    if(_ofRighe.length>1) h += '<button onclick="_ofRighe.splice('+i+',1);renderOfRighe()" style="background:transparent;border:none;color:#555;font-size:16px;cursor:pointer;padding:0 4px;">-</button>';
    h += '</div>';
  });
  el.innerHTML = h;
}
function salvaOrdFor(){
  var fornitore = document.getElementById('of-fornitore').value.trim();
  if(!fornitore){ showToastGen('red','Inserisci il fornitore'); return; }
  var righe = _ofRighe.filter(function(r){return r.desc.trim();});
  if(!righe.length){ showToastGen('red','Aggiungi almeno un articolo'); return; }
  loadOrdFor();
  ordFornitori.unshift({
    id:'ordfor_'+Date.now(),
    fornitore: fornitore,
    dataOrdine: document.getElementById('of-data').value,
    consegna: document.getElementById('of-consegna').value,
    note: document.getElementById('of-note').value.trim(),
    righe: righe,
    stato: 'atteso'
  });
  saveOrdFor(); closeOrdForOverlay(); renderFornitori();
  showToastGen('green', 'Ordine inviato a '+fornitore);
}
function setStatoOrdFor(id, stato){
  loadOrdFor();
  var ord = ordFornitori.find(function(o){return o.id===id;});
  if(ord){ ord.stato=stato; saveOrdFor(); renderFornitori(); }
}
function deleteOrdFor_(id){
  showConfirm('Eliminare questo ordine fornitore?', function(){

  loadOrdFor();
  ordFornitori = ordFornitori.filter(function(o){return o.id!==id;});
  saveOrdFor(); renderFornitori();

  });
}
function caricaArticoliDaOrdFor(id){
  loadOrdFor();
  var ord = ordFornitori.find(function(o){return o.id===id;});
  if(!ord) return;
  // Tenta di aggiornare la quantit- degli articoli corrispondenti in magazzino
  var aggiornati = 0;
  ord.righe.forEach(function(riga){
    if(!riga.desc) return;
    // Cerca in rows per descrizione (fuzzy match semplice)
    var idx = rows.findIndex(function(r,i){
      return !removed.has(String(i)) && r.desc && r.desc.toLowerCase().includes(riga.desc.toLowerCase().substring(0,10));
    });
    if(idx>=0 && riga.qty){
      if(!magazzino[idx]) magazzino[idx]={};
      var prev = magazzino[idx].qty!==undefined ? Number(magazzino[idx].qty) : 0;
      var nv = prev + parseFloat(riga.qty||0);
      magazzino[idx].qty = nv;
      registraMovimento(idx,'carico',parseFloat(riga.qty||0),prev,nv,'Ordine fornitore: '+esc(ord.fornitore));
      aggiornati++;
    }
  });
  lsSet(MAGK, magazzino);
  updateStockBadge();
  if(aggiornati) showToastGen('green', aggiornati+' articoli caricati in magazzino');
  else showToastGen('yellow','Nessun articolo trovato automaticamente - verifica manualmente');
}

// alias per compatibilit-
function showToastOk(msg){ showToastGen('green', msg); }

init();
loadGiornaliniNomi();
startAutoRefresh();
updateOrdCounter();
// Chiedi permesso notifiche su tutti i dispositivi (non solo PC)
setTimeout(richediNotifPermesso, 1500);
try{ loadEditorSettings(); }catch(e){}
try{ applyEditorCSS(); }catch(e){}

