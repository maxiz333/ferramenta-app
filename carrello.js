// ══ CARRELLO ═══════════════════════════════════════════════════════
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
    ensurePrezzoOriginaleDaListino(it, true);
    it.scampolo=true;
    it._scontoApplicato=perc;
    it._scontoTipo='globale';
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
    if(it._scontoTipo==='globale'){
      it.scampolo=false;it.fineRotolo=false;
      delete it._scontoApplicato;delete it._scontoTipo;
    }
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
    var sub=(_prezzoEffettivo(it)*parseFloat(it.qty||0)).toFixed(2);
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
    createdAt:new Date().toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'}),
    dataCreazione:Date.now(),
    creatoAtISO:new Date().toISOString(),
    items:[],
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
  if(!_cartPossoModificare(cart)){
    showToastGen('orange','🔒 Non puoi eliminare il carrello di un altro account');
    return;
  }
  cart.deletedAt=new Date().toLocaleString('it-IT');
  carrelliCestino.push(cart);lsSet(CART_CK,carrelliCestino);
  carrelli=carrelli.filter(function(c){return c.id!==id;});
  if(activeCartId===id)activeCartId=carrelli.length?carrelli[carrelli.length-1].id:null;
  saveCarrelli();renderCartTabs();
  showToastGen('green','🗑️ Carrello eliminato');
}

// ── PERMESSI CARRELLO ────────────────────────────────────────────────────────
function _cartPossoModificare(cart){
  if(!cart) return false;
  var myKey = (typeof _currentUser !== 'undefined' && _currentUser) ? _currentUser.key : null;
  var myRuolo = (typeof _currentUser !== 'undefined' && _currentUser) ? _currentUser.ruolo : 'proprietario';
  if(myRuolo === 'proprietario') return true;
  if(!cart.commesso) return true;
  return cart.commesso === myKey;
}

// Sblocca carrello inviato → torna attivo e rientra in Firebase
function cartUnlock(cartId){
  var cart = carrelli.find(function(c){ return c.id === cartId; });
  if(!cart) return;
  if(!_cartPossoModificare(cart)){
    showToastGen('orange','🔒 Solo il proprietario del carrello può sbloccarlo');
    return;
  }
  console.log('[CART] cartUnlock:', cartId);
  cart.stato = 'modifica';
  cart.locked = false;
  saveCarrelli(); // ora saveCarrelli lo include di nuovo in Firebase perché non è più 'inviato'
  renderCartTabs();
  showToastGen('purple','✏️ Carrello sbloccato — modifica e aggiorna');
}

// ── FORZA ACCESSO CARRELLO — triplo tap ──────────────────────────────────────
var _cartForzaTapTimer = null;
var _cartForzaTapId = null;
var _cartForzaTapCount = 0;

function cartForzaAccesso(cartId){
  if(_cartForzaTapId === cartId){
    _cartForzaTapCount++;
    clearTimeout(_cartForzaTapTimer);
    if(_cartForzaTapCount >= 2){
      _cartForzaTapId = null; _cartForzaTapCount = 0;
      var cart = carrelli.find(function(c){ return c.id === cartId; });
      if(!cart) return;
      var nomeComm = (typeof _roles !== 'undefined' && _roles[cart.commesso])
        ? _roles[cart.commesso].nome : (cart.commesso || 'altro account');
      if(!confirm('⚠️ Forza accesso\n\nCarrello di ' + nomeComm + '.\n\nVuoi prendere il controllo?')) return;
      var chi = (typeof _currentUser !== 'undefined' && _currentUser) ? _currentUser.key : '';
      var chiNome = (typeof _currentUser !== 'undefined' && _currentUser) ? _currentUser.nome : 'Sconosciuto';
      console.warn('[CART] cartForzaAccesso — '+chiNome+' prende controllo da '+nomeComm);
      cart.commesso = chi;
      saveCarrelli();
      renderCartTabs();
      showToastGen('orange','🔓 Accesso forzato — ora sei il proprietario');
      return;
    }
    showToastGen('orange','Ancora un tap per forzare...');
  } else {
    _cartForzaTapId = cartId; _cartForzaTapCount = 0;
    showToastGen('orange','Triplo tap per forzare accesso');
  }
  _cartForzaTapTimer = setTimeout(function(){ _cartForzaTapId=null; _cartForzaTapCount=0; }, 600);
}

// ── ELIMINA CARRELLO IN MODIFICA ────────────────────────────────────────────
// Scollega l'ordine (se esiste ancora) e rimuove il carrello
function eliminaCarrelloModifica(cartId){
  var cart = carrelli.find(function(c){ return c.id === cartId; });
  if(!cart) return;
  showConfirm('Eliminare questo carrello?\nSe l\'ordine esiste ancora rimarrà invariato.', function(){
    // Scollega bozza se presente
    if(cart.bozzaOrdId){
      ordini = ordini.filter(function(o){ return o.id !== cart.bozzaOrdId; });
      saveOrdini();
    }
    // Rimuovi il carrello
    deleteCart(cartId);
  });
}

