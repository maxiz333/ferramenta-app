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
// [SECTION: CARRELLO] ------------------------------------------------------
//  Carrelli clienti, ricerca articoli, numpad, sconto, scaglioni, DDT
var CARTK='cp4_carrelli', ORDK='cp4_ordini', CART_CK='cp4_carrelli_cestino';
var carrelli=lsGet(CARTK)||[], ordini=lsGet(ORDK)||[];
var carrelliCestino=lsGet(CART_CK)||[];
var activeCartId=carrelli.length?carrelli[carrelli.length-1].id:null;
var ordFiltro='nuovo';

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

// --- SCONTO GLOBALE -------------------------------------------
function openScontoOverlay(){
  if(!activeCartId)return;
  var cart=carrelli.find(function(c){return c.id===activeCartId;});
  if(!cart)return;
  document.getElementById('sconto-cliente').textContent='Cliente: '+(cart.nome||'-');
  document.getElementById('sconto-custom').value='';
  document.getElementById('sconto-overlay').classList.add('open');
}
function closeScontoOverlay(){document.getElementById('sconto-overlay').classList.remove('open');}

function applicaScontoRapido(perc){
  _applicaSconto(perc);
  closeScontoOverlay();
}
function applicaScontoCustom(){
  var v=parseFloat(document.getElementById('sconto-custom').value);
  if(!v||v<=0||v>=100){showToastGen('red','Inserisci una percentuale valida');return;}
  _applicaSconto(v);
  closeScontoOverlay();
}
function _applicaSconto(perc){
  if(!activeCartId)return;
  var cart=carrelli.find(function(c){return c.id===activeCartId;});
  if(!cart||!(cart.items||[]).length)return;
  cart.scontoGlobale=perc;
  (cart.items||[]).forEach(function(it){
    if(!it._prezzoOriginale)it._prezzoOriginale=it.prezzoUnit;
    var base= parsePriceIT(it._prezzoOriginale||it.prezzoUnit);
    var scontato=(base*(1-perc/100)).toFixed(2);
    it.prezzoUnit=scontato;
    it._scontoApplicato=perc;
  });
  saveCarrelli();
  renderCartTabs();
  showToastGen('green','- Sconto '+perc+'% applicato!');
}
function rimuoviScontoGlobale(){
  if(!activeCartId)return;
  var cart=carrelli.find(function(c){return c.id===activeCartId;});
  if(!cart)return;
  delete cart.scontoGlobale;
  (cart.items||[]).forEach(function(it){
    if(it._prezzoOriginale){it.prezzoUnit=it._prezzoOriginale;delete it._prezzoOriginale;delete it._scontoApplicato;}
  });
  saveCarrelli();
  renderCartTabs();
  closeScontoOverlay();
  showToastGen('green','- Sconti rimossi');
}

// --- WHATSAPP SHARE -------------------------------------------
function condividiWhatsApp(items,nomeCliente,totale,nota){
  var msg='- *Ordine - '+esc(nomeCliente||'Cliente')+'*\n';
  msg+='- '+new Date().toLocaleDateString('it-IT')+'\n\n';
  items.forEach(function(it){
    var sub=(parsePriceIT(it.prezzoUnit)*parseFloat(it.qty||0)).toFixed(2);
    msg+=it.qty+' '+( it.unit||'pz')+' - '+(it.desc||'');
    if(it.codF)msg+=' ['+it.codF+']';
    msg+=' - -'+sub+'\n';
  });
  msg+='\n*TOTALE: - '+totale+'*';
  if(nota)msg+='\n\n- '+nota;
  msg+='\n\n_Ferramenta Rattazzi_';
  var url='https://wa.me/?text='+encodeURIComponent(msg);
  window.open(url,'_blank');
}