// ── SVUOTA CARRELLO ──────────────────────────────────────────────────────────
// Rimuove tutti gli articoli dal carrello attivo dopo conferma utente.
// Usa showConfirm (funzione custom, non window.confirm bloccante su WebView).
function svuotaCarrello(cartId){
  var cart = carrelli.find(function(c){ return c.id === cartId; });
  if(!cart || !(cart.items||[]).length){ showToastGen('yellow','Carrello già vuoto'); return; }
  if(!_cartPossoModificare(cart)){
    showToastGen('orange','🔒 Non puoi svuotare il carrello di un altro account');
    return;
  }
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

// Helper: calcola prezzo effettivo (con sconto scampolo/rotolo se attivo) — base = listino
function _prezzoEffettivo(it){
  var p = listinoPrezzoNum(it);
  var sc=it._scontoApplicato||0;
  if((it.scampolo||it.fineRotolo) && sc>0) return p*(1-sc/100);
  if(it._scaglionato && sc>0){
    var q=parseFloat(it.qty||0);
    var soglia=it._scaglioneQta||10;
    if(q>=soglia) return p*(1-sc/100);
  }
  return p;
}
function cartCycleScampolo(cartId,idx){
  var cart=carrelli.find(function(c){return c.id===cartId;});
  if(!cart||!cart.items[idx])return;
  var it=cart.items[idx];
  if(!it.scampolo && !it.fineRotolo && !it._tuttoRotolo && !it._scaglionato){
    if(!ensurePrezzoOriginaleDaListino(it, true)){
      showToastGen('orange','Listino non disponibile: imposta prezzo o cerca da magazzino');
      return;
    }
    it.scampolo=true; it.fineRotolo=false; it._tuttoRotolo=false; it._scaglionato=false;
    it._scontoTipo='scampolo';
    if(!it._scontoApplicato) it._scontoApplicato=SCONTO_SCAMPOLO_DEFAULT_PCT;
  } else if(it.scampolo){
    if(!ensurePrezzoOriginaleDaListino(it, true)) return;
    it.scampolo=false; it.fineRotolo=true; it._tuttoRotolo=true; it._scaglionato=false;
    it._scontoTipo='rotolo';
    it._scontoApplicato = SCONTO_ROTOLO_DEFAULT_PCT;
    it.nota='ROTOLO INTERO';
  } else if(it.fineRotolo || it._tuttoRotolo){
    if(!ensurePrezzoOriginaleDaListino(it, true)) return;
    it.scampolo=false; it.fineRotolo=false; it._tuttoRotolo=false; it._scaglionato=true;
    it._scontoTipo='scaglionato';
    if(it.nota==='ROTOLO INTERO') it.nota='';
    if(!it._scontoApplicato) it._scontoApplicato=SCONTO_SCAGLIONI_DEFAULT_PCT;
    if(!it._scaglioneQta) it._scaglioneQta=10;
  } else {
    var restoreC = it._prezzoOriginale || listinoPrezzoString(it);
    it.scampolo=false; it.fineRotolo=false; it._tuttoRotolo=false; it._scaglionato=false;
    delete it._scontoTipo; delete it._scontoApplicato; delete it._scaglioneQta;
    delete it._prezzoOriginale;
    if(restoreC && parsePriceIT(restoreC) > 0) it.prezzoUnit = restoreC;
  }
  saveCarrelli();renderCartTabs();
}
function cartSetScontoScampolo(cartId,idx,val){
  var cart=carrelli.find(function(c){return c.id===cartId;});
  if(!cart||!cart.items[idx])return;
  var it=cart.items[idx];
  it._scontoApplicato=parseFloat(val)||0;
  if(it.scampolo||it.fineRotolo||it._scaglionato){
    ensurePrezzoOriginaleDaListino(it, true);
  }
  saveCarrelli();renderCartTabs();
}
function _applicaScontoScampolo(it){
  if(!ensurePrezzoOriginaleDaListino(it, true)) return;
  var base = parsePriceIT(it._prezzoOriginale);
  if(base <= 0) return;
  var sc = it._scontoApplicato || 0;
  if((it.scampolo || it.fineRotolo) && sc > 0){
    it.prezzoUnit = (base * (1 - sc/100)).toFixed(2);
  } else if(it.scampolo || it.fineRotolo){
    it.prezzoUnit = it._prezzoOriginale;
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
  var qWords=qLow.split(/\s+/).filter(function(w){return w.length>0;});
  rows.forEach(function(r,i){
    if(!r)return;
    if(removed.has(String(i)))return;
    var m=magazzino[i]||{};
    // Protezione: codF e codM possono essere null/undefined/number
    var codF=String(r.codF||'');
    var codM=String(r.codM||'');
    // Early-exit: ogni parola della query deve essere presente nel testo
    var text=[r.desc,codF,codM,m.marca,m.specs].join(' ').toLowerCase();
    var ok=true;
    for(var w=0;w<qWords.length;w++){
      if(text.indexOf(qWords[w])<0){ok=false;break;}
    }
    if(!ok) return;
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
//  renderCartTabs — RISCRITTURA DEFINITIVA v3
//  Layout testata: 3 righe fisse centrate max 600px
//  Riga 1: [📦 ORDINI — centrato]
//  Riga 2: [👥 CLIENTI▾]  [＋ NUOVO]
//  Riga 3: pillole nomi clienti (scroll laterale, mai trabocca)
//  Card: nome a capo | codici 14px | prezzo blu/verde | qty interi
// =============================================================================
function renderCartTabs(){
  var body = document.getElementById('cart-body');
  if(!body) return;

  // ── TESTATA: riga unica nel wrapper (struttura già in HTML) ────────────
  var wrap = document.getElementById('ct-header-wrap');
  var row1 = document.getElementById('ct-row-ordini');

  // Rimuovi vecchia riga 2 se esiste (legacy)
  var oldRow2 = document.getElementById('ct-row-azioni');
  if(oldRow2) oldRow2.remove();

  // Riga unica: NUOVO + CLIENTI + ORDINI (in ordine di importanza)
  var _oggiC = new Date().toISOString().slice(0,10);
  var nCl = carrelli.filter(function(c){
    var d = c.creatoAtISO ? c.creatoAtISO.slice(0,10) : '';
    return d === _oggiC || c.stato === 'inviato' || c.stato === 'modifica';
  }).length;
  row1.innerHTML =
    '<button class="ct-pill--new" onclick="newCart()">＋ NUOVO</button>' +
    '<button id="ct-btn-clienti" onclick="ctApriClienti()" title="Scegli cliente">' +
      '👥 CLIENTI' + (nCl ? ' <span class="ct-pill-n">' + nCl + '</span>' : '') +
    '</button>' +
    '<button id="ct-btn-ordfor" onclick="goTab(\'t-ordfor\');renderOrdFor()" title="Ordini per fornitore">📦 ORDINI</button>';

  // ── DROPDOWN CLIENTI (creato una sola volta nel body) ─────────────────────
  if(!document.getElementById('ct-clienti-dropdown')){
    var dd = document.createElement('div');
    dd.id  = 'ct-clienti-dropdown';
    dd.innerHTML =
      '<div id="ct-clienti-backdrop" onclick="ctChiudiClienti()"></div>' +
      '<div id="ct-clienti-panel">' +
        '<h3>👥 Clienti</h3>' +
        '<div id="ct-clienti-list"></div>' +
        '<button class="ct-clienti-close" onclick="ctChiudiClienti()">✕ Chiudi</button>' +
      '</div>';
    document.body.appendChild(dd);
  }

  // ── CORPO VUOTO ───────────────────────────────────────────────────────────
  if(!activeCartId || !carrelli.length){
    body.innerHTML =
      '<div class="ct-empty">' +
        '<div class="ct-empty-icon">🛒</div>' +
        '<p>Premi <b style="color:#FFD700">＋ NUOVO</b> per iniziare</p>' +
      '</div>';
    return;
  }
  var cart = carrelli.find(function(c){ return c.id === activeCartId; });
  if(!cart) return;

  var h = '';

  // ── CARRELLO DI UN ALTRO ACCOUNT — overlay blocco ──────────────────────────
  var _cartMio = _cartPossoModificare(cart);
  if(!_cartMio){
    var _nomeComm = (typeof _roles !== 'undefined' && _roles[cart.commesso])
      ? _roles[cart.commesso].nome : (cart.commesso || 'altro account');
    h += '<div style="position:relative;background:#111;border-radius:14px;border:2px solid #2a2a2a;min-height:160px;display:flex;align-items:center;justify-content:center;">';
    h += '<div class="ord-lock-overlay" style="position:relative;border-radius:12px;padding:32px 20px;" onclick="cartForzaAccesso(' + "'" + cart.id + "'" + ')">';
    h += '<div class="ord-lock-msg">';
    h += '<div style="font-size:30px;margin-bottom:8px">🔐</div>';
    h += '<div style="font-size:15px;font-weight:900">CARRELLO DI ' + esc(_nomeComm).toUpperCase() + '</div>';
    h += '<div style="font-size:11px;margin-top:6px;color:#aaa">' + (cart.items||[]).length + ' articoli — solo lettura</div>';
    h += '<div style="font-size:10px;margin-top:10px;color:#666">Triplo tap per forzare accesso</div>';
    h += '</div></div></div>';
    body.innerHTML = h;
    return;
  }

  // ── STATO INVIATO (read-only) ─────────────────────────────────────────────
  if(cart.stato === 'inviato' && cart.locked){
    var totInv = (cart.items||[]).reduce(function(s,it){
      return s + _prezzoEffettivo(it) * parseFloat(it.qty||0);
    }, 0);
    h += '<div class="ct-inviato-box">';
    h += '<div class="ct-inviato-top">';
    h += '<span style="font-size:22px">✅</span>';
    h += '<div style="flex:1"><div class="ct-inviato-label">Ordine inviato alla cassa</div>';
    h += '<div class="ct-inviato-nome" onclick="ctEditClienteName(\''+cart.id+'\')" style="cursor:pointer;" title="Tap per modificare">' + esc(cart.nome) + '</div></div>';
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

  // ── BANNER MODIFICA — striscia sottile ─────────────────────────────────
  if(cart.stato === 'modifica'){
    h += '<div class="ct-banner-mod">';
    h += '<span style="font-size:13px">✏️</span>';
    h += '<span class="ct-banner-mod-title" onclick="ctEditClienteName(\''+cart.id+'\')" style="cursor:pointer;" title="Tap per modificare">' + esc(cart.nome) + ' — MODIFICA</span>';
    h += '</div>';
  }

  // ── BARRA CERCA — compatta ──────────────────────────────────────────────
  h += '<div id="cart-action-btns">';
  h += '<button class="ct-btn-cerca" onclick="openCodeNumpad()">';
  h += '🔍 CERCA PER CODICE</button></div>';
  h += '<div id="cart-search-wrap">';
  h += '<input type="text" id="cart-search" placeholder="🔎 Cerca per nome, specifiche..." ';
  h += 'style="width:100%;padding:10px 14px;border:1px solid #2e3033;border-radius:10px;font-size:13px;background:#1e1e1e;color:#f0f0f0;box-sizing:border-box" ';
  h += 'oninput="renderCartSearch()" autocomplete="off">';
  h += '</div>';
  h += '<div id="cart-search-results" style="padding:0 8px"></div>';

  // ── LISTA VUOTA ───────────────────────────────────────────────────────────
  if(!(cart.items||[]).length){
    h += '<div class="ct-empty" style="padding:30px 20px">';
    h += '<div class="ct-empty-icon">📦</div>';
    h += '<p>Cerca un articolo o premi <b style="color:#FFD700">CERCA PER CODICE</b></p>';
    h += '</div>';
  } else {

    // ── TOTALE STICKY ─────────────────────────────────────────────────────
    var tot     = (cart.items||[]).reduce(function(s,it){ return s + _prezzoEffettivo(it) * parseFloat(it.qty||0); }, 0);
    var scontoGl = cart.scontoGlobale;
    var totFin   = scontoGl ? tot * (1 - scontoGl/100) : tot;
    h += '<div class="ct-sticky-total">';
    h += '<span class="ct-sticky-val">€ ' + totFin.toFixed(2) + '</span>';
    if(scontoGl) h += '<span class="ct-sconto-badge">-'+scontoGl+'%</span>';
    h += '<span class="ct-sticky-n">' + (cart.items||[]).length + ' art.</span>';
    h += '<button onclick="openScontoOverlay()" class="ct-btn-sconto">% Sconto</button>';
    h += '</div>';

    // ── GRIGLIA ARTICOLI — stessa struttura tab ordini ─────────────
    h += '<div class="ord-items-wrap">';
    h += '<div class="ord-grid ord-grid-head">';
    h += '<div class="ord-gh">Prodotto</div>';
    h += '<div class="ord-gh ord-gh-c">Qtà</div>';
    h += '<div class="ord-gh ord-gh-c">Prezzo</div>';
    h += '<div class="ord-gh ord-gh-c">Tot</div>';
    h += '</div>';
    h += '</div>';

    // ── CARD ARTICOLI ──────────────────────────────────────────────────────
    (cart.items||[]).forEach(function(it, idx){
      var p            = listinoPrezzoNum(it);
      var q            = parseFloat(it.qty) || 0;
      var isSc         = it.scampolo    || false;
      var isFR         = it.fineRotolo  || false;
      var isDaOrd      = it.daOrdinare  || false;
      var scagAp       = it._scaglioniAperti || false;
      var scagAtt      = it._scaglioneAttivo || null;
      var hasNota      = !!(it.nota && it.nota.trim());
      var scOn         = isSc || isFR;
      var isTuttoRotolo = it._tuttoRotolo || false;

      // Prezzo scontato calcolato al volo
      var scAttivo     = it._scontoApplicato || 0;
      var scApplica = false;
      if(it._scaglionato && scAttivo > 0){
        // Scaglionato: sconto solo se qty >= soglia
        scApplica = q >= (it._scaglioneQta || 10);
      } else if(scOn && scAttivo > 0){
        scApplica = true;
      }
      var pScontato    = scApplica ? p * (1 - scAttivo/100) : p;
      var sub          = (pScontato * q).toFixed(2);

      // Cod. Magazzino — 7 cifre se numerico
      var codM7 = it.codM
        ? (String(it.codM).match(/^\d+$/) ? String(it.codM).padStart(7,'0') : it.codM)
        : '';
      var codF = it.codF || '';

      // Bordo card
      var cardStyle = '';
      if(isTuttoRotolo)    cardStyle = 'border-color:#e53e3e;box-shadow:0 0 0 2px #e53e3e55';
      else if(it._ordColore) cardStyle = 'border-color:' + it._ordColore + ';box-shadow:0 0 0 1px ' + it._ordColore + '44';

      var cardClass = 'ct-card' +
        (it._checked ? ' ct-card--checked' : '') +
        (cart.stato === 'modifica' ? ' ct-card--mod' : '');

      h += '<div class="' + cardClass + '" id="cart-row-' + idx + '"' +
           (cardStyle ? ' style="' + cardStyle + '"' : '') + '>';

      // ── RIGA GRIGLIA: stessa struttura ord-grid 50%|15%|15%|20% ──────
      h += '<div class="ord-grid ord-grid-row' + (idx%2===0 ? ' ord-grid-even' : ' ord-grid-odd') + '">';

      // Colonna prodotto: nome + codici
      h += '<div class="ord-gc-desc">';
      h += '<div class="ord-item-name">' + esc(it.desc || '—') + '</div>';
      var codes = '';
      if(codM7) codes += '<span class="ord-code-mag">' + esc(codM7) + '</span>';
      // Cod.Forn editabile
      codes += '<span class="ord-code-forn" style="display:inline-flex;align-items:center;gap:2px;">Forn: ';
      codes += '<input class="ct-codf-inp" value="' + esc(codF) + '" placeholder="—" ' +
               'oninput="ctSetCodF(\'' + cart.id + '\',' + idx + ',this.value)" ' +
               'onclick="event.stopPropagation();this.select()" ' +
               'onkeydown="if(event.key===\'Enter\')this.blur()">';
      codes += '</span>';
      h += '<div class="ord-item-codes">' + codes + '</div>';
      h += '</div>';

      // Colonna quantità — stepper interattivo
      h += '<div class="ord-gc-qty ct-grid-qty">';
      h += '<div class="ct-qty ct-qty--compact">';
      h += '<button class="ct-qty-btn" onclick="cartDelta(\'' + cart.id + '\',' + idx + ',-1)">−</button>';
      h += '<button class="ct-qty-val" onclick="openQtyNumpad(\'' + cart.id + '\',' + idx + ')">' + Math.round(q) + '</button>';
      h += '<button class="ct-qty-btn" onclick="cartDelta(\'' + cart.id + '\',' + idx + ',1)">＋</button>';
      h += '</div>';
      var units = ['pz','mt','kg','lt','cf','ml','gr','mm','cm','m²','m³'];
      var curUnit = it.unit || 'pz';
      h += '<select class="ct-um-select ct-um--mini" onchange="cartSetUnit(\'' + cart.id + '\',' + idx + ',this.value)">';
      units.forEach(function(u){
        h += '<option value="' + u + '"' + (u === curUnit ? ' selected' : '') + '>' + u + '</option>';
      });
      h += '</select>';
      h += '</div>';

      // Colonna prezzo — prezzo base sempre visibile, scontato sotto se attivo
      h += '<div class="ord-gc-price" id="prz-' + idx + '">';
      var hasSconto = scApplica && pScontato < p - 0.005;
      if(hasSconto){
        var savU = (p - pScontato).toFixed(2);
        h += '<div class="ct-old--orig">€' + p.toFixed(2) + '</div>';
        h += '<div class="ct-sub--final">€' + pScontato.toFixed(2) + '</div>';
        h += '<div style="font-size:8px;color:#f6ad55;text-align:center;">-€' + savU + '</div>';
      } else {
        h += '<div style="font-size:12px;font-weight:900;color:#999">€' + p.toFixed(2) + '</div>';
      }
      h += '<input class="ct-punit" type="text" inputmode="decimal" value="' +
           esc(it.prezzoUnit||'0') + '" ' +
           'onchange="cartSetPrezzo(\'' + cart.id + '\',' + idx + ',this.value)" ' +
           'onclick="this.select()" title="€/unità">';
      h += '</div>';

      // Colonna totale
      h += '<div class="ord-gc-sub">';
      if(hasSconto){
        var savT = ((p - pScontato) * q).toFixed(2);
        h += '<div class="ct-old--orig">€' + (p * q).toFixed(2) + '</div>';
        h += '<div class="ct-sub--final">€' + sub + '</div>';
        h += '<div style="font-size:8px;color:#f6ad55;text-align:center;">-€' + savT + '</div>';
      } else {
        var subColor = isTuttoRotolo ? '#fc8181' : (isFR ? '#f6ad55' : 'var(--accent)');
        h += '<div style="font-size:13px;font-weight:900;color:' + subColor + '">€' + sub + '</div>';
      }
      h += '</div>';

      h += '</div>'; // fine ord-grid row

      // ── ICONBAR: Forbici+% | Note | Ordina | Cestino ─────────────────────
      h += '<div class="ct-iconbar">';

      // FORBICI (tap=scampolo, doppio tap=rotolo) + input % inline
      var isScag = it._scaglionato || false;
      var forbLbl = isScag ? 'SCAGLIONATO' : (isTuttoRotolo ? 'ROTOLO' : (scOn ? (isFR ? 'ROTOLO' : 'SCAMPOLO') : ''));
      var forbActive = scOn || isTuttoRotolo || isScag;
      h += '<div class="ct-forbici-row">';
      h += '<button class="ct-icon-btn' +
           (forbActive ? ' ct-icon-btn--on' : '') +
           (isTuttoRotolo ? ' ct-icon-btn--rotolo' : '') +
           (isScag ? ' ct-icon-btn--scag' : '') + '" ' +
           'onclick="ctForbiciTap(\'' + cart.id + '\',' + idx + ')" ' +
           'title="Tap: cicla Scampolo/Rotolo/Scaglionato">';
      h += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
           '<circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/>' +
           '<line x1="20" y1="4" x2="8.12" y2="15.88"/>' +
           '<line x1="14.47" y1="14.48" x2="20" y2="20"/>' +
           '<line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>';
      h += (forbLbl ? '<span>' + forbLbl + '</span>' : '<span>FORBICI</span>') + '</button>';
      // Input % sempre visibile accanto
      var scAtt = it._scontoApplicato || 0;
      h += '<div class="ct-sc-inline">';
      h += '<input type="number" min="0" max="100" value="' + (scAtt || '') + '" placeholder="%" class="ct-sc-inp"' +
           (isScag ? ' style="color:#63b3ed;border-color:#63b3ed44;"' : '') +
           ' onchange="cartSetScontoScampolo(\'' + cart.id + '\',' + idx + ',this.value)" ' +
           'onclick="event.stopPropagation();this.select()">';
      h += '<span class="ct-sc-pct"' + (isScag ? ' style="color:#63b3ed"' : '') + '>%</span>';
      if(isScag){
        h += '<span style="font-size:9px;color:#63b3ed;">da</span>';
        h += '<input type="number" min="1" value="' + (it._scaglioneQta || 10) + '" class="ct-sc-inp" style="width:36px;color:#63b3ed;border-color:#63b3ed44;" ' +
             'onchange="cartSetScaglioneQta(\'' + cart.id + '\',' + idx + ',this.value)" ' +
             'onclick="event.stopPropagation();this.select()">';
        h += '<span style="font-size:9px;color:#63b3ed;">pz</span>';
      }
      if(scAtt > 0){
        var risparmio = (parsePriceIT(it._prezzoOriginale||it._prezzoBase||it.prezzoUnit) * q * scAtt / 100).toFixed(2);
        h += '<span class="ct-sc-risp"' + (isScag ? ' style="color:#63b3ed"' : '') + '>-€' + risparmio + '</span>';
      }
      h += '</div>';
      h += '</div>';

      // NOTE
      h += '<button class="ct-icon-btn' + (hasNota ? ' ct-icon-btn--on' : '') + '" ' +
           'onclick="ctTogglePanel(\'' + cart.id + '\',' + idx + ',\'nota\')" title="Nota">';
      h += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
           '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>' +
           '<polyline points="14 2 14 8 20 8"/>' +
           '<line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>' +
           '<polyline points="10 9 9 9 8 9"/></svg></button>';

      // ORDINA
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

      // CESTINO
      h += '<button class="ct-icon-btn ct-icon-btn--del" ' +
           'onclick="cartRemoveItem(\'' + cart.id + '\',' + idx + ')" title="Elimina">';
      h += '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' +
           '<polyline points="3 6 5 6 21 6"/>' +
           '<path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/>' +
           '<path d="M9 6V4h6v2"/></svg></button>';

      h += '</div>'; // fine ct-iconbar

      // ── PANNELLI A COMPARSA ───────────────────────────────────────────────
      var pNoId = 'ctp-no-' + idx;
      var _pKey = cart.id + '-' + idx;

      // Pannello NOTE
      var notaPanelOpen = _ctPanelState[_pKey] === 'nota';
      h += '<div id="' + pNoId + '" class="ct-panel" style="display:' + (notaPanelOpen ? 'block' : 'none') + '">';
      h += '<textarea class="ct-nota-inp" placeholder="Nota articolo..." ' +
           'oninput="cartSetNota(\'' + cart.id + '\',' + idx + ',this.value)">' +
           esc(it.nota||'') + '</textarea>';
      h += '</div>';

      // Preview nota (se presente)
      if(hasNota){
        h += '<div class="ct-nota-prev">📝 ' + esc(it.nota) + '</div>';
      }

      // Badge stati attivi
      var badges = '';
      if(isTuttoRotolo) badges += '<span class="ct-badge ct-badge--red">ROTOLO INTERO</span> ';
      if(scagAtt) badges += '<span class="ct-badge ct-badge--blue">📊 -'+(scagAtt.sconto||0)+'% da '+scagAtt.qtaMin+'pz</span> ';
      if(isDaOrd){
        var bc = it._ordColore || '#e53e3e';
        badges += '<span class="ct-badge" style="background:'+bc+'22;color:'+bc+';border:1px solid '+bc+'44">🛒 ORDINA</span> ';
      }
      if(badges) h += '<div class="ct-badges">' + badges + '</div>';

      h += '</div>'; // fine ct-card
    }); // fine forEach items

  } // fine items.length > 0

  // ── NOTA ORDINE ───────────────────────────────────────────────────────────
  h += '<div id="cart-order-nota-row">';
  h += '<textarea class="pos-nota-ordine" rows="2" placeholder="📋 Nota ordine..." ' +
       'oninput="cartSetNotaOrdine(\'' + cart.id + '\',this.value)">' + esc(cart.nota||'') + '</textarea>';
  h += '</div>';

  // ── STICKY FOOTER ─────────────────────────────────────────────────────────
  var tot2    = (cart.items||[]).reduce(function(s,it){ return s + _prezzoEffettivo(it) * parseFloat(it.qty||0); }, 0);
  var tot2Fin = cart.scontoGlobale ? tot2*(1-cart.scontoGlobale/100) : tot2;
  h += '<div id="cart-pos-footer">';
  h += '<div class="ct-footer">';
  h += '<div class="ct-footer-tot"><span class="ct-footer-sym">€</span>' + tot2Fin.toFixed(2) + '</div>';
  h += '<div class="ct-footer-btns">';
  h += '<button class="ct-fbtn ct-fbtn--danger" onclick="svuotaCarrello(\'' + cart.id + '\')">🗑️<span>SVUOTA</span></button>';
  // Tasto Avvisa Ufficio — solo se non è modifica e non è già inviato
  if(cart.stato !== 'modifica' && cart.stato !== 'inviato'){
    var haBozza = !!cart.bozzaOrdId;
    h += '<button class="ct-fbtn ct-fbtn--avvisa' + (haBozza ? ' ct-fbtn--avvisa-on' : '') + '" ' +
         (!(cart.items||[]).length ? 'disabled ' : '') +
         'onclick="avvisaUfficio(\'' + cart.id + '\')">' +
         (haBozza ? '📡' : '📢') + '<span>' + (haBozza ? 'AGGIORNA' : 'UFFICIO') + '</span></button>';
  }
  h += '<button class="ct-fbtn ct-fbtn--riepilogo" onclick="openRiepilogoOrdine(\'' + cart.id + '\')">👀<span>RIEPILOGO</span></button>';
  if(cart.stato === 'modifica'){
    h += '<button class="ct-fbtn ct-fbtn--danger" onclick="eliminaCarrelloModifica(\'' + cart.id + '\')" title="Elimina carrello">🗑️<span>ELIMINA</span></button>';
    h += '<button class="ct-fbtn ct-fbtn--cassa" id="ctf-cassa-' + cart.id + '" ' +
         'onclick="ctCassaSingleClick(this,\'aggiornaOrdine(\\x27' + cart.id + '\\x27)\')">' +
         '✏️<span>AGGIORNA</span></button>';
  } else {
    h += '<button class="ct-fbtn ct-fbtn--cassa" id="ctf-cassa-' + cart.id + '" ' +
         (!(cart.items||[]).length ? 'disabled ' : '') +
         'onclick="ctCassaSingleClick(this,\'inviaOrdine(\\x27' + cart.id + '\\x27)\')">' +
         '🛍️<span>CONFERMA</span></button>';
  }
  h += '</div>';
  h += '</div>';
  h += '</div>'; // fine cart-pos-footer

  body.innerHTML = h;
}

// =============================================================================
//  CLIENTI DROPDOWN — Menu raggruppato per giorno
// =============================================================================
var _gg = ['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'];

function ctApriClienti(){
  var dd = document.getElementById('ct-clienti-dropdown');
  if(!dd) return;
  ctRenderClientiList();
  dd.classList.add('open');
}

function ctChiudiClienti(){
  var dd = document.getElementById('ct-clienti-dropdown');
  if(dd) dd.classList.remove('open');
}

function ctRenderClientiList(){
  var list = document.getElementById('ct-clienti-list');
  if(!list) return;

  // Filtra solo carrelli di oggi
  var oggiStr = new Date().toISOString().slice(0,10);
  var carrelliOggi = [];
  carrelli.forEach(function(cart, ci){
    var cData = '';
    if(cart.creatoAtISO) cData = cart.creatoAtISO.slice(0,10);
    else if(cart.dataCreazione) cData = new Date(cart.dataCreazione).toISOString().slice(0,10);
    if(cData === oggiStr || cart.stato === 'inviato' || cart.stato === 'modifica'){
      carrelliOggi.push({cart:cart, ci:ci});
    }
  });

  if(!carrelliOggi.length){
    list.innerHTML = '<div style="text-align:center;color:#555;padding:20px;font-size:13px;">Nessun cliente oggi.<br>Premi ＋ NUOVO per iniziare.</div>';
    return;
  }

  var h = '';
  carrelliOggi.forEach(function(item){
    var cart     = item.cart;
    var ci       = item.ci;
    var n        = (cart.items||[]).length;
    var isActive = cart.id === activeCartId;
    var stato    = cart.stato === 'inviato' ? '✅ ' : cart.stato === 'modifica' ? '✏️ ' : '';
    h += '<button class="ct-clienti-btn' + (isActive ? ' active' : '') + '" ' +
         'onclick="ctSelezionaCliente(' + ci + ')">' +
         '<span onclick="ctEditClienteName(\''+cart.id+'\')" style="cursor:pointer">' + stato + esc(cart.nome || '—') + '</span>' +
         (n ? '<span class="ct-clienti-n">' + n + ' art.</span>' : '') +
         '</button>';
  });
  list.innerHTML = h;
}

function ctSelezionaCliente(ci){
  switchCart(ci);
  ctChiudiClienti();
}

// =============================================================================
//  FUNZIONI HELPER CARRELLO NUOVO
// =============================================================================

// Chiave localStorage per nomi fornitori per colore
var CT_FORN_KEY = 'cp4_forniColore';

// ctTogglePanel: mostra/nasconde pannello a comparsa (sconto|nota)
// Stato salvato in _ctPanelState (JS puro, non nei dati carrello/Firebase)
var _ctPanelState = {}; // chiave: cartId+'-'+idx → 'sconto'|'nota'|null
function ctTogglePanel(cartId, idx, tipo){
  var key = cartId + '-' + idx;
  var ids = { sconto: 'ctp-sc-', nota: 'ctp-no-' };
  var targetId = (ids[tipo] || 'ctp-') + idx;
  var el = document.getElementById(targetId);
  if(!el) return;
  var isOpen = el.style.display !== 'none';
  // Chiude l'altro pannello della stessa card
  Object.keys(ids).forEach(function(t){
    if(t !== tipo){
      var other = document.getElementById((ids[t]||'ctp-') + idx);
      if(other) other.style.display = 'none';
    }
  });
  el.style.display = isOpen ? 'none' : 'block';
  _ctPanelState[key] = isOpen ? null : tipo;
  if(tipo === 'nota' && !isOpen){
    var ta = el.querySelector('textarea');
    if(ta) setTimeout(function(){ ta.focus(); }, 40);
  }
}

// ctForbiciClick: singolo click sulle forbici = ciclo scampolo/fine-rotolo
// Il singolo click deve essere ignorato se fa parte di un dblclick.
// Usiamo un timer: se entro 250ms arriva il secondo click (dblclick nativo),
// il singolo viene annullato — il dblclick gestisce "Tutto il Rotolo".
// ctToggleScontiMenu: apre/chiude il menu sconti compatto nella iconbar
var _ctScontiMenuState = {}; // chiave: cartId+'-'+idx → true/false
function ctToggleScontiMenu(cartId, idx){
  var key = cartId + '-' + idx;
  _ctScontiMenuState[key] = !_ctScontiMenuState[key];
  renderCartTabs();
}

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
  // Singolo tap: cicla OFF → Scampolo → Rotolo → Scaglionato → OFF
  cartCycleScampolo(cartId, idx);
}

// ctTuttoRotolo: attiva o disattiva la modalità ROTOLO INTERO
// Bordo rosso sulla card, nota automatica "ROTOLO INTERO", flag _tuttoRotolo
function ctTuttoRotolo(cartId, idx){
  var cart = carrelli.find(function(c){ return c.id === cartId; });
  if(!cart || !cart.items[idx]) return;
  var it = cart.items[idx];

  if(it._tuttoRotolo){
    var restoreTr = it._prezzoOriginale || listinoPrezzoString(it);
    it._tuttoRotolo = false;
    if(it.nota === 'ROTOLO INTERO') it.nota = '';
    it.scampolo   = false;
    it.fineRotolo = false;
    delete it._scontoApplicato;
    delete it._scontoTipo;
    delete it._prezzoOriginale;
    if(restoreTr && parsePriceIT(restoreTr) > 0) it.prezzoUnit = restoreTr;
  } else {
    ensurePrezzoOriginaleDaListino(it, true);
    it._tuttoRotolo     = true;
    it.nota             = 'ROTOLO INTERO';
    it.scampolo         = false;
    it.fineRotolo       = true;
    it._scontoTipo      = 'rotolo';
    it._scontoApplicato = SCONTO_ROTOLO_DEFAULT_PCT;
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

// ctCassaSingleClick: doppio tap per conferma (Safari iOS compatibile)
var _ctCassaTimer = null;
var _ctCassaPending = false;
function ctCassaSingleClick(btn, action){
  if(_ctCassaPending){
    // SECONDO TAP — conferma!
    clearTimeout(_ctCassaTimer);
    _ctCassaPending = false;
    btn.classList.remove('ct-fbtn--warn');
    var sp = btn.querySelector('span');
    if(sp) sp.textContent = '✅ Invio...';
    // Esegui l'azione (inviaOrdine o aggiornaOrdine)
    if(action) setTimeout(function(){ eval(action); }, 100);
  } else {
    // PRIMO TAP — mostra avviso
    _ctCassaPending = true;
    btn.classList.add('ct-fbtn--warn');
    var sp = btn.querySelector('span');
    var orig = sp ? sp.textContent : '';
    if(sp) sp.textContent = '⚠ Tocca di nuovo!';
    _ctCassaTimer = setTimeout(function(){
      btn.classList.remove('ct-fbtn--warn');
      if(sp) sp.textContent = orig;
      _ctCassaPending = false;
    }, 2000);
  }
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
var _ordForColorFilter=null;
function ordForFilterColor(col){
  _ordForColorFilter=(_ordForColorFilter===col)?null:col;
  renderOrdFor();
}

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

  // Barra filtri colore
  h+='<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;align-items:center;">';
  Object.keys(byColor).forEach(function(col){
    var nome=forniMap[col]||colorNames[col]||col;
    var isOn=(_ordForColorFilter===col);
    h+='<button onclick="ordForFilterColor(\''+col+'\')" style="display:flex;align-items:center;gap:5px;padding:6px 12px;border-radius:14px;border:2px solid '+(isOn?col:'#333')+';background:'+(isOn?col+'22':'transparent')+';color:'+(isOn?col:'#888')+';font-size:11px;font-weight:800;cursor:pointer;">';
    h+='<span style="width:10px;height:10px;border-radius:50%;background:'+col+';display:inline-block;"></span>';
    h+=esc(nome)+' ('+byColor[col].length+')';
    h+='</button>';
  });
  h+='</div>';

  // Filtra per colore se attivo
  var coloriDaMostrare=Object.keys(byColor);
  if(_ordForColorFilter && byColor[_ordForColorFilter]){
    coloriDaMostrare=[_ordForColorFilter];
  }

  coloriDaMostrare.forEach(function(col){
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
  // Aggiorna cella prezzo unitario (prz-IDX) — nella griglia è la colonna "Prezzo"
  var przEl = document.getElementById('prz-' + idx);
  if(przEl){
    var origEl = przEl.querySelector('.ct-old--orig');
    var finEl  = przEl.querySelector('.ct-sub--final');
    if(perc > 0 && base > finale + 0.005){
      if(origEl) origEl.textContent = '€' + base.toFixed(2);
      if(finEl)  finEl.textContent  = '€' + finale.toFixed(2);
      // Se non esistono ancora (era prezzo normale), riscrivi
      if(!origEl && !finEl){
        przEl.innerHTML = '<div class="ct-old--orig">€' + base.toFixed(2) + '</div>' +
          '<div class="ct-sub--final">€' + finale.toFixed(2) + '</div>' +
          przEl.querySelector('.ct-punit').outerHTML;
      }
    }
  }
  // Aggiorna cella totale — è il nextElementSibling di prz-IDX nella griglia
  if(przEl && przEl.nextElementSibling){
    var totCell = przEl.nextElementSibling;
    if(perc > 0 && base > finale + 0.005){
      totCell.innerHTML = '<div class="ct-old--orig">€' + (base*q).toFixed(2) + '</div>' +
        '<div class="ct-sub--final">€' + (finale*q).toFixed(2) + '</div>';
    } else {
      totCell.innerHTML = '<div style="font-size:14px;font-weight:900;color:var(--accent)">€' + (finale*q).toFixed(2) + '</div>';
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

  var tot = (cart.items||[]).reduce(function(s,it){ return s + _prezzoEffettivo(it) * parseFloat(it.qty||0); }, 0);
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
    var sub = (_prezzoEffettivo(it) * (parseFloat(it.qty)||0)).toFixed(2);
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

// ── AVVISA UFFICIO — crea bozza ordine visibile in tab ordini ──────
function avvisaUfficio(cartId){
  var cart=carrelli.find(function(c){return c.id===cartId;});
  if(!cart||(!(cart.items||[]).length)){showToastGen('red','Aggiungi almeno un articolo prima');return;}

  if(cart.bozzaOrdId){
    // Bozza già attiva: aggiorna
    _aggiornaBozzaOrdine(cart);
    showToastGen('green','📢 Ufficio aggiornato!');
    return;
  }

  var bozzaId='bozza_'+Date.now();
  var bozza={
    id:bozzaId,
    numero:null,
    nomeCliente:cart.nome||'—',
    ora:new Date().toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'}),
    data:new Date().toLocaleDateString('it-IT'),
    dataISO:new Date().toISOString().slice(0,10),
    createdAt:new Date().toISOString(),
    items:JSON.parse(JSON.stringify(cart.items||[])),
    nota:cart.nota||'',
    totale:'0',
    stato:'bozza',
    commesso:cart.commesso||''
  };
  ordini.unshift(bozza);
  saveOrdini();
  cart.bozzaOrdId=bozzaId;
  saveCarrelli();
  renderCartTabs();
  showToastGen('green','📢 Ufficio avvisato! Vedono già gli articoli.');
}

// Aggiorna la bozza con gli articoli correnti del carrello
function _aggiornaBozzaOrdine(cart){
  if(!cart||!cart.bozzaOrdId)return;
  var bozza=ordini.find(function(o){return o.id===cart.bozzaOrdId;});
  if(!bozza||bozza.stato!=='bozza')return;
  bozza.items=JSON.parse(JSON.stringify(cart.items||[]));
  bozza.nomeCliente=cart.nome||'—';
  bozza.nota=cart.nota||'';
  saveOrdini();
}

// Elimina la bozza collegata (chiamata quando si invia l'ordine vero)
function _rimuoviBozzaOrdine(cart){
  if(!cart||!cart.bozzaOrdId)return;
  // Rilascia il lock sulla bozza prima di eliminarla
  ordUnlock(cart.bozzaOrdId);
  ordini=ordini.filter(function(o){return o.id!==cart.bozzaOrdId;});
  delete cart.bozzaOrdId;
}

function inviaOrdine(cartId){
  var cart=carrelli.find(function(c){return c.id===cartId;});
  if(!cart||!(cart.items||[]).length){showToastGen('red','-- Carrello vuoto!');return;}
  // Rimuovi bozza se presente
  _rimuoviBozzaOrdine(cart);
  var tot=(cart.items||[]).reduce(function(s,it){return s+(_prezzoEffettivo(it)*parseFloat(it.qty||0));},0);
  var numOrd=getNextOrdNum();
  var ord={
    id:'ord_'+Date.now(),
    numero:numOrd,
    nomeCliente:cart.nome,
    ora:new Date().toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'}),
    data:new Date().toLocaleDateString('it-IT'),
    dataISO:new Date().toISOString().slice(0,10),
    createdAt:new Date().toISOString(),
    items:(function(){
      var cpy=JSON.parse(JSON.stringify(cart.items));
      cpy.forEach(function(it){
        ensurePrezzoOriginaleDaListino(it, true);
        var sc=it._scontoApplicato||0;
        var base=parsePriceIT(it._prezzoOriginale);
        if(base<=0) return;
        var scOn=it.scampolo||it.fineRotolo;
        if(scOn&&sc>0){
          it.prezzoUnit=(base*(1-sc/100)).toFixed(2);
        }
        if(it._scaglionato&&sc>0){
          var q=parseFloat(it.qty||0);
          if(q>=(it._scaglioneQta||10)){
            it.prezzoUnit=(base*(1-sc/100)).toFixed(2);
          } else {
            it.prezzoUnit=it._prezzoOriginale;
          }
        }
      });
      return cpy;
    })(),
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

  // Segna il carrello come "inviato" localmente (read-only, non va su Firebase)
  // saveCarrelli() filtra automaticamente i carrelli inviati — non li condivide
  cart.stato='inviato';
  cart.ordId=ord.id;
  cart.locked=true;
  saveCarrelli();   // ← scrive su Firebase solo i carrelli ancora attivi
  _lastAddedItem=null;
  feedbackSend();
  renderCartTabs();
  showToastGen('green','✅ Ordine #'+numOrd+' inviato! — '+ord.nomeCliente+' — €'+tot.toFixed(2));
}


// ── Modifica nome cliente dal carrello ───────────────────────────
function ctEditClienteName(cartId){
  var cart = carrelli.find(function(c){ return c.id === cartId; });
  if(!cart) return;
  var nome = prompt('Nome cliente:', cart.nome || '');
  if(nome === null) return;
  cart.nome = nome.trim();
  saveCarrelli();
  // Aggiorna anche l'ordine collegato
  if(cart.ordId){
    var ord = ordini.find(function(o){ return o.id === cart.ordId; });
    if(ord){ ord.nomeCliente = nome.trim(); saveOrdini(); }
  }
  renderCartTabs();
  showToastGen('green', '✏️ Cliente aggiornato');
}

// ── Imposta quantità minima scaglione (carrello) ─────────────────
function cartSetScaglioneQta(cartId, idx, val){
  var cart = carrelli.find(function(c){ return c.id === cartId; });
  if(!cart || !cart.items[idx]) return;
  cart.items[idx]._scaglioneQta = parseInt(val) || 10;
  saveCarrelli(); renderCartTabs();
}

// ── Override saveCarrelli: aggiorna automaticamente le bozze attive ──
// (core.js definisce saveCarrelli; qui la estendiamo senza toccare database.js)
(function(){
  var _origSaveCarrelli = saveCarrelli;
  saveCarrelli = function(){
    _origSaveCarrelli();
    // Per ogni carrello con bozza attiva, aggiorna la bozza ordine
    (carrelli||[]).forEach(function(cart){
      if(cart.bozzaOrdId && (cart.items||[]).length){
        _aggiornaBozzaOrdine(cart);
      }
    });
  };
})();