// --- STAMPA SCONTRINO ---------------------------------------
function stampaRicevuta(items,nomeCliente,totale,nota){
  var h='';
  h+='<div style="font-size:16px;font-weight:900;text-align:center;margin-bottom:4px;">FERRAMENTA RATTAZZI</div>';
  h+='<div style="font-size:10px;text-align:center;color:#666;margin-bottom:8px;">'+new Date().toLocaleString('it-IT')+'</div>';
  if(nomeCliente)h+='<div style="font-size:13px;font-weight:700;text-align:center;margin-bottom:8px;">Cliente: '+esc(nomeCliente)+'</div>';
  h+='<div style="border-top:1px dashed #555;margin:6px 0;"></div>';
  items.forEach(function(it){
    var pu=parsePriceIT(it.prezzoUnit);
    var q=parseFloat(it.qty||0);
    var sub=(pu*q).toFixed(2);
    h+='<div style="padding:4px 0;border-bottom:1px solid #2a2a2a;">';
    h+='<div style="font-size:13px;font-weight:700;color:var(--text);">'+esc(it.desc||'')+'</div>';
    if(it.scampolo&&it._scontoApplicato)h+='<div style="font-size:10px;color:var(--accent);">-- Scampolo -'+it._scontoApplicato+'%'+(it._prezzoOriginale?' (era -'+esc(it._prezzoOriginale)+')':'')+'</div>';
    if(it.fineRotolo&&it._scontoApplicato)h+='<div style="font-size:10px;color:#f6ad55;">- Rotolo -'+it._scontoApplicato+'%'+(it._prezzoOriginale?' (era -'+esc(it._prezzoOriginale)+')':'')+'</div>';
    if(it._scaglioneAttivo){
      var rispSc=it._prezzoBase?((parsePriceIT(it._prezzoBase)-pu)*q).toFixed(2):'';
      h+='<div style="font-size:10px;color:#63b3ed;">- -'+(it._scaglioneAttivo.sconto||0)+'% da '+it._scaglioneAttivo.qtaMin+'pz'+(it._prezzoBase?' (era -'+esc(it._prezzoBase)+')':'')+(rispSc&&parseFloat(rispSc)>0?' risparmi -'+rispSc:'')+'</div>';
    }
    h+='<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--muted);">';
    h+='<span>'+q+' '+(it.unit||'pz')+' - -'+(it.prezzoUnit||'0')+'</span>';
    h+='<span style="font-weight:900;color:var(--accent);">-'+sub+'</span>';
    h+='</div>';
    if(it.codF)h+='<div style="font-size:10px;color:#fc8181;">'+esc(it.codF)+'</div>';
    h+='</div>';
  });
  h+='<div style="border-top:1px dashed #555;margin:6px 0;"></div>';
  h+='<div style="display:flex;justify-content:space-between;font-size:18px;font-weight:900;color:var(--accent);padding:4px 0;">';
  h+='<span>TOTALE</span><span>- '+totale+'</span></div>';
  if(nota)h+='<div style="border-top:1px dashed #555;margin:6px 0;"></div><div style="font-size:11px;color:#666;font-style:italic;">'+esc(nota)+'</div>';
  // Mostra in overlay
  var ov=document.getElementById('ricevuta-overlay');
  document.getElementById('ricevuta-body').innerHTML=h;
  ov.classList.add('open');
}
function closeRicevuta(){document.getElementById('ricevuta-overlay').classList.remove('open');}
function printRicevutaContent(){
  var content=document.getElementById('ricevuta-body').innerHTML;
  var w=window.open('','_blank');
  if(!w){
    showToastGen('orange','Abilita i popup per stampare');
    return;
  }
  w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Ricevuta</title><style>*{margin:0;padding:0;box-sizing:border-box;}body{width:80mm;font-family:monospace;font-size:11px;padding:4mm;color:#000;}@media print{@page{size:80mm auto;margin:0;}}</style></head><body>'+content+'<script>setTimeout(function(){window.print();},400);<\/script></body></html>');
  w.document.close();
}

// --- CLIENTI - PREZZI PERSONALIZZATI ---------------------------
var clienti=lsGet('cp4_clienti',{});
function saveClienti(){lsSet('cp4_clienti',clienti);}

function getClienteSconto(nome){
  if(!nome)return 0;
  var key=nome.toLowerCase().trim();
  return clienti[key]&&clienti[key].sconto?clienti[key].sconto:0;
}
function setClienteSconto(nome,sconto){
  if(!nome)return;
  var key=nome.toLowerCase().trim();
  if(!clienti[key])clienti[key]={};
  clienti[key].sconto=parseFloat(sconto)||0;
  clienti[key].nome=nome;
  saveClienti();
}

// --- CARRELLO - NUOVO ---------------------------------------
function newCart(){
  var el=document.getElementById('nc-input');if(el)el.value='';
  var sc=document.getElementById('nc-sconto');if(sc)sc.value='';
  var ind=document.getElementById('nc-indirizzo');if(ind)ind.value='';
  var pv=document.getElementById('nc-piva');if(pv)pv.value='';
  document.getElementById('nc-overlay').classList.add('open');
  setTimeout(function(){if(el)el.focus();},100);
}
function confirmNewCart(){
  var el=document.getElementById('nc-input');
  var nome=el?el.value.trim():'';
  var scEl=document.getElementById('nc-sconto');
  var sconto=scEl?parseFloat(scEl.value)||0:0;
  document.getElementById('nc-overlay').classList.remove('open');
  var savedSconto=getClienteSconto(nome);
  if(!sconto&&savedSconto)sconto=savedSconto;
  if(nome&&sconto)setClienteSconto(nome,sconto);
  var id='cart_'+Date.now();
  carrelli.push({id:id,nome:nome||('Cliente '+(carrelli.length+1)),
    createdAt:new Date().toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'}),items:[],
    scontoGlobale:sconto||null});
  activeCartId=id;
  saveCarrelli();
  goTab('tc');
  if(sconto)showToastGen('green','-- Sconto cliente '+sconto+'% applicato');
  setTimeout(function(){ var s=document.getElementById('cart-search'); if(s)s.focus(); },200);
}
function ncAutoSconto(){
  var nome=(document.getElementById('nc-input')||{}).value||'';
  var sc=getClienteSconto(nome);
  var hint=document.getElementById('nc-sconto-hint');
  var inp=document.getElementById('nc-sconto');
  if(sc>0){
    if(inp&&!inp.value)inp.value=sc;
    if(hint)hint.textContent='(salvato: '+sc+'%)';
  } else {
    if(hint)hint.textContent='';
  }
}
function switchCart(idx){
  if(carrelli[idx])activeCartId=carrelli[idx].id;
  renderCartTabs();
}
function deleteCart(id){
  var cart=carrelli.find(function(c){return c.id===id;});
  if(!cart)return;
  cart.deletedAt=new Date().toLocaleString('it-IT');
  carrelliCestino.push(cart);lsSet(CART_CK,carrelliCestino);
  carrelli=carrelli.filter(function(c){return c.id!==id;});
  if(activeCartId===id)activeCartId=carrelli.length?carrelli[carrelli.length-1].id:null;
  saveCarrelli();renderCartTabs();
  showToastGen('green','-- Carrello eliminato');
}

// ── SVUOTA CARRELLO ──────────────────────────────────────────────────────────
// Rimuove tutti gli articoli dal carrello attivo dopo conferma utente.
// Usa showConfirm (funzione custom, non window.confirm bloccante su WebView).
function svuotaCarrello(cartId){
  var cart = carrelli.find(function(c){ return c.id === cartId; });
  if(!cart || !(cart.items||[]).length){ showToastGen('yellow','Carrello già vuoto'); return; }
  showConfirm('Svuotare il carrello "' + (cart.nome||'') + '"?\nTutti gli articoli saranno rimossi.', function(){
    _takeSnapshot(); // salva snapshot per undo
    cart.items = [];
    saveCarrelli();
    renderCartTabs();
    showToastGen('green','✅ Carrello svuotato');
  });
}
function rinominaCart(idx){
  var cart=carrelli[idx];if(!cart)return;
  activeCartId=cart.id;
  var nuovoNome=prompt('Rinomina cliente:',cart.nome);
  if(nuovoNome&&nuovoNome.trim()){
    cart.nome=nuovoNome.trim();
    saveCarrelli();renderCartTabs();
    showToastGen('green','-- Rinominato: '+cart.nome);
  }
}

// --- NUOVO ARTICOLO DA CARRELLO -------------------------------// --- RICERCA CODICE - NUMPAD GRANDE ---------------------------
var _codepadValue='';
var _codepadMode='codM'; // 'codM' = Mio Codice (default), 'codF' = Cod. Fornitore

function openCodeNumpad(){
  _codepadValue='';
  _codepadMode='codM';
  _codepadUpdateModeBtn();
  document.getElementById('codepad-display').textContent='_';
  document.getElementById('codepad-display').style.borderColor='var(--accent)';
  document.getElementById('codepad-display').style.color='var(--accent)';
  document.getElementById('codepad-match').innerHTML='<div style="color:#555;text-align:center;">Digita il Mio Codice...</div>';
  document.getElementById('code-numpad-overlay').style.display='flex';
}
function closeCodeNumpad(){
  document.getElementById('code-numpad-overlay').style.display='none';
  _codepadValue='';
}
function toggleCodepadMode(){
  _codepadMode=(_codepadMode==='codM')?'codF':'codM';
  _codepadUpdateModeBtn();
  _codepadValue='';
  _codepadUpdateDisplay();
  var label=_codepadMode==='codM'?'Digita il Mio Codice...':'Digita il Cod. Fornitore...';
  document.getElementById('codepad-match').innerHTML='<div style="color:#555;text-align:center;">'+label+'</div>';
}
function _codepadUpdateModeBtn(){
  var btn=document.getElementById('codepad-mode-btn');
  var disp=document.getElementById('codepad-display');
  if(_codepadMode==='codM'){
    btn.innerHTML='-- MIO CODICE';
    btn.style.borderColor='var(--accent)';
    btn.style.color='var(--accent)';
    btn.style.background='rgba(245,196,0,.12)';
    if(disp){disp.style.borderColor='var(--accent)';disp.style.color='var(--accent)';}
  } else {
    btn.innerHTML='- COD. FORNITORE';
    btn.style.borderColor='#fc8181';
    btn.style.color='#fc8181';
    btn.style.background='rgba(252,129,129,.12)';
    if(disp){disp.style.borderColor='#fc8181';disp.style.color='#fc8181';}
  }
}
function codepadPress(key){
  if(key==='C'){_codepadValue='';}
  else{_codepadValue+=key;}
  _codepadUpdateDisplay();
  _codepadLiveSearch();
}
function codepadBackspace(){
  _codepadValue=_codepadValue.slice(0,-1);
  _codepadUpdateDisplay();
  _codepadLiveSearch();
}
function _codepadUpdateDisplay(){
  var disp=document.getElementById('codepad-display');
  disp.textContent=_codepadValue||'_';
}
function _codepadLiveSearch(){
  var matchEl=document.getElementById('codepad-match');
  if(!_codepadValue||_codepadValue.length<2){
    var label=_codepadMode==='codM'?'Mio Codice':'Cod. Fornitore';
    matchEl.innerHTML='<div style="color:#555;text-align:center;">Digita almeno 2 caratteri ('+label+')...</div>';
    return;
  }
  // Database non ancora caricato
  if(!rows||!rows.length){
    matchEl.innerHTML='<div style="color:var(--accent);text-align:center;padding:8px;">⏳ Database in caricamento, attendi...</div>';
    return;
  }
  var code=_codepadValue.toLowerCase();
  var matches=[];
  for(var i=0;i<rows.length;i++){
    if(removed.has(String(i)))continue;
    var r=rows[i];
    if(!r)continue;
    var fieldVal=_codepadMode==='codM'?String(r.codM||'').toLowerCase():String(r.codF||'').toLowerCase();
    // Match esatto
    if(fieldVal===code){matches.unshift({r:r,i:i,exact:true});continue;}
    // Match parziale
    if(fieldVal.indexOf(code)>=0){matches.push({r:r,i:i,exact:false});}
  }
  if(!matches.length){
    matchEl.innerHTML='<div style="color:#e53e3e;text-align:center;padding:4px;">- Nessun codice trovato</div>';
    return;
  }
  var h='';
  matches.slice(0,4).forEach(function(m){
    var bgCol=m.exact?'rgba(56,161,105,0.15)':'#1a1a1a';
    var borderCol=m.exact?'#38a169':'#2a2a2a';
    h+='<div onclick="codepadAddItem('+m.i+')" style="background:'+bgCol+';border:1px solid '+borderCol+';border-radius:8px;padding:8px 10px;margin-bottom:4px;cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:8px;touch-action:manipulation;">';
    h+='<div style="flex:1;min-width:0;">';
    h+='<div style="font-size:12px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+esc(m.r.desc)+'</div>';
    h+='<div style="font-size:10px;margin-top:2px;">';
    if(m.r.codM)h+='<span style="color:var(--accent);font-weight:700;">-- '+esc(m.r.codM)+'</span> ';
    if(m.r.codF)h+='<span style="color:#fc8181;font-weight:600;">- '+esc(m.r.codF)+'</span>';
    h+='</div></div>';
    h+='<div style="font-size:15px;font-weight:900;color:var(--accent);flex-shrink:0;">- '+esc(m.r.prezzo)+'</div>';
    h+='</div>';
  });
  if(matches.length>4)h+='<div style="font-size:10px;color:#555;text-align:center;">...e altri '+(matches.length-4)+'</div>';
  matchEl.innerHTML=h;
}
function codepadSearch(){
  if(!_codepadValue)return;
  var code=_codepadValue.toLowerCase();
  var found=null,foundIdx=-1;
  // Match esatto
  for(var i=0;i<rows.length;i++){
    if(removed.has(String(i)))continue;
    var r=rows[i];
    var fieldVal=_codepadMode==='codM'?(r.codM||'').toLowerCase():(r.codF||'').toLowerCase();
    if(fieldVal===code){found=r;foundIdx=i;break;}
  }
  // Fallback parziale
  if(!found){
    for(var i=0;i<rows.length;i++){
      if(removed.has(String(i)))continue;
      var r=rows[i];
      var fieldVal=_codepadMode==='codM'?(r.codM||'').toLowerCase():(r.codF||'').toLowerCase();
      if(fieldVal.indexOf(code)>=0){found=r;foundIdx=i;break;}
    }
  }
  if(found){
    codepadAddItem(foundIdx);
  } else {
    showToastGen('red','- Codice non trovato: '+_codepadValue);
  }
}
function codepadAddItem(rowIdx){
  cartAddItem(rowIdx);
  var desc=rows[rowIdx]?rows[rowIdx].desc:'';
  showToastGen('green','- '+desc);
  _codepadValue='';
  _codepadUpdateDisplay();
  document.getElementById('codepad-match').innerHTML='<div style="color:#38a169;text-align:center;padding:4px;">- Aggiunto! Digita il prossimo codice...</div>';
}

// --- CARRELLO - OPERAZIONI ARTICOLI ---------------------------
function cartAddItem(rowIdx){
  if(!activeCartId)return;
  var cart=carrelli.find(function(c){return c.id===activeCartId;});if(!cart)return;
  var r=rows[rowIdx]||{};
  var m=magazzino[rowIdx]||{};
  var hasScag=!!(m.scaglioni&&m.scaglioni.length);
  var newItem={rowIdx:rowIdx,desc:r.desc||'',codF:r.codF||'',codM:r.codM||'',specs:m.specs||'',
    posizione:m.posizione||'',prezzoUnit:r.prezzo||'0',qty:1,unit:m.unit||'pz',
    scampolo:false,hasScaglioni:hasScag,scaglioni:hasScag?JSON.parse(JSON.stringify(m.scaglioni)):[],
    nota:'',_scaglioniAperti:false,daOrdinare:false};
  (cart.items=cart.items||[]).push(newItem);
  _lastAddedItem={rowIdx:rowIdx,item:JSON.parse(JSON.stringify(newItem))};
  saveCarrelli();
  feedbackAdd();
  // Avviso stock basso
  var stock=m.qty!==undefined&&m.qty!==''?Number(m.qty):-1;
  var soglia=m.soglia!==undefined&&m.soglia!==''?Number(m.soglia):1;
  if(stock>=0&&stock<=soglia){
    if(stock===0){
      showToastGen('red','-- ESAURITO - '+r.desc+' (stock: 0)');
    } else {
      showToastGen('orange','-- Stock basso - '+r.desc+' (rimaste: '+stock+' '+esc(m.unit||'pz')+')');
    }
  }
  var s=document.getElementById('cart-search');if(s)s.value='';
  var rs=document.getElementById('cart-search-results');if(rs)rs.innerHTML='';
  renderCartTabs();
  // Flash sull'ultimo articolo aggiunto
  setTimeout(function(){
    var items=document.querySelectorAll('.cart-item-row');
    var last=items[items.length-1];
    if(last){last.classList.add('cart-item-flash');last.scrollIntoView({behavior:'smooth',block:'nearest'});}
  },50);
}
function cartDelta(cartId,idx,delta){
  var cart=carrelli.find(function(c){return c.id===cartId;});
  if(!cart||!cart.items[idx])return;
  // Fix: incremento sempre intero (1, 2, 3...) — minimo assoluto 1
  var newQty = Math.round(parseFloat(cart.items[idx].qty)||0) + Math.round(delta);
  cart.items[idx].qty = Math.max(1, newQty);
  _cartApplicaScaglione(cart.items[idx]);
  saveCarrelli();renderCartTabs();
}
function cartSetQty(cartId,idx,val){
  var cart=carrelli.find(function(c){return c.id===cartId;});
  if(!cart||!cart.items[idx])return;
  // Fix: solo interi, minimo 1
  cart.items[idx].qty = Math.max(1, Math.round(parseFloat(val)||1));
  _cartApplicaScaglione(cart.items[idx]);
  saveCarrelli();renderCartTabs();
}
function cartSetPrezzo(cartId,idx,val){
  var cart=carrelli.find(function(c){return c.id===cartId;});
  if(!cart||!cart.items[idx])return;
  cart.items[idx].prezzoUnit=val;saveCarrelli();renderCartTabs();
}
function cartSetUnit(cartId,idx,val){
  var cart=carrelli.find(function(c){return c.id===cartId;});
  if(!cart||!cart.items[idx])return;
  cart.items[idx].unit=val;saveCarrelli();renderCartTabs();
}
function cartCycleScampolo(cartId,idx){
  var cart=carrelli.find(function(c){return c.id===cartId;});
  if(!cart||!cart.items[idx])return;
  var it=cart.items[idx];
  if(!it.scampolo&&!it.fineRotolo){
    // niente - scampolo
    if(!it._prezzoOriginale)it._prezzoOriginale=it.prezzoUnit;
    it.scampolo=true;it.fineRotolo=false;
    it._scontoTipo='scampolo';
    if(!it._scontoApplicato)it._scontoApplicato=30;
    _applicaScontoScampolo(it);
  } else if(it.scampolo){
    // scampolo - rotolo
    it.scampolo=false;it.fineRotolo=true;
    it._scontoTipo='rotolo';
    if(!it._scontoApplicato||it._scontoApplicato===30)it._scontoApplicato=50;
    _applicaScontoScampolo(it);
  } else {
    // rotolo - niente: ripristina prezzo
    it.scampolo=false;it.fineRotolo=false;
    if(it._prezzoOriginale){it.prezzoUnit=it._prezzoOriginale;delete it._prezzoOriginale;}
    delete it._scontoTipo;delete it._scontoApplicato;
  }
  saveCarrelli();renderCartTabs();
}
function cartSetScontoScampolo(cartId,idx,val){
  var cart=carrelli.find(function(c){return c.id===cartId;});
  if(!cart||!cart.items[idx])return;
  var it=cart.items[idx];
  it._scontoApplicato=parseFloat(val)||0;
  _applicaScontoScampolo(it);
  saveCarrelli();renderCartTabs();
}
function _applicaScontoScampolo(it){
  var sc=it._scontoApplicato||0;
  if(sc>0&&it._prezzoOriginale){
    var base=parsePriceIT(it._prezzoOriginale)||0;
    it.prezzoUnit=(base*(1-sc/100)).toFixed(2);
  }
}
function cartSetNota(cartId,idx,val){
  var cart=carrelli.find(function(c){return c.id===cartId;});
  if(!cart||!cart.items[idx])return;
  cart.items[idx].nota=val;saveCarrelli();
}
function cartToggleNotaInline(cartId,idx){
  var el=document.getElementById('cart-nota-'+idx);
  if(!el)return;
  var isVisible=el.style.display!=='none';
  el.style.display=isVisible?'none':'block';
  if(!isVisible){
    var inp=el.querySelector('input');
    if(inp){inp.focus();inp.select();}
  }
}
function cartHideNota(idx){
  // Piccolo ritardo per permettere all'oninput di salvare prima di nascondere
  setTimeout(function(){
    var el=document.getElementById('cart-nota-'+idx);
    if(el) el.style.display='none';
  },150);
}
function cartToggleDaOrdinare(cartId,idx){
  var cart=carrelli.find(function(c){return c.id===cartId;});
  if(!cart||!cart.items[idx])return;
  cart.items[idx].daOrdinare=!cart.items[idx].daOrdinare;
  saveCarrelli();renderCartTabs();
}function cartSetNotaOrdine(cartId,val){
  var cart=carrelli.find(function(c){return c.id===cartId;});
  if(cart){cart.nota=val;saveCarrelli();}
}
function cartRemoveItem(cartId,idx){
  var cart=carrelli.find(function(c){return c.id===cartId;});if(!cart)return;
  if(!(cart.items||[])[idx])return;
  _takeSnapshot();
  _fbSyncing=true; // blocca Firebase durante operazione
  var removed=(cart.items||[]).splice(idx,1)[0];
  lsSet(CARTK,carrelli);updateCartBadge();_fbPush('carrelli',carrelli);
  setTimeout(function(){_fbSyncing=false;},1000);
  renderCartTabs();
  // Undo toast
  var t=document.createElement('div');
  t.style.cssText='position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#222;border:1px solid #444;border-radius:10px;padding:10px 16px;display:flex;align-items:center;gap:12px;z-index:9000;box-shadow:0 4px 20px rgba(0,0,0,.5);';
  t.innerHTML='<span style="font-size:13px;color:#e0e0e0;">-- Rimosso</span>';
  var btn=document.createElement('button');
  btn.textContent='Annulla';
  btn.style.cssText='padding:4px 12px;border-radius:6px;border:1px solid var(--accent);background:transparent;color:var(--accent);font-size:12px;font-weight:700;cursor:pointer;';
  btn.onclick=function(){(cart.items||[]).splice(idx,0,removed);saveCarrelli();renderCartTabs();t.remove();};
  t.appendChild(btn);document.body.appendChild(t);
  setTimeout(function(){if(t.parentNode)t.remove();},5000);
}

function cartDuplicaItem(cartId,idx){
  var cart=carrelli.find(function(c){return c.id===cartId;});
  if(!cart||!cart.items[idx])return;
  var orig=cart.items[idx];
  var copy=JSON.parse(JSON.stringify(orig));
  copy.nota=copy.nota?(copy.nota+' (copia)'):'(copia)';
  copy.qty=1;
  copy._checked=false;
  copy._correlatiAperti=false;
  (cart.items||[]).splice(idx+1,0,copy);
  feedbackAdd();
  saveCarrelli();renderCartTabs();
  showToastGen('green','- Articolo duplicato - modifica la nota per distinguerlo');
}

// --- SPUNTE CARRELLO (verifica pezzi presi) -------------------
function cartToggleCheck(cartId,idx,checked){
  var cart=carrelli.find(function(c){return c.id===cartId;});
  if(!cart||!cart.items[idx])return;
  cart.items[idx]._checked=checked;
  // Aggiorna visuale senza re-render completo
  var row=document.getElementById('cart-row-'+idx);
  if(row){
    row.style.opacity=checked?'0.5':'1';
    row.style.background=checked?'rgba(56,161,105,.06)':'';
    var desc=row.querySelector('div[style*="font-weight:700"]');
    if(desc){
      desc.style.textDecoration=checked?'line-through':'none';
      desc.style.opacity=checked?'0.6':'1';
    }
  }
  saveCarrelli();
  // Aggiorna counter nello sticky (leggero, senza re-render)
  var checkedN=(cart.items||[]).filter(function(x){return x._checked;}).length;
  var allDone=checkedN===(cart.items||[]).length;
  // Re-render sticky solo se cambia lo stato "tutto spuntato"
  renderCartTabs();
}

// --- CORRELATI NEL CARRELLO -----------------------------------
function cartToggleCorrelati(cartId,idx){
  var cart=carrelli.find(function(c){return c.id===cartId;});
  if(!cart||!cart.items[idx])return;
  cart.items[idx]._correlatiAperti=!cart.items[idx]._correlatiAperti;
  saveCarrelli();renderCartTabs();
}

function _trovaCorrelati(rowIdx){
  var r=rows[rowIdx];if(!r)return[];
  var m=magazzino[rowIdx]||{};
  var results=[];
  var seen={};
  seen[rowIdx]=true;

  // 1. Correlati espliciti dal magazzino
  if(m.correlati&&m.correlati.length){
    m.correlati.forEach(function(ri){
      if(seen[ri]||!rows[ri]||removed.has(String(ri)))return;
      seen[ri]=true;
      results.push({i:ri,r:rows[ri],m:magazzino[ri]||{},reason:'correlato'});
    });
  }

  // 2. Stessa sottocategoria (es. tutte le viti M6, M8, M10...)
  if(m.subcat&&m.cat){
    rows.forEach(function(r2,i2){
      if(seen[i2]||removed.has(String(i2)))return;
      var m2=magazzino[i2]||{};
      if(m2.cat===m.cat&&m2.subcat===m.subcat){
        seen[i2]=true;
        results.push({i:i2,r:r2,m:m2,reason:m.subcat});
      }
    });
  }

  // 3. Stessa categoria (pi- ampio)
  if(m.cat&&results.length<8){
    rows.forEach(function(r2,i2){
      if(seen[i2]||removed.has(String(i2)))return;
      var m2=magazzino[i2]||{};
      if(m2.cat===m.cat){
        seen[i2]=true;
        results.push({i:i2,r:r2,m:m2,reason:'stessa cat.'});
      }
    });
  }

  // 4. Parole chiave in comune nella descrizione (es. "dado" - trova tutti i dadi)
  if(results.length<6){
    var words=(r.desc||'').toLowerCase().split(/\s+/).filter(function(w){return w.length>=4;}).slice(0,3);
    if(words.length){
      rows.forEach(function(r2,i2){
        if(seen[i2]||removed.has(String(i2))||results.length>=12)return;
        var d2=(r2&&r2.desc||'').toLowerCase();
        for(var wi=0;wi<words.length;wi++){
          if(d2.indexOf(words[wi])>=0){
            seen[i2]=true;
            results.push({i:i2,r:r2,m:magazzino[i2]||{},reason:'simile'});
            break;
          }
        }
      });
    }
  }

  return results;
}

// Numpad per quantit-
function openQtyNumpad(cartId,idx){
  var cart=carrelli.find(function(c){return c.id===cartId;});
  if(!cart||!cart.items[idx])return;
  var it=cart.items[idx];
  openNumpad(it.desc,it.qty,it.unit||'pz',function(val){
    it.qty=val;_cartApplicaScaglione(it);saveCarrelli();renderCartTabs();
  });
}

// --- SCAGLIONI CARRELLO ---------------------------------------
function _cartApplicaScaglione(it){
  if(!it.hasScaglioni||!it.scaglioni||!it.scaglioni.length){
    if(it._prezzoBase){it.prezzoUnit=it._prezzoBase;delete it._prezzoBase;delete it._scaglioneAttivo;}
    return;
  }
  var qty=parseFloat(it.qty)||1;
  if(!it._prezzoBase)it._prezzoBase=it.prezzoUnit;
  // Filtra solo scaglioni completi (con qtaMin > 0 e sconto > 0)
  var validi=it.scaglioni.filter(function(sg){
    return sg.qtaMin&&parseFloat(sg.qtaMin)>0&&sg.sconto&&parseFloat(sg.sconto)>0;
  });
  // Calcola prezzo per ogni scaglione valido
  var base=parsePriceIT(it._prezzoBase)||0;
  validi.forEach(function(sg){
    if(base>0)sg.prezzo=(base*(1-parseFloat(sg.sconto)/100)).toFixed(2);
  });
  var sorted=validi.sort(function(a,b){return(parseFloat(b.qtaMin)||0)-(parseFloat(a.qtaMin)||0);});
  for(var i=0;i<sorted.length;i++){
    var sg=sorted[i];
    if(qty>=parseFloat(sg.qtaMin)){
      it.prezzoUnit=String(sg.prezzo);
      it._scaglioneAttivo={qtaMin:sg.qtaMin,sconto:sg.sconto,prezzo:sg.prezzo};
      return;
    }
  }
  it.prezzoUnit=it._prezzoBase;
  delete it._scaglioneAttivo;
}

function cartToggleScaglioni(cartId,idx){
  var cart=carrelli.find(function(c){return c.id===cartId;});
  if(!cart||!cart.items[idx])return;
  var it=cart.items[idx];
  it._scaglioniAperti=!it._scaglioniAperti;
  if(!it.hasScaglioni)it.hasScaglioni=true;
  if(!it.scaglioni)it.scaglioni=[];
  // Se apro e non ci sono righe, aggiungi una riga vuota pronta
  if(it._scaglioniAperti&&it.scaglioni.length===0){
    it.scaglioni.push({qtaMin:'',sconto:'',prezzo:''});
  }
  saveCarrelli();renderCartTabs();
}

function cartUpdScag(cartId,itemIdx,sgIdx,field,val){
  var cart=carrelli.find(function(c){return c.id===cartId;});
  if(!cart||!cart.items[itemIdx])return;
  var it=cart.items[itemIdx];
  if(!it.scaglioni||!it.scaglioni[sgIdx])return;
  var sg=it.scaglioni[sgIdx];
  var base= parsePriceIT(it._prezzoBase||it.prezzoUnit);
  if(field==='qtaMin')sg.qtaMin=parseFloat(val)||0;
  else if(field==='sconto'){
    sg.sconto=parseFloat(val)||0;
  }
  // Calcola prezzo automaticamente dallo sconto
  if(base>0&&sg.sconto>0){
    sg.prezzo=(base*(1-sg.sconto/100)).toFixed(2);
  }
  _cartApplicaScaglione(it);
  saveCarrelli();renderCartTabs();
}

function cartAddScag(cartId,itemIdx){
  var cart=carrelli.find(function(c){return c.id===cartId;});
  if(!cart||!cart.items[itemIdx])return;
  if(!cart.items[itemIdx].scaglioni)cart.items[itemIdx].scaglioni=[];
  cart.items[itemIdx].scaglioni.push({qtaMin:'',sconto:'',prezzo:''});
  saveCarrelli();renderCartTabs();
}

function cartRmvScag(cartId,itemIdx,sgIdx){
  var cart=carrelli.find(function(c){return c.id===cartId;});
  if(!cart||!cart.items[itemIdx])return;
  var it=cart.items[itemIdx];
  it.scaglioni.splice(sgIdx,1);
  // Assicurati che ci sia sempre almeno una riga vuota se il pannello - aperto
  if(it._scaglioniAperti&&it.scaglioni.length===0){
    it.scaglioni.push({qtaMin:'',sconto:'',prezzo:''});
  }
  _cartApplicaScaglione(it);
  saveCarrelli();renderCartTabs();
}

// --- RICERCA CARRELLO (intelligente con ranking) ---------------
var _cartSearchTimer = null;
function renderCartSearch(){
  // Debounce: evita calcoli su ogni keystroke su cataloghi grandi
  if(_cartSearchTimer) clearTimeout(_cartSearchTimer);
  _cartSearchTimer = setTimeout(_doCartSearch, 120);
}
function _doCartSearch(){
  var q=(document.getElementById('cart-search')||{}).value||'';
  var res=document.getElementById('cart-search-results');if(!res)return;
  if(!q||q.trim().length<2){res.innerHTML='';return;}
  // Database non ancora caricato: avvisa l'utente
  if(!rows||!rows.length){
    res.innerHTML='<div style="padding:12px;color:var(--accent);font-size:13px;text-align:center;">⏳ Database in caricamento, attendi...</div>';
    return;
  }
  var matches=[];
  var qLow=q.toLowerCase();
  rows.forEach(function(r,i){
    if(!r)return;
    if(removed.has(String(i)))return;
    var m=magazzino[i]||{};
    // Protezione: codF e codM possono essere null/undefined/number
    var codF=String(r.codF||'');
    var codM=String(r.codM||'');
    // Early-exit rapido con indexOf prima del fuzzyScore (più veloce su 19k articoli)
    var text=[r.desc,codF,codM,m.marca,m.specs].join(' ');
    if(text.toLowerCase().indexOf(qLow)<0 && !codF.startsWith(q) && !codM.startsWith(q)) return;
    var score=fuzzyScore(q,text);
    if(score>=50)matches.push({r:r,i:i,m:m,score:score});
  });
  // Ordina per score decrescente (migliori in cima)
  matches.sort(function(a,b){return b.score-a.score;});
  if(!matches.length){res.innerHTML='<div style="padding:10px;color:var(--muted);font-size:12px;">Nessun risultato per "'+esc(q)+'"</div>';return;}
  var h='<div style="background:#1e1e1e;border:1px solid var(--border);border-radius:10px;overflow:hidden;max-height:300px;overflow-y:auto;">';
  matches.slice(0,15).forEach(function(x){
    var r=x.r,i=x.i,m=x.m;
    var qty=m.qty!==undefined&&m.qty!==''?m.qty:'';
    h+='<div style="padding:10px 12px;border-bottom:1px solid #2a2a2a;display:flex;justify-content:space-between;align-items:center;gap:10px;">';
    h+='<div style="flex:1;min-width:0;"><div style="font-size:13px;font-weight:700;color:var(--text);">'+esc(r.desc)+'</div>';
    h+='<div style="font-size:10px;margin-top:2px;">';
    if(r.codF)h+='<span style="color:#fc8181;font-weight:600;">'+esc(r.codF)+'</span> ';
    if(r.codM)h+='<span style="color:var(--accent);font-weight:600;">'+esc(r.codM)+'</span>';
    if(m.marca)h+=' <span style="color:var(--muted);">- '+esc(m.marca)+'</span>';
    h+='</div>';
    if(qty!=='')h+='<div style="font-size:10px;color:#555;margin-top:1px;">Stock: '+qty+' '+(m.unit||'pz')+'</div>';
    if(m.posizione)h+='<div style="font-size:10px;color:#63b3ed;margin-top:1px;">- '+esc(m.posizione)+'</div>';
    h+='</div>';
    h+='<div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;flex-shrink:0;">';
    h+='<div style="font-size:15px;font-weight:900;color:var(--accent);">- '+esc(r.prezzo)+'</div>';
    h+='<button onclick="cartAddItem('+i+')" style="padding:6px 16px;border-radius:8px;border:none;background:#38a169;color:#fff;font-size:12px;font-weight:900;cursor:pointer;">+ Aggiungi</button>';
    h+='</div></div>';
  });
  if(matches.length>15)h+='<div style="font-size:10px;color:#555;text-align:center;padding:6px;">...e altri '+(matches.length-15)+'</div>';
  h+='</div>';
  res.innerHTML=h;
}

// --- STORICO CLIENTE ---------------------------------------
function getStoricoCliente(nomeCliente){
  if(!nomeCliente)return[];
  var nome=nomeCliente.toLowerCase().trim();
  return ordini.filter(function(o){
    return(o.nomeCliente||'').toLowerCase().trim()===nome;
  }).slice(0,5);
}

// --- RENDER CARRELLO ---------------------------------------

// =============================================================================
//  renderCartTabs — RIGENERATA COMPLETAMENTE
//  Design: Dark #121212, Giallo #FFD700 (ferramenta)
//  Responsive: PC max 760px | Mobile full-width, touch 44px
//  Funzioni: foto popup, U.M. select, forbici dblclick, colore ordine,
//             dblclick protezione su CONFERMA, riepilogo intatto
// =============================================================================
function renderCartTabs(){
  var bar  = document.getElementById('cart-tabs-bar');
  var body = document.getElementById('cart-body');
  if(!bar || !body) return;

  // ── TAB PILLS ────────────────────────────────────────────────────────────
  var tabsHtml = '<button class="ct-pill ct-pill--new" onclick="newCart()">＋ NUOVO</button>';
  carrelli.forEach(function(cart, ci){
    var active  = cart.id === activeCartId;
    var n       = (cart.items||[]).length;
    var isInv   = cart.stato === 'inviato';
    var isMod   = cart.stato === 'modifica';
    var pill    = document.createElement('button');
    pill.className = 'ct-pill' + (active ? ' active' : '') + (isMod ? ' ct-pill--mod' : '');
    pill.dataset.tipo = cart.tipo || '';
    var icon = isInv ? '✅ ' : isMod ? '✏️ ' : '';
    pill.innerHTML = icon + esc(cart.nome) +
      (n ? '<span class="ct-pill-n">' + n + '</span>' : '');
    pill.addEventListener('click', function(){ switchCart(ci); });
    pill.addEventListener('dblclick', function(e){ e.stopPropagation(); rinominaCart(ci); });
    tabsHtml += pill.outerHTML;
  });
  // Aggiunge il tasto ORDINI inline nel tab-bar (non fixed, non fuori layout)
  tabsHtml += '<button id="ct-btn-ordfor" onclick="goTab(\'t-ordfor\');renderOrdFor()" title="Ordini per fornitore">📦 ORDINI</button>';
  bar.innerHTML = tabsHtml;
  // Ri-attacca eventi dopo innerHTML
  bar.querySelectorAll('.ct-pill:not(.ct-pill--new)').forEach(function(p, ci){
    p.addEventListener('click', function(){ switchCart(ci); });
    p.addEventListener('dblclick', function(e){ e.stopPropagation(); rinominaCart(ci); });
  });

  // ── CORPO VUOTO ───────────────────────────────────────────────────────────
  if(!activeCartId || !carrelli.length){
    body.innerHTML = '<div class="ct-empty"><div class="ct-empty-icon">🛒</div>' +
      '<p>Premi <b style="color:#FFD700">＋ NUOVO</b> per iniziare</p></div>';
    return;
  }
  var cart = carrelli.find(function(c){ return c.id === activeCartId; });
  if(!cart) return;

  var h = '';

  // ── STATO INVIATO (read-only) ─────────────────────────────────────────────
  if(cart.stato === 'inviato' && cart.locked){
    var totInv = (cart.items||[]).reduce(function(s,it){
      return s + parsePriceIT(it.prezzoUnit) * parseFloat(it.qty||0);
    }, 0);
    h += '<div class="ct-inviato-box">';
    h += '<div class="ct-inviato-top">';
    h += '<span style="font-size:22px">✅</span>';
    h += '<div style="flex:1"><div class="ct-inviato-label">Ordine inviato alla cassa</div>';
    h += '<div class="ct-inviato-nome">' + esc(cart.nome) + '</div></div>';
    h += '<div class="ct-price-big">€ ' + totInv.toFixed(2) + '</div>';
    h += '</div>';
    (cart.items||[]).forEach(function(it){
      var sub = (parsePriceIT(it.prezzoUnit)*parseFloat(it.qty||0)).toFixed(2);
      h += '<div class="ct-inviato-row">';
      h += '<div style="flex:1;min-width:0;font-size:12px;color:#ccc">' + esc(it.desc||'');
      if(it.codM) h += ' <span style="color:#FFD700;font-size:10px">' + esc(it.codM) + '</span>';
      if(it.nota) h += '<div style="font-size:10px;color:#f6ad55;font-style:italic">📝 '+esc(it.nota)+'</div>';
      h += '</div><div class="ct-price-sm">€'+sub+'</div></div>';
    });
    h += '<div style="display:flex;gap:8px;margin-top:14px">';
    h += '<button onclick="cartUnlock(\'' + cart.id + '\')" class="ct-btn-yellow" style="flex:1">✏️ Sblocca e modifica</button>';
    h += '<button onclick="goTab(\'to\')" class="ct-btn-solid" style="padding:10px 16px">📋 Ordini</button>';
    h += '</div>';
    h += '<div style="display:flex;gap:6px;margin-top:8px">';
    h += '<button onclick="deleteCart(\'' + cart.id + '\')" class="ct-btn-ghost" style="flex:1;font-size:12px;color:#555">🗑️ Elimina carrello</button>';
    h += '</div></div>';
    body.innerHTML = h;
    return;
  }

  // ── BANNER MODIFICA con bordo cantiere giallo/nero ────────────────────────
  if(cart.stato === 'modifica'){
    h += '<div class="ct-banner-mod">';
    h += '<span style="font-size:18px">✏️</span>';
    h += '<div style="flex:1"><div class="ct-banner-mod-title">MODIFICA IN CORSO</div>';
    h += '<div style="font-size:10px;color:#888">' + esc(cart.nome) + ' — modifica e premi Aggiorna</div></div>';
    h += '</div>';
  }

  // ── BARRA CERCA ──────────────────────────────────────────────────────────
  h += '<div id="cart-action-btns">';
  h += '<button class="ct-btn-cerca" onclick="openCodeNumpad()">';
  h += '<span class="ct-btn-icon">🔍</span><span>CERCA PER CODICE</span></button></div>';
  h += '<div style="padding:0 10px 6px">';
  h += '<input type="text" id="cart-search" placeholder="🔎 Cerca per nome, specifiche..." ';
  h += 'style="width:100%;padding:10px 14px;border:1px solid #2e3033;border-radius:10px;font-size:13px;background:#1e1e1e;color:#f0f0f0;box-sizing:border-box" ';
  h += 'oninput="renderCartSearch()" autocomplete="off">';
  h += '</div>';
  h += '<div id="cart-search-results" style="padding:0 10px"></div>';

  // ── LISTA VUOTA ───────────────────────────────────────────────────────────
  if(!(cart.items||[]).length){
    h += '<div class="ct-empty" style="padding:30px 20px">';
    h += '<div class="ct-empty-icon">📦</div>';
    h += '<p>Cerca un articolo o premi <b style="color:#FFD700">CERCA PER CODICE</b></p>';
    h += '</div>';
  } else {

    // ── TOTALE STICKY ─────────────────────────────────────────────────────
    var tot = (cart.items||[]).reduce(function(s,it){
      return s + parsePriceIT(it.prezzoUnit) * parseFloat(it.qty||0);
    }, 0);
    var scontoGl = cart.scontoGlobale;
    var totFin   = scontoGl ? tot * (1 - scontoGl/100) : tot;
    h += '<div class="ct-sticky-total">';
    h += '<span class="ct-sticky-val">€ ' + totFin.toFixed(2) + '</span>';
    if(scontoGl) h += '<span class="ct-sconto-badge">-'+scontoGl+'%</span>';
    h += '<span class="ct-sticky-n">' + (cart.items||[]).length + ' art.</span>';
    h += '<button onclick="openScontoOverlay()" class="ct-btn-sconto">% Sconto</button>';
    h += '</div>';

    // ══════════════════════════════════════════════════════════════════════
    //  CARD ARTICOLI — flex-row compatta + icon-bar + pannelli a comparsa
    // ══════════════════════════════════════════════════════════════════════
    (cart.items||[]).forEach(function(it, idx){
      var p       = parsePriceIT(it.prezzoUnit);
      var q       = parseFloat(it.qty) || 0;
      var sub     = (p * q).toFixed(2);
      var isSc    = it.scampolo    || false;
      var isFR    = it.fineRotolo  || false;
      var isDaOrd = it.daOrdinare  || false;
      var scagAp  = it._scaglioniAperti || false;
      var scagAtt = it._scaglioneAttivo || null;
      var hasNota = !!(it.nota && it.nota.trim());
      var scOn    = isSc || isFR;
      var isTuttoRotolo = it._tuttoRotolo || false;

      // Cod. Magazzino 7 cifre
      var codM7 = it.codM
        ? (String(it.codM).match(/^\d+$/) ? String(it.codM).padStart(7,'0') : it.codM)
        : '';
      var codF = it.codF || '';

      // Bordo card: colore ordine | stato modifica | rotolo intero
      var cardBorder = '';
      if(isTuttoRotolo) cardBorder = 'border-color:#e53e3e;box-shadow:0 0 0 1px #e53e3e55';
      else if(it._ordColore) cardBorder = 'border-color:' + it._ordColore + ';box-shadow:0 0 0 1px ' + it._ordColore + '44';

      // Card con classe modifica per bordo cantiere
      var cardClass = 'ct-card' +
        (it._checked ? ' ct-card--checked' : '') +
        (cart.stato === 'modifica' ? ' ct-card--mod' : '');

      h += '<div class="' + cardClass + '" id="cart-row-' + idx + '"' +
           (cardBorder ? ' style="' + cardBorder + '"' : '') + '>';

      // ── RIGA PRINCIPALE: layout responsive 2 righe su mobile ──────────────
      // Riga A (sempre): foto | info(nome+codici) | prezzo
      // Riga B (sotto):  stepper qty | UM select
      h += '<div class="ct-row">';

      // Foto interattiva — onclick apriModalFoto
      if(it.foto){
        h += '<img class="ct-thumb" src="' + it.foto + '" alt="" ' +
             'onclick="apriModalFoto(this.src)" title="Clicca per ingrandire">';
      } else {
        h += '<div class="ct-thumb ct-thumb--empty">📦</div>';
      }

      // Info: nome + riga codici (Cod.Mag | Cod.Forn)
      h += '<div class="ct-info">';
      h += '<div class="ct-nome" onclick="ctToggleNome(\'' + cart.id + '\',' + idx + ')" title="Tocca per leggere il nome completo">' + esc(it.desc || '—') + '</div>';
      // Riga codici allineata orizzontalmente
      if(codM7 || codF !== undefined){
        h += '<div class="ct-codes">';
        // Cod. Magazzino — statico (non editabile nella card)
        if(codM7) h += '<span class="ct-code ct-code--mag">Cod.Mag: <b>' + esc(codM7) + '</b></span>';
        if(codM7) h += '<span class="ct-code-sep">|</span>';
        // Cod. Fornitore — input editabile direttamente nella card
        h += '<span class="ct-code">Cod.Forn: <input class="ct-codf-inp" '
           + 'value="' + esc(codF) + '" '
           + 'placeholder="—" '
           + 'title="Clicca per modificare il Codice Fornitore" '
           + 'oninput="ctSetCodF(\'' + cart.id + '\',' + idx + ',this.value)" '
           + 'onclick="event.stopPropagation();this.select()" '
           + 'onkeydown="if(event.key===\'Enter\')this.blur()"\'>';
        h += '</span>';
        h += '</div>';
      }
      h += '</div>'; // fine ct-info

      // Prezzi: ORIGINALE in blu sbarrato, FINALE in verde, giallo se nessuno sconto
      // id="prz-IDX" permette aggiornamento live da ctCalcolaLive()
      h += '<div class="ct-price-block" id="prz-' + idx + '">';

      var prezOrigNum = 0;
      var prezFinNum  = p;
      var hasSconto   = false;
      if(scagAtt && it._prezzoBase){
        prezOrigNum = parsePriceIT(it._prezzoBase);
        hasSconto   = prezOrigNum > prezFinNum + 0.005;
      } else if((scOn || (it._scontoApplicato && it._scontoApplicato > 0)) && it._prezzoOriginale){
        prezOrigNum = parsePriceIT(it._prezzoOriginale);
        hasSconto   = prezOrigNum > prezFinNum + 0.005;
      }

      if(hasSconto){
        h += '<div class="ct-old--orig">€' + (prezOrigNum * q).toFixed(2) + '</div>';
        h += '<div class="ct-sub--final">€' + sub + '</div>';
      } else {
        var subColor = isTuttoRotolo ? '#fc8181' : (isFR ? '#f6ad55' : '#FFD700');
        h += '<div class="ct-sub" style="color:' + subColor + '">€' + sub + '</div>';
      }

      h += '<input class="ct-punit" type="text" inputmode="decimal" value="' +
           esc(it.prezzoUnit||'0') + '" ' +
           'onchange="cartSetPrezzo(\'' + cart.id + '\',' + idx + ',this.value)" ' +
           'onclick="this.select()" title="€/unità">';
      h += '</div>'; // fine ct-price-block

      h += '</div>'; // fine ct-row

      // ── RIGA B: stepper qty + selezione U.M. ─────────────────────────────
      // Separata in riga propria: tasti grandi, facili su mobile
      h += '<div class="ct-row-b">';
      h += '<div class="ct-qty">';
      h += '<button class="ct-qty-btn" onclick="cartDelta(\'' + cart.id + '\',' + idx + ',-1)">−</button>';
      h += '<button class="ct-qty-val" onclick="openQtyNumpad(\'' + cart.id + '\',' + idx + ')">' + q + '</button>';
      h += '<button class="ct-qty-btn" onclick="cartDelta(\'' + cart.id + '\',' + idx + ',1)">＋</button>';
      h += '</div>';
      var units = ['pz','mt','kg','lt','cf','ml','gr','mm','cm','m²','m³'];
      var curUnit = it.unit || 'pz';
      h += '<select class="ct-um-select" title="U.M." ' +
           'onchange="cartSetUnit(\'' + cart.id + '\',' + idx + ',this.value)">';
      units.forEach(function(u){
        h += '<option value="' + u + '"' + (u === curUnit ? ' selected' : '') + '>' + u + '</option>';
      });
      h += '</select>';
      h += '<div class="ct-row-b-spacer"></div>';
      h += '</div>'; // fine ct-row-b

      // ── ICON-BAR orizzontale ──────────────────────────────────────────────
      // Icone SVG outline: Forbici (singolo = scampolo, DOPPIO = Tutto Rotolo),
      // Percentuale (sconto/scaglioni), Note, Ordina, Cestino
      h += '<div class="ct-iconbar">';

      // ──── FORBICI ─────────────────────────────────────────────────────────
      // Singolo click: ciclo scampolo/fine-rotolo (logica originale)
      // DOPPIO CLICK (dblclick): attiva "Tutto il Rotolo" — bordo rosso + nota automatica
      // Il dblclick è distinto dal singolo: usa event.detail o timer separato
      // FORBICI — un solo onclick gestisce singolo e doppio tap
      // ctForbiciTap() conta i tap: 1 tap = scampolo, 2 tap rapidi = ROTOLO INTERO
      // ondblclick rimosso: non affidabile su Safari/iPhone
      var forbLbl = isTuttoRotolo ? 'ROTOLO' : (scOn ? (isFR?'ROTOLO':'SCAMPOLO') : '');
      h += '<button class="ct-icon-btn' + (scOn||isTuttoRotolo ? ' ct-icon-btn--on' : '') +
           (isTuttoRotolo ? ' ct-icon-btn--rotolo' : '') + '" ' +
           'onclick="ctForbiciTap(\'' + cart.id + '\',' + idx + ')" ' +
           'title="Tap: scampolo | 2 tap rapidi: TUTTO IL ROTOLO">';
      h += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
           '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>' +
           '<line x1="20" y1="4" x2="8.12" y2="15.88"/>' +
           '<line x1="14.47" y1="14.48" x2="20" y2="20"/>' +
           '<line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>';
      h += (forbLbl ? '<span>' + forbLbl + '</span>' : '') + '</button>';

      // ──── SCONTO % ────────────────────────────────────────────────────────
      var hasScag = scagAp || scagAtt;
      h += '<button class="ct-icon-btn' + (hasScag ? ' ct-icon-btn--on' : '') + '" ' +
           'onclick="ctTogglePanel(\'' + cart.id + '\',' + idx + ',\'sconto\')" ' +
           'title="Sconto / Scaglioni">';
      h += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
           '<line x1="19" y1="5" x2="5" y2="19"/>' +
           '<circle cx="6.5" cy="6.5" r="2.5"/>' +
           '<circle cx="17.5" cy="17.5" r="2.5"/></svg></button>';

      // ──── NOTE ────────────────────────────────────────────────────────────
      h += '<button class="ct-icon-btn' + (hasNota ? ' ct-icon-btn--on' : '') + '" ' +
           'onclick="ctTogglePanel(\'' + cart.id + '\',' + idx + ',\'nota\')" title="Nota">';
      h += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
           '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' +
           '<polyline points="14 2 14 8 20 8"/>' +
           '<line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>' +
           '<polyline points="10 9 9 9 8 9"/></svg></button>';

      // ──── ORDINA (con colore) ──────────────────────────────────────────────
      var ordStyle = it._ordColore
        ? 'background:' + it._ordColore + '33;border-color:' + it._ordColore + ';color:' + it._ordColore
        : '';
      h += '<button class="ct-icon-btn ct-icon-btn--ordina' + (isDaOrd ? ' ct-icon-btn--on' : '') + '" ' +
           'style="' + ordStyle + '" ' +
           'onclick="ctApriColori(\'' + cart.id + '\',' + idx + ')" title="Colore ordine fornitore">';
      h += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
           '<circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/>' +
           '<path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>' +
           '<span>ORDINA</span></button>';

      // ──── CESTINO ─────────────────────────────────────────────────────────
      h += '<button class="ct-icon-btn ct-icon-btn--del" ' +
           'onclick="cartRemoveItem(\'' + cart.id + '\',' + idx + ')" title="Elimina">';
      h += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
           '<polyline points="3 6 5 6 21 6"/>' +
           '<path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>' +
           '<path d="M9 6V4h6v2"/></svg></button>';

      h += '</div>'; // fine ct-iconbar

      // ── PANNELLI A COMPARSA (display:none di default) ────────────────────
      var pScId = 'ctp-sc-' + idx;
      var pNoId = 'ctp-no-' + idx;

      // Pannello Sconto / Scaglioni — calcolo LIVE con oninput
      h += '<div id="' + pScId + '" class="ct-panel" style="display:none">';
      if(!hasScag || true){
        var pBase4sc = it._prezzoOriginale || it._prezzoBase || it.prezzoUnit || '0';
        var scAtt4sc = it._scontoApplicato || 0;
        var fin4sc   = scAtt4sc > 0
          ? (parsePriceIT(pBase4sc)*(1-scAtt4sc/100)*q).toFixed(2)
          : (parsePriceIT(pBase4sc)*q).toFixed(2);
        h += '<div class="ct-panel-row">';
        h += '<label class="ct-pl">Sconto %</label>';
        h += '<input type="number" min="0" max="100" value="' + scAtt4sc + '" ' +
             'class="ct-pi" ' +
             'oninput="ctCalcolaLive(this,' + idx + ',\'' + pBase4sc + '\',' + q + ')" ' +
             'onchange="cartSetScontoScampolo(\'' + cart.id + '\',' + idx + ',this.value)">';
        h += '</div>';
        h += '<div class="ct-panel-preview" id="pp-sc-' + idx + '">';
        h += '<span class="ct-pp-orig">Orig: €' + (parsePriceIT(pBase4sc)*q).toFixed(2) + '</span>';
        h += '<span class="ct-pp-fin">Fin: €' + fin4sc + '</span>';
        h += '</div>';
      }
      if(it.hasScaglioni || hasScag){
        var baseP    = it._prezzoBase || it.prezzoUnit || '0';
        var basePNum = parsePriceIT(baseP) || 0;
        h += '<div style="font-size:10px;color:#63b3ed;margin:4px 0 5px">📊 Scaglioni — base €' + esc(baseP) + '</div>';
        (it.scaglioni||[]).forEach(function(sg, si){
          var pc = basePNum > 0 && sg.sconto ? (basePNum*(1-sg.sconto/100)).toFixed(2) : '';
          h += '<div class="ct-scag-row">';
          h += '<span class="ct-pl">da</span>';
          h += '<input type="number" min="1" value="' + (sg.qtaMin||'') + '" class="ct-si" ' +
               'onchange="cartUpdScag(\'' + cart.id + '\',' + idx + ',' + si + ',\'qtaMin\',this.value)"> pz —';
          h += '<input type="number" min="0" max="100" value="' + (sg.sconto||'') + '" class="ct-si ct-si--pct" ' +
               'onchange="cartUpdScag(\'' + cart.id + '\',' + idx + ',' + si + ',\'sconto\',this.value)">%';
          if(pc) h += '<span class="ct-scag-res">€' + pc + '</span>';
          h += '<button class="ct-scag-del" onclick="cartRmvScag(\'' + cart.id + '\',' + idx + ',' + si + ')">✕</button>';
          h += '</div>';
        });
        h += '<button class="ct-scag-add" onclick="cartAddScag(\'' + cart.id + '\',' + idx + ')">+ scaglione</button>';
      }
      h += '</div>';

      // Pannello Note
      h += '<div id="' + pNoId + '" class="ct-panel" style="display:none">';
      h += '<textarea class="ct-nota-inp" placeholder="Nota articolo..." ' +
           'oninput="cartSetNota(\'' + cart.id + '\',' + idx + ',this.value)">' +
           esc(it.nota||'') + '</textarea>';
      h += '</div>';

      // Preview nota
      if(hasNota){
        h += '<div class="ct-nota-prev">📝 ' + esc(it.nota) + '</div>';
      }

      // Badge stato attivi
      var badges = '';
      if(isTuttoRotolo) badges += '<span class="ct-badge ct-badge--red">🔴 ROTOLO INTERO</span> ';
      else if(scOn && it._scontoApplicato) badges += '<span class="ct-badge ct-badge--yellow">' +
        (isFR?'🔚':'✂️') + ' -' + it._scontoApplicato + '%</span> ';
      if(scagAtt) badges += '<span class="ct-badge ct-badge--blue">📊 -'+(scagAtt.sconto||0)+'% da '+scagAtt.qtaMin+'pz</span> ';
      if(isDaOrd){
        var bc = it._ordColore || '#e53e3e';
        badges += '<span class="ct-badge" style="background:'+bc+'22;color:'+bc+';border:1px solid '+bc+'44">🛒 ORDINA</span> ';
      }
      if(badges) h += '<div class="ct-badges">' + badges + '</div>';

      h += '</div>'; // fine ct-card
    });

  } // fine items.length

  // ── NOTA ORDINE ───────────────────────────────────────────────────────────
  h += '<div id="cart-order-nota-row">';
  h += '<textarea class="pos-nota-ordine" rows="2" placeholder="📋 Nota ordine..." ' +
       'oninput="cartSetNotaOrdine(\'' + cart.id + '\',this.value)">' + esc(cart.nota||'') + '</textarea>';
  h += '</div>';

  // ══ STICKY FOOTER — ultra-sottile, giallo ════════════════════════════════
  var tot2    = (cart.items||[]).reduce(function(s,it){
    return s + parsePriceIT(it.prezzoUnit) * parseFloat(it.qty||0);
  }, 0);
  var tot2Fin = cart.scontoGlobale ? tot2*(1-cart.scontoGlobale/100) : tot2;
  h += '<div id="cart-pos-footer">';
  h += '<div class="ct-footer">';
  h += '<div class="ct-footer-tot"><span class="ct-footer-sym">€</span>' + tot2Fin.toFixed(2) + '</div>';
  h += '<div class="ct-footer-btns">';
  // 🗑️ SVUOTA
  h += '<button class="ct-fbtn ct-fbtn--danger" onclick="svuotaCarrello(\'' + cart.id + '\')">🗑️<span>SVUOTA</span></button>';
  // 👀 RIEPILOGO — logica checkbox invariata, non toccare
  h += '<button class="ct-fbtn ct-fbtn--riepilogo" onclick="openRiepilogoOrdine(\'' + cart.id + '\')">👀<span>RIEPILOGO</span></button>';
  // 🛍️ CONFERMA — SOLO DBLCLICK, singolo click mostra avviso
  if(cart.stato === 'modifica'){
    h += '<button class="ct-fbtn ct-fbtn--cassa" id="ctf-cassa-' + cart.id + '" ' +
         'onclick="ctCassaSingleClick(this)" ondblclick="aggiornaOrdine(\'' + cart.id + '\')">' +
         '✏️<span>AGGIORNA</span></button>';
  } else {
    h += '<button class="ct-fbtn ct-fbtn--cassa" id="ctf-cassa-' + cart.id + '" ' +
         (!(cart.items||[]).length ? 'disabled ' : '') +
         'onclick="ctCassaSingleClick(this)" ondblclick="inviaOrdine(\'' + cart.id + '\')">' +
         '🛍️<span>CONFERMA</span></button>';
  }
  h += '</div>'; // fine ct-footer-btns
  h += '</div>'; // fine ct-footer
  h += '</div>'; // fine cart-pos-footer

  body.innerHTML = h;
}



// =============================================================================
//  FUNZIONI HELPER CARRELLO NUOVO
// =============================================================================

// Chiave localStorage per nomi fornitori per colore
var CT_FORN_KEY = 'cp4_forniColore';

// ctTogglePanel: mostra/nasconde pannello a comparsa (sconto|nota)
// Usa display none/block — non occupa spazio se non attivo
function ctTogglePanel(cartId, idx, tipo){
  var ids = { sconto: 'ctp-sc-', nota: 'ctp-no-' };
  var targetId = (ids[tipo] || 'ctp-') + idx;
  var el = document.getElementById(targetId);
  if(!el) return;
  // Chiude l'altro pannello della stessa card
  Object.keys(ids).forEach(function(t){
    if(t !== tipo){
      var other = document.getElementById((ids[t]||'ctp-') + idx);
      if(other) other.style.display = 'none';
    }
  });
  var isOpen = el.style.display !== 'none';
  el.style.display = isOpen ? 'none' : 'block';
  if(tipo === 'nota' && !isOpen){
    var ta = el.querySelector('textarea');
    if(ta) setTimeout(function(){ ta.focus(); }, 40);
  }
}

// ctForbiciClick: singolo click sulle forbici = ciclo scampolo/fine-rotolo
// Il singolo click deve essere ignorato se fa parte di un dblclick.
// Usiamo un timer: se entro 250ms arriva il secondo click (dblclick nativo),
// il singolo viene annullato — il dblclick gestisce "Tutto il Rotolo".
// ═══════════════════════════════════════════════════════════════════════════
// ctForbiciTap — TAP SINGOLO / DOPPIO TAP sulle forbici
// Funziona su iPhone Safari dove ondblclick non è affidabile.
//
// Logica a timer (unico onClick):
//   1° tap → segna _ctForbiciPending[idx]=true, avvia timer 380ms
//   2° tap entro 380ms → annulla timer → ROTOLO INTERO
//   Timer scade → tap singolo confermato → ciclo scampolo normale
//
// 380ms è calibrato: abbastanza per un doppio tap intenzionale,
// abbastanza corto da non sembrare lento su tap singolo.
// ═══════════════════════════════════════════════════════════════════════════
var _ctForbiciTimers  = {};
var _ctForbiciPending = {};

function ctForbiciTap(cartId, idx){
  if(_ctForbiciPending[idx]){
    // ── SECONDO TAP rilevato (doppio tap) ──────────────────────────────
    clearTimeout(_ctForbiciTimers[idx]);
    _ctForbiciPending[idx] = false;
    ctTuttoRotolo(cartId, idx);   // attiva/disattiva ROTOLO INTERO
  } else {
    // ── PRIMO TAP: aspetta per vedere se arriva il secondo ─────────────
    _ctForbiciPending[idx] = true;
    _ctForbiciTimers[idx]  = setTimeout(function(){
      _ctForbiciPending[idx] = false;
      cartCycleScampolo(cartId, idx);   // tap singolo: ciclo scampolo
    }, 380);
  }
}

// ctTuttoRotolo: attiva o disattiva la modalità ROTOLO INTERO
// Bordo rosso sulla card, nota automatica "ROTOLO INTERO", flag _tuttoRotolo
function ctTuttoRotolo(cartId, idx){
  var cart = carrelli.find(function(c){ return c.id === cartId; });
  if(!cart || !cart.items[idx]) return;
  var it = cart.items[idx];

  if(it._tuttoRotolo){
    // Disattiva
    it._tuttoRotolo = false;
    if(it.nota === 'ROTOLO INTERO') it.nota = '';
    it.scampolo   = false;
    it.fineRotolo = false;
    if(it._prezzoOriginale){
      it.prezzoUnit = it._prezzoOriginale;
      delete it._prezzoOriginale;
    }
    delete it._scontoApplicato;
  } else {
    // Attiva ROTOLO INTERO
    it._tuttoRotolo     = true;
    it.nota             = 'ROTOLO INTERO';
    it.scampolo         = false;
    it.fineRotolo       = true;
    it._scontoTipo      = 'rotolo';
    it._scontoApplicato = 0;
    if(!it._prezzoOriginale) it._prezzoOriginale = it.prezzoUnit;
  }
  saveCarrelli();
  renderCartTabs();
}

// ctApriColori: popup colore ordine fornitore
function ctApriColori(cartId, idx){
  // Rimuove popup precedente se esiste
  var ex = document.getElementById('ct-color-popup');
  if(ex){ ex.remove(); document.getElementById('ct-color-bd')&&document.getElementById('ct-color-bd').remove(); return; }

  var cart = carrelli.find(function(c){ return c.id === cartId; });
  if(!cart || !cart.items[idx]) return;
  var it = cart.items[idx];

  var colori = [
    { label:'🔴 Rosso',   val:'#e53e3e' },
    { label:'🟢 Verde',   val:'#38a169' },
    { label:'🔵 Blu',     val:'#3182ce' },
    { label:'🟡 Giallo',  val:'#e2c400' },
    { label:'✕ Rimuovi', val:''         },
  ];

  var popup = document.createElement('div');
  popup.id = 'ct-color-popup';
  popup.className = 'ct-color-popup';

  var html = '<div class="ct-color-title">Colore ordine fornitore</div>';
  colori.forEach(function(c){
    var isActive = it._ordColore === c.val && c.val !== '';
    html += '<button class="ct-color-opt' + (isActive ? ' ct-color-opt--active' : '') + '"';
    if(c.val) html += ' style="border-color:' + c.val + '"';
    html += ' onclick="ctSetColore(\'' + cartId + '\',' + idx + ',\'' + c.val + '\')">';
    html += c.label;
    if(isActive) html += ' ✓';
    html += '</button>';
  });
  popup.innerHTML = html;

  // Posizionamento vicino alla card
  var card = document.getElementById('cart-row-' + idx);
  if(card){
    var r = card.getBoundingClientRect();
    popup.style.top  = (r.bottom + window.scrollY + 4) + 'px';
    popup.style.left = Math.min(r.left, window.innerWidth - 180) + 'px';
  }

  var bd = document.createElement('div');
  bd.id = 'ct-color-bd';
  bd.style.cssText = 'position:fixed;inset:0;z-index:7990';
  bd.onclick = function(){ popup.remove(); bd.remove(); };

  document.body.appendChild(bd);
  document.body.appendChild(popup);
}

// ctSetColore: salva il colore e aggiorna la card
function ctSetColore(cartId, idx, colore){
  var cart = carrelli.find(function(c){ return c.id === cartId; });
  if(!cart || !cart.items[idx]) return;
  var it = cart.items[idx];
  it._ordColore = colore || undefined;
  it.daOrdinare = !!colore;
  var p = document.getElementById('ct-color-popup');
  var b = document.getElementById('ct-color-bd');
  if(p) p.remove(); if(b) b.remove();
  saveCarrelli();
  renderCartTabs();
}


// ctSetCodF: salva il Codice Fornitore editato direttamente nella card
// Il campo è un <input> inline — si salva a ogni keystroke con debounce
var _ctCodFTimers = {};
function ctSetCodF(cartId, idx, val){
  clearTimeout(_ctCodFTimers[cartId + '_' + idx]);
  _ctCodFTimers[cartId + '_' + idx] = setTimeout(function(){
    var cart = carrelli.find(function(c){ return c.id === cartId; });
    if(!cart || !cart.items[idx]) return;
    cart.items[idx].codF = val.trim();
    saveCarrelli(); // salva su localStorage + Firebase
    // NON chiama renderCartTabs() per non perdere il focus sull'input
  }, 600);
}

// ctCassaSingleClick: protezione doppio click — singolo mostra avviso 1.5s
var _ctCassaTimer = null;
function ctCassaSingleClick(btn){
  if(_ctCassaTimer) return; // già in attesa: non stacca
  btn.classList.add('ct-fbtn--warn');
  var sp = btn.querySelector('span');
  var orig = sp ? sp.textContent : '';
  if(sp) sp.textContent = '⚠ Doppio click!';
  _ctCassaTimer = setTimeout(function(){
    btn.classList.remove('ct-fbtn--warn');
    if(sp) sp.textContent = orig;
    _ctCassaTimer = null;
  }, 1500);
}

// apriModalFoto: foto a tutto schermo — onclick su miniatura
function apriModalFoto(src){
  var ex = document.getElementById('ct-modal-foto');
  if(ex){ ex.remove(); return; }
  var m = document.createElement('div');
  m.id = 'ct-modal-foto';
  m.className = 'ct-modal-foto';
  m.innerHTML = '<div class="ct-modal-box">' +
    '<button class="ct-modal-close" ' +
    'onclick="document.getElementById(\'ct-modal-foto\').remove()">✕</button>' +
    '<img src="' + src + '" class="ct-modal-img" alt="">' +
    '</div>';
  m.addEventListener('click', function(e){ if(e.target===m) m.remove(); });
  document.body.appendChild(m);
}

// =============================================================================
//  TAB ORDINI PER COLORE/FORNITORE — #t-ordfor
// =============================================================================

// Salva/carica nomi fornitori per colore in localStorage
function ctGetForniColore(){
  try{ return JSON.parse(localStorage.getItem(CT_FORN_KEY)||'{}'); }catch(e){ return {}; }
}
function ctSaveForniColore(map){
  localStorage.setItem(CT_FORN_KEY, JSON.stringify(map));
  // Sincronizza su Firebase se disponibile
  try{ _fbPush('forniColore', map); }catch(e){}
}

// renderOrdFor: renderizza la tab Ordini Fornitore raggruppati per colore
function renderOrdFor(){
  var wrap = document.getElementById('t-ordfor-body');
  if(!wrap) return;

  // Raccoglie tutti gli articoli "daOrdinare" da tutti i carrelli
  var byColor = {};
  carrelli.forEach(function(cart){
    (cart.items||[]).forEach(function(it){
      // Mostra SOLO articoli con colore reale assegnato (non '#888888' = senza colore)
      if(!it.daOrdinare) return;
      if(!it._ordColore || it._ordColore === '#888888') return;
      var col = it._ordColore;
      if(!byColor[col]) byColor[col] = [];
      byColor[col].push({ it: it, cartNome: cart.nome||'' });
    });
  });

  var forniMap = ctGetForniColore();
  var colorNames = {
    '#e53e3e':'Rosso', '#38a169':'Verde', '#3182ce':'Blu',
    '#e2c400':'Giallo', '#888888':'Senza colore'
  };

  if(!Object.keys(byColor).length){
    wrap.innerHTML = '<div style="text-align:center;padding:40px;color:#555">' +
      'Nessun articolo da ordinare.<br><small>Usa il tasto ORDINA nelle card del carrello.</small></div>';
    return;
  }

  var h = '';
  Object.keys(byColor).forEach(function(col){
    var items     = byColor[col];
    var colLabel  = colorNames[col] || col;
    var fornNome  = forniMap[col] || '';

    h += '<div class="cof-group" style="border-color:' + col + '55">';
    // Intestazione gruppo: pallino colore + nome fornitore MODIFICABILE
    h += '<div class="cof-header" style="border-color:' + col + '">';
    h += '<span class="cof-dot" style="background:' + col + '"></span>';
    h += '<span class="cof-color-label">' + colLabel + '</span>';
    // Campo nome fornitore — input cliccabile, si salva onblur/enter
    h += '<input class="cof-forn-inp" ' +
         'value="' + esc(fornNome) + '" ' +
         'placeholder="Nome fornitore..." ' +
         'title="Clicca per modificare il nome del fornitore" ' +
         'oninput="ctSaveFornNome(\'' + col + '\',this.value)" ' +
         'onkeydown="if(event.key===\'Enter\')this.blur()">';
    h += '<span class="cof-count">' + items.length + ' art.</span>';
    h += '</div>'; // fine cof-header

    // Lista articoli del gruppo
    items.forEach(function(entry){
      var it   = entry.it;
      var codM = it.codM ? (String(it.codM).match(/^\d+$/) ? String(it.codM).padStart(7,'0') : it.codM) : '';
      var sub  = (parsePriceIT(it.prezzoUnit)*(parseFloat(it.qty)||0)).toFixed(2);
      h += '<div class="cof-row">';
      if(it.foto) h += '<img class="cof-thumb" src="' + it.foto + '" alt="" onclick="apriModalFoto(this.src)">';
      else        h += '<div class="cof-thumb cof-thumb--empty">📦</div>';
      h += '<div class="cof-info">';
      h += '<div class="cof-nome">' + esc(it.desc||'—') + '</div>';
      h += '<div class="cof-meta">';
      if(codM)    h += '<span>Cod.Mag: <b>' + esc(codM) + '</b></span> ';
      if(it.codF) h += '<span>Cod.Forn: <b>' + esc(it.codF) + '</b></span> ';
      h += '<span>Cart: <b>' + esc(entry.cartNome) + '</b></span>';
      h += '</div>';
      if(it.nota) h += '<div class="cof-nota">📝 ' + esc(it.nota) + '</div>';
      h += '</div>';
      h += '<div class="cof-right">';
      h += '<div class="cof-qty">' + (parseFloat(it.qty)||0) + ' ' + (it.unit||'pz') + '</div>';
      h += '<div class="cof-sub">€' + sub + '</div>';
      h += '</div>';
      h += '</div>'; // fine cof-row
    });

    h += '</div>'; // fine cof-group
  });

  wrap.innerHTML = h;
}

// ctSaveFornNome: salva il nome fornitore per un colore (con debounce)
var _ctFornTimer = null;
function ctSaveFornNome(colore, nome){
  clearTimeout(_ctFornTimer);
  _ctFornTimer = setTimeout(function(){
    var map = ctGetForniColore();
    if(nome && nome.trim()) map[colore] = nome.trim();
    else delete map[colore];
    ctSaveForniColore(map);
  }, 400); // salva dopo 400ms di pausa dalla digitazione
}



// ctToggleNome: click sul nome prodotto espande/collassa la card
// La classe ct-card--expanded nel CSS imposta white-space:normal sul nome
function ctToggleNome(cartId, idx){
  var card = document.getElementById('cart-row-' + idx);
  if(card) card.classList.toggle('ct-card--expanded');
}

// ctCalcolaLive — aggiorna i prezzi nel DOM in tempo reale SENZA salvare su Firebase.
// Viene chiamata da oninput sull'input %. onchange salva poi definitivamente.
// Parametri: inputEl = <input> %, idx = indice card, baseStr = prezzo originale, qty = quantità
function ctCalcolaLive(inputEl, idx, baseStr, qty){
  var perc   = parseFloat(inputEl.value) || 0;
  var base   = parsePriceIT(String(baseStr)) || 0;
  var finale = perc > 0 ? base * (1 - perc / 100) : base;
  var q      = parseFloat(qty) || 1;

  // Aggiorna preview nel pannello
  var ppEl = document.getElementById('pp-sc-' + idx);
  if(ppEl){
    ppEl.querySelector('.ct-pp-orig').textContent = 'Orig: €' + (base*q).toFixed(2);
    ppEl.querySelector('.ct-pp-fin').textContent  = 'Fin: €'  + (finale*q).toFixed(2);
  }
  // Aggiorna anche blocco prezzi della card (prz-IDX) in tempo reale
  var przEl = document.getElementById('prz-' + idx);
  if(przEl){
    var origEl = przEl.querySelector('.ct-old--orig, .ct-old--orig-live');
    var finEl  = przEl.querySelector('.ct-sub--final, .ct-sub--final-live');
    var subEl  = przEl.querySelector('.ct-sub');
    if(perc > 0 && base > finale + 0.005){
      if(origEl) origEl.textContent = '€' + (base*q).toFixed(2);
      if(finEl)  finEl.textContent  = '€' + (finale*q).toFixed(2);
    } else if(subEl){
      subEl.textContent = '€' + (finale*q).toFixed(2);
    }
  }
}


// ── RIEPILOGO ORDINE (checklist operativa) ────────────────────────────────────
var _riepilogoChecks = {}; // id_carrello + idx -> bool

function openRiepilogoOrdine(cartId){
  var cart = carrelli.find(function(c){ return c.id === cartId; });
  if(!cart || !(cart.items||[]).length){ showToastGen('yellow','Carrello vuoto'); return; }

  // Inizializza checks se non esistono
  var key = cartId;
  if(!_riepilogoChecks[key]) _riepilogoChecks[key] = {};

  var ov = document.getElementById('riepilogo-overlay');
  if(!ov){ ov = document.createElement('div'); ov.id = 'riepilogo-overlay'; document.body.appendChild(ov); }
  ov.className = 'overlay open';

  var tot = (cart.items||[]).reduce(function(s,it){ return s + parsePriceIT(it.prezzoUnit) * parseFloat(it.qty||0); }, 0);
  var totFin = cart.scontoGlobale ? tot * (1 - cart.scontoGlobale/100) : tot;
  var checks = _riepilogoChecks[key];
  var checked = Object.keys(checks).filter(function(k){ return checks[k]; }).length;

  var h = '<div class="riepilogo-modal">';
  // Header
  h += '<div class="riepilogo-header">';
  h += '<div>';
  h += '<div class="riepilogo-title">📋 ' + esc(cart.nome) + '</div>';
  h += '<div class="riepilogo-meta">' + (cart.items||[]).length + ' articoli &nbsp;·&nbsp; <span style="color:var(--accent);font-weight:800;">€' + totFin.toFixed(2) + '</span>';
  if(cart.scontoGlobale) h += ' <span style="font-size:10px;color:var(--pos-muted);">(-' + cart.scontoGlobale + '%)</span>';
  h += '</div></div>';
  h += '<div style="display:flex;gap:6px;align-items:center;">';
  h += '<span class="riepilogo-counter" id="riepilogo-counter">' + checked + '/' + (cart.items||[]).length + '</span>';
  h += '<button onclick="closeRiepilogo()" class="riepilogo-close">✕</button>';
  h += '</div></div>';

  // Lista articoli
  h += '<div class="riepilogo-list">';
  (cart.items||[]).forEach(function(it, idx){
    var isChecked = !!checks[idx];
    var codM7 = it.codM ? (String(it.codM).match(/^\d+$/) ? String(it.codM).padStart(7,'0') : it.codM) : '';
    var sub = (parsePriceIT(it.prezzoUnit) * (parseFloat(it.qty)||0)).toFixed(2);
    h += '<label class="riepilogo-row' + (isChecked ? ' riepilogo-row-done' : '') + '" onclick="toggleRiepilogoCheck(\'' + cartId + '\',' + idx + ')">';
    h += '<div class="riepilogo-check' + (isChecked ? ' riepilogo-check-on' : '') + '">';
    h += isChecked ? '✓' : '';
    h += '</div>';
    h += '<div class="riepilogo-item-info">';
    h += '<div class="riepilogo-item-name">' + esc(it.desc || '—') + '</div>';
    var meta = '';
    if(codM7) meta += '<span style="color:var(--accent);">' + esc(codM7) + '</span>';
    if(codM7 && it.codF) meta += ' · ';
    if(it.codF) meta += '<span style="color:#fc8181;">' + esc(it.codF) + '</span>';
    if(meta) h += '<div class="riepilogo-item-code">' + meta + '</div>';
    if(it.nota) h += '<div class="riepilogo-item-nota">📝 ' + esc(it.nota) + '</div>';
    h += '</div>';
    h += '<div class="riepilogo-item-right">';
    h += '<div class="riepilogo-item-qty">' + (parseFloat(it.qty)||0) + ' ' + (it.unit||'pz') + '</div>';
    h += '<div class="riepilogo-item-sub">€' + sub + '</div>';
    h += '</div>';
    h += '</label>';
  });
  h += '</div>'; // fine list

  // Footer modal
  h += '<div class="riepilogo-footer">';
  h += '<button onclick="resetRiepilogoChecks(\'' + cartId + '\')" class="riepilogo-btn-reset">↺ Reset</button>';
  h += '<button onclick="closeRiepilogo()" class="riepilogo-btn-close">Chiudi</button>';
  h += '</div>';
  h += '</div>'; // fine modal

  ov.innerHTML = h;
}

function toggleRiepilogoCheck(cartId, idx){
  if(!_riepilogoChecks[cartId]) _riepilogoChecks[cartId] = {};
  _riepilogoChecks[cartId][idx] = !_riepilogoChecks[cartId][idx];
  // Aggiorna visivamente senza re-render completo
  var cart = carrelli.find(function(c){ return c.id === cartId; });
  var total = cart ? (cart.items||[]).length : 0;
  var checked = Object.keys(_riepilogoChecks[cartId]).filter(function(k){ return _riepilogoChecks[cartId][k]; }).length;
  var counter = document.getElementById('riepilogo-counter');
  if(counter) counter.textContent = checked + '/' + total;
  // Toggle classi sulla riga
  openRiepilogoOrdine(cartId);
}

function resetRiepilogoChecks(cartId){
  _riepilogoChecks[cartId] = {};
  openRiepilogoOrdine(cartId);
}

function closeRiepilogo(){
  var ov = document.getElementById('riepilogo-overlay');
  if(ov){ ov.className = 'overlay'; }
}

// --- RIPETI ORDINE DALLO STORICO -------------------------------
function ripetiOrdine(ordIdx,cartId){
  var ord=ordini[ordIdx];
  var cart=carrelli.find(function(c){return c.id===cartId;});
  if(!ord||!cart)return;
  (ord.items||[]).forEach(function(it){
    var copy=JSON.parse(JSON.stringify(it));
    delete copy._checked;delete copy._scaglioniAperti;
    (cart.items=cart.items||[]).push(copy);
  });
  saveCarrelli();renderCartTabs();
  feedbackAdd();
  showToastGen('green','- '+(ord.items||[]).length+' articoli aggiunti dallo storico');
}

// --- INVIA ORDINE -------------------------------------------
// ══════════════════════════════════════════════════════════════════════════════
// SUB-TAB "ORDINARE" — pannello scorrevole dal basso con articoli da ordinare
// Si apre con doppio tap sull'icona carrello nel menu in basso (DOM = Document Object Model).
// Raggruppa gli articoli contrassegnati "daOrdinare" per fornitore (codF).
// ══════════════════════════════════════════════════════════════════════════════

// Variabile per gestire il doppio tap sull'icona del carrello nella bottom bar
var _cartDoubleTapTimer = null;

// Intercetta tap sull'icona carrello: singolo tap = vai alla tab, doppio tap = apri sub-tab ordinare
function handleCartTap(){
  if(_cartDoubleTapTimer){
    // Secondo tap rilevato entro 350ms: apre la Sub-Tab Ordinare
    clearTimeout(_cartDoubleTapTimer);
    _cartDoubleTapTimer = null;
    apriSubTabOrdinare();
  } else {
    // Primo tap: aspetta 350ms per vedere se arriva il secondo
    _cartDoubleTapTimer = setTimeout(function(){
      _cartDoubleTapTimer = null;
      goTab('tc'); // tap singolo: vai normalmente al carrello (tab tc)
    }, 350);
  }
}

// Apre la Sub-Tab "Ordinare": pannello che scorre dal basso verso l'alto
// coprendo parzialmente il carrello, con lista articoli da ordinare per fornitore.
function apriSubTabOrdinare(){
  // Raccoglie tutti gli articoli "daOrdinare" da tutti i carrelli attivi
  var daOrdinare = [];
  carrelli.forEach(function(cart){
    (cart.items||[]).forEach(function(it){
      if(it.daOrdinare){
        daOrdinare.push({
          desc: it.desc || '—',
          codM: it.codM || '',   // codice interno (magazzino)
          codF: it.codF || '',   // codice fornitore (recuperato da Firebase NoSQL)
          qty:  it.qty  || 1,
          unit: it.unit || 'pz',
          cartNome: cart.nome || ''
        });
      }
    });
  });

  // Raggruppa per codice fornitore (codF); se assente usa "Fornitore sconosciuto"
  var gruppi = {};
  daOrdinare.forEach(function(it){
    var key = it.codF || '__nessuno__';
    if(!gruppi[key]) gruppi[key] = { codF: it.codF, articoli: [] };
    gruppi[key].articoli.push(it);
  });

  // Costruisce l'HTML del pannello
  var h = '';
  h += '<div id="subtab-ordinare-handle"><div class="subtab-handle-bar"></div></div>';
  h += '<div class="subtab-ordinare-header">';
  h += '<span style="font-size:18px;font-weight:900;color:var(--accent);">📦 Da Ordinare</span>';
  h += '<button onclick="chiudiSubTabOrdinare()" style="background:none;border:none;color:var(--muted);font-size:22px;cursor:pointer;padding:4px;">✕</button>';
  h += '</div>';

  if(!daOrdinare.length){
    h += '<div style="padding:40px 20px;text-align:center;color:var(--muted);">Nessun articolo marcato "Da ordinare".<br><small>Premi 📦 Imballo su un articolo del carrello.</small></div>';
  } else {
    h += '<div class="subtab-ordinare-body">';
    // Itera i gruppi per fornitore
    Object.keys(gruppi).forEach(function(key){
      var g = gruppi[key];
      var nomeForn = g.codF || 'Fornitore sconosciuto';
      h += '<div class="subtab-forn-group">';
      h += '<div class="subtab-forn-title">';
      h += '<span style="font-weight:800;color:var(--text);">🏭 ' + esc(nomeForn) + '</span>';
      if(g.codF) h += '<span style="font-size:9px;color:var(--muted);margin-left:6px;">COD: ' + esc(g.codF) + '</span>';
      h += '</div>';
      g.articoli.forEach(function(it){
        h += '<div class="subtab-ordinare-item">';
        h += '<div style="flex:1;min-width:0;">';
        h += '<div style="font-size:13px;font-weight:700;color:var(--text);">' + esc(it.desc) + '</div>';
        if(it.codM) h += '<div style="font-size:10px;color:var(--accent);">' + esc(it.codM) + '</div>';
        h += '<div style="font-size:10px;color:var(--muted);">Carrello: ' + esc(it.cartNome) + '</div>';
        h += '</div>';
        h += '<div style="text-align:right;font-weight:700;color:var(--accent);">' + it.qty + ' ' + esc(it.unit) + '</div>';
        h += '</div>';
      });
      h += '</div>';
    });
    h += '</div>';
  }

  // Tasto grande CONFERMA ORDINE A FORNITORI in fondo al pannello
  h += '<div class="subtab-ordinare-footer">';
  h += '<button class="subtab-confirm-btn" onclick="confermaOrdineAFornitori()">';
  h += '📋 CONFERMA ORDINE A FORNITORI</button>';
  h += '</div>';

  // Crea o aggiorna il pannello nel DOM (Document Object Model = struttura HTML della pagina)
  var panel = document.getElementById('subtab-ordinare');
  if(!panel){
    panel = document.createElement('div');
    panel.id = 'subtab-ordinare';
    document.body.appendChild(panel);
  }
  panel.innerHTML = h;
  panel.classList.add('open');

  // Gesture: swipe verso il basso chiude il pannello
  var startY = 0;
  panel.addEventListener('touchstart', function(e){ startY = e.touches[0].clientY; }, {passive:true});
  panel.addEventListener('touchend', function(e){
    var dy = e.changedTouches[0].clientY - startY;
    if(dy > 60) chiudiSubTabOrdinare(); // swipe giù > 60px = chiudi
  }, {passive:true});
}

// Chiude la Sub-Tab Ordinare rimuovendo la classe "open"
function chiudiSubTabOrdinare(){
  var panel = document.getElementById('subtab-ordinare');
  if(panel) panel.classList.remove('open');
}

// Conferma e invia l'ordine a tutti i fornitori con articoli "daOrdinare"
// Per ora mostra un riepilogo testuale e notifica — espandibile con invio email/WhatsApp
function confermaOrdineAFornitori(){
  var daOrd = [];
  carrelli.forEach(function(cart){
    (cart.items||[]).forEach(function(it){
      if(it.daOrdinare) daOrd.push(it);
    });
  });
  if(!daOrd.length){ showToastGen('yellow','Nessun articolo da ordinare'); return; }
  showToastGen('green','✅ Ordine confermato a ' + daOrd.length + ' articoli');
  chiudiSubTabOrdinare();
}

function inviaOrdine(cartId){
  var cart=carrelli.find(function(c){return c.id===cartId;});
  if(!cart||!(cart.items||[]).length){showToastGen('red','-- Carrello vuoto!');return;}
  var tot=(cart.items||[]).reduce(function(s,it){return s+(parsePriceIT(it.prezzoUnit)*parseFloat(it.qty||0));},0);
  var numOrd=getNextOrdNum();
  var ord={
    id:'ord_'+Date.now(),
    numero:numOrd,
    nomeCliente:cart.nome,
    ora:new Date().toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'}),
    data:new Date().toLocaleDateString('it-IT'),
    createdAt:new Date().toISOString(),
    items:JSON.parse(JSON.stringify(cart.items)),
    nota:cart.nota||'',
    totale:tot.toFixed(2),
    stato:'nuovo',
    scontoGlobale:cart.scontoGlobale||null,
    commesso:cart.commesso||''
  };
  ordini.unshift(ord);
  saveOrdini();

  // -- Scarico automatico magazzino --
  var sottoScortaList=[];
  (cart.items||[]).forEach(function(it){
    if(it.rowIdx===undefined||it.rowIdx===null)return;
    var m=magazzino[it.rowIdx];
    if(!m)return;
    var prevQty=m.qty!==undefined&&m.qty!==''?Number(m.qty):null;
    if(prevQty===null)return; // se non ha qty impostata, non scaricare
    var venduto=parseFloat(it.qty||0);
    var nuovaQty=Math.max(0, prevQty - venduto);
    m.qty=nuovaQty;
    lsSet(MAGK, magazzino);
    // Controlla soglia
    var soglia=getSoglia(it.rowIdx);
    if(nuovaQty<=soglia){
      var desc=(rows[it.rowIdx]&&rows[it.rowIdx].desc)||it.desc||'Articolo';
      sottoScortaList.push({desc:desc,qty:nuovaQty,soglia:soglia});
    }
  });
  // Notifica sotto scorta
  if(sottoScortaList.length){
    var msg='- SOTTO SCORTA:\n';
    sottoScortaList.forEach(function(s){
      msg+=s.desc+' - rimasti '+s.qty+' (min: '+s.soglia+')\n';
    });
    setTimeout(function(){
      showToastGen('red',msg.trim());
    },1500);
  }

  // Mantieni il carrello come "inviato" con lucchetto
  cart.stato='inviato';
  cart.ordId=ord.id;
  cart.locked=true;
  saveCarrelli();
  _lastAddedItem=null;
  feedbackSend();
  renderCartTabs();
  showToastGen('green','- Ordine #'+numOrd+' inviato! - '+ord.nomeCliente+' - - '+ord.totale);
}

// --- CARRELLO INVIATO - SBLOCCA / MODIFICA / AGGIORNA -------
function cartUnlock(cartId){
  var cart=carrelli.find(function(c){return c.id===cartId;});
  if(!cart)return;
  cart.stato='modifica';
  cart.locked=false;
  saveCarrelli();renderCartTabs();
  showToastGen('purple','- Carrello sbloccato - modifica e aggiorna');
}

function aggiornaOrdine(cartId){
  var cart=carrelli.find(function(c){return c.id===cartId;});
  if(!cart||!cart.ordId)return;
  var ord=ordini.find(function(o){return o.id===cart.ordId;});
  if(!ord){showToastGen('red','Ordine non trovato');return;}
  // Aggiorna ordine con i dati modificati del carrello
  ord.items=JSON.parse(JSON.stringify(cart.items));
  ord.nota=cart.nota||'';
  var tot=(cart.items||[]).reduce(function(s,it){return s+(parsePriceIT(it.prezzoUnit)*parseFloat(it.qty||0));},0);
  ord.totale=tot.toFixed(2);
  ord.scontoGlobale=cart.scontoGlobale||null;
  ord.modificato=true;
  ord.modificatoAt=new Date().toLocaleString('it-IT');
  ord.modificatoAtISO=new Date().toISOString();
  saveOrdini();
  // Rimetti il carrello come inviato
  cart.stato='inviato';
  cart.locked=true;
  saveCarrelli();
  feedbackSend();
  renderCartTabs();
  showToastGen('purple','- Ordine #'+(ord.numero||'')+' aggiornato!');
}

function annullaModifica(cartId){
  var cart=carrelli.find(function(c){return c.id===cartId;});
  if(!cart)return;
  // Ripristina items dall'ordine originale
  if(cart.ordId){
    var ord=ordini.find(function(o){return o.id===cart.ordId;});
    if(ord){
      cart.items=JSON.parse(JSON.stringify(ord.items));
      cart.nota=ord.nota||'';
    }
  }
  cart.stato='inviato';
  cart.locked=true;
  saveCarrelli();
  renderCartTabs();
  showToastGen('green','- Modifiche annullate');
}

// --- MODIFICA ORDINE DAL TAB ORDINI ---------------------------
var _editOrdIdx=null;
var _editOrdItems=null;

function modificaOrdineDaTab(gi){
  var ord=ordini[gi];
  if(!ord)return;
  _editOrdIdx=gi;
  _editOrdItems=JSON.parse(JSON.stringify(ord.items));
  renderEditOrdine();
  document.getElementById('edit-ord-overlay').style.display='flex';
}

function renderEditOrdine(){
  var ord=ordini[_editOrdIdx];
  if(!ord)return;
  var items=_editOrdItems;
  var tot=items.reduce(function(s,it){return s+(parsePriceIT(it.prezzoUnit)*parseFloat(it.qty||0));},0);
  var h='';
  h+='<div style="font-size:15px;font-weight:900;color:#b794f4;margin-bottom:4px;">-- Modifica ordine'+(ord.numero?' #'+ord.numero:'')+'</div>';
  h+='<div style="font-size:11px;color:var(--muted);margin-bottom:12px;">'+esc(ord.nomeCliente)+' - '+ord.data+' '+ord.ora+'</div>';
  items.forEach(function(it,idx){
    var p=parsePriceIT(it.prezzoUnit);
    var q=parseFloat(it.qty||0);
    var sub=(p*q).toFixed(2);
    var isSc=it.scampolo||false;
    var isFR=it.fineRotolo||false;
    h+='<div style="padding:8px;border:1px solid #2a2a2a;border-radius:8px;margin-bottom:6px;background:#1a1a1a;">';
    h+='<div style="font-size:12px;font-weight:700;color:var(--text);margin-bottom:4px;">'+esc(it.desc)+'</div>';
    h+='<div style="display:flex;gap:6px;align-items:center;margin-bottom:4px;">';
    h+='<button onclick="_editOrdDelta('+idx+',-1)" style="width:28px;height:28px;border-radius:6px;border:none;background:#2a2a2a;color:var(--text);font-size:16px;font-weight:bold;cursor:pointer;">-</button>';
    h+='<span style="min-width:32px;text-align:center;font-size:14px;font-weight:900;color:var(--accent);">'+q+'</span>';
    h+='<button onclick="_editOrdDelta('+idx+',1)" style="width:28px;height:28px;border-radius:6px;border:none;background:#2a2a2a;color:var(--text);font-size:16px;font-weight:bold;cursor:pointer;">+</button>';
    h+='<span style="font-size:10px;color:#555;">-</span>';
    h+='<input type="text" value="'+esc(it.prezzoUnit)+'" style="width:60px;padding:4px 6px;border:1px solid #333;border-radius:5px;background:#111;color:var(--accent);font-size:12px;font-weight:700;text-align:right;" onchange="_editOrdPrezzo('+idx+',this.value)">';
    h+='<span style="font-size:13px;font-weight:900;color:var(--accent);margin-left:auto;">-'+sub+'</span>';
    h+='</div>';
    var scLabel=isSc?'--':isFR?'-':'--';
    var scBrd=isSc?'var(--accent)':isFR?'#f6ad55':'#2a2a2a';
    var scBg=isSc?'var(--accent)':isFR?'rgba(246,173,85,.15)':'transparent';
    var scClr=isSc?'#111':isFR?'#f6ad55':'#555';
    h+='<div style="display:flex;gap:5px;align-items:center;">';
    h+='<button onclick="_editOrdCycleScampolo('+idx+')" style="padding:3px 8px;border-radius:5px;border:1px solid '+scBrd+';background:'+scBg+';color:'+scClr+';font-size:10px;cursor:pointer;">'+scLabel+'</button>';
    if(isSc||isFR){
      h+='<input type="number" min="0" max="100" value="'+(it._scontoApplicato||'')+'" placeholder="%" style="width:40px;padding:3px 4px;border:1px solid #333;border-radius:5px;background:#111;color:#68d391;font-size:11px;font-weight:700;text-align:center;" onchange="_editOrdSconto('+idx+',this.value)">%';
      if(it._prezzoOriginale)h+='<span style="font-size:9px;color:#555;text-decoration:line-through;">-'+esc(it._prezzoOriginale)+'</span>';
    }
    h+='<button onclick="_editOrdRemove('+idx+')" style="margin-left:auto;padding:3px 6px;border-radius:5px;border:none;background:transparent;color:#e53e3e;font-size:12px;cursor:pointer;">-</button>';
    h+='</div></div>';
  });
  h+='<div style="display:flex;justify-content:space-between;margin-top:10px;padding:8px;background:#111;border-radius:8px;border:1px solid var(--accent)33;">';
  h+='<span style="font-size:14px;font-weight:700;color:var(--muted);">TOTALE</span>';
  h+='<span style="font-size:18px;font-weight:900;color:var(--accent);">- '+tot.toFixed(2)+'</span></div>';
  h+='<div style="display:flex;gap:8px;margin-top:12px;">';
  h+='<button onclick="salvaEditOrdine()" style="flex:1;padding:12px;border-radius:10px;border:none;background:#805ad5;color:#fff;font-size:14px;font-weight:900;cursor:pointer;">- AGGIORNA</button>';
  h+='<button onclick="chiudiEditOrdine()" style="padding:12px 16px;border-radius:10px;border:1px solid #444;background:transparent;color:#888;font-size:13px;cursor:pointer;">-</button></div>';
  document.getElementById('edit-ord-body').innerHTML=h;
}
function _editOrdDelta(idx,d){_editOrdItems[idx].qty=Math.max(0.5,Math.round((parseFloat(_editOrdItems[idx].qty||0)+d)*10)/10);renderEditOrdine();}
function _editOrdPrezzo(idx,val){_editOrdItems[idx].prezzoUnit=val;renderEditOrdine();}
function _editOrdRemove(idx){_editOrdItems.splice(idx,1);renderEditOrdine();}
function _editOrdCycleScampolo(idx){
  var it=_editOrdItems[idx];
  if(!it.scampolo&&!it.fineRotolo){
    if(!it._prezzoOriginale)it._prezzoOriginale=it.prezzoUnit;
    it.scampolo=true;it.fineRotolo=false;it._scontoTipo='scampolo';
    if(!it._scontoApplicato)it._scontoApplicato=30;
    _applicaScontoScampolo(it);
  } else if(it.scampolo){
    it.scampolo=false;it.fineRotolo=true;it._scontoTipo='rotolo';
    if(!it._scontoApplicato||it._scontoApplicato===30)it._scontoApplicato=50;
    _applicaScontoScampolo(it);
  } else {
    it.scampolo=false;it.fineRotolo=false;
    if(it._prezzoOriginale){it.prezzoUnit=it._prezzoOriginale;delete it._prezzoOriginale;}
    delete it._scontoTipo;delete it._scontoApplicato;
  }
  renderEditOrdine();
}
function _editOrdSconto(idx,val){
  _editOrdItems[idx]._scontoApplicato=parseFloat(val)||0;
  _applicaScontoScampolo(_editOrdItems[idx]);
  renderEditOrdine();
}
function salvaEditOrdine(){
  var ord=ordini[_editOrdIdx];if(!ord)return;
  ord.items=JSON.parse(JSON.stringify(_editOrdItems));
  var tot=_editOrdItems.reduce(function(s,it){return s+(parsePriceIT(it.prezzoUnit)*parseFloat(it.qty||0));},0);
  ord.totale=tot.toFixed(2);
  ord.modificato=true;ord.modificatoAt=new Date().toLocaleString('it-IT');ord.modificatoAtISO=new Date().toISOString();
  saveOrdini();
  var linkedCart=carrelli.find(function(c){return c.ordId===ord.id;});
  if(linkedCart){linkedCart.items=JSON.parse(JSON.stringify(_editOrdItems));saveCarrelli();}
  chiudiEditOrdine();feedbackSend();renderOrdini();
  showToastGen('purple','- Ordine #'+(ord.numero||'')+' aggiornato!');
}
function chiudiEditOrdine(){document.getElementById('edit-ord-overlay').style.display='none';_editOrdIdx=null;_editOrdItems=null;}

// --- ORDINI ---------------------------------------------------
function filterOrdini(f){
  ordFiltro=f;
  ['nuovo','lavorazione','pronto','completato','tutti'].forEach(function(x){
    var btn=document.getElementById('ord-f-'+x);if(!btn)return;
    var on=(x===f);
    btn.style.background=on?'var(--accent)':'transparent';
    btn.style.color=on?'#111':'var(--muted)';
    btn.style.borderColor=on?'var(--accent)':'var(--border)';
  });
  renderOrdini();
}
function setStatoOrdine(gi,stato){
  var o=ordini[gi];if(!o)return;
  o.stato=stato;
  if(!o.statiLog)o.statiLog={};
  o.statiLog[stato]={ora:new Date().toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'}),data:new Date().toLocaleDateString('it-IT')};
  saveOrdini();renderOrdini();
}
function deleteOrdine(gi){
  showConfirm('Eliminare questo ordine?',function(){
    ordini.splice(gi,1);saveOrdini();renderOrdini();showToastGen('red','- Eliminato');
  });
}
function clearOrdiniCompletati(){
  showConfirm('Rimuovere tutti i completati?',function(){
    ordini=ordini.filter(function(o){return o.stato!=='completato';});saveOrdini();renderOrdini();
  });
}

// [SECTION: ORDINI] --------------------------------------------------------
//  Render lista ordini, filtri, dettaglio ordine, vista cassa
function renderOrdini(){
  var list=document.getElementById('ord-list');if(!list)return;
  updateOrdCounter();
  var searchVal=(document.getElementById('ord-search')||{}).value||'';
  var searchLow=searchVal.trim().toLowerCase();

  var filtered=ordini.filter(function(o){
    if(ordFiltro!=='tutti'&&o.stato!==ordFiltro)return false;
    if(!searchLow)return true;
    var hay=(o.nomeCliente||'');
    (o.items||[]).forEach(function(it){hay+=' '+(it.desc||'')+' '+(it.codF||'')+' '+(it.codM||'');});
    return hay.toLowerCase().indexOf(searchLow)>=0;
  });

  filtered.sort(function(a,b){return(b.createdAt||'').localeCompare(a.createdAt||'');});

  if(!filtered.length){
    list.innerHTML='<div style="text-align:center;padding:60px 20px;color:#444;"><div style="font-size:40px;margin-bottom:8px;">-</div>'+(searchLow?'Nessun risultato':'Nessun ordine')+'</div>';
    return;
  }

  var SC={nuovo:'#f5c400',lavorazione:'#3182ce',pronto:'#dd6b20',completato:'#38a169'};
  var SI={nuovo:'-',lavorazione:'-',pronto:'-',completato:'-'};
  var SL={nuovo:'Nuovo',lavorazione:'In corso',pronto:'Pronto',completato:'Fatto'};

  // Raggruppa per data
  var gruppi={},gruppiOrd=[];
  filtered.forEach(function(o){
    var dk=o.data||'-';
    var iso=o.createdAt||'';
    if(iso){
      var d=new Date(iso),oggi=new Date();oggi.setHours(0,0,0,0);
      var ieri=new Date(oggi);ieri.setDate(ieri.getDate()-1);
      var dD=new Date(d);dD.setHours(0,0,0,0);
      if(dD.getTime()===oggi.getTime())dk='Oggi';
      else if(dD.getTime()===ieri.getTime())dk='Ieri';
      else dk=d.toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long'});
    }
    if(!gruppi[dk]){gruppi[dk]=[];gruppiOrd.push(dk);}
    gruppi[dk].push(o);
  });

  var h='';
  gruppiOrd.forEach(function(dk){
    // Separatore data — più visibile
    h+='<div style="font-size:11px;font-weight:800;color:#666;text-transform:uppercase;letter-spacing:1.5px;padding:16px 2px 8px;display:flex;align-items:center;gap:8px;">';
    h+='<span style="flex:1;height:1px;background:#2a2a2a;display:block;"></span>';
    h+='<span>'+esc(dk)+'</span>';
    h+='<span style="flex:1;height:1px;background:#2a2a2a;display:block;"></span>';
    h+='</div>';

    gruppi[dk].forEach(function(ord){
      var gi=ordini.indexOf(ord);
      var ost=ord.stato;
      var sc=SC[ost]||'#555';
      var nArt=(ord.items||[]).length;
      var tot=0;
      (ord.items||[]).forEach(function(it){tot+=parsePriceIT(it.prezzoUnit)*parseFloat(it.qty||0);});

      // ── CARD ────────────────────────────────────────────────────────────────
      h+='<div style="background:#1c1c1c;border-radius:14px;margin-bottom:10px;overflow:hidden;border:1px solid #2a2a2a;border-left:5px solid '+sc+';box-shadow:0 2px 8px rgba(0,0,0,.3);">';

      // ── HEADER: cliente + numero ordine ─────────────────────────────────────
      h+='<div style="padding:14px 14px 10px;display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">';
      h+='<div style="flex:1;min-width:0;">';
      h+='<div style="font-size:18px;font-weight:900;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+esc(ord.nomeCliente||'—')+'</div>';
      h+='<div style="font-size:12px;color:#666;margin-top:3px;display:flex;align-items:center;gap:6px;">';
      if(ord.numero) h+='<span style="background:#2a2a2a;color:var(--accent);font-size:11px;font-weight:800;padding:1px 7px;border-radius:6px;">#'+ord.numero+'</span>';
      h+=esc(ord.data||'')+(ord.ora?' · '+ord.ora:'');
      h+='</div></div>';
      // Stato + totale a destra
      h+='<div style="text-align:right;flex-shrink:0;">';
      h+='<div style="display:inline-flex;align-items:center;gap:4px;padding:5px 12px;border-radius:20px;font-size:12px;font-weight:800;background:'+sc+'22;color:'+sc+';border:1px solid '+sc+'55;">'+SL[ost]+'</div>';
      h+='<div style="font-size:24px;font-weight:900;color:var(--accent);line-height:1.1;margin-top:5px;">€'+tot.toFixed(2)+'</div>';
      h+='<div style="font-size:11px;color:#555;">'+nArt+' art.</div>';
      h+='</div></div>';

      // ── NOTA ORDINE ──────────────────────────────────────────────────────────
      if(ord.nota){
        h+='<div style="margin:0 12px 10px;padding:8px 12px;background:#2a1800;border-left:3px solid #f6ad55;border-radius:6px;font-size:12px;color:#f6ad55;font-weight:600;">📝 '+esc(ord.nota)+'</div>';
      }

      // ── LISTA ARTICOLI ───────────────────────────────────────────────────────
      h+='<div style="padding:0 14px 10px;">';
      (ord.items||[]).forEach(function(it){
        var pu=parsePriceIT(it.prezzoUnit);
        var q=parseFloat(it.qty||0);
        var sub=(pu*q).toFixed(2);
        h+='<div style="display:flex;align-items:center;gap:8px;padding:7px 0;border-bottom:1px solid #242424;">';
        // Quantità badge
        h+='<span style="background:#2e2e2e;color:var(--accent);font-size:13px;font-weight:900;padding:4px 8px;border-radius:6px;flex-shrink:0;min-width:32px;text-align:center;">'+q+'</span>';
        // Descrizione
        h+='<div style="flex:1;min-width:0;">';
        h+='<div style="font-size:14px;font-weight:700;color:#e8e8e8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+esc(it.desc||'')+'</div>';
        var meta='';
        if(it.codM) meta+='<span style="color:var(--accent);font-size:10px;font-weight:700;">'+esc(it.codM)+'</span> ';
        if(it.codF) meta+='<span style="color:#fc8181;font-size:10px;font-weight:700;">'+esc(it.codF)+'</span>';
        if(meta) h+='<div style="margin-top:1px;">'+meta+'</div>';
        if(it.nota) h+='<div style="font-size:11px;color:#f6ad55;margin-top:2px;">📝 '+esc(it.nota)+'</div>';
        if(it.daOrdinare) h+='<div style="font-size:10px;color:#fc8181;font-weight:800;margin-top:1px;">🚚 DA ORDINARE</div>';
        h+='</div>';
        // Subtotale
        h+='<span style="font-size:14px;font-weight:900;color:var(--accent);flex-shrink:0;">€'+sub+'</span>';
        h+='</div>';
      });
      h+='</div>';

      // ── BARRA AZIONI MOBILE-FIRST ────────────────────────────────────────────
      // Riga 1: bottoni principali grandi (min 48px, pollice-friendly)
      h+='<div style="padding:10px 12px 6px;display:flex;gap:8px;">';
      if(ost!=='completato'){
        h+='<button onclick="setStatoOrdine('+gi+',\'completato\')" style="flex:1;min-height:48px;border-radius:12px;border:none;background:#38a169;color:#fff;font-size:16px;font-weight:900;cursor:pointer;touch-action:manipulation;display:flex;align-items:center;justify-content:center;gap:6px;">✅ Fatto</button>';
      } else {
        h+='<button onclick="setStatoOrdine('+gi+',\'nuovo\')" style="flex:1;min-height:48px;border-radius:12px;border:2px solid #f5c40055;background:rgba(245,196,0,.08);color:#f5c400;font-size:14px;font-weight:800;cursor:pointer;touch-action:manipulation;">↩️ Riapri</button>';
      }
      h+='<button onclick="openCassa('+gi+')" style="flex:1;min-height:48px;border-radius:12px;border:2px solid var(--accent)44;background:rgba(245,196,0,.08);color:var(--accent);font-size:14px;font-weight:800;cursor:pointer;touch-action:manipulation;">💰 Cassa</button>';
      h+='</div>';
      // Riga 2: azioni secondarie più piccole ma ancora touch-friendly
      h+='<div style="padding:0 12px 10px;display:flex;gap:6px;flex-wrap:wrap;">';
      h+='<button onclick="modificaOrdineDaTab('+gi+')" style="flex:1;min-height:40px;border-radius:10px;border:1px solid #805ad544;background:transparent;color:#b794f4;font-size:13px;font-weight:700;cursor:pointer;touch-action:manipulation;">✏️ Modifica</button>';
      h+='<button onclick="stampaRicevuta(ordini['+gi+'].items,ordini['+gi+'].nomeCliente,ordini['+gi+'].totale,ordini['+gi+'].nota)" style="min-height:40px;padding:0 14px;border-radius:10px;border:1px solid #33333388;background:transparent;color:#666;font-size:13px;cursor:pointer;touch-action:manipulation;">🖨️</button>';
      if(ost!=='lavorazione') h+='<button onclick="setStatoOrdine('+gi+',\'lavorazione\')" style="min-height:40px;padding:0 12px;border-radius:10px;border:1px solid #3182ce44;background:transparent;color:#63b3ed;font-size:12px;font-weight:700;cursor:pointer;touch-action:manipulation;">⏳</button>';
      if(ost!=='pronto') h+='<button onclick="setStatoOrdine('+gi+',\'pronto\')" style="min-height:40px;padding:0 12px;border-radius:10px;border:1px solid #dd6b2044;background:transparent;color:#f6ad55;font-size:12px;font-weight:700;cursor:pointer;touch-action:manipulation;">📦</button>';
      h+='<button onclick="deleteOrdine('+gi+')" style="min-height:40px;padding:0 12px;border-radius:10px;border:1px solid #e53e3e33;background:transparent;color:#e53e3e88;font-size:12px;cursor:pointer;touch-action:manipulation;margin-left:auto;">🗑️</button>';
      h+='</div>';

      h+='</div>'; // fine card
    });
  });

  list.innerHTML=h;
}
// --- AUTO-REFRESH ORDINI (polling localStorage ogni 5s) -------
var _autoRefreshInterval=null;
var _lastOrdiniJson='';

function startAutoRefresh(){
  _lastOrdiniJson=JSON.stringify(ordini);
  _autoRefreshInterval=setInterval(function(){
    var fresh=lsGet(ORDK,[]);
    var freshJson=JSON.stringify(fresh);
    if(freshJson!==_lastOrdiniJson){
      _lastOrdiniJson=freshJson;
      ordini=fresh;
      updateOrdBadge();
      updateOrdCounter();
      // Se la tab ordini - visibile, aggiorna
      var toTab=document.getElementById('to');
      if(toTab&&toTab.classList.contains('active')){
        renderOrdini();
      }
      // Notifica sonora per nuovi ordini
      var nuovi=ordini.filter(function(o){return o.stato==='nuovo';}).length;
      var vecchiNuovi=JSON.parse(_lastOrdiniJson||'[]').filter(function(o){return o.stato==='nuovo';}).length;
      if(nuovi>vecchiNuovi){
        feedbackSend();
      }
    }
  },5000);
}

// --- CONTATORE ORDINI IN ATTESA -------------------------------
function updateOrdCounter(){
  var banner=document.getElementById('ord-counter-banner');
  if(!banner)return;
  var nuovi=ordini.filter(function(o){return o.stato==='nuovo';}).length;
  var inCorso=ordini.filter(function(o){return o.stato==='lavorazione';}).length;
  var pronti=ordini.filter(function(o){return o.stato==='pronto';}).length;
  if(nuovi===0&&inCorso===0&&pronti===0){
    banner.style.display='none';
    return;
  }
  banner.style.display='block';
  var h='<div style="display:flex;gap:8px;flex-wrap:wrap;">';
  if(nuovi>0){
    h+='<div class="ord-counter-pulse" style="background:linear-gradient(135deg,#1a1a00,#2a2a00);border:2px solid var(--accent);border-radius:12px;padding:12px 16px;text-align:center;flex:1;min-width:80px;">';
    h+='<div style="font-size:28px;font-weight:900;color:var(--accent);">'+nuovi+'</div>';
    h+='<div style="font-size:10px;color:var(--accent);font-weight:700;text-transform:uppercase;letter-spacing:.5px;">- Nuov'+(nuovi===1?'o':'i')+'</div>';
    h+='</div>';
  }
  if(inCorso>0){
    h+='<div style="background:#0d1a2a;border:1px solid #3182ce44;border-radius:12px;padding:12px 16px;text-align:center;flex:1;min-width:80px;">';
    h+='<div style="font-size:28px;font-weight:900;color:#63b3ed;">'+inCorso+'</div>';
    h+='<div style="font-size:10px;color:#63b3ed;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">- In corso</div>';
    h+='</div>';
  }
  if(pronti>0){
    h+='<div style="background:#1a1500;border:1px solid #dd6b2044;border-radius:12px;padding:12px 16px;text-align:center;flex:1;min-width:80px;">';
    h+='<div style="font-size:28px;font-weight:900;color:#f6ad55;">'+pronti+'</div>';
    h+='<div style="font-size:10px;color:#f6ad55;font-weight:700;text-transform:uppercase;letter-spacing:.5px;">- Pront'+(pronti===1?'o':'i')+'</div>';
    h+='</div>';
  }
  h+='</div>';
  banner.innerHTML=h;
}

// --- VISTA CASSA (fullscreen per tablet/schermo cassa) -------
var _cassaOrdId=null;

function openCassa(gi){
  var ord=ordini[gi];
  if(!ord)return;
  _cassaOrdId=ord.id;
  document.getElementById('cassa-cliente').textContent=ord.nomeCliente||'Cliente';
  var infoTxt=(ord.numero?'Ordine #'+ord.numero+' - ':'')+ord.data+' '+ord.ora;
  if(ord.commesso)infoTxt+=' - - '+ord.commesso;
  document.getElementById('cassa-info').textContent=infoTxt;
  document.getElementById('cassa-info').style.fontSize='11px';
  document.getElementById('cassa-cliente').style.fontSize='18px';
  var tot=0;
  var nItems=(ord.items||[]).length;
  var bodyH='';
  (ord.items||[]).forEach(function(it,i){
    var pu=parsePriceIT(it.prezzoUnit);
    var q=parseFloat(it.qty||0);
    var sub=(pu*q).toFixed(2);
    tot+=pu*q;
    bodyH+='<div class="cassa-item" style="gap:10px;">';
    bodyH+='<div style="flex:1;min-width:0;">';
    bodyH+='<div style="font-size:14px;font-weight:700;color:var(--text);">'+esc(it.desc||'')+'</div>';
    bodyH+='<div style="font-size:11px;color:var(--muted);margin-top:2px;">';
    if(it.codM)bodyH+='<span style="color:var(--accent);font-weight:700;">'+esc(it.codM)+'</span> ';
    if(it.codF)bodyH+='<span style="color:#fc8181;">'+esc(it.codF)+'</span>';
    if(it.nota)bodyH+='<div style="padding:3px 8px;margin-top:2px;background:#2a1800;border-left:3px solid #f6ad55;border-radius:3px;font-size:10px;color:#f6ad55;font-weight:600;">- '+esc(it.nota)+'</div>';
    bodyH+='</div>';
    if(it.scampolo)bodyH+='<div style="font-size:10px;color:var(--accent);font-weight:700;margin-top:1px;">-- SCAMPOLO</div>';
    bodyH+='</div>';
    bodyH+='<div style="text-align:right;flex-shrink:0;">';
    bodyH+='<div style="font-size:16px;font-weight:900;color:var(--accent);">- '+sub+'</div>';
    bodyH+='<div style="font-size:11px;color:var(--muted);">'+q+' '+(it.unit||'pz')+' - -'+esc(it.prezzoUnit)+'</div>';
    bodyH+='</div>';
    bodyH+='</div>';
  });
  if(ord.nota){
    bodyH+='<div style="padding:8px 0;font-size:12px;color:#666;font-style:italic;border-top:1px solid #222;margin-top:6px;">- '+esc(ord.nota)+'</div>';
  }
  document.getElementById('cassa-body').innerHTML=bodyH;
  document.getElementById('cassa-totale').textContent='- '+tot.toFixed(2);
  document.getElementById('cassa-totale').style.fontSize='28px';
  document.getElementById('cassa-n-art').textContent=nItems+' articoli'+(ord.scontoGlobale?' - - -'+ord.scontoGlobale+'%':'');
  var fattoBtn=document.getElementById('cassa-fatto-btn');
  fattoBtn.style.fontSize='14px';
  fattoBtn.style.padding='12px 22px';
  fattoBtn.onclick=function(){
    var o=ordini.find(function(x){return x.id===_cassaOrdId;});
    if(o){
      o.stato='completato';
      if(!o.statiLog)o.statiLog={};
      o.statiLog.completato={ora:new Date().toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'}),data:new Date().toLocaleDateString('it-IT')};
      saveOrdini();
    }
    closeCassa();
    renderOrdini();
    showToastGen('green','- Ordine completato!');
  };
  document.getElementById('cassa-overlay').classList.add('open');
}

function closeCassa(){
  document.getElementById('cassa-overlay').classList.remove('open');
  _cassaOrdId=null;
}

// --- PRODOTTI CORRELATI PER ORDINE ----------------------------
function openCorrelatiOrdine(gi){
  var ord=ordini[gi];
  if(!ord||!ord.items||!(ord.items||[]).length){showToastGen('red','Nessun articolo');return;}
  document.getElementById('correlati-subtitle').textContent='Suggerimenti basati sugli articoli di '+esc(ord.nomeCliente||'-');
  var suggestions=[];
  var alreadyInOrder={};
  (ord.items||[]).forEach(function(it){if(it.rowIdx!==undefined)alreadyInOrder[it.rowIdx]=true;});

  // Per ogni articolo dell'ordine, cerca articoli simili per categoria, marca, descrizione
  (ord.items||[]).forEach(function(it){
    if(it.rowIdx===undefined)return;
    var m=magazzino[it.rowIdx]||{};
    var r=rows[it.rowIdx]||{};
    // 1. Correlati espliciti (se magazzino ha correlati)
    if(m.correlati&&m.correlati.length){
      m.correlati.forEach(function(ri){
        if(!alreadyInOrder[ri]&&rows[ri]&&!suggestions.find(function(s){return s.i===ri;})){
          suggestions.push({i:ri,r:rows[ri],m:magazzino[ri]||{},reason:'correlato a '+esc(r.desc||'').substring(0,25)});
        }
      });
    }
    // 2. Stessa categoria
    if(m.cat){
      rows.forEach(function(r2,i2){
        if(alreadyInOrder[i2]||removed.has(String(i2)))return;
        var m2=magazzino[i2]||{};
        if(m2.cat===m.cat&&!suggestions.find(function(s){return s.i===i2;})&&i2!==it.rowIdx){
          suggestions.push({i:i2,r:r2,m:m2,reason:'stessa categoria'});
        }
      });
    }
    // 3. Stessa marca
    if(m.marca){
      rows.forEach(function(r2,i2){
        if(alreadyInOrder[i2]||removed.has(String(i2)))return;
        var m2=magazzino[i2]||{};
        if(m2.marca&&m2.marca.toLowerCase()===m.marca.toLowerCase()&&!suggestions.find(function(s){return s.i===i2;})&&i2!==it.rowIdx){
          suggestions.push({i:i2,r:r2,m:m2,reason:'stesso brand '+esc(m.marca)});
        }
      });
    }
  });

  var listEl=document.getElementById('correlati-list');
  if(!suggestions.length){
    listEl.innerHTML='<div style="text-align:center;padding:20px;color:#555;">Nessun suggerimento disponibile.<br><span style="font-size:11px;">Imposta categorie e correlati nell\'inventario per avere suggerimenti.</span></div>';
  } else {
    var h='';
    suggestions.slice(0,15).forEach(function(s){
      h+='<div style="display:flex;align-items:center;gap:10px;padding:10px;border:1px solid #2a2a2a;border-radius:10px;margin-bottom:6px;background:#111;">';
      h+='<div style="flex:1;min-width:0;">';
      h+='<div style="font-size:12px;font-weight:700;color:var(--text);">'+esc(s.r.desc||'')+'</div>';
      h+='<div style="font-size:10px;margin-top:2px;">';
      if(s.r.codM)h+='<span style="color:var(--accent);font-weight:600;">'+esc(s.r.codM)+'</span> ';
      if(s.r.codF)h+='<span style="color:#fc8181;">'+esc(s.r.codF)+'</span>';
      h+='</div>';
      h+='<div style="font-size:9px;color:#2dd4bf;margin-top:2px;">'+esc(s.reason)+'</div>';
      h+='</div>';
      h+='<div style="flex-shrink:0;text-align:right;">';
      h+='<div style="font-size:14px;font-weight:900;color:var(--accent);">- '+esc(s.r.prezzo||'')+'</div>';
      h+='<button onclick="addCorrelato('+s.i+');closeCorrelati()" style="margin-top:4px;padding:5px 12px;border-radius:6px;border:none;background:#38a169;color:#fff;font-size:11px;font-weight:700;cursor:pointer;">+ Aggiungi</button>';
      h+='</div></div>';
    });
    listEl.innerHTML=h;
  }
  document.getElementById('correlati-overlay').style.display='flex';
}

function closeCorrelati(){
  document.getElementById('correlati-overlay').style.display='none';
}

function addCorrelato(rowIdx){
  // Aggiunge al carrello attivo se esiste, altrimenti noop
  if(activeCartId){
    cartAddItem(rowIdx);
  } else {
    showToastGen('orange','Apri un carrello per aggiungere');
  }
}



// --- NOTA ARTICOLO (edit con prompt) --------------------------
function cartEditNota(cartId, idx){
  var cart = carrelli.find(function(c){ return c.id === cartId; });
  if(!cart || !cart.items[idx]) return;
  var current = cart.items[idx].nota || '';
  var nuova = prompt('- Nota per: ' + (cart.items[idx].desc || ''), current);
  if(nuova === null) return; // annullato
  cart.items[idx].nota = nuova.trim();
  saveCarrelli();
  renderCartTabs();
  if(nuova.trim()) showToastGen('green', '- Nota salvata');
}

// ---------------------------------------------------------------
//  DDT - DOCUMENTO DI TRASPORTO (stampa A4)
// ---------------------------------------------------------------
var DDT_NUM_K = 'cp4_ddt_num';

function getNextDDTNum(){
  var n = parseInt(localStorage.getItem(DDT_NUM_K) || '0') + 1;
  localStorage.setItem(DDT_NUM_K, String(n));
  return n;
}

function stampaDDT(cartId){
  var cart = carrelli.find(function(c){ return c.id === cartId; });
  if(!cart || !(cart.items||[]).length){
    showToastGen('red','-- Carrello vuoto!');
    return;
  }

  var ddtNum = getNextDDTNum();
  var oggi = new Date();
  var dataStr = String(oggi.getDate()).padStart(2,'0') + '/' + String(oggi.getMonth()+1).padStart(2,'0') + '/' + oggi.getFullYear();
  var oraStr = String(oggi.getHours()).padStart(2,'0') + ':' + String(oggi.getMinutes()).padStart(2,'0');

  var nomeCliente = cart.nome || '-';
  var indirizzo = cart.indirizzo || '';
  var piva = cart.piva || '';
  var nota = cart.nota || '';

  // Calcola totale
  var totale = 0;
  var righeHTML = '';
  (cart.items||[]).forEach(function(it, idx){
    var pu =  parsePriceIT(it.prezzoUnit);
    var qty = parseFloat(it.qty || 1);
    var sub = (pu * qty).toFixed(2);
    totale += pu * qty;
    var codice = it.codM || it.codF || '';
    var unit = it.unit || 'pz';
    righeHTML += '<tr>' +
      '<td style="padding:6px 8px;border:1px solid #999;font-size:11px;">' + esc(codice) + '</td>' +
      '<td style="padding:6px 8px;border:1px solid #999;font-size:11px;">' + esc(it.desc || '') + (it.specs ? '<br><i style="color:#666;font-size:10px;">' + esc(it.specs) + '</i>' : '') + '</td>' +
      '<td style="padding:6px 8px;border:1px solid #999;font-size:11px;text-align:center;">' + esc(unit) + '</td>' +
      '<td style="padding:6px 8px;border:1px solid #999;font-size:11px;text-align:center;font-weight:700;">' + qty + '</td>' +
      '<td style="padding:6px 8px;border:1px solid #999;font-size:11px;text-align:right;">&euro; ' + pu.toFixed(2) + '</td>' +
      '<td style="padding:6px 8px;border:1px solid #999;font-size:11px;text-align:right;font-weight:700;">&euro; ' + sub + '</td>' +
      '</tr>';
  });

  // Righe vuote per completare il modulo (minimo 15 righe visibili)
  var minRighe = 15;
  for(var r = (cart.items||[]).length; r < minRighe; r++){
    righeHTML += '<tr>' +
      '<td style="padding:6px 8px;border:1px solid #999;">&nbsp;</td>' +
      '<td style="padding:6px 8px;border:1px solid #999;">&nbsp;</td>' +
      '<td style="padding:6px 8px;border:1px solid #999;">&nbsp;</td>' +
      '<td style="padding:6px 8px;border:1px solid #999;">&nbsp;</td>' +
      '<td style="padding:6px 8px;border:1px solid #999;">&nbsp;</td>' +
      '<td style="padding:6px 8px;border:1px solid #999;">&nbsp;</td>' +
      '</tr>';
  }

  var html = '';
  // Stili inline nel contenuto
  html += '<style>';
  html += 'body{font-family:Arial,Helvetica,sans-serif;margin:0;padding:12mm 15mm;font-size:11px;color:#111;}';
  html += '@media print{@page{size:A4 portrait;margin:10mm 12mm;}body{padding:0;}}';
  html += 'table{width:100%;border-collapse:collapse;}';
  html += '.header{display:flex;justify-content:space-between;margin-bottom:14px;padding-bottom:10px;border-bottom:2px solid #111;}';
  html += '.cedente{font-size:12px;line-height:1.5;}';
  html += '.cedente b{font-size:16px;letter-spacing:1px;}';
  html += '.ddt-info{text-align:right;font-size:12px;}';
  html += '.ddt-info .num{font-size:20px;font-weight:900;}';
  html += '.client-box{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px;padding:10px;border:1px solid #999;border-radius:4px;}';
  html += '.client-box .label{font-size:9px;text-transform:uppercase;color:#666;margin-bottom:2px;}';
  html += '.client-box .value{font-size:12px;font-weight:600;min-height:16px;}';
  html += '.transport-row{display:flex;justify-content:space-between;margin-bottom:12px;padding:6px 10px;border:1px solid #999;border-radius:4px;font-size:10px;}';
  html += 'th{background:#e8e8e8;padding:6px 8px;border:1px solid #999;font-size:10px;text-transform:uppercase;font-weight:700;}';
  html += '.totale-row{text-align:right;padding:10px 0;font-size:14px;font-weight:900;}';
  html += '.footer{margin-top:20px;display:flex;justify-content:space-between;font-size:10px;color:#555;}';
  html += '.firma-box{border-top:1px solid #999;width:180px;text-align:center;padding-top:4px;margin-top:40px;}';
  html += '.note-box{margin-top:10px;padding:8px;border:1px solid #ccc;border-radius:4px;font-size:10px;color:#444;min-height:30px;}';
  html += '</style>';

  // -- HEADER --
  html += '<div class="header">';
  html += '<div class="cedente">';
  html += '<b>RATTAZZI</b> S.R.L.<br>';
  html += 'Via Ettore Piazza, 10<br>';
  html += '28064 CARPIGNANO SESIA (NO)<br>';
  html += 'Tel. 0321.825.145 - Fax 0321.825.917<br>';
  html += '<span style="font-size:10px;color:#555;">Cap. Soc. &euro; 116.000 i.v. &middot; Cod Fisc. e P.IVA 00093600039<br>Reg. Imprese Novara 00093600039 &middot; R.E.A. n. 89056</span>';
  html += '</div>';
  html += '<div class="ddt-info">';
  html += '<div style="font-size:11px;color:#555;">Documento di trasporto</div>';
  html += '<div class="num">N. ' + ddtNum + '</div>';
  html += '<div style="margin-top:6px;">del <b>' + dataStr + '</b></div>';
  html += '</div>';
  html += '</div>';

  // -- DATI CLIENTE --
  html += '<div class="client-box">';
  html += '<div><div class="label">Spett.le Ditta</div><div class="value">' + esc(nomeCliente) + '</div></div>';
  html += '<div><div class="label">P.IVA / Cod. Fiscale</div><div class="value">' + esc(piva) + '</div></div>';
  html += '<div style="grid-column:1/-1;"><div class="label">Residenza o domicilio</div><div class="value">' + esc(indirizzo) + '</div></div>';
  html += '</div>';

  // -- TRASPORTO --
  html += '<div class="transport-row">';
  html += '<div><span style="color:#666;">Trasporto a cura del:</span> <b>- Cedente</b> &nbsp; - Cessionario &nbsp; - Vettore</div>';
  html += '<div><span style="color:#666;">Causale:</span> <b>- Vendita</b></div>';
  html += '<div><span style="color:#666;">Data:</span> <b>' + dataStr + '</b> &nbsp; <span style="color:#666;">Ora:</span> <b>' + oraStr + '</b></div>';
  html += '</div>';

  // -- TABELLA ARTICOLI --
  html += '<table>';
  html += '<thead><tr>';
  html += '<th style="width:90px;">Codice</th>';
  html += '<th>Descrizione dei beni (Natura - Qualit&agrave;)</th>';
  html += '<th style="width:40px;">U.M.</th>';
  html += '<th style="width:55px;">Quantit&agrave;</th>';
  html += '<th style="width:70px;">Prezzo Unit.</th>';
  html += '<th style="width:75px;">Importo</th>';
  html += '</tr></thead>';
  html += '<tbody>' + righeHTML + '</tbody>';
  html += '</table>';

  // -- TOTALE --
  html += '<div class="totale-row">TOTALE: &euro; ' + totale.toFixed(2) + '</div>';

  // -- NOTE --
  if(nota){
    html += '<div class="note-box"><b>Note:</b> ' + esc(nota) + '</div>';
  }

  // -- FIRME --
  html += '<div class="footer">';
  html += '<div><div class="firma-box">Firma del cedente</div></div>';
  html += '<div><div class="firma-box">Firma del cessionario</div></div>';
  html += '<div><div class="firma-box">Firma del vettore</div></div>';
  html += '</div>';

  html += '<div style="text-align:center;margin-top:12px;font-size:8px;color:#aaa;">Documento generato da Gestionale Rattazzi &mdash; ' + dataStr + ' ' + oraStr + '</div>';
  

  // Mostra overlay DDT per stampa (no popup)
  var ov = document.getElementById('ddt-print-overlay');
  if(!ov){
    ov = document.createElement('div');
    ov.id = 'ddt-print-overlay';
    ov.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#fff;overflow-y:auto;display:none;';
    document.body.appendChild(ov);
  }
  ov.innerHTML = '<div style="padding:8px;background:#333;display:flex;gap:8px;align-items:center;position:sticky;top:0;z-index:1;">' +
    '<button onclick="window.print()" style="padding:10px 24px;border-radius:8px;border:none;background:#3182ce;color:#fff;font-size:14px;font-weight:800;cursor:pointer;">-- Stampa DDT</button>' +
    '<button onclick="chiudiDDT()" style="padding:10px 18px;border-radius:8px;border:1px solid #555;background:transparent;color:#fff;font-size:13px;cursor:pointer;">- Chiudi</button>' +
    '<span style="color:#aaa;font-size:12px;margin-left:8px;">DDT N.' + ddtNum + ' - ' + esc(nomeCliente) + '</span>' +
    '</div>' +
    '<div id="ddt-content" style="padding:12mm 15mm;max-width:210mm;margin:0 auto;background:#fff;">' + html + '</div>';
  ov.style.display = 'block';
  document.body.style.overflow = 'hidden';
  showToastGen('green','- DDT N.' + ddtNum + ' - premi Stampa');
}

function chiudiDDT(){
  var ov = document.getElementById('ddt-print-overlay');
  if(ov) ov.style.display = 'none';
  document.body.style.overflow = '';
}


// --- Ord Detail (dal file principale) ---
var _ordDetailId=null;function ordSblocca(gi){
  var o=ordini[gi];
  if(o){o.unlocked=true; saveOrdini(); renderOrdini();}
}
function ordBlocca(gi){
  var o=ordini[gi];
  if(o){o.unlocked=false; saveOrdini(); renderOrdini();}
}
      function renderItemsEditabili(){
        var existing=wrap.querySelector('.items-edit-list');
        if(existing) existing.remove();
        var list=document.createElement('div');
        list.className='items-edit-list';
        list.style.cssText='margin-bottom:12px;';

        (cart.items||[]).forEach(function(it, ii){
          var card=document.createElement('div');
          card.style.cssText='background:#111;border:1px solid #2d2040;border-radius:10px;padding:10px;margin-bottom:8px;';

          // Riga 1: descrizione + X rimuovi
          var r1=document.createElement('div');
          r1.style.cssText='display:flex;align-items:center;gap:8px;margin-bottom:8px;';
          var desc=document.createElement('div');
          desc.style.cssText='flex:1;min-width:0;';
          var descTxt=document.createElement('div');
          descTxt.style.cssText='font-size:13px;font-weight:700;color:#e8e8e8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
          descTxt.textContent=it.desc||'';
          desc.appendChild(descTxt);
          if(it.codM||it.codF){
            var codRow=document.createElement('div');
            codRow.style.cssText='margin-top:2px;display:flex;gap:6px;';
            if(it.codM){ var sm=document.createElement('span'); sm.style.cssText='color:var(--accent);font-size:10px;font-weight:700;'; sm.textContent=it.codM; codRow.appendChild(sm); }
            if(it.codF){ var sf=document.createElement('span'); sf.style.cssText='color:#fc8181;font-size:10px;font-weight:700;'; sf.textContent=it.codF; codRow.appendChild(sf); }
            desc.appendChild(codRow);
          }
          var btnX=document.createElement('button');
          btnX.style.cssText='width:28px;height:28px;border-radius:6px;border:1px solid #e53e3e44;background:transparent;color:#e53e3e;font-size:16px;cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0;';
          btnX.textContent='-';
          btnX.addEventListener('click',function(){
            (cart.items||[]).splice(ii,1);
            saveCarrelli();
            renderItemsEditabili();
          });
          r1.appendChild(desc);
          r1.appendChild(btnX);
          card.appendChild(r1);

          // Riga 2: Qt- + Unit- + Prezzo
          var r2=document.createElement('div');
          r2.style.cssText='display:flex;gap:6px;align-items:center;margin-bottom:6px;';

          var lQty=document.createElement('label');
          lQty.style.cssText='font-size:10px;color:#666;display:flex;flex-direction:column;gap:2px;';
          lQty.textContent='Qt-';
          var inQty=document.createElement('input');
          inQty.type='number'; inQty.min='0.01'; inQty.step='any';
          inQty.value=it.qty||1;
          inQty.style.cssText='width:60px;padding:5px 7px;border:1px solid #6b46c1;border-radius:6px;background:#1a1a2e;color:#fff;font-size:13px;font-weight:700;';
          inQty.addEventListener('input',function(){ it.qty=this.value; saveCarrelli(); });
          lQty.appendChild(inQty);

          var lUnit=document.createElement('label');
          lUnit.style.cssText='font-size:10px;color:#666;display:flex;flex-direction:column;gap:2px;';
          lUnit.textContent='Unit-';
          var inUnit=document.createElement('input');
          inUnit.type='text';
          inUnit.value=it.unit||'pz';
          inUnit.style.cssText='width:48px;padding:5px 7px;border:1px solid #333;border-radius:6px;background:#111;color:#aaa;font-size:12px;';
          inUnit.addEventListener('input',function(){ it.unit=this.value; saveCarrelli(); });
          lUnit.appendChild(inUnit);

          var lPrez=document.createElement('label');
          lPrez.style.cssText='font-size:10px;color:#666;display:flex;flex-direction:column;gap:2px;flex:1;';
          lPrez.textContent='- Prezzo';
          var inPrez=document.createElement('input');
          inPrez.type='text';
          inPrez.value=it.prezzoUnit||'0';
          inPrez.style.cssText='width:100%;padding:5px 7px;border:1px solid #333;border-radius:6px;background:#111;color:var(--accent);font-size:13px;font-weight:700;';
          inPrez.addEventListener('input',function(){ it.prezzoUnit=this.value; saveCarrelli(); });
          lPrez.appendChild(inPrez);

          r2.appendChild(lQty);
          r2.appendChild(lUnit);
          r2.appendChild(lPrez);
          card.appendChild(r2);

          // Riga 3: nota articolo
          var inNota=document.createElement('input');
          inNota.type='text';
          inNota.placeholder='Nota articolo (opzionale)...';
          inNota.value=it.nota||'';
          inNota.style.cssText='width:100%;padding:5px 9px;border:1px solid #222;border-radius:6px;background:#0d0d0d;color:#888;font-size:11px;box-sizing:border-box;margin-bottom:8px;';
          inNota.addEventListener('input',function(){ it.nota=this.value; saveCarrelli(); });
          card.appendChild(inNota);

          // Riga 4: toggle Scampolo + Scaglionati
          (function(item, cartId, itemIdx){
            var rBadge=document.createElement('div');
            rBadge.style.cssText='display:flex;gap:6px;margin-bottom:6px;flex-wrap:wrap;';

            // Bottone Scampolo
            var btnSc=document.createElement('button');
            var isSc=item.scampolo||false;
            btnSc.style.cssText='padding:5px 10px;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;border:1px solid '+(isSc?'var(--accent)':'#444')+';background:'+(isSc?'rgba(245,196,0,0.15)':'transparent')+';color:'+(isSc?'var(--accent)':'#666')+';';
            btnSc.textContent='-- Scampolo';
            btnSc.addEventListener('click',function(){
              item.scampolo=!item.scampolo; saveCarrelli(); renderItemsEditabili();
            });
            rBadge.appendChild(btnSc);

            // Bottone Scaglionati
            var btnHs=document.createElement('button');
            var isHs=item.hasScaglioni||false;
            btnHs.style.cssText='padding:5px 10px;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer;border:1px solid '+(isHs?'#3182ce':'#444')+';background:'+(isHs?'rgba(49,130,206,0.15)':'transparent')+';color:'+(isHs?'#63b3ed':'#666')+';';
            btnHs.textContent='- Scaglionati';
            btnHs.addEventListener('click',function(){
              item.hasScaglioni=!item.hasScaglioni;
              saveCarrelli(); renderItemsEditabili();
            });
            rBadge.appendChild(btnHs);
            card.appendChild(rBadge);

            // Form scaglioni (visibile se hasScaglioni)
            if(item.hasScaglioni){
              if(!item.scaglioni) item.scaglioni=[];
              var scagBox=document.createElement('div');
              scagBox.style.cssText='background:#0d1420;border:1px solid #3182ce44;border-radius:8px;padding:8px;margin-bottom:6px;';
              var scagTitle=document.createElement('div');
              scagTitle.style.cssText='font-size:10px;color:#63b3ed;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;';
              scagTitle.textContent='- Prezzi a scaglioni';
              scagBox.appendChild(scagTitle);

              // Intestazione colonne
              var header=document.createElement('div');
              header.style.cssText='display:flex;gap:6px;margin-bottom:4px;';
              ['Da qt-','Sconto %','Prezzo -',''].forEach(function(lbl){
                var th=document.createElement('div');
                th.style.cssText='font-size:9px;color:#555;text-transform:uppercase;flex:'+(lbl===''?'0 0 24px':'1')+';';
                th.textContent=lbl;
                header.appendChild(th);
              });
              scagBox.appendChild(header);

              // Righe scaglioni
              item.scaglioni.forEach(function(sg, si){
                var row=document.createElement('div');
                row.style.cssText='display:flex;gap:6px;align-items:center;margin-bottom:4px;';

                var inQta=document.createElement('input');
                inQta.type='number'; inQta.min='1'; inQta.placeholder='qt-';
                inQta.value=sg.qtaMin||'';
                inQta.style.cssText='flex:1;padding:4px 6px;border:1px solid #2a3a4a;border-radius:5px;background:#111;color:#e8e8e8;font-size:12px;font-weight:700;min-width:0;';
                inQta.addEventListener('input',function(){ sg.qtaMin=parseFloat(this.value)||0; saveCarrelli(); });

                var inSconto=document.createElement('input');
                inSconto.type='number'; inSconto.min='0'; inSconto.max='100'; inSconto.placeholder='%';
                inSconto.value=sg.sconto||'';
                inSconto.style.cssText='flex:1;padding:4px 6px;border:1px solid #2a3a4a;border-radius:5px;background:#111;color:#68d391;font-size:12px;font-weight:700;min-width:0;';
                inSconto.addEventListener('input',function(){
                  sg.sconto=parseFloat(this.value)||0;
                  // Calcola prezzo automatico
                  var base= parsePriceIT(item.prezzoUnit);
                  if(base>0 && sg.sconto>0){
                    sg.prezzo=(base*(1-sg.sconto/100)).toFixed(2);
                    var inP=row.querySelector('.scag-prezzo');
                    if(inP) inP.value=sg.prezzo;
                  }
                  saveCarrelli();
                });

                var inPrezzo=document.createElement('input');
                inPrezzo.type='text'; inPrezzo.placeholder='-';
                inPrezzo.value=sg.prezzo||'';
                inPrezzo.className='scag-prezzo';
                inPrezzo.style.cssText='flex:1;padding:4px 6px;border:1px solid #2a3a4a;border-radius:5px;background:#111;color:var(--accent);font-size:12px;font-weight:700;min-width:0;';
                inPrezzo.addEventListener('input',function(){
                  sg.prezzo=this.value;
                  // Calcola sconto automatico
                  var base= parsePriceIT(item.prezzoUnit);
                  var pr=parseFloat(this.value.replace(',','.'));
                  if(base>0 && pr>0){
                    sg.sconto=((1-pr/base)*100).toFixed(1);
                    var inS=row.querySelector('input[max="100"]');
                    if(inS) inS.value=sg.sconto;
                  }
                  saveCarrelli();
                });

                var btnRm=document.createElement('button');
                btnRm.style.cssText='width:24px;height:24px;border-radius:4px;border:none;background:#e53e3e22;color:#e53e3e;font-size:14px;cursor:pointer;flex-shrink:0;display:flex;align-items:center;justify-content:center;';
                btnRm.textContent='-';
                (function(sIdx){ btnRm.addEventListener('click',function(){
                  item.scaglioni.splice(sIdx,1); saveCarrelli(); renderItemsEditabili();
                }); })(si);

                row.appendChild(inQta);
                row.appendChild(inSconto);
                row.appendChild(inPrezzo);
                row.appendChild(btnRm);
                scagBox.appendChild(row);
              });

              // Aggiungi scaglione
              var btnAddSg=document.createElement('button');
              btnAddSg.style.cssText='width:100%;padding:5px;border-radius:6px;border:1px dashed #3182ce44;background:transparent;color:#3182ce;font-size:11px;font-weight:700;cursor:pointer;margin-top:2px;';
              btnAddSg.textContent='+ Aggiungi scaglione';
              btnAddSg.addEventListener('click',function(){
                if(!item.scaglioni) item.scaglioni=[];
                item.scaglioni.push({qtaMin:1,sconto:0,prezzo:''});
                saveCarrelli(); renderItemsEditabili();
              });
              scagBox.appendChild(btnAddSg);
              card.appendChild(scagBox);
            }
          })(it, cart.id, ii);

          list.appendChild(card);
        });

        // Bottone + aggiungi articolo
        var btnAdd=document.createElement('button');
        btnAdd.style.cssText='width:100%;padding:9px;border-radius:8px;border:1px dashed #6b46c1;background:transparent;color:#a78bfa;font-size:12px;font-weight:700;cursor:pointer;';
        btnAdd.textContent='+ Aggiungi articolo';
        btnAdd.addEventListener('click',function(){
          // Mostra ricerca
          var sr=wrap.querySelector('.search-add-wrap');
          if(sr){ sr.style.display=sr.style.display==='none'?'block':'none'; }
        });
        list.appendChild(btnAdd);

        // Nota ordine
        var lNota=document.createElement('div');
        lNota.style.cssText='margin-top:8px;';
        lNota.innerHTML='<label style="font-size:10px;color:#666;">Nota ordine</label>';
        var inNotaOrd=document.createElement('input');
        inNotaOrd.type='text';
        inNotaOrd.placeholder='Nota generale ordine...';
        inNotaOrd.value=cart.nota||'';
        inNotaOrd.style.cssText='width:100%;padding:7px 10px;border:1px solid #333;border-radius:7px;background:#111;color:#aaa;font-size:12px;box-sizing:border-box;margin-top:3px;';
        inNotaOrd.addEventListener('input',function(){ cart.nota=this.value; saveCarrelli(); });
        lNota.appendChild(inNotaOrd);
        list.appendChild(lNota);

        wrap.insertBefore(list, wrap.querySelector('.search-add-wrap') || wrap.querySelector('.btns-modifica'));
      }
function cartToggleScampolo(cartId,idx){
  var cart=carrelli.find(function(c){return c.id===cartId;});
  if(!cart||!cart.items[idx]) return;
  cart.items[idx].scampolo=!cart.items[idx].scampolo; saveCarrelli(); renderCartTabs();
}
function cartMostraNota(notaId, cartId, idx){
  var btn=document.getElementById(notaId+'-btn');
  var inp=document.getElementById(notaId);
  if(!inp) return;
  if(btn) btn.style.display='none';
  inp.style.display='block';
  inp.focus();
}
function cartSetDesc(cartId,idx,val){
  var cart=carrelli.find(function(c){return c.id===cartId;});
  if(!cart||!cart.items[idx]) return;
  cart.items[idx].desc=val.trim()||cart.items[idx].desc;
  saveCarrelli();
}
function cartEditDesc(cartId,idx,el){
  var cur=el.textContent;
  var inp=document.createElement('input');
  inp.type='text'; inp.value=cur;
  inp.style.cssText='width:100%;font-size:12px;font-weight:700;color:var(--text);background:#1a1a1a;border:1px solid var(--accent);border-radius:4px;padding:2px 6px;outline:none;box-sizing:border-box;';
  el.replaceWith(inp);
  inp.focus(); inp.select();  inp.addEventListener('blur', commit);
  inp.addEventListener('keydown', function(e){
    if(e.key==='Enter'){ inp.blur(); }
    if(e.key==='Escape'){ inp.removeEventListener('blur',commit); renderCartTabs(); }
  });
}
  function commit(){
    cartSetDesc(cartId,idx,inp.value);
    renderCartTabs();
  }
function _showToastUndo(msg, onUndo){
  // Rimuovi toast undo precedente se esiste
  var old=document.getElementById('_toast-undo');
  if(old) old.remove();
  var t=document.createElement('div');
  t.id='_toast-undo';
  t.style.cssText='position:fixed;bottom:80px;left:50%;transform:translateX(-50%);background:#222;border:1px solid #444;border-radius:10px;padding:10px 16px;display:flex;align-items:center;gap:12px;z-index:9000;box-shadow:0 4px 20px rgba(0,0,0,.5);min-width:220px;';
  var txt=document.createElement('span');
  txt.style.cssText='font-size:13px;color:#e0e0e0;flex:1;';
  txt.textContent=msg;
  var btn=document.createElement('button');
  btn.textContent='Annulla';
  btn.style.cssText='padding:4px 12px;border-radius:6px;border:1px solid var(--accent);background:transparent;color:var(--accent);font-size:12px;font-weight:700;cursor:pointer;white-space:nowrap;';
  btn.onclick=function(){ t.remove(); onUndo(); };
  t.appendChild(txt);
  t.appendChild(btn);
  document.body.appendChild(t);
  // Auto-rimozione dopo 5 secondi
  setTimeout(function(){ if(t.parentNode){ t.remove(); _lastRemovedItem=null; } }, 5000);
}
function ordSetNuovo(gi){ setStatoOrdine(gi,'nuovo'); }
function ordSetLav(gi){ setStatoOrdine(gi,'lavorazione'); }
function ordSetFatto(gi){ setStatoOrdine(gi,'completato'); }
function _rimuoviCarrelloDaOrdine(ordId){
  var idx=carrelli.findIndex(function(c){return c.ordId===ordId;});
  if(idx===-1) return;
  var cart=carrelli[idx];
  cart.deletedAt=new Date().toLocaleString('it-IT');
  carrelliCestino.push(cart);
  lsSet(CART_CK, carrelliCestino);
  carrelli.splice(idx,1);
  if(activeCartId===cart.id) activeCartId=carrelli.length?carrelli[carrelli.length-1].id:null;
  saveCarrelli();
  renderCartTabs();
}
function openOrdDetail(gi){
  try{
    var ord=ordini[gi];
    if(!ord){console.error('Ordine non trovato indice:',gi);return;}
    _ordDetailId=ord.id;
    _odRender(ord);
    var ov=document.getElementById('ord-detail-overlay');
    if(ov)ov.classList.add('open');
  }catch(e){console.error('openOrdDetail:',e);}
}
function closeOrdDetail(){
  var ov=document.getElementById('ord-detail-overlay');
  if(ov)ov.classList.remove('open');
  _ordDetailId=null;
  renderOrdini();
}
function _odTot(ord){
  return (ord.items||[]).reduce(function(s,it){
    return s+ parsePriceIT(it.prezzoUnit)*parseFloat(it.qty||0);
  },0);
}
function _odRender(ord){
  try{
    var COLORI={nuovo:'#f5c400',lavorazione:'#3182ce',completato:'#38a169'};
    var LABEL={nuovo:'Nuovo',lavorazione:'In corso',completato:'Completato'};
    var sc=COLORI[ord.stato]||'#888';
    var el;
    el=document.getElementById('odh-cliente');
    if(el)el.textContent=ord.nomeCliente||'-';
    el=document.getElementById('odh-info');
    if(el)el.textContent=(ord.data||'')+(ord.ora?' - '+ord.ora:'');
    var tot=_odTot(ord);
    el=document.getElementById('odh-totale');
    if(el)el.textContent='- '+tot.toFixed(2);
    el=document.getElementById('odh-stato-badge');
    if(el){el.textContent=LABEL[ord.stato]||ord.stato;el.style.color=sc;}
    el=document.getElementById('ord-detail-stato');
    if(el)el.value=ord.stato||'nuovo';
    el=document.getElementById('ord-detail-nota');
    if(el)el.value=ord.nota||'';
    _odRenderItems(ord);
  }catch(e){console.error('_odRender:',e);}
}
function _odRenderItems(ord){
  var el=document.getElementById('ord-detail-items');
  if(!el)return;
  var h='';
  var items=ord.items||[];
  for(var i=0;i<items.length;i++){
    var it=items[i];
    var desc=it.desc||'';
    var qty=parseFloat(it.qty||1);
    var unit=it.unit||'pz';
    var pu=(it.prezzoUnit||'0').toString();
    var sub=(parseFloat(pu.replace(',','.'))*qty).toFixed(2);
    var isSc=it.scampolo||false;
    var isHs=it.hasScaglioni||false;
    var expanded=it._expanded||false;

    h+='<div style="background:#1a1a1a;border:1px solid #2a2a2a;border-radius:10px;margin-bottom:8px;overflow:hidden;" id="odi-'+i+'">';

    // -- RIGA COMPATTA (sempre visibile) --
    h+='<div style="padding:8px 10px;">';

    // Nome articolo (con emoji - se ci sono specs/foto)
    var _odHasInfo=(it.rowIdx!==undefined&&((_idbCache[it.rowIdx])||((magazzino[it.rowIdx]||{}).specs)));
    if(_odHasInfo){
      h+='<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">';
      h+='<button onclick="mostraFotoSpecifiche('+it.rowIdx+')" style="background:transparent;border:none;font-size:20px;cursor:pointer;padding:0;flex-shrink:0;line-height:1;" title="Vedi specifiche">-</button>';
      h+='<input value="'+esc(desc)+'" oninput="odUpd('+i+',\'desc\',this.value)" placeholder="Articolo..." style="background:transparent;border:none;border-bottom:1px solid #2a2a2a;color:var(--text);font-size:13px;font-weight:700;flex:1;outline:none;font-family:inherit;padding:2px 0;">';
      h+='</div>';
    } else {
      h+='<input value="'+esc(desc)+'" oninput="odUpd('+i+',\'desc\',this.value)" placeholder="Articolo..." style="background:transparent;border:none;border-bottom:1px solid #2a2a2a;color:var(--text);font-size:13px;font-weight:700;width:100%;outline:none;font-family:inherit;padding:2px 0;margin-bottom:6px;">';
    }

    // Riga: codici
    h+='<div style="display:flex;gap:6px;margin-bottom:6px;">';
    h+='<input value="'+esc(it.codM||'')+'" oninput="odUpd('+i+',\'codM\',this.value)" placeholder="Cod. articolo" style="flex:1;background:#111;border:1px solid #2a2a2a;border-radius:6px;color:var(--accent);font-size:11px;font-weight:700;padding:4px 7px;outline:none;font-family:inherit;">';
    h+='<input value="'+esc(it.codF||'')+'" oninput="odUpd('+i+',\'codF\',this.value)" placeholder="Cod. fornitore" style="flex:1;background:#111;border:1px solid #2a2a2a;border-radius:6px;color:#fc8181;font-size:11px;font-weight:700;padding:4px 7px;outline:none;font-family:inherit;">';
    h+='</div>';

    // Riga: qt- + unit- + prezzo + subtotale
    h+='<div style="display:flex;align-items:center;gap:6px;">';
    // Qt- -/+
    h+='<div style="display:flex;align-items:center;background:#111;border-radius:7px;border:1px solid #2a2a2a;overflow:hidden;flex-shrink:0;">';
    h+='<button onclick="odDQ('+i+',-1)" style="background:transparent;border:none;color:#aaa;width:26px;height:26px;cursor:pointer;font-size:16px;line-height:1;font-family:inherit;">-</button>';
    h+='<span style="min-width:24px;text-align:center;color:var(--accent);font-size:13px;font-weight:800;" id="odq-'+i+'">'+qty+'</span>';
    h+='<button onclick="odDQ('+i+',1)" style="background:transparent;border:none;color:#aaa;width:26px;height:26px;cursor:pointer;font-size:16px;line-height:1;font-family:inherit;">+</button>';
    h+='</div>';
    // Unit-
    h+='<select onchange="odUpd('+i+',\'unit\',this.value)" style="background:#111;border:1px solid #2a2a2a;border-radius:6px;color:var(--text);font-size:11px;padding:4px 4px;outline:none;font-family:inherit;flex-shrink:0;">';
    ['pz','mt','kg','lt','conf','rot','sc'].forEach(function(u){ h+='<option'+(unit===u?' selected':'')+'>'+u+'</option>'; });
    h+='</select>';
    // Prezzo
    h+='<span style="font-size:10px;color:#444;flex-shrink:0;">-</span>';
    h+='<input type="text" value="'+esc(pu)+'" oninput="odUpd('+i+',\'prezzoUnit\',this.value)" style="width:52px;background:transparent;border:none;border-bottom:1px solid #2a2a2a;color:#63b3ed;font-size:12px;font-weight:700;text-align:right;outline:none;font-family:inherit;padding:1px 2px;flex-shrink:0;">';
    // Subtotale
    h+='<span style="font-size:13px;font-weight:800;color:var(--accent);min-width:44px;text-align:right;flex-shrink:0;" id="ods-'+i+'">-'+sub+'</span>';
    // - rimuovi
    h+='<button onclick="odRmv('+i+')" style="background:transparent;border:none;color:#333;font-size:16px;cursor:pointer;padding:0 2px;flex-shrink:0;transition:color .1s;" onmouseover="this.style.color=\'#e53e3e\'" onmouseout="this.style.color=\'#333\'">-</button>';
    // + espandi
    h+='<button onclick="odToggleExpand('+i+')" style="background:transparent;border:none;color:'+(expanded?'var(--accent)':'#444')+';font-size:18px;cursor:pointer;padding:0 2px;flex-shrink:0;font-weight:900;" title="Mostra pi- campi">'+(expanded?'-':'-')+'</button>';
    h+='</div>';
    h+='</div>'; // fine riga compatta

    // -- SEZIONE ESPANSA (nascosta di default) --
    h+='<div style="display:'+(expanded?'block':'none')+';padding:0 10px 10px;border-top:1px solid #222;" id="odi-exp-'+i+'">';

    // Fornitore
    h+='<div style="margin-top:8px;">';
    h+='<div style="font-size:9px;color:#555;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;">Fornitore</div>';
    h+='<input value="'+esc(it.fornitore||'')+'" oninput="odUpd('+i+',\'fornitore\',this.value)" placeholder="Nome fornitore..." style="width:100%;background:#111;border:1px solid #2a2a2a;border-radius:6px;color:#e8e8e8;font-size:11px;padding:5px 8px;outline:none;font-family:inherit;">';
    h+='</div>';

    // Specifiche
    h+='<div style="margin-top:6px;">';
    h+='<div style="font-size:9px;color:#555;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;">Specifiche</div>';
    h+='<input value="'+esc(it.specs||'')+'" oninput="odUpd('+i+',\'specs\',this.value)" placeholder="es. colore, dimensione..." style="width:100%;background:#111;border:1px solid #2a2a2a;border-radius:6px;color:#2dd4bf;font-size:11px;padding:5px 8px;outline:none;font-family:inherit;">';
    h+='</div>';

    // Nota
    h+='<div style="margin-top:6px;">';
    h+='<div style="font-size:9px;color:#555;text-transform:uppercase;letter-spacing:.5px;margin-bottom:3px;">Nota</div>';
    h+='<input value="'+esc(it.nota||'')+'" oninput="odUpd('+i+',\'nota\',this.value)" placeholder="nota articolo..." style="width:100%;background:#111;border:1px solid #2a2a2a;border-radius:6px;color:#888;font-size:11px;padding:5px 8px;outline:none;font-family:inherit;">';
    h+='</div>';

    // Badge scampolo + scaglionati
    h+='<div style="display:flex;gap:6px;margin-top:8px;">';
    h+='<button onclick="odToggleScampolo('+i+')" style="padding:5px 10px;border-radius:6px;border:1px solid '+(isSc?'var(--accent)':'#333')+';background:'+(isSc?'rgba(245,196,0,0.15)':'transparent')+';color:'+(isSc?'var(--accent)':'#666')+';font-size:11px;font-weight:700;cursor:pointer;">-- Scampolo</button>';
    h+='<button onclick="odToggleScaglioni('+i+')" style="padding:5px 10px;border-radius:6px;border:1px solid '+(isHs?'#3182ce':'#333')+';background:'+(isHs?'rgba(49,130,206,0.15)':'transparent')+';color:'+(isHs?'#63b3ed':'#666')+';font-size:11px;font-weight:700;cursor:pointer;">- Scaglionati</button>';
    h+='</div>';

    // Form scaglioni (visibile se hasScaglioni)
    if(isHs){
      if(!it.scaglioni) it.scaglioni=[];
      var sgBase=parsePriceIT(it.prezzoUnit);
      h+='<div style="background:#0d1420;border:1px solid #3182ce44;border-radius:8px;padding:8px;margin-top:8px;">';
      h+='<div style="font-size:10px;color:#63b3ed;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin-bottom:6px;">- Prezzi a scaglioni</div>';
      h+='<div style="display:flex;gap:6px;margin-bottom:3px;"><div style="flex:1;font-size:9px;color:#555;text-transform:uppercase;">Da qt-</div><div style="flex:1;font-size:9px;color:#555;text-transform:uppercase;">Sconto %</div><div style="flex:1;font-size:9px;color:#555;text-transform:uppercase;">Prezzo -</div><div style="flex:0 0 24px;"></div></div>';
      for(var si=0;si<it.scaglioni.length;si++){
        var sg=it.scaglioni[si];
        h+='<div style="display:flex;gap:6px;align-items:center;margin-bottom:4px;">';
        h+='<input type="number" min="1" placeholder="qt-" value="'+esc(String(sg.qtaMin||''))+'" oninput="odUpdScag('+i+','+si+',\'qtaMin\',this.value)" style="flex:1;padding:4px 6px;border:1px solid #2a3a4a;border-radius:5px;background:#111;color:#e8e8e8;font-size:12px;font-weight:700;min-width:0;outline:none;">';
        h+='<input type="number" min="0" max="100" placeholder="%" value="'+esc(String(sg.sconto||''))+'" oninput="odUpdScag('+i+','+si+',\'sconto\',this.value)" style="flex:1;padding:4px 6px;border:1px solid #2a3a4a;border-radius:5px;background:#111;color:#68d391;font-size:12px;font-weight:700;min-width:0;outline:none;">';
        h+='<input type="text" placeholder="-" value="'+esc(String(sg.prezzo||''))+'" oninput="odUpdScag('+i+','+si+',\'prezzo\',this.value)" style="flex:1;padding:4px 6px;border:1px solid #2a3a4a;border-radius:5px;background:#111;color:var(--accent);font-size:12px;font-weight:700;min-width:0;outline:none;">';
        h+='<button onclick="odRmvScag('+i+','+si+')" style="width:24px;height:24px;border-radius:4px;border:none;background:#e53e3e22;color:#e53e3e;font-size:14px;cursor:pointer;flex-shrink:0;">-</button>';
        h+='</div>';
      }
      h+='<button onclick="odAddScag('+i+')" style="width:100%;padding:5px;border-radius:6px;border:1px dashed #3182ce44;background:transparent;color:#3182ce;font-size:11px;font-weight:700;cursor:pointer;margin-top:2px;">+ Aggiungi scaglione</button>';
      h+='</div>';
    }
    h+='</div>'; // fine sezione espansa

    h+='</div>'; // fine card item
  }
  el.innerHTML=h;
}
function odUpd(i,field,val){
  var ord=ordini.find(function(o){return o.id===_ordDetailId;});
  if(!ord||!ord.items[i])return;
  ord.items[i][field]=val;
  if(field==='qty'||field==='prezzoUnit'){
    var pu=(ord.items[i].prezzoUnit||'0').toString().replace(',','.');
    var sub=(parseFloat(pu)*parseFloat(ord.items[i].qty||0)).toFixed(2);
    var elS=document.getElementById('ods-'+i);
    if(elS)elS.textContent='-'+sub;
    var elQ=document.getElementById('odq-'+i);
    if(elQ&&field==='qty')elQ.textContent=val;
    var tot=_odTot(ord);
    var elT=document.getElementById('odh-totale');
    if(elT)elT.textContent='- '+tot.toFixed(2);
  }
  ord.totale=_odTot(ord).toFixed(2);
  saveOrdini();
}
function odDQ(i,delta){
  var ord=ordini.find(function(o){return o.id===_ordDetailId;});
  if(!ord||!ord.items[i])return;
  var cur=parseFloat(ord.items[i].qty||1);
  var nv=Math.max(1,Math.round(cur+delta));
  ord.items[i].qty=nv;
  // Applica prezzo scaglione se attivo
  _odApplicaScaglione(ord.items[i]);
  var elQ=document.getElementById('odq-'+i);
  if(elQ)elQ.textContent=nv;
  var pu=(ord.items[i].prezzoUnit||'0').toString().replace(',','.');
  var sub=(parseFloat(pu)*nv).toFixed(2);
  var elS=document.getElementById('ods-'+i);
  if(elS)elS.textContent='-'+sub;
  var tot=_odTot(ord);
  var elT=document.getElementById('odh-totale');
  if(elT)elT.textContent='- '+tot.toFixed(2);
  ord.totale=tot.toFixed(2);
  saveOrdini();
}
function _odApplicaScaglione(it){
  if(!it.hasScaglioni || !it.scaglioni || !it.scaglioni.length) return;
  var qty=parseFloat(it.qty)||1;
  var sorted=it.scaglioni.slice().sort((a,b)=>(b.qtaMin||0)-(a.qtaMin||0));
  for(var sg of sorted){
    if(qty>=(sg.qtaMin||0) && sg.prezzo){
      it.prezzoUnit=String(sg.prezzo);
      return;
    }
  }
}
function odRmv(i){
  var ord=ordini.find(function(o){return o.id===_ordDetailId;});
  if(!ord)return;
  ord.items.splice(i,1);
  ord.totale=_odTot(ord).toFixed(2);
  saveOrdini();
  _odRender(ord);
}
function odToggleExpand(i){
  var ord=ordini.find(function(o){return o.id===_ordDetailId;});
  if(!ord||!ord.items[i]) return;
  ord.items[i]._expanded=!ord.items[i]._expanded;
  _odRenderItems(ord);
}
function odToggleScampolo(i){
  var ord=ordini.find(function(o){return o.id===_ordDetailId;});
  if(!ord||!ord.items[i]) return;
  ord.items[i].scampolo=!ord.items[i].scampolo;
  saveOrdini(); _odRenderItems(ord); renderOrdini();
}
function odToggleScaglioni(i){
  var ord=ordini.find(function(o){return o.id===_ordDetailId;});
  if(!ord||!ord.items[i]) return;
  ord.items[i].hasScaglioni=!ord.items[i].hasScaglioni;
  if(ord.items[i].hasScaglioni && !ord.items[i].scaglioni) ord.items[i].scaglioni=[];
  saveOrdini(); _odRenderItems(ord); renderOrdini();
}
function odUpdScag(itemIdx, sgIdx, field, val){
  var ord=ordini.find(function(o){return o.id===_ordDetailId;});
  if(!ord||!ord.items[itemIdx]||!ord.items[itemIdx].scaglioni) return;
  var sg=ord.items[itemIdx].scaglioni[sgIdx];
  if(!sg) return;
  var base= parsePriceIT(ord.items[itemIdx].prezzoUnit);
  if(field==='qtaMin') sg.qtaMin=parseFloat(val)||0;
  else if(field==='sconto'){
    sg.sconto=parseFloat(val)||0;
    if(base>0 && sg.sconto>0) sg.prezzo=(base*(1-sg.sconto/100)).toFixed(2);
  } else if(field==='prezzo'){
    sg.prezzo=val;
    var pr=parseFloat(val.replace(',','.'));
    if(base>0 && pr>0) sg.sconto=((1-pr/base)*100).toFixed(1);
  }
  saveOrdini(); _odRenderItems(ord);
}
function odRmvScag(itemIdx, sgIdx){
  var ord=ordini.find(function(o){return o.id===_ordDetailId;});
  if(!ord||!ord.items[itemIdx]||!ord.items[itemIdx].scaglioni) return;
  ord.items[itemIdx].scaglioni.splice(sgIdx,1);
  _odApplicaScaglione(ord.items[itemIdx]);
  saveOrdini(); _odRenderItems(ord);
}
function odAddScag(itemIdx){
  var ord=ordini.find(function(o){return o.id===_ordDetailId;});
  if(!ord||!ord.items[itemIdx]) return;
  if(!ord.items[itemIdx].scaglioni) ord.items[itemIdx].scaglioni=[];
  ord.items[itemIdx].scaglioni.push({qtaMin:1,sconto:0,prezzo:''});
  saveOrdini(); _odRenderItems(ord);
}
function ordDetailAddItem(){
  var ord=ordini.find(function(o){return o.id===_ordDetailId;});
  if(!ord)return;
  if(!ord.items)ord.items=[];
  ord.items.push({desc:'',qty:1,unit:'pz',prezzoUnit:'0',scampolo:false,hasScaglioni:false,_expanded:true});
  saveOrdini();
  _odRenderItems(ord);
}
function ordDetailSaveNota(){
  var ord=ordini.find(function(o){return o.id===_ordDetailId;});
  if(!ord)return;
  var el=document.getElementById('ord-detail-nota');
  if(el)ord.nota=el.value;
  saveOrdini();
}
function ordDetailSetStato(stato){
  var ord=ordini.find(function(o){return o.id===_ordDetailId;});
  if(!ord)return;
  ord.stato=stato;
  saveOrdini();
  var SC={nuovo:'#f5c400',lavorazione:'#3182ce',completato:'#38a169'};
  var LABEL={nuovo:'Nuovo',lavorazione:'In corso',completato:'Completato'};
  var el=document.getElementById('odh-stato-badge');
  if(el){el.textContent=LABEL[stato];el.style.color=SC[stato]||'#888';}
}
function ordDetailElimina(){
  showConfirm('Eliminare questo ordine?', function(){
    var ord=ordini.find(function(o){return o.id===_ordDetailId;});
    if(ord) _rimuoviCarrelloDaOrdine(ord.id);
    ordini=ordini.filter(function(o){return o.id!==_ordDetailId;});
    saveOrdini(); closeOrdDetail(); renderOrdini();
  });
}
function ordDetailStampa(){
  var ord=ordini.find(function(o){return o.id===_ordDetailId;});
  if(!ord)return;
  var w=window.open('','_blank');
  if(!w){showToastGen('red','-- Popup bloccato');return;}
  var tot=_odTot(ord).toFixed(2);
  var righe='';
  (ord.items||[]).forEach(function(it){
    var sub=( parsePriceIT(it.prezzoUnit)*parseFloat(it.qty||0)).toFixed(2);
    righe+='<tr><td>'+esc(it.desc||'')+'</td><td style="text-align:center;">'+it.qty+' '+esc(it.unit||'pz')+'</td><td style="text-align:right;">-'+esc(it.prezzoUnit||'0')+'</td><td style="text-align:right;font-weight:bold;">-'+sub+'</td></tr>';
  });
  w.document.write('<html><head><title>Ordine</title><style>body{font-family:Arial;padding:16mm;font-size:11pt;}table{width:100%;border-collapse:collapse;}th,td{border:1px solid #ccc;padding:6px 8px;}th{background:#f5f5f5;}.tot{font-size:14pt;font-weight:bold;text-align:right;margin-top:12px;}</style></head><body>');
  w.document.write('<h2>Ordine - '+esc(ord.nomeCliente||'')+'</h2>');
  w.document.write('<p>Data: '+esc(ord.data||'')+' '+esc(ord.ora||'')+(ord.nota?'<br>Nota: '+esc(ord.nota):'')+'</p>');
  w.document.write('<table><tr><th>Articolo</th><th>Qt-</th><th>Prezzo unit.</th><th>Subtotale</th></tr>'+righe+'</table>');
  w.document.write('<div class="tot">TOTALE: - '+tot+'</div></body></html>');
  w.document.close();w.print();
}

function openEditProdotto(i, isNew){
  if(!rows[i]) return;
  _epIdx = i;
  _epIsNew = !!isNew;
  var r = rows[i];
  var m = magazzino[i] || {};

  // Snapshot per annulla
  _epSnapshot = { row: JSON.parse(JSON.stringify(r)), mag: JSON.parse(JSON.stringify(m)) };

  // Helper set field
  function sf(id,val){ var el=document.getElementById(id); if(el) el.value=val; }

  // Popola campi
  sf('ep-desc',   r.desc || '');
  sf('ep-codf',   r.codF || '');
  sf('ep-codm',   r.codM || '');
  sf('ep-prezzo', r.prezzo || '');
  sf('ep-prezzoold', r.prezzoOld || '');
  sf('ep-acq',    m.prezzoAcquisto || '');
  sf('ep-specs',  m.specs || '');
  sf('ep-marca',  m.marca || '');
  sf('ep-pos',    m.posizione || '');
  sf('ep-qty',    m.qty !== undefined ? m.qty : '');
  sf('ep-soglia',    m.soglia !== undefined ? m.soglia : '');
  sf('ep-fornitore', m.nomeFornitore || '');

  // Unit-
  var unitSel = document.getElementById('ep-unit');
  if(unitSel){ unitSel.value = m.unit || 'pz'; }

  // Popola categorie
  var catSel = document.getElementById('ep-cat');
  catSel.innerHTML = '<option value="">- Nessuna -</option>';
  categorie.forEach(function(cat){
    var opt = document.createElement('option');
    opt.value = cat.id; opt.textContent = cat.nome;
    if(cat.id === m.cat) opt.selected = true;
    catSel.appendChild(opt);
  });
  epFillSubcat(m.subcat);

  document.getElementById('ep').classList.add('open');
  setTimeout(function(){ document.getElementById('ep-desc').focus(); renderCorrelati(_epIdx); renderScaglioni(_epIdx); }, 100);
}

function epFillSubcat(selectedSub){
  var catSel = document.getElementById('ep-cat');
  var subSel = document.getElementById('ep-subcat');
  var catId = catSel.value;
  var cat = categorie.find(function(c){ return c.id === catId; });
  subSel.innerHTML = '<option value="">-</option>';
  if(cat && cat.sub){
    cat.sub.forEach(function(s){
      var opt = document.createElement('option');
      opt.value = s; opt.textContent = s;
      if(s === selectedSub || s === (magazzino[_epIdx]||{}).subcat) opt.selected = true;
      subSel.appendChild(opt);
    });
  }
}

function epDeltaQty(delta){
  var inp = document.getElementById('ep-qty');
  var cur = parseFloat(inp.value) || 0;
  inp.value = Math.max(0, cur + delta);
}

function saveEditProdotto(){
  if(_epIdx === null) return;
  var i = _epIdx;
  if(!magazzino[i]) magazzino[i] = {};

  // gf() - definita globalmente in [SECTION: UTILS]

  // Aggiorna row
  var newPrezzo = gf('ep-prezzo');
  if(newPrezzo && newPrezzo !== rows[i].prezzo){
    if(!rows[i].priceHistory) rows[i].priceHistory = [];
    rows[i].priceHistory.push({ prezzo: rows[i].prezzo, data: rows[i].data });
  }

  rows[i].desc      = gf('ep-desc');
  rows[i].codF      = gf('ep-codf');
  rows[i].codM      = gf('ep-codm');
  rows[i].prezzo    = newPrezzo;
  rows[i].prezzoOld = gf('ep-prezzoold');
  rows[i].size      = autoSize(newPrezzo);

  // Aggiorna magazzino
  magazzino[i].specs          = gf('ep-specs');
  magazzino[i].marca          = gf('ep-marca');
  magazzino[i].posizione      = gf('ep-pos');
  magazzino[i].prezzoAcquisto = gf('ep-acq');
  var prevQtyEdit = magazzino[i].qty!==undefined&&magazzino[i].qty!==''?Number(magazzino[i].qty):null;
  var qtyVal = gf('ep-qty');
  var newQtyEdit = qtyVal !== '' ? parseFloat(qtyVal) : '';
  magazzino[i].qty   = newQtyEdit;
  var unitEl = document.getElementById('ep-unit');
  magazzino[i].unit  = unitEl ? unitEl.value : 'pz';
  var sogVal = gf('ep-soglia');
  magazzino[i].soglia  = sogVal !== '' ? parseFloat(sogVal) : '';
  var catEl = document.getElementById('ep-cat');
  magazzino[i].cat   = catEl ? catEl.value : '';
  var subEl = document.getElementById('ep-subcat');
  magazzino[i].subcat        = subEl ? subEl.value : '';
  magazzino[i].nomeFornitore = gf('ep-fornitore');

  // Controlla scorta e registra movimento
  var qtyEditNum = newQtyEdit!=='' ? Number(newQtyEdit) : null;
  checkScorta(i, qtyEditNum, prevQtyEdit);
  if(qtyEditNum !== null && prevQtyEdit !== null && qtyEditNum !== prevQtyEdit){
    var deltaEdit = qtyEditNum - prevQtyEdit;
    var tipoEdit = deltaEdit < 0 ? 'vendita' : 'carico';
    registraMovimento(i, tipoEdit, deltaEdit, prevQtyEdit, qtyEditNum, 'modifica scheda');
  }

  // Salva tutto
  lsSet(SK, rows);
  lsSet(MAGK, magazzino);
  updateStats();
  updateStockBadge();

  document.getElementById('ep').classList.remove('open');
  _epSnapshot = null;
  _epIdx = null;
  updateOrdBadge();
  updateCartBadge();
  var activeTab = document.querySelector('.tab-content.active');
  if(activeTab){
    var tid = activeTab.id;
    if(tid==='t0') renderInventario();
    else if(tid==='t1') renderTable();
    else if(tid==='t11') renderMagazzino();
    else if(tid==='tc') renderCartTabs();
    else if(tid==='tmov') renderMovimenti();
  }
  // Se aperto dal carrello - aggiungi automaticamente al carrello attivo
  if(_epFromCart && activeCartId){
    var cart=carrelli.find(function(ct){return ct.id===activeCartId;});
    var row=rows[i];
    if(cart && row && row.desc){
      var newItem={
        id: Date.now()+'_'+Math.random().toString(36).slice(2,6),
        desc: row.desc,
        codM: row.codM||'',
        codF: row.codF||'',
        prezzoUnit: row.prezzo||row.prezzoV||'0',
        qty: 1
      };
      (cart.items=cart.items||[]).push(newItem);
      lsSet(CARTK, carrelli);
      updateCartBadge();
    }
    _epFromCart=false;
    goTab('tc');
  }
  _epFromCart=false;
  showToastGen('green','\u2705 Prodotto salvato');
}

function cancelEditProdotto(){
  if(_epIdx !== null){
    if(_epIsNew){
      // Articolo nuovo mai salvato: eliminalo
      rows.splice(_epIdx, 1);
      if(magazzino.length > _epIdx) magazzino.splice(_epIdx, 1);
      lsSet(SK, rows);
      renderTable();
    } else if(_epSnapshot){
      // Ripristina snapshot
      rows[_epIdx] = _epSnapshot.row;
      magazzino[_epIdx] = _epSnapshot.mag;
    }
  }
  _epSnapshot = null;
  _epIdx = null;
  _epIsNew = false;
  _epFromCart = false;
  document.getElementById('ep').classList.remove('open');
}


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
  showToastGen('green', '\u2705 Articolo duplicato \u2014 modifica la copia');
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
  var nr = {
    desc: gfi('desc') || 'Nuovo articolo',
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
  showToastOk('- Articolo creato da foto!');
  // Apri subito la scheda per completarlo
  setTimeout(function(){ openEditProdotto(ni); }, 200);
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

// Ascolta quando la tab torna in focus
document.addEventListener('visibilitychange', function(){
  if(!document.hidden && _pendingOrdineModal){
    var ord = _pendingOrdineModal;
    _pendingOrdineModal = null;
    setTimeout(function(){ _apriOrdineModal(ord); }, 300);
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
loadEditorSettings();
applyEditorCSS();

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

// ═══════════════════════════════════════════════════════════════════════════════
//  INVENTARIO — ricerca veloce con indice pre-costruito
//
//  Problema originale: fuzzyScore() usa Levenshtein su ogni articolo ad ogni
//  tasto → O(n²) su 19.000 voci → blocco totale su mobile.
//
//  Soluzione:
//  1. _invBuildIndex() — costruisce UNA VOLTA SOLA un array di stringhe piatte
//     (una per articolo). Viene chiamato appena Firebase finisce di caricare.
//  2. renderInventario() — debounce 350ms, poi cerca con semplice indexOf()
//     sull'indice: niente fuzzy, niente Levenshtein, ~2ms per 19.000 voci.
//  3. Max 50 righe renderizzate. Lista vuota finché < 3 caratteri.
// ═══════════════════════════════════════════════════════════════════════════════

// Indice piatto: _invIdx[i] = stringa normalizzata dell'articolo i
var _invIdx = null;
var _invIdxBuilt = false;
var _invSearchTimer = null;

// Normalizza per ricerca: minuscolo, senza accenti, senza punteggiatura
function _invNorm(s){
  return (s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ').trim();
}

// Costruisce l'indice — chiamato da loadMagazzinoFB() al termine del caricamento
function _invBuildIndex(){
  _invIdx = new Array(rows.length);
  for(var i = 0; i < rows.length; i++){
    var r = rows[i];
    if(!r){ _invIdx[i] = ''; continue; }
    var m = magazzino[i] || {};
    _invIdx[i] = _invNorm([
      r.desc  || '',
      r.codF  || '',
      r.codM  || '',
      m.marca || '',
      m.specs || '',
      m.posizione || ''
    ].join(' '));
  }
  _invIdxBuilt = true;
}

// ── Entry point chiamato dall'oninput e da goTab('t0') ────────────────────────
function renderInventario(){
  // Popola filtro categorie una-tantum (operazione leggera)
  var sel = document.getElementById('inv-cat-filter');
  if(sel && sel.options.length <= 1 && typeof categorie !== 'undefined'){
    categorie.forEach(function(cat){
      var opt = document.createElement('option');
      opt.value = cat.id; opt.textContent = cat.nome;
      sel.appendChild(opt);
    });
  }
  // Debounce 350ms — non parte ad ogni singolo tasto
  if(_invSearchTimer) clearTimeout(_invSearchTimer);
  _invSearchTimer = setTimeout(_doInvSearch, 350);
}

// ── Ricerca vera — eseguita dopo il debounce ──────────────────────────────────
function _doInvSearch(){
  var body    = document.getElementById('inv-body');
  var statsEl = document.getElementById('inv-stats');
  if(!body) return;

  // Database non ancora pronto
  if(!rows || !rows.length){
    body.innerHTML = '<tr><td colspan="9" style="text-align:center;padding:40px;color:var(--accent);font-size:14px;">⏳ Database in caricamento...</td></tr>';
    if(statsEl) statsEl.innerHTML = '';
    return;
  }

  // Costruisce l'indice se non esiste ancora (prima ricerca dopo caricamento)
  if(!_invIdxBuilt) _invBuildIndex();

  var rawSearch = (document.getElementById('inv-search') || {}).value || '';
  var catFilter = (document.getElementById('inv-cat-filter') || {}).value || '';
  var hasSearch = rawSearch.trim().length >= 3;
  var hasFilter = !!catFilter;
  var hasSottoScorta = (typeof invSottoScorta !== 'undefined') && invSottoScorta;

  // Nessun criterio → mostra placeholder
  if(!hasSearch && !hasFilter && !hasSottoScorta){
    body.innerHTML =
      '<tr><td colspan="9" style="text-align:center;padding:50px 20px;color:var(--muted);font-size:13px;">' +
      '🔍 Digita almeno <b style="color:var(--accent)">3 caratteri</b> per cercare tra ' +
      '<b style="color:var(--accent)">' + rows.length.toLocaleString('it-IT') + '</b> articoli' +
      '</td></tr>';
    if(statsEl) statsEl.innerHTML =
      '<div class="sc"><span class="n">' + rows.length.toLocaleString('it-IT') + '</span>Articoli totali</div>';
    return;
  }

  // ── Costruisce le query-words per ricerca multi-termine ───────────────────
  // Es. "vite inox m6" → cerca articoli che contengano TUTTE e tre le parole
  var qWords = hasSearch
    ? _invNorm(rawSearch).split(' ').filter(function(w){ return w.length >= 2; })
    : [];

  var MAX = 50;
  var results = [];
  var tot = 0, sottoScorta = 0, totVal = 0;

  for(var i = 0; i < rows.length; i++){
    var r = rows[i];
    if(!r) continue;
    if(removed.has(String(i))) continue;

    var m = magazzino[i] || {};

    // Filtro categoria
    if(hasFilter && (m.cat || '') !== catFilter) continue;

    // Filtro testo — indexOf sull'indice piatto, nessun fuzzy
    if(hasSearch){
      var hay = _invIdx[i] || '';
      var ok = true;
      for(var w = 0; w < qWords.length; w++){
        if(hay.indexOf(qWords[w]) < 0){ ok = false; break; }
      }
      if(!ok) continue;
    }

    // Filtro sotto-scorta
    var soglia = getSoglia(i);
    var qty = (m.qty !== undefined && m.qty !== '') ? Number(m.qty) : null;
    var isLow = qty !== null && qty <= soglia;
    if(hasSottoScorta && !isLow) continue;

    // Statistiche su tutti i match (non solo i primi 50)
    tot++;
    if(qty !== null) totVal += (parseFloat(r.prezzo) || 0) * qty;
    if(isLow) sottoScorta++;

    if(results.length < MAX){
      results.push({ r:r, i:i, m:m, isLow:isLow, soglia:soglia, qty:qty });
    }
  }

  // ── Render HTML dei primi MAX risultati ───────────────────────────────────
  var html = '';

  if(!results.length){
    html = '<tr><td colspan="9" style="padding:40px;text-align:center;color:var(--muted);">' +
      'Nessun risultato per <b style="color:var(--accent)">"' + esc(rawSearch) + '"</b>' +
      '</td></tr>';
  } else {
    for(var ri = 0; ri < results.length; ri++){
      var x  = results[ri];
      var r  = x.r, idx = x.i, m = x.m;
      var isLow   = x.isLow;
      var rowBg   = isLow ? 'rgba(229,62,62,0.08)' : '';
      var borderL = isLow ? 'border-left:3px solid #e53e3e;' : 'border-left:3px solid transparent;';
      var unit    = m.unit || 'pz';
      var specs   = m.specs || '';
      var pos     = m.posizione || '';
      var marca   = m.marca || '';
      var prezzoAcq = m.prezzoAcquisto || '';
      var catId   = m.cat || '';
      var catLabel = '';
      if(catId && typeof categorie !== 'undefined'){
        var cf = categorie.find(function(c){ return c.id === catId; });
        catLabel = cf ? cf.nome : '';
      }
      var sub = m.subcat || '';
      var codM7 = r.codM
        ? (String(r.codM).match(/^\d+$/) ? String(r.codM).padStart(7,'0') : String(r.codM))
        : '-';

      html += '<tr style="border-bottom:1px solid var(--border);' + borderL + 'background:' + rowBg + ';cursor:pointer;" onclick="openSchedaProdotto(' + idx + ')" title="Modifica">';
      // 1. Descrizione + marca
      html += '<td style="padding:8px 6px;">';
      html += '<div style="font-size:12px;font-weight:600;color:var(--text);">' + esc(r.desc || '—') + '</div>';
      if(marca) html += '<div style="font-size:10px;color:var(--muted);">• ' + esc(marca) + '</div>';
      html += '</td>';
      // 2. Specifiche
      html += '<td style="padding:8px 6px;font-size:11px;color:#2dd4bf;font-style:italic;">' + esc(specs) + '</td>';
      // 3. Cod. Fornitore
      html += '<td style="padding:8px 6px;font-size:11px;color:#fc8181;font-weight:600;">' + esc(String(r.codF || '—')) + '</td>';
      // 4. Mio Codice
      html += '<td style="padding:8px 6px;font-size:11px;color:var(--accent);font-weight:600;">' + esc(codM7) + '</td>';
      // 5. Quantità
      html += '<td style="padding:8px 6px;text-align:center;white-space:nowrap;">';
      html += '<button onclick="event.stopPropagation();deltaQta(' + idx + ',-1)" style="background:#333;border:none;color:var(--text);width:30px;height:30px;border-radius:5px;cursor:pointer;font-size:18px;font-weight:bold;touch-action:manipulation;">−</button> ';
      html += '<input type="number" min="0" value="' + (x.qty !== null ? x.qty : '') + '" placeholder="—" onclick="event.stopPropagation()" ' +
              'style="width:44px;padding:3px 2px;border:1px solid ' + (isLow ? '#e53e3e' : 'var(--border)') + ';border-radius:5px;background:#111;color:' + (isLow ? '#e53e3e' : 'var(--accent)') + ';font-size:13px;font-weight:900;text-align:center;" ' +
              'onchange="event.stopPropagation();saveQta(' + idx + ',this.value)" id="inv-qty-' + idx + '"> ';
      html += '<button onclick="event.stopPropagation();deltaQta(' + idx + ',1)" style="background:#333;border:none;color:var(--text);width:30px;height:30px;border-radius:5px;cursor:pointer;font-size:18px;font-weight:bold;touch-action:manipulation;">+</button>';
      html += '<div style="font-size:10px;color:var(--muted);margin-top:2px;">' +
              '<button onclick="event.stopPropagation();openMovProdotto(' + idx + ')" style="background:none;border:none;color:#3182ce;font-size:10px;cursor:pointer;padding:0;">📊</button> ' +
              esc(unit) + (isLow ? ' <span style="color:#e53e3e;font-weight:700;">⚠ min:' + x.soglia + '</span>' : '') +
              '</div>';
      html += '</td>';
      // 6. Prezzo vendita
      html += '<td style="padding:8px 6px;text-align:right;font-size:13px;font-weight:900;color:var(--accent);">€ ' + esc(r.prezzo || '0') + '</td>';
      // 7. Prezzo acquisto (riservato)
      html += '<td style="padding:8px 6px;text-align:right;" onclick="event.stopPropagation();">' +
              '<input type="text" value="' + esc(prezzoAcq) + '" placeholder="—" onclick="event.stopPropagation()" ' +
              'style="width:52px;padding:3px 5px;border:1px solid #333;border-radius:5px;background:#0d0d0d;color:#555;font-size:11px;text-align:right;font-style:italic;" ' +
              'title="Prezzo acquisto" ' +
              'onchange="event.stopPropagation();saveMagRow(' + idx + ',\'prezzoAcquisto\',this.value)">' +
              '</td>';
      // 8. Posizione
      html += '<td style="padding:8px 6px;font-size:11px;color:#888;font-style:italic;">' + esc(pos) + '</td>';
      // 9. Categoria
      html += '<td style="padding:8px 6px;">';
      if(catLabel) html += '<div style="font-size:10px;color:var(--accent);">' + esc(catLabel) + '</div>';
      if(sub)      html += '<div style="font-size:10px;color:#555;">' + esc(sub) + '</div>';
      html += '</td></tr>';
    }

    // Banner se ci sono più di MAX risultati
    if(tot > MAX){
      html += '<tr><td colspan="9" style="text-align:center;padding:12px;font-size:12px;color:var(--muted);background:rgba(245,196,0,.04);border-top:1px solid var(--border);">' +
              '📌 Mostrati <b style="color:var(--accent)">' + MAX + '</b> su <b>' + tot + '</b> risultati — aggiungi parole per restringere la ricerca.' +
              '</td></tr>';
    }
  }

  body.innerHTML = html;

  if(statsEl) statsEl.innerHTML =
    '<div class="sc"><span class="n">' + (tot > MAX ? MAX + '+' : tot) + '</span>Risultati</div>' +
    (totVal > 0 ? '<div class="sc g"><span class="n" style="color:#68d391">€ ' + totVal.toFixed(0) + '</span>Valore</div>' : '') +
    (sottoScorta ? '<div class="sc r"><span class="n" style="color:#e53e3e">' + sottoScorta + '</span>Sotto scorta</div>' : '');
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MAGAZZINO — override renderMagazzino (stessa strategia dell'inventario)
//
//  Problema: la versione in database.js itera 19.000 articoli AL CLICK sulla
//  tab, costruendo HTML per ognuno → crash immediato su mobile.
//
//  Soluzione:
//  • Lista vuota finché non si digitano ≥ 3 caratteri (o filtro/sottoScorta)
//  • Ricerca con indexOf sull'indice _invIdx già costruito (zero fuzzyMatch)
//  • Max 50 card renderizzate
//  • Debounce 350ms sulla digitazione
// ═══════════════════════════════════════════════════════════════════════════════

var _magSearchTimer = null;

function renderMagazzino(){
  // Popola filtro categorie una-tantum
  var sel = document.getElementById('mag-cat-filter');
  if(sel && sel.options.length <= 1 && typeof categorie !== 'undefined'){
    categorie.forEach(function(cat){
      var opt = document.createElement('option');
      opt.value = cat.id; opt.textContent = cat.nome;
      sel.appendChild(opt);
    });
  }
  if(_magSearchTimer) clearTimeout(_magSearchTimer);
  _magSearchTimer = setTimeout(_doMagSearch, 350);
}

function _doMagSearch(){
  var list    = document.getElementById('mag-list');
  var statsEl = document.getElementById('mag-stats');
  if(!list) return;

  // Database non pronto
  if(!rows || !rows.length){
    list.innerHTML = '<div style="text-align:center;padding:40px;color:var(--accent);font-size:14px;">⏳ Database in caricamento...</div>';
    if(statsEl) statsEl.innerHTML = '';
    return;
  }

  // Costruisce indice se mancante (condiviso con inventario)
  if(!_invIdxBuilt) _invBuildIndex();

  var rawSearch  = (document.getElementById('mag-search') || {}).value || '';
  var catFilter  = (document.getElementById('mag-cat-filter') || {}).value || '';
  var hasSearch  = rawSearch.trim().length >= 3;
  var hasFilter  = !!catFilter;
  var hasSottoSc = (typeof magSottoScorta !== 'undefined') && magSottoScorta;
  var mode       = (typeof magMode !== 'undefined') ? magMode : 'prod';

  // Nessun criterio → placeholder
  if(!hasSearch && !hasFilter && !hasSottoSc){
    list.innerHTML =
      '<div style="text-align:center;padding:50px 20px;color:var(--muted);font-size:13px;">' +
      '🔍 Digita almeno <b style="color:var(--accent)">3 caratteri</b> per cercare tra ' +
      '<b style="color:var(--accent)">' + rows.length.toLocaleString('it-IT') + '</b> articoli' +
      '</div>';
    if(statsEl) statsEl.innerHTML =
      '<div class="sc"><span class="n">' + rows.length.toLocaleString('it-IT') + '</span>Articoli totali</div>';
    return;
  }

  // Query words
  var qWords = hasSearch
    ? _invNorm(rawSearch).split(' ').filter(function(w){ return w.length >= 2; })
    : [];

  var MAX = 50;
  var results = [], tot = 0, sottoScorta = 0;

  for(var i = 0; i < rows.length; i++){
    var r = rows[i];
    if(!r) continue;
    if(removed.has(String(i))) continue;
    var m = magazzino[i] || {};

    // Filtro categoria
    if(hasFilter && (m.cat || '__nessuna__') !== catFilter) continue;

    // Filtro testo — indexOf sull'indice piatto
    if(hasSearch){
      var hay = '';
      if(mode === 'spec'){
        // Modalità specifiche: cerca solo in specs
        hay = _invNorm(m.specs || '');
      } else {
        hay = _invIdx[i] || '';
      }
      var ok = true;
      for(var w = 0; w < qWords.length; w++){
        if(hay.indexOf(qWords[w]) < 0){ ok = false; break; }
      }
      if(!ok) continue;
    }

    // Filtro sotto-scorta
    var soglia = getSoglia(i);
    var qty    = (m.qty !== undefined && m.qty !== '') ? Number(m.qty) : null;
    var isLow  = qty !== null && qty <= soglia;
    if(hasSottoSc && !isLow) continue;

    tot++;
    if(isLow) sottoScorta++;
    if(results.length < MAX) results.push({r:r, i:i, m:m, isLow:isLow, soglia:soglia, qty:qty});
  }

  // Stats
  if(statsEl) statsEl.innerHTML =
    '<div class="sc"><span class="n">' + (tot > MAX ? MAX + '+' : tot) + '</span>Trovati</div>' +
    (sottoScorta ? '<div class="sc r"><span class="n" style="color:#e53e3e">' + sottoScorta + '</span>Sotto scorta</div>' : '');

  if(!results.length){
    list.innerHTML = '<div style="text-align:center;padding:40px;color:var(--muted);">Nessun risultato per <b style="color:var(--accent)">"' + esc(rawSearch) + '"</b></div>';
    return;
  }

  // ── Render card ───────────────────────────────────────────────────────────
  var html = '';
  results.forEach(function(o){
    var r = o.r, i = o.i, m = o.m, isLow = o.isLow;
    var qty    = o.qty !== null ? o.qty : '';
    var unit   = m.unit   || 'pz';
    var specs  = m.specs  || '';
    var marca  = m.marca  || '';
    var sub    = m.subcat || '';
    var borderCol = isLow ? '#e53e3e' : 'var(--border)';

    // Categoria label
    var catLabel = '';
    if(m.cat && typeof categorie !== 'undefined'){
      var cf = categorie.find(function(c){ return c.id === m.cat; });
      catLabel = cf ? cf.nome : '';
    }

    // Sotto-categorie per il select dinamico
    var subsForCat = [];
    if(m.cat && typeof categorie !== 'undefined'){
      var cfx = categorie.find(function(x){ return x.id === m.cat; });
      if(cfx) subsForCat = cfx.sub || [];
    }

    var hasFoto = Object.prototype.hasOwnProperty.call(_idbCache, i) && !!_idbCache[i];
    var codM7 = r.codM ? (String(r.codM).match(/^\d+$/) ? String(r.codM).padStart(7,'0') : String(r.codM)) : '—';

    html += '<div style="background:#1e1e1e;border:1px solid ' + borderCol + ';border-radius:10px;padding:10px 12px;margin-bottom:10px;' + (isLow ? 'box-shadow:0 0 0 1px #e53e3e33;' : '') + '">';

    // Badge sotto scorta
    if(isLow){
      html += '<div style="background:#e53e3e;color:#fff;font-size:10px;font-weight:700;padding:2px 8px;border-radius:4px;margin-bottom:6px;display:inline-block;">⚠ SCORTA BASSA — ' + qty + ' ' + unit + ' (min: ' + o.soglia + ')</div>';
    }

    html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">';

    // Colonna sinistra: info
    html += '<div style="flex:1;min-width:0;">';
    html += '<div style="font-size:13px;font-weight:700;color:var(--text);">' + esc(r.desc || '—') + '</div>';
    html += '<div style="font-size:10px;color:var(--muted);margin-top:3px;">';
    if(sub)   html += '<span style="color:var(--accent);">' + esc(sub) + '</span> · ';
    if(marca) html += esc(marca) + ' · ';
    html += '<span style="color:#fc8181;font-weight:600;">' + esc(String(r.codF || '—')) + '</span>';
    html += ' <span style="color:#888;">/</span> ';
    html += '<span style="color:var(--accent);font-weight:600;">' + esc(codM7) + '</span>';
    html += '</div>';
    if(specs) html += '<div style="font-size:11px;color:#aaa;margin-top:4px;font-style:italic;">📐 ' + esc(specs) + '</div>';
    html += '</div>';

    // Colonna destra: foto + prezzo + qty
    html += '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:5px;flex-shrink:0;">';
    if(hasFoto){
      html += '<img src="' + _idbCache[i] + '" onclick="magZoomFoto(' + i + ')" style="width:52px;height:52px;object-fit:cover;border-radius:8px;border:2px solid var(--accent);cursor:pointer;">';
      html += '<button onclick="magRimoviFoto(' + i + ')" style="font-size:9px;color:#e53e3e;background:transparent;border:none;cursor:pointer;padding:0;">rimuovi</button>';
    } else {
      html += '<button onclick="document.getElementById(\'mag-foto-inp-' + i + '\').click()" style="width:52px;height:52px;border-radius:8px;border:1px dashed #444;background:#111;color:#555;font-size:10px;cursor:pointer;line-height:1.3;">📷<br>foto</button>';
      html += '<input type="file" id="mag-foto-inp-' + i + '" accept="image/*" capture="environment" style="display:none;" onchange="magSalvaFoto(' + i + ',this)">';
    }
    html += '<div style="font-size:15px;font-weight:900;color:var(--accent);">€ ' + esc(r.prezzo || '0') + '</div>';
    // Qty + unità
    html += '<div style="display:flex;gap:3px;align-items:center;">';
    html += '<input type="number" min="0" value="' + esc(String(qty)) + '" placeholder="Qtà" ' +
            'style="width:58px;padding:4px 6px;border:1px solid var(--border);border-radius:5px;background:#111;color:var(--text);font-size:13px;font-weight:700;text-align:center;" ' +
            'onchange="saveQta(' + i + ',this.value)" oninput="saveQta(' + i + ',this.value)">';
    html += '<select style="width:52px;padding:4px;border:1px solid var(--border);border-radius:5px;background:#111;color:var(--accent);font-size:11px;" onchange="saveMagRow(' + i + ',\'unit\',this.value)">';
    ['pz','mt','kg','lt','conf','rot','sc'].forEach(function(u){
      html += '<option' + (unit === u ? ' selected' : '') + '>' + u + '</option>';
    });
    html += '</select>';
    html += '</div>';
    html += '</div>'; // fine colonna destra
    html += '</div>'; // fine flex principale

    // Riga dettagli: categoria + sotto-cat + marca + specs + bottone modifica
    html += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:8px;align-items:center;">';
    html += '<select style="flex:1;min-width:130px;padding:5px 8px;border:1px solid var(--border);border-radius:6px;background:#111;color:var(--text);font-size:11px;" onchange="saveMagRow(' + i + ',\'cat\',this.value);renderMagazzino();">';
    html += '<option value="">— Categoria —</option>';
    if(typeof categorie !== 'undefined') categorie.forEach(function(cat){
      html += '<option value="' + cat.id + '"' + (m.cat === cat.id ? ' selected' : '') + '>' + esc(cat.nome) + '</option>';
    });
    html += '</select>';
    html += '<select style="flex:1;min-width:130px;padding:5px 8px;border:1px solid var(--border);border-radius:6px;background:#111;color:var(--text);font-size:11px;" onchange="saveMagRow(' + i + ',\'subcat\',this.value)">';
    html += '<option value="">— Sotto-categoria —</option>';
    subsForCat.forEach(function(s){
      html += '<option' + (m.subcat === s ? ' selected' : '') + '>' + esc(s) + '</option>';
    });
    html += '</select>';
    html += '<input type="text" placeholder="Marca" value="' + esc(marca) + '" ' +
            'style="width:100px;padding:5px 8px;border:1px solid var(--border);border-radius:6px;background:#111;color:var(--text);font-size:11px;" ' +
            'onchange="saveMagRow(' + i + ',\'marca\',this.value)">';
    html += '</div>';
    html += '<input type="text" placeholder="📐 Specifiche tecniche (es: M6×30, IP44, 1000W...)" value="' + esc(specs) + '" ' +
            'style="width:100%;margin-top:6px;padding:5px 10px;border:1px solid var(--border);border-radius:6px;background:#111;color:#aaa;font-size:11px;font-style:italic;" ' +
            'onchange="saveMagRow(' + i + ',\'specs\',this.value)">';
    html += '<button onclick="openEditProdotto(' + i + ')" style="margin-top:8px;width:100%;padding:8px;border-radius:7px;border:1px solid var(--accent)44;background:transparent;color:var(--accent);font-size:12px;font-weight:700;cursor:pointer;touch-action:manipulation;">✏️ Modifica articolo</button>';
    html += '</div>'; // fine card
  });

  // Banner più risultati
  if(tot > MAX){
    html += '<div style="text-align:center;padding:14px;font-size:12px;color:var(--muted);background:rgba(245,196,0,.04);border-radius:8px;margin-top:4px;">' +
            '📌 Mostrati <b style="color:var(--accent)">' + MAX + '</b> su <b>' + tot + '</b> — aggiungi parole per restringere.' +
            '</div>';
  }

  list.innerHTML = html;
}

// ═══════════════════════════════════════════════════════════════════════════════
//  TAB CARTELLINI (t1) — caricamento lazy e cap ridotto su mobile
//
//  Problema: renderTable() viene chiamata da init() all'avvio E ogni volta
//  che si apre t1, renderizzando fino a 300 righe con <input> editabili.
//  Su mobile 300 input nel DOM = crash / freeze.
//
//  Soluzione:
//  • _tablePageSize ridotto a 50 su mobile (≤768px), 100 su desktop
//  • renderTable() soppressa durante init() se t1 non è visibile
//  • goTabDirect override: per t1 mostra banner + ricerca prima di caricare
// ═══════════════════════════════════════════════════════════════════════════════

// ── Riduce _tablePageSize su mobile ──────────────────────────────────────────
(function(){
  var isMobile = window.innerWidth <= 768 || /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
  if(typeof _tablePageSize !== 'undefined'){
    _tablePageSize = isMobile ? 50 : 100;
  }
})();

// ── Lazy loading tab Cartellini (t1) ─────────────────────────────────────────
// NON sovrascriviamo goTabDirect (causa loop per hoisting).
// Usiamo un flag: _t1LazyPending viene controllato dentro renderTable
// che è chiamata da goTabDirect quando id==='t1'.
var _t1LazyPending = false;

// Intercetta i click sui bottoni che portano a t1 nell'HTML
// aggiungendo il flag prima che goTabDirect chiami renderTable
document.addEventListener('click', function(e){
  var btn = e.target.closest('button[onclick]');
  if(!btn) return;
  var oc = btn.getAttribute('onclick') || '';
  // Controlla se il click porta alla tab t1
  if(oc.indexOf("goTab('t1')") >= 0 || oc.indexOf('goTab("t1")') >= 0 ||
     oc.indexOf("goTabDirect('t1')") >= 0){
    _t1LazyPending = true;
  }
}, true); // capture phase: scatta PRIMA di onclick

// Sovrascrive renderTable con una versione che mostra il banner lazy
// quando _t1LazyPending è attivo e ci sono molti articoli.
// USA var + IIFE per evitare il bug di hoisting delle function declaration.
var renderTable = (function(_origRenderTable){
  return function(){
    if(_t1LazyPending){
      _t1LazyPending = false;
      var cap = (typeof _tablePageSize !== 'undefined') ? _tablePageSize : 50;
      var total = rows ? rows.filter(function(r,i){ return r && !removed.has(String(i)); }).length : 0;
      if(total > cap){
        // Mostra banner invece di caricare tutto
        var tb = document.getElementById('tb');
        if(tb){
          tb.innerHTML = '';
          var tr = document.createElement('tr');
          tr.id = '_cart_lazy_banner';
          tr.innerHTML =
            '<td colspan="12" style="padding:30px 20px;text-align:center;background:#1a1a1a;">' +
            '<div style="font-size:32px;margin-bottom:10px;">🏷️</div>' +
            '<div style="font-size:14px;font-weight:700;color:var(--accent);margin-bottom:6px;">' +
            (rows ? rows.length.toLocaleString('it-IT') : '0') + ' articoli nel database' +
            '</div>' +
            '<div style="font-size:12px;color:var(--muted);margin-bottom:16px;">' +
            'Usa 🔍 la ricerca sopra, oppure carica i primi ' + cap + '.' +
            '</div>' +
            '<button onclick="_tableShowAll=false;renderTable();if(typeof genTags===\'function\')genTags();" ' +
            'style="padding:10px 24px;border-radius:10px;border:none;background:var(--accent);color:#111;font-size:14px;font-weight:800;cursor:pointer;touch-action:manipulation;">' +
            '📋 Carica i primi ' + cap + '</button>' +
            '</td>';
          tb.appendChild(tr);
          if(typeof updateStats === 'function') updateStats();
          return; // non chiamare _origRenderTable
        }
      }
    }
    // Comportamento normale
    _origRenderTable();
  };
})(renderTable); // cattura renderTable di database.js QUI, prima dell'assegnazione


// ═══════════════════════════════════════════════════════════════════════════════
//  CT — CARTELLINI TOOL  (array separato da rows[])
//
//  ARCHITETTURA:
//  • rows[]   = database Firebase (19.000 articoli, caricato da loadMagazzinoFB)
//  • ctRows[] = cartellini selezionati per la stampa (chiave localStorage CTK)
//  • I due array non si sovrascrivono mai
// ═══════════════════════════════════════════════════════════════════════════════

var CT = {
  COLORS: [
    {val:'',       label:'—',      bg:'#1e1e1e', dot:'#444',    text:'#666'   },
    {val:'rosso',  label:'Rosso',  bg:'#2a0808', dot:'#e53e3e', text:'#fc8181'},
    {val:'verde',  label:'Verde',  bg:'#081f08', dot:'#38a169', text:'#68d391'},
    {val:'blu',    label:'Blu',    bg:'#08082a', dot:'#3182ce', text:'#63b3ed'},
    {val:'grigio', label:'Grigio', bg:'#141414', dot:'#718096', text:'#a0aec0'},
    {val:'giallo', label:'Giallo', bg:'#1e1800', dot:'#d69e2e', text:'#f6e05e'},
    {val:'viola',  label:'Viola',  bg:'#14082a', dot:'#805ad5', text:'#b794f4'},
    {val:'arancio',label:'Arancio',bg:'#1e0e00', dot:'#dd6b20', text:'#f6ad55'}
  ],

  color: function(val){
    return CT.COLORS.find(function(c){ return c.val===val; }) || CT.COLORS[0];
  },

  save: function(){
    lsSet(CTK, ctRows);
  },

  // ── RENDER lista cartellini ───────────────────────────────────────
  render: function(){
    var list   = document.getElementById('ct-list');
    var empty  = document.getElementById('ct-empty');
    var footer = document.getElementById('ct-footer');
    if(!list) return;

    if(!ctRows.length){
      if(empty)  empty.style.display  = 'block';
      list.style.display  = 'none';
      if(footer) footer.style.display = 'none';
      CT.updateDashboard();
      return;
    }

    if(empty)  empty.style.display  = 'none';
    list.style.display  = 'block';
    if(footer) footer.style.display = 'flex';

    var h = '';
    ctRows.forEach(function(r, i){
      var c       = CT.color(r.giornalino||'');
      var promoOn = (r.barrato==='si' || r.promo==='si');

      h += '<div id="ct-card-'+i+'" style="background:'+c.bg+';border-radius:14px;margin-bottom:10px;'
         + 'border:1px solid '+(c.dot==='#444'?'#2a2a2a':c.dot+'44')+';border-left:4px solid '+c.dot+';overflow:hidden;">';

      // Riga 1: Descrizione + cestino
      h += '<div style="padding:12px 12px 6px;display:flex;align-items:flex-start;gap:8px;">';
      h += '<div style="flex:1;min-width:0;">';
      h += '<div style="font-size:15px;font-weight:800;color:var(--text);line-height:1.3;">'+ esc(r.desc||'—') +'</div>';
      h += '<div style="margin-top:5px;display:flex;gap:6px;flex-wrap:wrap;">';
      if(r.codF) h += '<span style="font-size:11px;color:#fc8181;font-weight:700;background:#2a0808;padding:2px 7px;border-radius:5px;">F: '+esc(r.codF)+'</span>';
      if(r.codM) h += '<span style="font-size:11px;color:var(--accent);font-weight:700;background:#1a1600;padding:2px 7px;border-radius:5px;">M: '+esc(r.codM)+'</span>';
      h += '</div></div>';
      h += '<button onclick="ct_del('+i+')" style="width:40px;height:40px;border-radius:10px;border:1px solid #e53e3e33;background:transparent;color:#e53e3e88;font-size:18px;cursor:pointer;flex-shrink:0;touch-action:manipulation;">🗑️</button>';
      h += '</div>';

      // Riga 2: Prezzi + Promo toggle + Dimensione
      h += '<div style="padding:0 12px 10px;display:flex;align-items:center;gap:8px;flex-wrap:wrap;">';
      if(promoOn){
        h += '<input type="text" value="'+esc(r.prezzoOld||'')+'" placeholder="€ vec."'
           + ' onchange="ct_setPrezzoOld('+i+',this.value)"'
           + ' style="width:68px;min-height:40px;padding:0 8px;border-radius:8px;border:1px solid #e53e3e44;background:#2a0808;color:#fc8181;font-size:13px;font-weight:700;text-align:center;text-decoration:line-through;">';
      }
      h += '<input type="text" value="'+esc(r.prezzo||'')+'" placeholder="€ nuovo"'
         + ' onchange="ct_setPrezzo('+i+',this.value)"'
         + ' style="width:80px;min-height:40px;padding:0 10px;border-radius:8px;border:1px solid var(--accent)44;background:#1a1600;color:var(--accent);font-size:16px;font-weight:900;text-align:center;">';
      h += '<button onclick="ct_togglePromo('+i+')" title="Prezzo sbarrato"'
         + ' style="min-height:40px;padding:0 12px;border-radius:8px;font-size:12px;font-weight:700;cursor:pointer;touch-action:manipulation;'
         + 'border:1px solid '+(promoOn?'#e53e3e88':'#333')+';background:'+(promoOn?'#2a0808':'transparent')+';color:'+(promoOn?'#fc8181':'#555')+';white-space:nowrap;">'
         + (promoOn?'✂️ Promo ON':'✂️ Promo') +'</button>';
      h += '<select onchange="ct_setSize('+i+',this.value)" style="min-height:40px;padding:0 8px;border-radius:8px;border:1px solid #333;background:#1a1a1a;color:#aaa;font-size:12px;cursor:pointer;">'
         + '<option value="small"'+(r.size==='small'?' selected':'')+'>Piccolo</option>'
         + '<option value="large"'+(r.size==='large'?' selected':'')+'>Grande</option>'
         + '</select>';
      h += '</div>';

      // Riga 3: Selettore colore
      h += '<div style="padding:0 12px 12px;display:flex;gap:7px;align-items:center;flex-wrap:wrap;">';
      h += '<span style="font-size:11px;color:#444;">Giornalino:</span>';
      CT.COLORS.forEach(function(col){
        var sel = (r.giornalino||'')=== col.val;
        h += '<button onclick="ct_setColor('+i+',\''+col.val+'\')" title="'+col.label+'"'
           + ' style="width:32px;height:32px;border-radius:50%;border:'+(sel?'3px solid #fff':'2px solid transparent')+';background:'+col.dot
           + ';cursor:pointer;touch-action:manipulation;transform:'+(sel?'scale(1.25)':'scale(1)')+';transition:transform .12s;"></button>';
      });
      h += '</div>';

      h += '</div>';
    });

    list.innerHTML = h;
    CT.updateDashboard();
  },

  // ── Dashboard ───────────────────────────────────────────────────
  updateDashboard: function(){
    var dash = document.getElementById('ct-dashboard');
    if(!dash) return;

    var h = '<div style="flex-shrink:0;background:#1a1a1a;border-radius:10px;padding:6px 12px;border:1px solid #2a2a2a;text-align:center;min-width:56px;">'
          + '<div style="font-size:18px;font-weight:900;color:var(--accent);line-height:1;">'+ctRows.length+'</div>'
          + '<div style="font-size:9px;color:#555;text-transform:uppercase;letter-spacing:.5px;margin-top:1px;">Totale</div>'
          + '</div>';

    CT.COLORS.slice(1).forEach(function(col){
      var count = ctRows.filter(function(r){ return (r.giornalino||'')===col.val; }).length;
      if(!count) return;
      h += '<div style="flex-shrink:0;background:'+col.bg+';border-radius:10px;padding:6px 12px;border:1px solid '+col.dot+'44;text-align:center;min-width:56px;">'
         + '<div style="font-size:18px;font-weight:900;color:'+col.dot+';line-height:1;">'+count+'</div>'
         + '<div style="font-size:9px;color:'+col.text+';text-transform:uppercase;letter-spacing:.5px;margin-top:1px;">'+col.label+'</div>'
         + '</div>';
    });

    var noColor = ctRows.filter(function(r){ return !(r.giornalino||''); }).length;
    if(noColor && ctRows.length){
      h += '<div style="flex-shrink:0;background:#1a1a1a;border-radius:10px;padding:6px 12px;border:1px solid #2a2a2a;text-align:center;min-width:56px;">'
         + '<div style="font-size:18px;font-weight:900;color:#555;line-height:1;">'+noColor+'</div>'
         + '<div style="font-size:9px;color:#444;text-transform:uppercase;letter-spacing:.5px;margin-top:1px;">Nessuno</div>'
         + '</div>';
    }

    dash.innerHTML = h;
  }
};

// ── Azioni sulle righe ───────────────────────────────────────────────────────

function ct_setColor(i, val){
  if(!ctRows[i]) return;
  ctRows[i].giornalino = val;
  CT.save(); CT.render();
}

function ct_setPrezzo(i, val){
  if(!ctRows[i]) return;
  var old = ctRows[i].prezzo;
  if(old && old!==val){
    if(!ctRows[i].priceHistory) ctRows[i].priceHistory=[];
    ctRows[i].priceHistory.unshift({prezzo:old, data:new Date().toLocaleDateString('it-IT')});
  }
  ctRows[i].prezzo = val;
  ctRows[i].size = (typeof autoSize==='function') ? autoSize(val) : 'small';
  CT.save(); CT.updateDashboard();
}

function ct_setPrezzoOld(i, val){
  if(!ctRows[i]) return;
  ctRows[i].prezzoOld = val;
  CT.save();
}

function ct_togglePromo(i){
  if(!ctRows[i]) return;
  var on = ctRows[i].barrato==='si' || ctRows[i].promo==='si';
  ctRows[i].barrato = on?'no':'si';
  ctRows[i].promo   = on?'no':'si';
  CT.save(); CT.render();
}

function ct_setSize(i, val){
  if(!ctRows[i]) return;
  ctRows[i].size = val;
  CT.save();
}

function ct_del(i){
  if(!ctRows[i]) return;
  var removed_row = ctRows.splice(i,1)[0];
  cestino.unshift(Object.assign({}, removed_row, {deletedAt:new Date().toLocaleString('it-IT')}));
  lsSet(CK, cestino);
  CT.save(); CT.render();
  updateBadge && updateBadge();
  showToastGen('red','🗑️ Rimosso dai cartellini');
}

function ct_svuota(){
  showConfirm('Svuotare tutti i cartellini?', function(){
    ctRows.forEach(function(r){
      cestino.unshift(Object.assign({},r,{deletedAt:new Date().toLocaleString('it-IT')}));
    });
    ctRows = [];
    lsSet(CK, cestino);
    CT.save(); CT.render();
    updateBadge && updateBadge();
    showToastGen('green','✅ Lista svuotata');
  });
}

function ct_genAnteprima(){
  if(!ctRows.length){ showToastGen('red','⚠️ Nessun cartellino'); return; }
  // Genera anteprima usando ctRows come sorgente temporanea
  var backup = rows;
  rows = ctRows;
  if(typeof genTags==='function') genTags();
  if(typeof showPrev==='function') showPrev();
  rows = backup;
}

function ct_toggleCsv(){
  var p = document.getElementById('ct-csv-panel');
  var b = document.getElementById('ct-csv-btn');
  if(!p) return;
  var open = p.style.display!=='none';
  p.style.display = open ? 'none' : 'block';
  if(b){ b.style.borderColor = open?'#2a2a2a':'var(--accent)'; b.style.color = open?'#555':'var(--accent)'; }
}

// ── Ricerca articoli dal database rows[] ─────────────────────────────────────
var _ctSearchTimer = null;

function ct_searchInput(val){
  clearTimeout(_ctSearchTimer);
  var res = document.getElementById('ct-search-results');
  if(!res) return;
  val = (val||'').trim();
  if(val.length<2){ res.style.display='none'; res.innerHTML=''; return; }
  _ctSearchTimer = setTimeout(function(){ ct_doSearch(val); }, 280);
}

function ct_doSearch(q){
  var res = document.getElementById('ct-search-results');
  if(!res) return;

  // rows[] è il database Firebase — deve essere caricato
  if(!rows || !rows.length){
    res.innerHTML='<div style="padding:14px;color:#555;text-align:center;font-size:13px;">⏳ Database non caricato — apri prima la tab Inventario</div>';
    res.style.display='block'; return;
  }

  var qn = q.toLowerCase();
  var matches = [];
  for(var i=0; i<rows.length; i++){
    var r = rows[i];
    if(!r) continue;
    var text = [(r.desc||''),(r.codF||''),(r.codM||'')].join(' ').toLowerCase();
    if(text.indexOf(qn)>=0){ matches.push({r:r,i:i}); if(matches.length>=25) break; }
  }

  if(!matches.length){
    res.innerHTML='<div style="padding:14px;color:#555;text-align:center;font-size:13px;">Nessun risultato per "<b>'+esc(q)+'</b>"</div>';
    res.style.display='block'; return;
  }

  var h='';
  matches.forEach(function(m){
    var r=m.r; var mag=magazzino[m.i]||{};
    h+='<div onclick="ct_addFromSearch('+m.i+')"'
      +' style="padding:11px 14px;border-bottom:1px solid #1e1e1e;cursor:pointer;display:flex;gap:10px;align-items:center;touch-action:manipulation;"'
      +' onpointerdown="this.style.background=\'#252525\'" onpointerup="this.style.background=\'\'" onpointerleave="this.style.background=\'\'">';
    h+='<div style="flex:1;min-width:0;">';
    h+='<div style="font-size:14px;font-weight:700;color:#e8e8e8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">'+esc(r.desc||'—')+'</div>';
    h+='<div style="font-size:11px;color:#555;margin-top:2px;display:flex;gap:6px;flex-wrap:wrap;">';
    if(r.codF) h+='<span style="color:#fc8181;">F: '+esc(r.codF)+'</span>';
    if(r.codM) h+='<span style="color:var(--accent);">M: '+esc(r.codM)+'</span>';
    if(mag.specs) h+='<span style="color:#2dd4bf;">'+esc(mag.specs.substring(0,35))+'</span>';
    h+='</div></div>';
    if(r.prezzo) h+='<div style="font-size:16px;font-weight:900;color:var(--accent);flex-shrink:0;">€'+esc(r.prezzo)+'</div>';
    h+='<div style="font-size:20px;color:#555;flex-shrink:0;">＋</div>';
    h+='</div>';
  });

  res.innerHTML=h; res.style.display='block';
}

function ct_addFromSearch(idx){
  var r = rows[idx]; // cerca nel DATABASE, non nei cartellini
  if(!r){ showToastGen('red','❌ Articolo non trovato'); return; }

  var newRow = {
    data:     new Date().toLocaleDateString('it-IT'),
    desc:     r.desc  || '',
    codF:     r.codF  || '',
    codM:     r.codM  || '',
    prezzoOld:'',
    prezzo:   r.prezzo || '',
    size:     (typeof autoSize==='function') ? autoSize(r.prezzo||'0') : 'small',
    note:     '',
    giornalino: '',
    barrato:  'no',
    promo:    'no',
    priceHistory: []
  };

  ctRows.push(newRow);
  CT.save(); CT.render();
  ct_closeSearch();
  showToastGen('green','✅ '+esc(r.desc||'Articolo')+' aggiunto');
}

function ct_closeSearch(){
  var inp=document.getElementById('ct-search');
  var res=document.getElementById('ct-search-results');
  if(inp) inp.value='';
  if(res){ res.style.display='none'; res.innerHTML=''; }
}

// Chiudi dropdown click fuori
document.addEventListener('click', function(e){
  var res=document.getElementById('ct-search-results');
  if(!res||res.style.display==='none') return;
  var inp=document.getElementById('ct-search');
  if(inp&&inp.contains(e.target)) return;
  if(res.contains(e.target)) return;
  res.style.display='none';
});

// ── Integrazione con import CSV ──────────────────────────────────────────────
// Dopo confirmImp, i cartellini dal CSV finiscono in rows[].
// Li migriamo in ctRows[] e ripristiniamo rows[] al database Firebase.
var confirmImp = (function(_ci_orig){
  return function(){
    var rowsBefore = rows.slice(); // backup database corrente
    _ci_orig(); // esegue l'import (modifica rows)
    // Dopo import: rows contiene i cartellini importati + eventuali dati DB
    // Estrai solo i nuovi cartellini (quelli con prezzo, aggiunti dall'import vecchio formato)
    var rowsAfter = rows;
    if(rowsAfter !== rowsBefore && rowsAfter.length <= 500){
      // Formato vecchio: rows = solo cartellini — migrali in ctRows
      rowsAfter.forEach(function(r){ ctRows.push(Object.assign({},r)); });
      rows = rowsBefore; // ripristina il database Firebase
      CT.save(); CT.render();
      showToastGen('green','✅ '+ctRows.length+' cartellini importati');
    } else {
      // Formato nuovo: confirmImp aggiorna DB e cartellini separatamente
      setTimeout(function(){ CT.render(); }, 200);
    }
    ct_toggleCsv(); // chiudi pannello CSV
  };
})(confirmImp);

// ── Aggiorna CT quando si apre la tab t1 ─────────────────────────────────────
document.addEventListener('click', function(e){
  var btn = e.target.closest('[onclick]');
  if(!btn) return;
  var oc = btn.getAttribute('onclick')||'';
  if(oc.indexOf("'t1'")>=0||oc.indexOf('"t1"')>=0){
    setTimeout(function(){ CT.render(); }, 60);
  }
}, true);

// Render iniziale
setTimeout(function(){ CT.render(); }, 350);
