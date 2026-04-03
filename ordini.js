// ══ ORDINI ════════════════════════════════════════════════════════
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
  if(!ord){
    // Ordine eliminato: scollega il carrello
    cart.stato='';
    cart.locked=false;
    delete cart.ordId;
    saveCarrelli(); renderCartTabs();
    showToastGen('orange','Ordine eliminato — carrello scollegato');
    return;
  }
  // ── Confronta vecchio vs nuovo per nota automatica ──
  var vecchiItems = ord.items || [];
  var nuoviItems  = cart.items || [];
  var ora = new Date().toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'});
  var diff = [];

  // Articoli modificati o rimossi
  vecchiItems.forEach(function(old_it){
    var new_it = nuoviItems.find(function(x){ return x.desc === old_it.desc; });
    if(!new_it){
      diff.push('rimosso: ' + (old_it.desc||'?'));
    } else {
      var qOld = parseFloat(old_it.qty||0), qNew = parseFloat(new_it.qty||0);
      if(qOld !== qNew) diff.push((new_it.desc||'?') + ': ' + qOld + '→' + qNew + ' ' + (new_it.unit||'pz'));
    }
  });
  // Articoli aggiunti
  nuoviItems.forEach(function(new_it){
    var esiste = vecchiItems.find(function(x){ return x.desc === new_it.desc; });
    if(!esiste) diff.push('aggiunto: ' + (new_it.desc||'?') + ' ×' + (new_it.qty||1));
  });

  // Aggiorna ordine con i dati modificati del carrello
  ord.items=JSON.parse(JSON.stringify(cart.items));
  var notaBase = cart.nota || '';
  if(diff.length){
    var rigaDiff = '✏️ ' + ora + ' — ' + diff.join(' · ');
    // Salva diff separatamente per il popup modificato
    if(!ord.modificheDiff) ord.modificheDiff = [];
    ord.modificheDiff.unshift(rigaDiff);
    if(ord.modificheDiff.length > 5) ord.modificheDiff.length = 5; // max 5 storici
    // NON toccare ord.nota con la diff — la nota resta quella del cliente
    ord.nota = notaBase;
  } else {
    ord.nota = notaBase;
  }
  var tot=(cart.items||[]).reduce(function(s,it){return s+(_prezzoEffettivo(it)*parseFloat(it.qty||0));},0);
  ord.totale=tot.toFixed(2);
  ord.scontoGlobale=cart.scontoGlobale||null;
  ord.modificato=true;
  ord.modificatoAt=new Date().toLocaleString('it-IT');
  ord.modificatoAtISO=new Date().toISOString();
  // Salva chi ha modificato
  if(typeof _currentUser !== 'undefined' && _currentUser){
    if(!ord.commesso) ord.commesso = _currentUser.key;
    ord.modificatoDa = _currentUser.key;
  }
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
  if(cart.ordId){
    var ord=ordini.find(function(o){return o.id===cart.ordId;});
    if(ord){
      cart.items=JSON.parse(JSON.stringify(ord.items));
      cart.nota=ord.nota||'';
      cart.stato='inviato';
      cart.locked=true;
    } else {
      // Ordine eliminato: scollega
      cart.stato='';
      cart.locked=false;
      delete cart.ordId;
      showToastGen('orange','Ordine eliminato — carrello scollegato');
    }
  } else {
    cart.stato='inviato';
    cart.locked=true;
  }
  saveCarrelli();
  renderCartTabs();
  showToastGen('green','- Modifiche annullate');
}

// --- MODIFICA ORDINE DAL TAB ORDINI ---------------------------
var _editOrdIdx=null;
var _editOrdItems=null;

function modificaOrdineDaTab(gi){
  var ord=ordini[gi];
  if(!ord){ console.error('[LOCK] modificaOrdineDaTab — ordine non trovato a indice:', gi); return; }
  var oid = ord.id;
  var blocco = ordIsLockedByOther(oid);
  if(blocco){
    showToastGen('orange','🔒 ' + (blocco.name||'Altro account') + ' sta modificando questo ordine');
    return;
  }
  ordAcquireOrderLock(oid, { force: false }, function(ok){
    if(!ok){
      showToastGen('orange','🔒 Ordine appena preso da un altro utente — riprova tra poco');
      return;
    }
    var gi2 = ordini.findIndex(function(o){ return o && o.id === oid; });
    if(gi2 < 0){
      ordUnlock(oid);
      return;
    }
    _editOrdIdx = gi2;
    _editOrdItems = JSON.parse(JSON.stringify(ordini[gi2].items || []));
    renderEditOrdine();
    document.getElementById('edit-ord-overlay').style.display='flex';
  });
}

function renderEditOrdine(){
  var ord=ordini[_editOrdIdx];
  if(!ord)return;
  var items=_editOrdItems;
  var tot=items.reduce(function(s,it){return s+(ordItemLineUnitSelling(it)*parseFloat(it.qty||0));},0);
  var h='';
  h+='<div style="font-size:15px;font-weight:900;color:#b794f4;margin-bottom:4px;">-- Modifica ordine'+(ord.numero?' #'+ord.numero:'')+'</div>';
  h+='<div style="font-size:11px;color:var(--muted);margin-bottom:12px;">'+esc(ord.nomeCliente)+' - '+ord.data+' '+ord.ora+'</div>';
  items.forEach(function(it,idx){
    var p=ordItemLineUnitSelling(it);
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
    if(!ensurePrezzoOriginaleDaListino(it, true)){
      showToastGen('orange','Listino non disponibile per questo articolo');
      return;
    }
    it.scampolo=true;it.fineRotolo=false;it._scontoTipo='scampolo';
    if(!it._scontoApplicato)it._scontoApplicato=SCONTO_SCAMPOLO_DEFAULT_PCT;
    _applicaScontoScampolo(it);
  } else if(it.scampolo){
    if(!ensurePrezzoOriginaleDaListino(it, true)) return;
    it.scampolo=false;it.fineRotolo=true;it._scontoTipo='rotolo';
    it._scontoApplicato = SCONTO_ROTOLO_DEFAULT_PCT;
    _applicaScontoScampolo(it);
  } else {
    it.scampolo=false;it.fineRotolo=false;
    if(it._prezzoOriginale){it.prezzoUnit=it._prezzoOriginale;delete it._prezzoOriginale;}
    delete it._scontoTipo;delete it._scontoApplicato;
  }
  renderEditOrdine();
}
function _editOrdSconto(idx,val){
  var it=_editOrdItems[idx];
  it._scontoApplicato=parseFloat(val)||0;
  if(!ensurePrezzoOriginaleDaListino(it, true)){
    showToastGen('orange','Listino non disponibile');
    renderEditOrdine();
    return;
  }
  _applicaScontoScampolo(it);
  renderEditOrdine();
}
function salvaEditOrdine(){
  var ord=ordini[_editOrdIdx];
  if(!ord){ console.error('[LOCK] salvaEditOrdine — nessun ordine a indice:', _editOrdIdx); return; }
  ord.items=JSON.parse(JSON.stringify(_editOrdItems));
  var tot=_editOrdItems.reduce(function(s,it){return s+(ordItemLineUnitSelling(it)*parseFloat(it.qty||0));},0);
  ord.totale=tot.toFixed(2);
  ord.modificato=true;ord.modificatoAt=new Date().toLocaleString('it-IT');ord.modificatoAtISO=new Date().toISOString();
  saveOrdini();
  var linkedCart=carrelli.find(function(c){return c.ordId===ord.id;});
  if(!linkedCart && ord.stato==='bozza'){
    linkedCart=carrelli.find(function(c){return c.bozzaOrdId===ord.id;});
  }
  if(linkedCart){
    console.log('[LOCK] salvaEditOrdine — sync prezzi su carrello collegato:', linkedCart.id);
    linkedCart.items=JSON.parse(JSON.stringify(_editOrdItems));
    saveCarrelli();
  }
  console.log('[LOCK] salvaEditOrdine — rilascio lock su ordine:', ord.id);
  ordUnlock(ord.id);
  chiudiEditOrdine();feedbackSend();renderOrdini();
  showToastGen('purple','✅ Ordine #'+(ord.numero||'')+' aggiornato!');
}
function chiudiEditOrdine(){
  if(_editOrdIdx !== null && ordini[_editOrdIdx]){
    console.log('[LOCK] chiudiEditOrdine — rilascio lock su ordine:', ordini[_editOrdIdx].id);
    ordUnlock(ordini[_editOrdIdx].id);
  }
  document.getElementById('edit-ord-overlay').style.display='none';
  _editOrdIdx=null;
  _editOrdItems=null;
}

// --- INLINE EDIT ORDINI (doppio click su cella) ----------------
function ordInlineEdit(el, gi, ii, field){
  // Evita doppia apertura
  if(el._editing) return;
  if(el.querySelector && el.querySelector('input.ord-inline-input')) return;
  var ord = ordini[gi];
  if(!ord || !ord.items[ii]) return;
  el._editing = true;
  var it = ord.items[ii];
  var oldVal = '';
  var inputType = 'text';
  if(field === 'qty'){ oldVal = parseFloat(it.qty)||0; inputType = 'number'; }
  else if(field === 'price'){ oldVal = it.prezzoUnit || ''; inputType = 'text'; }
  else if(field === 'codF'){ oldVal = it.codF || ''; }

  // Salva HTML originale per ripristino
  var origHTML = el.innerHTML;
  el.innerHTML = '<input type="'+inputType+'" value="'+oldVal+'" class="ord-inline-input"'+(field==='qty'?' min="0.5" step="0.5"':'')+'>';
  var inp = el.querySelector('input');
  setTimeout(function(){ inp.focus(); inp.select(); }, 50);

  function save(){
    el._editing = false;
    var v = inp.value.trim();
    if(field === 'qty'){
      var nq = parseFloat(v);
      if(!nq || nq <= 0) nq = parseFloat(it.qty)||1;
      it.qty = nq;
      // Ricalcola prezzo scaglionato
      ensurePrezzoOriginaleDaListino(it, false);
      if(it._scaglionato && it._prezzoOriginale && it._scontoApplicato > 0){
        if(nq >= (it._scaglioneQta||10)){
          it.prezzoUnit = (parsePriceIT(it._prezzoOriginale)*(1-it._scontoApplicato/100)).toFixed(2);
        } else {
          it.prezzoUnit = it._prezzoOriginale;
        }
      }
    } else if(field === 'price'){
      if(v) it.prezzoUnit = v;
    } else if(field === 'codF'){
      it.codF = v;
    }
    var tot = ord.items.reduce(function(s,x){ return s + parsePriceIT(x.prezzoUnit)*parseFloat(x.qty||0); },0);
    ord.totale = tot.toFixed(2);
    ord.modificato = true;
    ord.modificatoAt = new Date().toLocaleString('it-IT');
    ord.modificatoAtISO = new Date().toISOString();
    saveOrdini();
    var linkedCart = carrelli.find(function(c){ return c.ordId === ord.id; });
    if(!linkedCart && ord.stato === 'bozza'){
      linkedCart = carrelli.find(function(c){ return c.bozzaOrdId === ord.id; });
    }
    if(linkedCart){ linkedCart.items = JSON.parse(JSON.stringify(ord.items)); saveCarrelli(); }
    renderOrdini();
  }
  inp.addEventListener('blur', save);
  inp.addEventListener('keydown', function(e){
    if(e.key === 'Enter'){ e.preventDefault(); inp.blur(); }
    if(e.key === 'Escape'){ inp.value = oldVal; inp.blur(); }
  });
}

// ── Rimuovi articolo dall'ordine (doppio tap) ───────────────────
function ordDelItem(el, gi, ii){
  if(el._confirm){
    // Secondo tap — elimina
    var ord = ordini[gi];
    if(!ord || !ord.items[ii]) return;
    ord.items.splice(ii, 1);
    var tot = ord.items.reduce(function(s,x){ return s + parsePriceIT(x.prezzoUnit)*parseFloat(x.qty||0); }, 0);
    ord.totale = tot.toFixed(2);
    ord.modificato = true;
    ord.modificatoAt = new Date().toLocaleString('it-IT');
    ord.modificatoAtISO = new Date().toISOString();
    saveOrdini();
    var linkedCart = carrelli.find(function(c){ return c.ordId === ord.id; });
    if(!linkedCart && ord.stato === 'bozza'){
      linkedCart = carrelli.find(function(c){ return c.bozzaOrdId === ord.id; });
    }
    if(linkedCart){ linkedCart.items = JSON.parse(JSON.stringify(ord.items)); saveCarrelli(); }
    renderOrdini();
    showToastGen('red', 'Articolo rimosso');
    return;
  }
  // Primo tap — chiedi conferma
  el._confirm = true;
  el.textContent = '?';
  el.classList.add('ord-item-del--confirm');
  setTimeout(function(){
    el._confirm = false;
    el.textContent = '×';
    el.classList.remove('ord-item-del--confirm');
  }, 2500);
}

function filterOrdini(f){
  // Chiudi vista "da ordinare"
  if(_daOrdView){
    _daOrdView=false;
    var dbtn=document.getElementById('ord-f-daordinare');
    if(dbtn){dbtn.style.background='transparent';dbtn.style.color='#fc8181';}
    var listEl=document.getElementById('ord-list');if(listEl)listEl.style.display='';
    var daoEl=document.getElementById('ord-daordinare-view');if(daoEl)daoEl.style.display='none';
  }
  // Chiudi cestino
  if(_cestinoOrdOpen){
    _cestinoOrdOpen=false;
    var cb=document.getElementById('ord-f-cestino');
    if(cb){cb.style.background='transparent';cb.style.borderColor='#222';cb.style.color='#444';}
    var cv=document.getElementById('ord-cestino-view');if(cv)cv.style.display='none';
    var ll=document.getElementById('ord-list');if(ll)ll.style.display='';
  }
  // Chiudi storico
  if(_storicoOpen){
    _storicoOpen=false;
    var sb=document.getElementById('ord-f-storico');
    if(sb){sb.style.background='transparent';sb.style.borderColor='#333';}
    var sv=document.getElementById('ord-storico-view');if(sv)sv.style.display='none';
    var ll2=document.getElementById('ord-list');if(ll2)ll2.style.display='';
  }
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
  console.log('[LOCK] setStatoOrdine — ordine:', o.id, 'nuovo stato:', stato);
  var lockInfo = ordIsLockedByOther(o.id);
  if(lockInfo){
    console.warn('[LOCK] setStatoOrdine — ordine bloccato da:', lockInfo.name, '— cambio stato bloccato');
    showToastGen('orange','🔒 ' + (lockInfo.name||'Altro account') + ' sta lavorando su questo ordine');
    return;
  }
  if(stato==='completato'){
    ordUnlock(o.id);
    _syncPrezziOrdineAlDB(o);
  } else if(stato==='pronto'){
    ordUnlock(o.id);
  }
  o.stato=stato;
  if(!o.statiLog)o.statiLog={};
  o.statiLog[stato]={ora:new Date().toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'}),data:new Date().toLocaleDateString('it-IT')};
  if(stato==='completato') o.completatoAtISO=new Date().toISOString();
  saveOrdini();renderOrdini();
}

// ── Sync ordine completato → database articoli ───────────────────────────────
// Aggiorna prezzo, qty (scarico), unit nel database per ogni articolo dell'ordine.
// Chiamata sia da setStatoOrdine che da _cassaModeFatto — comportamento identico.
function _syncPrezziOrdineAlDB(ord){
  if(!ord || !ord.items || !ord.items.length) return;
  var aggiornatiPrezzi = 0;
  var aggiornatiQty = 0;
  var sottoScortaList = [];

  ord.items.forEach(function(it){
    var prezzoOrd = it.prezzoUnit;
    var qVenduta = parseFloat(it.qty || 0);

    // Trova articolo nel database
    var dbIdx = -1;
    if(it.rowIdx !== undefined && it.rowIdx !== null && rows[it.rowIdx]) dbIdx = it.rowIdx;
    else if(it.codM){
      for(var ri = 0; ri < rows.length; ri++){
        if(rows[ri] && rows[ri].codM === it.codM){ dbIdx = ri; break; }
      }
    }
    if(dbIdx < 0 || !rows[dbIdx]) return;

    var r = rows[dbIdx];
    var m = magazzino[dbIdx] || {};
    var changed = false;

    // ── 1. Aggiorna prezzo ──────────────────────────────────────
    if(prezzoOrd && prezzoOrd !== '0' && prezzoOrd !== '' && r.prezzo !== prezzoOrd){
      if(r.prezzo){
        if(!r.priceHistory) r.priceHistory = [];
        if(r.prezzoOld && r.prezzoOld !== r.prezzo){
          var giaNello = r.priceHistory.some(function(p){ return p.prezzo === r.prezzoOld; });
          if(!giaNello) r.priceHistory.push({ prezzo: r.prezzoOld, data: '' });
        }
        r.prezzoOld = r.prezzo;
        r.priceHistory.unshift({ prezzo: r.prezzo, data: r.data || '' });
        if(r.priceHistory.length > 5) r.priceHistory.length = 5;
      }
      r.prezzo = prezzoOrd;
      r.data = new Date().toLocaleDateString('it-IT');
      r.size = (typeof autoSize === 'function') ? autoSize(prezzoOrd) : r.size;
      changed = true;
      aggiornatiPrezzi++;
    }

    // ── 2. Aggiorna unità di misura ─────────────────────────────
    if(it.unit && it.unit !== (m.unit || 'pz')){
      m.unit = it.unit;
      changed = true;
    }

    // ── 3. Scarico magazzino (qty) ──────────────────────────────
    if(qVenduta > 0 && m.qty !== undefined && m.qty !== ''){
      var prevQty = Number(m.qty);
      var nuovaQty = Math.max(0, prevQty - qVenduta);
      m.qty = nuovaQty;
      magazzino[dbIdx] = m;
      lsSet(MAGK, magazzino);
      if(typeof updateStockBadge === 'function') updateStockBadge();
      if(typeof registraMovimento === 'function'){
        registraMovimento(dbIdx, 'ordine', -qVenduta, prevQty, nuovaQty, 'Ordine #' + (ord.numero || ord.id));
      }
      // Controlla scorta minima
      var soglia = (typeof getSoglia === 'function') ? getSoglia(dbIdx) : (m.soglia !== undefined ? Number(m.soglia) : 1);
      if(nuovaQty <= soglia){
        sottoScortaList.push({ desc: r.desc || it.desc || '?', qty: nuovaQty, soglia: soglia });
      }
      changed = true;
      aggiornatiQty++;
    }

    if(changed){
      if(typeof _fbSaveArticolo === 'function') _fbSaveArticolo(dbIdx);
    }
  });

  if(aggiornatiPrezzi) lsSet(SK, rows);

  // Toast riepilogo
  var parts = [];
  if(aggiornatiPrezzi) parts.push(aggiornatiPrezzi + ' prezz' + (aggiornatiPrezzi === 1 ? 'o' : 'i'));
  if(aggiornatiQty) parts.push(aggiornatiQty + ' qt' + (aggiornatiQty === 1 ? 'à' : 'à'));
  if(parts.length){
    showToastGen('green', '💰 Aggiornati: ' + parts.join(' · '));
  }

  // Avvisi scorta bassa (ritardati per non sovrapporsi al toast completato)
  if(sottoScortaList.length){
    setTimeout(function(){
      var msg = '⚠️ SOTTO SCORTA:\n' + sottoScortaList.map(function(s){
        return s.desc + ' — rimasti ' + s.qty + ' (min: ' + s.soglia + ')';
      }).join('\n');
      showToastGen('red', msg.trim());
    }, 1800);
  }
}
var ORDK_CESTINO = 'cp4_ordini_cestino';
var ordiniCestino = lsGet(ORDK_CESTINO) || [];
var _cestinoOrdOpen = false;

function deleteOrdine(gi){
  showConfirm('Eliminare questo ordine?',function(){
    var ord = ordini.splice(gi,1)[0];
    if(ord){
      ord.eliminatoAt = new Date().toLocaleString('it-IT');
      ordiniCestino.unshift(ord);
      lsSet(ORDK_CESTINO, ordiniCestino);
      // Rimuovi anche il carrello collegato
      if(ord.id) _rimuoviCarrelloDaOrdine(ord.id);
      saveCarrelli();
    }
    saveOrdini();renderOrdini();showToastGen('red','Ordine spostato nel cestino');
  });
}

function toggleCestinoOrdini(){
  _cestinoOrdOpen = !_cestinoOrdOpen;
  var btn = document.getElementById('ord-f-cestino');
  if(btn){
    btn.style.background = _cestinoOrdOpen ? '#e53e3e22' : 'transparent';
    btn.style.borderColor = _cestinoOrdOpen ? '#e53e3e' : '#222';
    btn.style.color = _cestinoOrdOpen ? '#fc8181' : '#444';
  }
  var listEl = document.getElementById('ord-list');
  if(_cestinoOrdOpen){
    if(listEl) listEl.style.display = 'none';
    renderCestinoOrdini();
  } else {
    var cv = document.getElementById('ord-cestino-view');
    if(cv) cv.style.display = 'none';
    if(listEl) listEl.style.display = '';
  }
}

function renderCestinoOrdini(){
  var cv = document.getElementById('ord-cestino-view');
  if(!cv){
    cv = document.createElement('div');
    cv.id = 'ord-cestino-view';
    var listEl = document.getElementById('ord-list');
    if(listEl) listEl.parentNode.insertBefore(cv, listEl.nextSibling);
    else return;
  }
  cv.style.display = 'block';
  if(!ordiniCestino.length){
    cv.innerHTML = '<div style="text-align:center;color:#555;padding:30px;font-size:13px;">Cestino vuoto.</div>';
    return;
  }
  var h = '<div style="padding:8px 0 12px;text-align:center;font-size:12px;font-weight:700;color:#fc8181;">🗑️ CESTINO — ' + ordiniCestino.length + ' ordini eliminati</div>';
  ordiniCestino.forEach(function(ord,ci){
    var nArt = (ord.items||[]).length;
    var tot = 0;
    (ord.items||[]).forEach(function(it){tot += parsePriceIT(it.prezzoUnit)*parseFloat(it.qty||0);});
    h += '<div style="border:1px solid #2a2a2a;border-radius:10px;margin-bottom:8px;overflow:hidden;border-top:3px solid #e53e3e;">';
    h += '<div style="background:#e53e3e22;padding:6px 12px;display:flex;justify-content:space-between;align-items:center;">';
    h += '<span style="font-size:13px;font-weight:800;color:#fc8181;">'+esc(ord.nomeCliente||'—')+'</span>';
    h += '<span style="font-size:10px;color:#888;">'+esc(ord.eliminatoAt||ord.data||'')+'</span>';
    h += '</div>';
    h += '<div style="padding:6px 12px;display:flex;justify-content:space-between;align-items:center;">';
    h += '<span style="font-size:11px;color:#888;">'+nArt+' articoli — €'+tot.toFixed(2)+'</span>';
    h += '<div style="display:flex;gap:6px;">';
    h += '<button onclick="ripristinaOrdine('+ci+')" style="padding:4px 10px;border-radius:6px;border:1px solid #38a16944;background:transparent;color:#68d391;font-size:11px;cursor:pointer;">↩️ Ripristina</button>';
    h += '<button onclick="eliminaDefinitivo('+ci+')" style="padding:4px 10px;border-radius:6px;border:1px solid #e53e3e44;background:transparent;color:#fc8181;font-size:11px;cursor:pointer;">✕</button>';
    h += '</div></div></div>';
  });
  h += '<div style="text-align:center;padding:12px;">';
  h += '<button onclick="svuotaCestinoOrdini()" style="padding:6px 16px;border-radius:8px;border:1px solid #e53e3e44;background:transparent;color:#fc8181;font-size:11px;cursor:pointer;">🗑️ Svuota cestino</button>';
  h += '</div>';
  cv.innerHTML = h;
}

function ripristinaOrdine(ci){
  var ord = ordiniCestino.splice(ci,1)[0];
  if(ord){
    delete ord.eliminatoAt;
    ord.stato = 'nuovo';
    ordini.unshift(ord);
    saveOrdini();
    lsSet(ORDK_CESTINO, ordiniCestino);
    renderCestinoOrdini();
    showToastGen('green','↩️ Ordine ripristinato');
  }
}

function eliminaDefinitivo(ci){
  showConfirm('Eliminare definitivamente?',function(){
    ordiniCestino.splice(ci,1);
    lsSet(ORDK_CESTINO, ordiniCestino);
    renderCestinoOrdini();
    showToastGen('red','Eliminato definitivamente');
  });
}

function svuotaCestinoOrdini(){
  showConfirm('Svuotare tutto il cestino?',function(){
    ordiniCestino = [];
    lsSet(ORDK_CESTINO, []);
    renderCestinoOrdini();
    showToastGen('red','Cestino svuotato');
  });
}

// --- STORICO ORDINI ARCHIVIATI ---
var _storicoOpen=false;
function toggleStoricoOrdini(){
  _storicoOpen=!_storicoOpen;
  var btn=document.getElementById('ord-f-storico');
  if(btn){
    btn.style.background=_storicoOpen?'#805ad533':'transparent';
    btn.style.borderColor=_storicoOpen?'#805ad5':'#333';
  }
  var listEl=document.getElementById('ord-list');
  if(_storicoOpen){
    renderStoricoOrdini();
    if(listEl) listEl.style.display='none';
  } else {
    var sv=document.getElementById('ord-storico-view');
    if(sv) sv.style.display='none';
    if(listEl) listEl.style.display='';
  }
}
function renderStoricoOrdini(){
  var sv=document.getElementById('ord-storico-view');
  if(!sv){
    sv=document.createElement('div');
    sv.id='ord-storico-view';
    var listEl=document.getElementById('ord-list');
    if(listEl) listEl.parentNode.insertBefore(sv,listEl.nextSibling);
    else return;
  }
  sv.style.display='block';
  var arch=lsGet(ORDK_ARCH)||[];
  if(!arch.length){
    sv.innerHTML='<div style="text-align:center;color:#555;padding:30px;font-size:13px;">Nessun ordine archiviato.<br>Gli ordini completati da 7+ giorni vengono archiviati automaticamente.</div>';
    return;
  }
  var SC={nuovo:'var(--accent)',lavorazione:'#63b3ed',pronto:'#f6ad55',completato:'#68d391'};
  var h='<div style="padding:8px 0 12px;text-align:center;font-size:12px;font-weight:700;color:#805ad5;">📂 STORICO — '+arch.length+' ordini archiviati</div>';
  arch.forEach(function(ord,ai){
    var nArt=(ord.items||[]).length;
    var tot=0;
    (ord.items||[]).forEach(function(it){tot+=parsePriceIT(it.prezzoUnit)*parseFloat(it.qty||0);});
    h+='<div style="border:1px solid #2a2a2a;border-radius:10px;margin-bottom:8px;overflow:hidden;border-top:3px solid #805ad5;">';
    h+='<div style="background:#805ad522;padding:6px 12px;display:flex;justify-content:space-between;align-items:center;">';
    h+='<span style="font-size:13px;font-weight:800;color:#d6bcfa;">'+esc(ord.nomeCliente||'—')+'</span>';
    h+='<span style="font-size:11px;color:#805ad5;">'+esc(ord.data||'')+' '+esc(ord.ora||'')+'</span>';
    h+='</div>';
    h+='<div style="padding:8px 12px;">';
    (ord.items||[]).forEach(function(it){
      var pu=parsePriceIT(it.prezzoUnit);
      var q=parseFloat(it.qty||0);
      h+='<div style="display:flex;justify-content:space-between;padding:3px 0;border-bottom:1px solid #1a1a1a;font-size:12px;">';
      h+='<span style="color:#ccc;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">'+esc(it.desc||'—')+'</span>';
      h+='<span style="color:#888;margin:0 8px;">x'+q+'</span>';
      h+='<span style="color:var(--accent);font-weight:700;">€'+(pu*q).toFixed(2)+'</span>';
      h+='</div>';
    });
    h+='<div style="display:flex;justify-content:space-between;padding:6px 0 2px;font-weight:900;">';
    h+='<span style="color:#888;font-size:11px;">'+nArt+' articoli</span>';
    h+='<span style="color:#805ad5;font-size:15px;">€'+tot.toFixed(2)+'</span>';
    h+='</div>';
    h+='</div></div>';
  });
  h+='<div style="text-align:center;padding:12px;">';
  h+='<button onclick="clearStorico()" style="padding:6px 16px;border-radius:8px;border:1px solid #e53e3e44;background:transparent;color:#fc8181;font-size:11px;cursor:pointer;">🗑️ Svuota storico</button>';
  h+='</div>';
  sv.innerHTML=h;
}
function clearStorico(){
  showConfirm('Eliminare tutto lo storico archiviato?',function(){
    ordiniArchivio=[];
    lsSet(ORDK_ARCH,[]);
    renderStoricoOrdini();
    showToastGen('purple','Storico svuotato');
  });
}

// --- VISTA "DA ORDINARE" — raccoglie tutti gli articoli daOrdinare da carrelli + ordini ---
var _daOrdView=false;

function toggleDaOrdinareView(){
  _daOrdView=!_daOrdView;
  var btn=document.getElementById('ord-f-daordinare');
  var listEl=document.getElementById('ord-list');
  var daoEl=document.getElementById('ord-daordinare-view');
  if(!daoEl)return;
  if(_daOrdView){
    if(btn){btn.style.background='#e53e3e';btn.style.color='#fff';}
    if(listEl)listEl.style.display='none';
    daoEl.style.display='block';
    _daOrdColorFilter=null;
    renderDaOrdinareView();
  } else {
    if(btn){btn.style.background='transparent';btn.style.color='#fc8181';}
    if(listEl)listEl.style.display='';
    daoEl.style.display='none';
  }
}

// Filtro colore per vista "da ordinare" nella tab ordini
var _daOrdColorFilter=null;
function daOrdFilterColor(col){
  _daOrdColorFilter=(_daOrdColorFilter===col)?null:col;
  renderDaOrdinareView();
}

function renderDaOrdinareView(){
  var wrap=document.getElementById('ord-daordinare-view');
  if(!wrap)return;

  // Raccoglie articoli da ordinare SOLO dai carrelli attivi — identico a renderOrdFor
  var byColor={};
  carrelli.forEach(function(cart){
    (cart.items||[]).forEach(function(it){
      if(!it.daOrdinare) return;
      if(!it._ordColore || it._ordColore==='#888888') return;
      var col=it._ordColore;
      if(!byColor[col]) byColor[col]=[];
      byColor[col].push({ it:it, cartNome:cart.nome||'' });
    });
  });

  var forniMap=ctGetForniColore();
  var colorNames={'#e53e3e':'Rosso','#38a169':'Verde','#3182ce':'Blu','#e2c400':'Giallo','#888888':'Senza colore'};

  if(!Object.keys(byColor).length){
    wrap.innerHTML='<div style="text-align:center;padding:40px;color:#555">'+
      'Nessun articolo da ordinare.<br><small>Usa il tasto ORDINA nelle card del carrello.</small></div>';
    return;
  }

  var h='';

  // Barra filtri colore
  h+='<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;align-items:center;">';
  h+='<span style="font-size:13px;font-weight:900;color:var(--text);">🚚 Da ordinare</span>';
  Object.keys(byColor).forEach(function(col){
    var nome=forniMap[col]||colorNames[col]||col;
    var isOn=(_daOrdColorFilter===col);
    h+='<button onclick="daOrdFilterColor(\''+col+'\')" style="display:flex;align-items:center;gap:5px;padding:6px 12px;border-radius:14px;border:2px solid '+(isOn?col:'#333')+';background:'+(isOn?col+'22':'transparent')+';color:'+(isOn?col:'#888')+';font-size:11px;font-weight:800;cursor:pointer;">';
    h+='<span style="width:10px;height:10px;border-radius:50%;background:'+col+';display:inline-block;"></span>';
    h+=esc(nome)+' ('+byColor[col].length+')';
    h+='</button>';
  });
  h+='</div>';

  // Filtra per colore se attivo
  var coloriDaMostrare=Object.keys(byColor);
  if(_daOrdColorFilter && byColor[_daOrdColorFilter]){
    coloriDaMostrare=[_daOrdColorFilter];
  }

  coloriDaMostrare.forEach(function(col){
    var items=byColor[col];
    var colLabel=colorNames[col]||col;
    var fornNome=forniMap[col]||'';

    h+='<div class="cof-group" style="border-color:'+col+'55">';
    h+='<div class="cof-header" style="border-color:'+col+'">';
    h+='<span class="cof-dot" style="background:'+col+'"></span>';
    h+='<span class="cof-color-label">'+colLabel+'</span>';
    h+='<input class="cof-forn-inp" value="'+esc(fornNome)+'" placeholder="Nome fornitore..." '+
       'oninput="ctSaveFornNome(\''+col+'\',this.value)" onkeydown="if(event.key===\'Enter\')this.blur()">';
    h+='<span class="cof-count">'+items.length+' art.</span>';
    h+='</div>';

    items.forEach(function(entry){
      var it=entry.it;
      var codM=it.codM?(String(it.codM).match(/^\d+$/)?String(it.codM).padStart(7,'0'):it.codM):'';
      var sub=(parsePriceIT(it.prezzoUnit)*(parseFloat(it.qty)||0)).toFixed(2);
      h+='<div class="cof-row">';
      if(it.foto) h+='<img class="cof-thumb" src="'+it.foto+'" alt="" onclick="apriModalFoto(this.src)">';
      else h+='<div class="cof-thumb cof-thumb--empty">📦</div>';
      h+='<div class="cof-info">';
      h+='<div class="cof-nome">'+esc(it.desc||'—')+'</div>';
      h+='<div class="cof-meta">';
      if(codM) h+='<span>Cod.Mag: <b>'+esc(codM)+'</b></span> ';
      if(it.codF) h+='<span>Cod.Forn: <b>'+esc(it.codF)+'</b></span> ';
      h+='<span>Cart: <b>'+esc(entry.cartNome)+'</b></span>';
      h+='</div>';
      if(it.nota) h+='<div class="cof-nota">📝 '+esc(it.nota)+'</div>';
      h+='</div>';
      h+='<div class="cof-right">';
      h+='<div class="cof-qty">'+(parseFloat(it.qty)||0)+' '+(it.unit||'pz')+'</div>';
      h+='<div class="cof-sub">€'+sub+'</div>';
      h+='</div>';
      h+='</div>';
    });

    h+='</div>';
  });

  wrap.innerHTML=h;
}

// [SECTION: ORDINI] --------------------------------------------------------
//  Render lista ordini, filtri, dettaglio ordine, vista cassa
function renderOrdini(){
  var list=document.getElementById('ord-list');if(!list)return;
  updateOrdCounter();
  _updateBozzaBadge();
  var searchVal=(document.getElementById('ord-search')||{}).value||'';
  var searchLow=searchVal.trim().toLowerCase();

  // ── BOZZE — rileggi sempre da localStorage per sicurezza ──
  var _freshOrdini = lsGet(ORDK, []);
  // Merge: aggiungi bozze presenti in localStorage ma non in memoria
  _freshOrdini.forEach(function(fo){
    if(fo && fo.stato==='bozza' && !ordini.find(function(o){return o.id===fo.id;})){
      ordini.unshift(fo);
    }
  });

  // Bozze incluse nel flusso normale (filtro "nuovo" o "tutti")
  var filtered = ordini.filter(function(o){
    if(o.stato==='bozza'){
      // Le bozze appaiono solo in "nuovo" e "tutti"
      if(ordFiltro!=='nuovo' && ordFiltro!=='tutti') return false;
    } else {
      if(ordFiltro!=='tutti' && o.stato!==ordFiltro) return false;
    }
    if(!searchLow) return true;
    var hay=(o.nomeCliente||'');
    (o.items||[]).forEach(function(it){hay+=' '+(it.desc||'')+' '+(it.codF||'')+' '+(it.codM||'');});
    return hay.toLowerCase().indexOf(searchLow)>=0;
  });

  filtered.sort(function(a,b){return(b.createdAt||'').localeCompare(a.createdAt||'');});

  if(!filtered.length){
    list.innerHTML='<div style="text-align:center;padding:60px 20px;color:#444;"><div style="font-size:40px;margin-bottom:8px;">📋</div>'+(searchLow?'Nessun risultato':'Nessun ordine')+'</div>';
    return;
  }

  var SC={nuovo:'#f5c400',lavorazione:'#3182ce',pronto:'#dd6b20',completato:'#38a169'};
  var SL={nuovo:'NUOVO',lavorazione:'IN CORSO',pronto:'PRONTO',completato:'COMPLETATO'};
  var SBG={nuovo:'#f5c400',lavorazione:'#3182ce',pronto:'#dd6b20',completato:'#38a169'};

  var h='';

  // Raggruppa per data
  var gruppi={},gruppiOrd=[];
  filtered.forEach(function(o){
    var dk=o.data||'—';
    var iso=o.createdAt||'';
    if(iso){
      var d=new Date(iso),oggi=new Date();oggi.setHours(0,0,0,0);
      var ieri=new Date(oggi);ieri.setDate(ieri.getDate()-1);
      var dD=new Date(d);dD.setHours(0,0,0,0);
      if(dD.getTime()===oggi.getTime())dk='OGGI';
      else if(dD.getTime()===ieri.getTime())dk='IERI';
      else dk=d.toLocaleDateString('it-IT',{weekday:'long',day:'numeric',month:'long'}).toUpperCase();
    }
    if(!gruppi[dk]){gruppi[dk]=[];gruppiOrd.push(dk);}
    gruppi[dk].push(o);
  });

  // Render ordini raggruppati per data (include bozze nel flusso)
  gruppiOrd.forEach(function(dk){
    // ── SEPARATORE DATA — banda piena ──
    h+='<div class="ord-date-sep">';
    h+='<span class="ord-date-line"></span>';
    h+='<span class="ord-date-label">📅 '+esc(dk)+'</span>';
    h+='<span class="ord-date-line"></span>';
    h+='</div>';

    gruppi[dk].forEach(function(ord,idxInGroup){
      var gi=ordini.indexOf(ord);
      var ost=ord.stato;
      var nArt=(ord.items||[]).length;
      var tot=0;
      (ord.items||[]).forEach(function(it){tot+=parsePriceIT(it.prezzoUnit)*parseFloat(it.qty||0);});

      // ── BOZZA INLINE — card speciale dentro il flusso normale ──
      if(ost==='bozza'){
        h+='<div class="ord-card ord-card--bozza" data-bozza-id="'+ord.id+'" style="position:relative;">';
        h+='<div class="ord-card-stato ord-card-stato--bozza">';
        h+='📡 🔨 ⚡';
        h+='</div>';
        h+='<div class="ord-card-cliente">';
        h+='<div class="ord-cliente-nome" style="color:#90cdf4;">'+esc(ord.nomeCliente||'—')+'</div>';
        h+='<div class="ord-cliente-meta">';
        h+=esc(ord.data||'')+(ord.ora?' · '+ord.ora:'');
        h+=' · '+nArt+' articol'+(nArt===1?'o':'i')+' · <span style="color:#63b3ed;font-weight:700;">Dal banco</span>';
        h+='</div></div>';
        h+='<div class="ord-items-wrap">';
        h+='<div class="ord-grid ord-grid-head">';
        h+='<div class="ord-gh">Prodotto</div>';
        h+='<div class="ord-gh ord-gh-c">Qtà</div>';
        h+='<div class="ord-gh ord-gh-c">Prezzo</div>';
        h+='<div class="ord-gh ord-gh-c">Tot</div>';
        h+='</div>';
        (ord.items||[]).forEach(function(it,ii){
          var pu=parsePriceIT(it.prezzoUnit);
          var q=parseFloat(it.qty||0);
          var sub=(pu*q).toFixed(2);
          var prezzoManca=(!it.prezzoUnit||it.prezzoUnit==='0'||it.prezzoUnit===0||it.prezzoUnit==='');

          var prezOrigNum=0;
          var prezFinNum=pu;
          var hasSconto=false;
          var scOn=it.scampolo||it.fineRotolo||it._scaglionato||false;
          var scagAtt=it._scaglioneAttivo||null;
          if(scagAtt && it._prezzoBase){
            prezOrigNum=parsePriceIT(it._prezzoBase);
            hasSconto=prezOrigNum>prezFinNum+0.005;
          } else if((scOn||(it._scontoApplicato&&it._scontoApplicato>0))&&it._prezzoOriginale){
            prezOrigNum=parsePriceIT(it._prezzoOriginale);
            hasSconto=prezOrigNum>prezFinNum+0.005;
          }

          h+='<div class="ord-grid ord-grid-row'+(ii%2===0?' ord-grid-even':' ord-grid-odd')+'">';
          h+='<div class="ord-gc-desc">';
          h+='<div class="ord-item-name" onclick="openSchedaFromOrdine('+gi+','+ii+')" style="cursor:pointer;">'+esc(it.desc||'\u2014')+'</div>';
          var codesB='';
          if(it.codM) codesB+='<span class="ord-code-mag">'+esc(it.codM)+'</span>';
          codesB+='<span class="ord-code-forn ord-editable" onclick="ordInlineEdit(this,'+gi+','+ii+',\'codF\')" title="Tap per modificare">'+esc(it.codF||'—')+'</span>';
          h+='<div class="ord-item-codes">'+codesB+'</div>';
          if(it.nota) h+='<div class="ord-item-nota">📝 '+esc(it.nota)+'</div>';
          if(it.daOrdinare) h+='<div class="ord-item-daord">🚚 DA ORDINARE</div>';
          h+='</div>';

          h+='<div class="ord-gc-qty ord-editable" onclick="ordInlineEdit(this,'+gi+','+ii+',\'qty\')" title="Tap per modificare">'+q;
          h+='<select class="ord-unit-select" onclick="event.stopPropagation()" onchange="ordSetUnit('+gi+','+ii+',this.value)">';
          var unitsB=['pz','mt','kg','lt','cf','ml','gr','mm','cm','m\xB2','m\xB3'];
          unitsB.forEach(function(u){ h+='<option value="'+u+'"'+(u===(it.unit||'pz')?' selected':'')+'>'+u+'</option>'; });
          h+='</select>';
          h+='</div>';

          h+='<div class="ord-gc-price ord-editable" onclick="ordInlineEdit(this,'+gi+','+ii+',\'price\')" title="Tap per modificare">';
          if(prezzoManca && !hasSconto){
            h+='<span style="color:#fc8181;font-size:11px;font-weight:800;">— €?</span>';
          } else if(hasSconto){
            var savUnitB = (prezOrigNum - pu).toFixed(2);
            h+='<div class="ct-old--orig">€'+prezOrigNum.toFixed(2)+'</div>';
            h+='<div class="ct-sub--final">€'+pu.toFixed(2)+'</div>';
            h+='<div style="font-size:8px;color:#f6ad55;text-align:center;">-€'+savUnitB+'</div>';
          } else {
            h+='€'+pu.toFixed(2);
          }
          h+='</div>';

          h+='<div class="ord-gc-sub">';
          if(prezzoManca && !hasSconto){
            h+='<span style="color:#555;font-size:11px;">—</span>';
          } else if(hasSconto){
            var savTotB = ((prezOrigNum - pu) * q).toFixed(2);
            h+='<div class="ct-old--orig">€'+(prezOrigNum*q).toFixed(2)+'</div>';
            h+='<div class="ct-sub--final">€'+sub+'</div>';
            h+='<div style="font-size:8px;color:#f6ad55;text-align:center;">-€'+savTotB+'</div>';
          } else {
            h+='€'+sub;
          }
          h+='</div>';
          h+='</div>';

          var scOn2 = it.scampolo||it.fineRotolo||it._scaglionato||false;
          var hasNota2 = !!(it.nota && it.nota.trim());
          var sc2 = it._scontoApplicato||0;
          var actClass = it._scaglionato ? 'ord-actions-scaglionato' : (it._tuttoRotolo||it.fineRotolo ? 'ord-actions-rotolo' : (it.scampolo ? 'ord-actions-scampolo' : ''));
          h+='<div class="ord-item-actions '+ actClass +'" style="display:flex;gap:4px;align-items:center;padding:2px 8px;">';
          var forbLbl2 = it._scaglionato?'SCAG':(it._tuttoRotolo?'ROT':(scOn2?(it.fineRotolo?'ROT':'SCA'):''));
          var forbColor = it._scaglionato ? 'color:#63b3ed;border-color:#63b3ed44;background:#08082a;' : (scOn2||it._tuttoRotolo ? '' : '');
          h+='<button class="ord-mini-btn'+(scOn2||it._tuttoRotolo?' ord-mini-on':'')+'" style="'+forbColor+'" onclick="ordToggleScampolo('+gi+','+ii+')" title="Scampolo/Rotolo/Scaglionato">';
          h+='✂'+(forbLbl2?' '+forbLbl2:'')+'</button>';
          if(scOn2||it._tuttoRotolo||it._scaglionato){
            h+='<input type="number" min="0" max="100" value="'+(sc2||'')+'" placeholder="%" class="ord-mini-pct" onchange="ordSetSconto('+gi+','+ii+',this.value)" onclick="event.stopPropagation();this.select()">';
            h+='<span style="font-size:9px;color:'+(it._scaglionato?'#63b3ed':'#68d391')+'">%</span>';
          }
          if(it._scaglionato){
            h+='<span style="font-size:9px;color:#63b3ed;">da</span>';
            h+='<input type="number" min="1" value="'+(it._scaglioneQta||10)+'" placeholder="qty" class="ord-mini-pct" style="color:#63b3ed;border-color:#63b3ed44;" onchange="ordSetScaglioneQta('+gi+','+ii+',this.value)" onclick="event.stopPropagation();this.select()">';
            h+='<span style="font-size:9px;color:#63b3ed;">pz</span>';
          }
          h+='<button class="ord-mini-btn'+(hasNota2?' ord-mini-on':'')+'" onclick="ordEditNota('+gi+','+ii+')" title="Nota" style="margin-left:auto">📝</button>';
          h+='<span class="ord-item-del" onclick="event.stopPropagation();ordDelItem(this,'+gi+','+ii+')" title="Rimuovi articolo">×</span>';
          h+='</div>';
        });
        h+='</div>';
        h+='<div class="ord-total-bar">';
        h+='<span class="ord-total-label">TOTALE</span>';
        h+='<span class="ord-total-value" style="color:#63b3ed;">€ '+tot.toFixed(2)+(tot===0?' <span style="font-size:12px;color:#555;">prezzi da inserire</span>':'')+'</span>';
        h+='</div>';
        if(ord.nota){
          h+='<div style="padding:6px 12px;font-size:12px;color:#f6ad55;white-space:pre-wrap;word-break:break-word;">📋 '+esc(ord.nota)+'</div>';
        }
        h+='<div style="padding:8px 14px 12px;font-size:11px;color:#3182ce;font-style:italic;">⚡ Ordine in costruzione dal banco — aggiornato in tempo reale</div>';
        h+='</div>';
        h+='<div class="ord-spacer"><div class="ord-spacer-line"></div></div>';
        return; // skip rendering card normale
      }

      // ── Ex-bozza promossa a ordine: colore viola solo se ancora 'nuovo' ──
      var _isExBozza = !!(ord.promozione);
      var sc = (_isExBozza && ost==='nuovo') ? '#805ad5' : (SC[ost]||'#555');

      // ── CARD ORDINE — blocco massiccio con bordo colorato top ──
      var lockInfo = ordIsLockedByOther(ord.id);
      var isCompleted = ost==='completato';
      var unlocked = ord.unlocked || false;

      // Calcolo ruolo/permessi PRIMA degli overlay (usati subito sotto)
      var _myKey = (typeof _currentUser !== 'undefined' && _currentUser) ? _currentUser.key : null;
      var _myRuolo = (typeof _currentUser !== 'undefined' && _currentUser) ? _currentUser.ruolo : 'proprietario';
      var _ordCommesso = ord.commesso || null;
      var _altruiOrdine = (_myRuolo !== 'proprietario' && _ordCommesso && _ordCommesso !== _myKey);
      // Non editabile se: completato, ordine altrui, o bloccato da un altro account
      var _canEdit = !(isCompleted && !unlocked) && !_altruiOrdine && !lockInfo;

      h+='<div class="ord-card'+(isCompleted&&!unlocked?' ord-card--done':'') + (_isExBozza&&ost==='nuovo'?' ord-card--exbozza':'')+'" style="border-top:4px solid '+sc+';position:relative;">';

      // OVERLAY ACCOUNT - ordine di un altro commesso (solo proprietario può toccare)
      if(_altruiOrdine && !lockInfo){
        h+='<div class="ord-lock-overlay" onclick="ordDblTap(this,\'force\',\''+ord.id+'\','+gi+')">';
        h+='<div class="ord-lock-msg">';
        h+='<div style="font-size:24px;margin-bottom:6px">🔐</div>';
        var _ordNomeCommesso = (typeof _roles !== 'undefined' && _roles[_ordCommesso]) ? _roles[_ordCommesso].nome : (_ordCommesso || 'altro account');
        h+='<div style="font-size:14px;font-weight:800">ORDINE DI '+esc(_ordNomeCommesso).toUpperCase()+'</div>';
        h+='<div style="font-size:10px;margin-top:8px;color:#666">Solo il proprietario può modificarlo</div>';
        h+='</div></div>';
      }

      // OVERLAY LOCK - se un altro dispositivo sta lavorando
      if(lockInfo){
        h+='<div class="ord-lock-overlay" onclick="ordDblTap(this,\'force\',\''+ord.id+'\','+gi+')">';
        h+='<div class="ord-lock-msg">';
        h+='<div style="font-size:24px;margin-bottom:6px">🔒</div>';
        h+='<div style="font-size:14px;font-weight:800">IN LAVORAZIONE</div>';
        h+='<div style="font-size:11px;margin-top:4px;color:#aaa">'+esc(lockInfo.name||'Altro dispositivo')+'</div>';
        h+='<div style="font-size:10px;margin-top:8px;color:#666">Triplo tap per forzare</div>';
        h+='</div></div>';
      }

      // ── HEADER: banda colorata con stato ──
      var _bannerLabel = (_isExBozza && ost==='nuovo') ? ('📡 DA BOZZA') : SL[ost];
      var _bannerTextCol = (ost==='nuovo' && !_isExBozza) ? '#111' : '#fff';
      h+='<div class="ord-card-stato" style="background:'+sc+';color:'+_bannerTextCol+'">';
      h+=_bannerLabel;
      if(ord.numero) h+=' — #'+ord.numero;
      // Etichetta "da bozza" in piccolo se ex-bozza e NON in stato nuovo (dove il banner è già viola)
      if(_isExBozza && ost!=='nuovo'){
        h+=' <span style="font-size:9px;opacity:.7;font-weight:600;letter-spacing:.3px;vertical-align:middle;">📡 da bozza</span>';
      }
      if(ord.modificato){
        var diffTxt = (ord.modificheDiff && ord.modificheDiff.length) ? ord.modificheDiff.join('\\n') : '';
        h+=' <span onclick="event.stopPropagation();ordMostraModifiche(\''+ord.id+'\')" style="background:#553c9a;color:#e9d8fd;font-size:10px;padding:1px 7px;border-radius:8px;letter-spacing:.5px;font-weight:700;vertical-align:middle;cursor:pointer;" title="Vedi modifiche">✏️ MODIFICATO</span>';
      }
      h+='</div>';

      // ── CLIENTE + DATA ──
      h+='<div class="ord-card-cliente">';
      if(_canEdit){
        h+='<div class="ord-cliente-nome" onclick="ordEditCliente('+gi+')" style="cursor:pointer;" title="Tap per modificare">'+esc(ord.nomeCliente||'—')+'</div>';
      } else {
        h+='<div class="ord-cliente-nome">'+esc(ord.nomeCliente||'—')+'</div>';
      }
      h+='<div class="ord-cliente-meta">';
      h+=esc(ord.data||'')+(ord.ora?' · '+ord.ora:'');
      h+=' · '+nArt+' articol'+(nArt===1?'o':'i');
      h+='</div>';
      h+='</div>';

      // ── GRIGLIA ARTICOLI — header ──
      h+='<div class="ord-items-wrap">';
      h+='<div class="ord-grid ord-grid-head">';
      h+='<div class="ord-gh">Prodotto</div>';
      h+='<div class="ord-gh ord-gh-c">Qtà</div>';
      h+='<div class="ord-gh ord-gh-c">Prezzo</div>';
      h+='<div class="ord-gh ord-gh-c">Tot</div>';
      h+='</div>';

      // _myKey, _myRuolo, _ordCommesso, _altruiOrdine, _canEdit — già calcolati sopra

      (ord.items||[]).forEach(function(it,ii){
        var pu=parsePriceIT(it.prezzoUnit);
        var q=parseFloat(it.qty||0);
        var sub=(pu*q).toFixed(2);

        // Calcola se c'è sconto attivo
        var prezOrigNum=0;
        var prezFinNum=pu;
        var hasSconto=false;
        var scOn=it.scampolo||it.fineRotolo||it._scaglionato||false;
        var scagAtt=it._scaglioneAttivo||null;
        if(scagAtt && it._prezzoBase){
          prezOrigNum=parsePriceIT(it._prezzoBase);
          hasSconto=prezOrigNum>prezFinNum+0.005;
        } else if((scOn||(it._scontoApplicato&&it._scontoApplicato>0))&&it._prezzoOriginale){
          prezOrigNum=parsePriceIT(it._prezzoOriginale);
          hasSconto=prezOrigNum>prezFinNum+0.005;
        }

        h+='<div class="ord-grid ord-grid-row'+(ii%2===0?' ord-grid-even':' ord-grid-odd')+'">';

        // Colonna prodotto: nome + codici sotto (codF editabile con dblclick)
        h+='<div class="ord-gc-desc">';
        h+='<div class="ord-item-name" onclick="openSchedaFromOrdine('+gi+','+ii+')" style="cursor:pointer;">'+esc(it.desc||'\u2014')+'</div>';
        var codes='';
        if(it.codM) codes+='<span class="ord-code-mag">'+esc(it.codM)+'</span>';
        codes+='<span class="ord-code-forn'+(_canEdit?' ord-editable':'')+'"'+(_canEdit?' onclick="ordInlineEdit(this,'+gi+','+ii+',\'codF\')" title="Tap per modificare"':'')+'>'+esc(it.codF||'—')+'</span>';
        h+='<div class="ord-item-codes">'+codes+'</div>';
        if(it.nota) h+='<div class="ord-item-nota">📝 '+esc(it.nota)+'</div>';
        if(it.daOrdinare) h+='<div class="ord-item-daord">🚚 DA ORDINARE</div>';
        h+='</div>';

        // Quantità + unità nella stessa cella
        h+='<div class="ord-gc-qty'+(_canEdit?' ord-editable':'')+'"'+(_canEdit?' onclick="ordInlineEdit(this,'+gi+','+ii+',\'qty\')" title="Tap per modificare"':'')+'>'+q;
        if(_canEdit){
          h+='<select class="ord-unit-select" onclick="event.stopPropagation()" onchange="ordSetUnit('+gi+','+ii+',this.value)">';
          var units=['pz','mt','kg','lt','cf','ml','gr','mm','cm','m\xB2','m\xB3'];
          units.forEach(function(u){ h+='<option value="'+u+'"'+(u===(it.unit||'pz')?' selected':'')+'>'+u+'</option>'; });
          h+='</select>';
        } else {
          h+='<span class="ord-unit">'+esc(it.unit||'pz')+'</span>';
        }
        h+='</div>';

        // Prezzo unitario — con sconto sbarrato se presente
        h+='<div class="ord-gc-price'+(_canEdit?' ord-editable':'')+'"'+(_canEdit?' onclick="ordInlineEdit(this,'+gi+','+ii+',\'price\')" title="Tap per modificare"':'')+'>';
        if(hasSconto){
          var savUnit = (prezOrigNum - pu).toFixed(2);
          h+='<div class="ct-old--orig">€'+prezOrigNum.toFixed(2)+'</div>';
          h+='<div class="ct-sub--final">€'+pu.toFixed(2)+'</div>';
          h+='<div style="font-size:8px;color:#f6ad55;text-align:center;">-€'+savUnit+'</div>';
        } else {
          h+='€'+pu.toFixed(2);
        }
        h+='</div>';

        // Subtotale — con sconto sbarrato se presente
        h+='<div class="ord-gc-sub">';
        if(hasSconto){
          var savTot = ((prezOrigNum - pu) * q).toFixed(2);
          h+='<div class="ct-old--orig">€'+(prezOrigNum*q).toFixed(2)+'</div>';
          h+='<div class="ct-sub--final">€'+sub+'</div>';
          h+='<div style="font-size:8px;color:#f6ad55;text-align:center;">-€'+savTot+'</div>';
        } else {
          h+='€'+sub;
        }
        h+='</div>'; // fine ord-gc-sub
        h+='</div>'; // fine ord-grid-row

        // Mini azioni articolo — forbici + nota (fuori dalla griglia, div separato)
        var scOn2 = it.scampolo||it.fineRotolo||it._scaglionato||false;
        var hasNota2 = !!(it.nota && it.nota.trim());
        var sc2 = it._scontoApplicato||0;
        var actClass = it._scaglionato ? 'ord-actions-scaglionato' : (it._tuttoRotolo||it.fineRotolo ? 'ord-actions-rotolo' : (it.scampolo ? 'ord-actions-scampolo' : ''));
        if(_canEdit){
          h+='<div class="ord-item-actions '+ actClass +'" style="display:flex;gap:4px;align-items:center;padding:2px 8px;">';
          // Forbici — ciclo: OFF→SCA→ROT→SCAG→OFF
          var forbLbl2 = it._scaglionato?'SCAG':(it._tuttoRotolo?'ROT':(scOn2?(it.fineRotolo?'ROT':'SCA'):''));
          var forbColor = it._scaglionato ? 'color:#63b3ed;border-color:#63b3ed44;background:#08082a;' : (scOn2||it._tuttoRotolo ? '' : '');
          h+='<button class="ord-mini-btn'+(scOn2||it._tuttoRotolo?' ord-mini-on':'')+'" style="'+forbColor+'" onclick="ordToggleScampolo('+gi+','+ii+')" title="Scampolo/Rotolo/Scaglionato">';
          h+='✂'+(forbLbl2?' '+forbLbl2:'')+'</button>';
          // % sconto inline
          if(scOn2||it._tuttoRotolo||it._scaglionato){
            h+='<input type="number" min="0" max="100" value="'+(sc2||'')+'" placeholder="%" class="ord-mini-pct" onchange="ordSetSconto('+gi+','+ii+',this.value)" onclick="event.stopPropagation();this.select()">';
            h+='<span style="font-size:9px;color:'+(it._scaglionato?'#63b3ed':'#68d391')+'">%</span>';
          }
          // Quantità minima scaglione
          if(it._scaglionato){
            h+='<span style="font-size:9px;color:#63b3ed;">da</span>';
            h+='<input type="number" min="1" value="'+(it._scaglioneQta||10)+'" placeholder="qty" class="ord-mini-pct" style="color:#63b3ed;border-color:#63b3ed44;" onchange="ordSetScaglioneQta('+gi+','+ii+',this.value)" onclick="event.stopPropagation();this.select()">';
            h+='<span style="font-size:9px;color:#63b3ed;">pz</span>';
          }
          // Nota articolo
          h+='<button class="ord-mini-btn'+(hasNota2?' ord-mini-on':'')+'" onclick="ordEditNota('+gi+','+ii+')" title="Nota" style="margin-left:auto">📝</button>';
          h+='<span class="ord-item-del" onclick="event.stopPropagation();ordDelItem(this,'+gi+','+ii+')" title="Rimuovi articolo">×</span>';
          h+='</div>';
        } else if(hasNota2||scOn2){
          h+='<div style="padding:1px 8px;font-size:9px;color:#666;">';
          if(it._scaglionato&&sc2) h+='<span style="color:#63b3ed;">📦 Scaglionato -'+sc2+'% da '+(it._scaglioneQta||10)+'pz</span> ';
          else if(scOn2&&sc2) h+='<span>✂ -'+sc2+'%</span> ';
          if(hasNota2) h+='<span>📝 '+esc(it.nota)+'</span>';
          h+='</div>';
        }

      });

      h+='</div>';

      // Nota ordine — editabile se sbloccato, gialla fissa se bloccato
      if(_canEdit){
        h+='<div class="ord-nota-edit" style="padding:4px 12px;">';
        h+='<input type="text" class="ord-nota-input" value="'+esc(ord.nota||'')+'" placeholder="📋 Nota ordine..." onchange="ordSetNotaOrdine('+gi+',this.value)" onclick="event.stopPropagation()">';
        h+='</div>';
      } else if(ord.nota){
        h+='<div style="padding:6px 12px;font-size:13px;color:var(--accent);font-weight:700;white-space:pre-wrap;word-break:break-word;">📋 '+esc(ord.nota)+'</div>';
      }

      // ── TOTALE ORDINE — grande e visibile ──
      h+='<div class="ord-total-bar">';
      h+='<span class="ord-total-label">TOTALE</span>';
      h+='<span class="ord-total-value">€ '+tot.toFixed(2)+'</span>';
      h+='</div>';

      // ── AZIONI ──
      if(isCompleted && !unlocked){
        // Completato e bloccato: solo Sblocca, Stampa, Elimina
        h+='<div class="ord-actions">';
        h+='<button onclick="ordSbloccaFatto('+gi+')" class="ord-abtn ord-abtn--reopen">🔓 Sblocca</button>';
        h+='<button onclick="ordStampaDblTap(this,'+gi+')" class="ord-abtn ord-abtn--print">🖨️ Stampa</button>';
        h+='<button onclick="deleteOrdine('+gi+')" class="ord-abtn ord-abtn--del">🗑️ Elimina</button>';
        h+='</div>';
      } else {
        h+='<div class="ord-actions">';
        if(!isCompleted){
          h+='<button onclick="setStatoOrdine('+gi+',\'completato\')" class="ord-abtn ord-abtn--done">✅ Fatto</button>';
        } else {
          h+='<button onclick="ordRibloccaFatto('+gi+')" class="ord-abtn ord-abtn--done">🔒 Blocca</button>';
          h+='<button onclick="setStatoOrdine('+gi+',\'nuovo\')" class="ord-abtn ord-abtn--reopen">↩️ Riapri</button>';
        }
        h+='<button onclick="openCassa('+gi+')" class="ord-abtn ord-abtn--cassa">💰 Cassa</button>';
        h+='</div>';
        h+='<div class="ord-actions ord-actions-sec">';
        h+='<button onclick="ordStampaDblTap(this,'+gi+')" class="ord-abtn ord-abtn--print">🖨️ Stampa</button>';
        if(ost!=='lavorazione') h+='<button onclick="setStatoOrdine('+gi+',\'lavorazione\')" class="ord-abtn ord-abtn--wip">⏳ In corso</button>';
        if(ost!=='pronto') h+='<button onclick="setStatoOrdine('+gi+',\'pronto\')" class="ord-abtn ord-abtn--ready">📦 Pronto</button>';
        h+='<button onclick="deleteOrdine('+gi+')" class="ord-abtn ord-abtn--del">🗑️ Elimina</button>';
        h+='</div>';
      }

      h+='</div>'; // fine ord-card

      // ── SPACER tra ordini — grande, con linea decorativa ──
      h+='<div class="ord-spacer"><div class="ord-spacer-line"></div></div>';
    });
  });

  list.innerHTML=h;
}
// --- AUTO-REFRESH ORDINI (polling localStorage ogni 5s) -------
var _autoRefreshInterval=null;
var _lastOrdiniJson='';

var _bozzaBadgeLast = -1; // -1 = primo avvio, non notificare
function _updateBozzaBadge(){
  var nBozze=ordini.filter(function(o){return o.stato==='bozza';}).length;
  // Notifica solo se arrivano bozze NUOVE (non al primo avvio)
  if(_bozzaBadgeLast >= 0 && nBozze > _bozzaBadgeLast){
    var toTab=document.getElementById('to');
    var tabAttiva = toTab && toTab.classList.contains('active');
    if(!tabAttiva){
      var tbbTo=document.getElementById('tbb-to');
      if(tbbTo){ tbbTo.style.color='#63b3ed'; setTimeout(function(){tbbTo.style.color='';},3000); }
    }
  }
  _bozzaBadgeLast = nBozze;
  // Badge 📡 sul tasto tab ordini nella bottom bar
  var bb=document.getElementById('bozza-badge');
  if(!bb){
    var tbbTo=document.getElementById('tbb-to');
    if(tbbTo){
      bb=document.createElement('span');
      bb.id='bozza-badge';
      bb.style.cssText='background:#3182ce;color:#fff;border-radius:8px;padding:1px 5px;font-size:9px;margin-left:2px;';
      tbbTo.appendChild(bb);
    }
  }
  if(bb){
    bb.textContent= nBozze>0 ? '📡'+nBozze : '';
    bb.style.display= nBozze>0 ? '' : 'none';
  }
}

function startAutoRefresh(){
  _lastOrdiniJson=JSON.stringify(ordini);
  _updateBozzaBadge(); // controlla subito all'avvio
  _autoRefreshInterval=setInterval(function(){
    var fresh=lsGet(ORDK,[]);
    var freshJson=JSON.stringify(fresh);
    if(freshJson!==_lastOrdiniJson){
      var prevJson=_lastOrdiniJson;
      var prev=JSON.parse(prevJson)||[];
      var prevBozze=prev.filter(function(o){return o.stato==='bozza';}).length;
      var prevNuovi=prev.filter(function(o){return o.stato==='nuovo';}).length;
      _lastOrdiniJson=freshJson;
      ordini=fresh;
      updateOrdBadge();
      updateOrdCounter();
      _updateBozzaBadge();
      // Se la tab ordini è visibile, aggiorna
      var toTab=document.getElementById('to');
      if(toTab&&toTab.classList.contains('active')){
        renderOrdini();
        // Rileva bozze aggiornate (stessa quantità ma contenuto diverso)
        var freshBozzeIds=fresh.filter(function(o){return o.stato==='bozza';}).map(function(o){return o.id;});
        var prevBozzeMap={};
        prev.filter(function(o){return o.stato==='bozza';}).forEach(function(o){prevBozzeMap[o.id]=JSON.stringify(o);});
        freshBozzeIds.forEach(function(bid){
          var fb=fresh.find(function(o){return o.id===bid;});
          if(fb && prevBozzeMap[bid] && prevBozzeMap[bid]!==JSON.stringify(fb)){
            if(typeof mostraBozzaAggiornata === 'function') mostraBozzaAggiornata(fb);
          }
        });
      } else {
        // Tab non attiva: badge e notifica gestiti da _updateBozzaBadge()
        var nuoveBozze=fresh.filter(function(o){return o.stato==='bozza';}).length;
        if(nuoveBozze>prevBozze){
          var tbbTo=document.getElementById('tbb-to');
          if(tbbTo){
            tbbTo.style.color='#63b3ed';
            setTimeout(function(){tbbTo.style.color='';},3000);
          }
          // Notifica browser + modal per bozza
          var bozzeArr=fresh.filter(function(o){return o.stato==='bozza';});
          if(bozzeArr.length && typeof mostraNotificaBozza === 'function'){
            mostraNotificaBozza(bozzeArr[0]);
          }
        }
      }
      // Notifica sonora per nuovi ordini normali
      var nuovi=fresh.filter(function(o){return o.stato==='nuovo';}).length;
      if(nuovi>prevNuovi){
        feedbackSend();
      }
    }
  },5000);
}

// --- CONTATORE ORDINI IN ATTESA -------------------------------
var _lastBozzeCount = 0;
function updateOrdCounter(){
  _updateBozzaBadge();
  // Se arrivano bozze nuove via Firebase sync, aggiorna il render
  var curBozze = ordini.filter(function(o){ return o.stato==='bozza'; }).length;
  if(curBozze !== _lastBozzeCount){
    _lastBozzeCount = curBozze;
    var toTab = document.getElementById('to');
    if(toTab && toTab.classList.contains('active') && !document.querySelector('.ord-inline-input')){
      renderOrdini();
    }
  }
  var banner=document.getElementById('ord-counter-banner');
  if(!banner)return;

  // Mostra solo il contatore dello stato filtrato attivo
  var count=0;
  var label='';
  var color='';
  var bg='';
  var border='';
  var icon='';

  if(ordFiltro==='nuovo'){
    count=ordini.filter(function(o){return o.stato==='nuovo'||o.stato==='bozza';}).length;
    label='Nuov'+(count===1?'o':'i'); icon='🆕'; color='var(--accent)'; bg='linear-gradient(135deg,#1a1a00,#2a2a00)'; border='2px solid var(--accent)';
  } else if(ordFiltro==='lavorazione'){
    count=ordini.filter(function(o){return o.stato==='lavorazione';}).length;
    label='In corso'; icon='⏳'; color='#63b3ed'; bg='#0d1a2a'; border='1px solid #3182ce44';
  } else if(ordFiltro==='pronto'){
    count=ordini.filter(function(o){return o.stato==='pronto';}).length;
    label='Pront'+(count===1?'o':'i'); icon='📦'; color='#f6ad55'; bg='#1a1500'; border='1px solid #dd6b2044';
  } else if(ordFiltro==='completato'){
    count=ordini.filter(function(o){return o.stato==='completato';}).length;
    label='Fatt'+(count===1?'o':'i'); icon='✅'; color='#68d391'; bg='#0d1a0d'; border='1px solid #38a16944';
  } else {
    // "tutti" — nessun contatore
    banner.style.display='none';
    var fc=document.getElementById('ord-filter-count');
    if(fc){ fc.textContent=ordini.length; }
    return;
  }

  if(count===0){
    banner.style.display='none';
  } else {
    banner.style.display='block';
    banner.innerHTML=
      '<div style="display:flex;justify-content:center;">' +
      '<div style="background:'+bg+';border:'+border+';border-radius:12px;padding:10px 24px;text-align:center;min-width:100px;">' +
      '<div style="font-size:28px;font-weight:900;color:'+color+';">'+count+'</div>' +
      '<div style="font-size:10px;color:'+color+';font-weight:700;text-transform:uppercase;letter-spacing:.5px;">'+icon+' '+label+'</div>' +
      '</div></div>';
  }

  // Contatore filtrato accanto al titolo
  var fc=document.getElementById('ord-filter-count');
  if(fc){
    fc.textContent=count;
  }
}

// --- CALENDARIO STORICO ORDINI ---
function toggleOrdCalendario(){
  var cal=document.getElementById('ord-calendario');
  var btn=document.getElementById('ord-cal-btn');
  if(!cal)return;
  var show=cal.style.display==='none';
  cal.style.display=show?'block':'none';
  if(btn){
    btn.style.borderColor=show?'var(--accent)':'#555';
    btn.style.color=show?'var(--accent)':'#aaa';
  }
  if(show){
    var inp=document.getElementById('ord-cal-date');
    if(inp && !inp.value) inp.value=new Date().toISOString().slice(0,10);
    renderOrdiniByDate();
  }
}
function chiudiOrdCalendario(){
  var cal=document.getElementById('ord-calendario');
  var btn=document.getElementById('ord-cal-btn');
  if(cal) cal.style.display='none';
  if(btn){btn.style.borderColor='#555';btn.style.color='#aaa';}
}
function ordCalOggi(){
  var inp=document.getElementById('ord-cal-date');
  if(inp) inp.value=new Date().toISOString().slice(0,10);
  renderOrdiniByDate();
}

function _getOrdDataISO(ord){
  // Prova dataISO diretto
  if(ord.dataISO) return ord.dataISO;
  // Fallback: ricava da createdAt (ISO string)
  if(ord.createdAt) return ord.createdAt.slice(0,10);
  // Fallback: ricava da data italiana "dd/mm/yyyy"
  if(ord.data){
    var p=ord.data.split('/');
    if(p.length===3) return p[2]+'-'+p[1].padStart(2,'0')+'-'+p[0].padStart(2,'0');
  }
  return '';
}

function renderOrdiniByDate(){
  var wrap=document.getElementById('ord-cal-results');
  if(!wrap)return;
  var inp=document.getElementById('ord-cal-date');
  var selDate=inp?inp.value:'';
  if(!selDate){wrap.innerHTML='';return;}

  var filtered=ordini.filter(function(o){
    return _getOrdDataISO(o)===selDate;
  });

  if(!filtered.length){
    // Formatta data per messaggio
    var dp=selDate.split('-');
    var label=dp[2]+'/'+dp[1]+'/'+dp[0];
    wrap.innerHTML='<div style="text-align:center;padding:30px 16px;color:#555;font-size:13px;">'+
      '<div style="font-size:32px;margin-bottom:8px;">📅</div>'+
      'Nessun ordine trovato per il <b style="color:#888;">'+label+'</b></div>';
    return;
  }

  var SC={nuovo:'#f5c400',lavorazione:'#3182ce',pronto:'#dd6b20',completato:'#38a169'};
  var SL={nuovo:'NUOVO',lavorazione:'IN CORSO',pronto:'PRONTO',completato:'COMPLETATO'};

  var h='<div style="font-size:12px;color:#888;font-weight:800;margin-bottom:10px;letter-spacing:1px;">'+filtered.length+' ORDINE'+(filtered.length>1?'':'')+'</div>';

  filtered.forEach(function(ord){
    var ost=ord.stato;
    var sc=SC[ost]||'#555';
    var tot=0;
    (ord.items||[]).forEach(function(it){tot+=parsePriceIT(it.prezzoUnit)*parseFloat(it.qty||0);});

    h+='<div class="ord-card" style="border-top:4px solid '+sc+';margin-bottom:14px;">';
    h+='<div class="ord-card-stato" style="background:'+sc+';color:'+(ost==='nuovo'?'#111':'#fff')+'">'+SL[ost]+(ord.modificato?' <span style="background:#553c9a;color:#e9d8fd;font-size:10px;padding:1px 7px;border-radius:8px;letter-spacing:.5px;font-weight:700;vertical-align:middle;">MODIFICATO</span>':'');
    if(ord.numero) h+=' — #'+ord.numero;
    h+='</div>';
    h+='<div class="ord-card-cliente">';
    h+='<div class="ord-cliente-nome">'+esc(ord.nomeCliente||'—')+'</div>';
    h+='<div class="ord-cliente-meta">'+esc(ord.data||'')+(ord.ora?' · '+ord.ora:'')+' · '+(ord.items||[]).length+' articol'+((ord.items||[]).length===1?'o':'i')+'</div>';
    h+='</div>';

    if(ord.nota) h+='<div class="ord-nota" style="white-space:pre-wrap;word-break:break-word;">📝 '+esc(ord.nota)+'</div>';

    // Articoli in grid
    h+='<div class="ord-items-wrap">';
    h+='<div class="ord-grid ord-grid-head">';
    h+='<div class="ord-gh">Prodotto</div><div class="ord-gh ord-gh-c">Qtà</div><div class="ord-gh ord-gh-c">Prezzo</div><div class="ord-gh ord-gh-c">Tot</div>';
    h+='</div>';
    (ord.items||[]).forEach(function(it,ii){
      var pu=parsePriceIT(it.prezzoUnit);var q=parseFloat(it.qty||0);var sub=(pu*q).toFixed(2);
      h+='<div class="ord-grid ord-grid-row'+(ii%2===0?' ord-grid-even':' ord-grid-odd')+'">';
      h+='<div class="ord-gc-desc"><div class="ord-item-name">'+esc(it.desc||'—')+'</div>';
      var codes='';
      if(it.codM) codes+='<span class="ord-code-mag">'+esc(it.codM)+'</span>';
      if(it.codF) codes+='<span class="ord-code-forn">'+esc(it.codF)+'</span>';
      if(codes) h+='<div class="ord-item-codes">'+codes+'</div>';
      h+='</div>';
      h+='<div class="ord-gc-qty">'+q+'<span class="ord-unit">'+esc(it.unit||'pz')+'</span></div>';
      h+='<div class="ord-gc-price">€'+pu.toFixed(2)+'</div>';
      h+='<div class="ord-gc-sub">€'+sub+'</div>';
      h+='</div>';
    });
    h+='</div>';

    h+='<div class="ord-total-bar"><span class="ord-total-label">TOTALE</span><span class="ord-total-value">€ '+tot.toFixed(2)+'</span></div>';
    h+='</div>';
  });

  wrap.innerHTML=h;
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
      if(o.id && typeof ordUnlock === 'function') ordUnlock(o.id);
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
function ordSbloccaFatto(gi){ ordSblocca(gi); }
function ordRibloccaFatto(gi){ ordBlocca(gi); }
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
  // Popola tendina storico prezzi
  var ph = r.priceHistory || [];
  var phWrap = document.getElementById('ep-price-history');
  for(var pi = 0; pi < 4; pi++){
    var phEl = document.getElementById('ep-ph-' + (pi + 2));
    if(phEl) phEl.textContent = ph[pi] ? ('€ ' + ph[pi].prezzo + (ph[pi].data ? ' — ' + ph[pi].data : '')) : '—';
  }
  if(phWrap) phWrap.style.display = 'none'; // chiusa di default
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

// Tendina storico prezzi nella scheda prodotto
function togglePriceHistory(){
  var el = document.getElementById('ep-price-history');
  if(!el) return;
  el.style.display = el.style.display === 'none' ? 'block' : 'none';
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
  _fbSaveArticolo(i);
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




// ── LOCK COLLABORATIVO — forza accesso con triplo tap ────────────
function ordForceLock(ordId, gi){
  var ord = ordini[gi];
  if(!ord || ord.id !== ordId){ ord = ordini.find(function(x){ return x && x.id === ordId; }); }
  if(!ord){ console.error('[LOCK] ordForceLock — ordine non trovato:', ordId); return; }
  var key = _lockKey(ordId);
  var currentLock = _ordLocks[key];
  var holderName = currentLock ? (currentLock.name || 'altro account') : 'altro account';
  console.warn('[LOCK] ordForceLock — tentativo sblocco forzato su:', ordId, 'da:', holderName);
  if(!confirm('⚠️ Sblocco forzato\n\n' + holderName + ' sta lavorando su questo ordine.\n\nVuoi forzare l\'accesso?')){
    console.log('[LOCK] ordForceLock — annullato dall\'utente');
    return;
  }
  console.warn('[LOCK] ordForceLock — CONFERMATO, prendo il lock su:', ordId);
  ordAcquireOrderLock(ordId, { force: true }, function(ok){
    if(!ok){
      showToastGen('red','❌ Impossibile aggiornare il lock su Firebase');
      return;
    }
    var o = ordini.find(function(x){ return x && x.id === ordId; });
    if(!o) return;
    var chi = (typeof _currentUser !== 'undefined' && _currentUser) ? _currentUser.nome : 'Sconosciuto';
    var ora = new Date().toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'});
    if(!o.modificheDiff) o.modificheDiff = [];
    o.modificheDiff.unshift('⚠️ ' + ora + ' — Lock forzato da ' + chi + ' (era: ' + holderName + ')');
    o.modificato = true;
    o.modificatoAt = new Date().toLocaleString('it-IT');
    o.modificatoAtISO = new Date().toISOString();
    saveOrdini();
    showToastGen('orange','🔓 Lock forzato — ora lavori tu');
    if(typeof ordRefreshLockUI === 'function') ordRefreshLockUI();
    else renderOrdini();
  });
}

// ── DOPPIO TAP UNIVERSALE ORDINI (Safari iOS compatibile) ────────
// Tap multipli: doppio tap per edit normale, TRIPLO tap per forzare lock
var _ordDblTapTimer = null;
var _ordDblTapEl = null;
var _ordDblTapKey = null;
var _ordDblTapCount = 0;

function ordDblTap(el, action, arg1, arg2){
  while(el && !el.getAttribute('onclick') && el.parentElement){
    el = el.parentElement;
  }
  var key = action + '_' + arg1 + '_' + arg2;
  if(_ordDblTapKey === key){
    _ordDblTapCount++;
    clearTimeout(_ordDblTapTimer);
    if(action === 'force'){
      // Per il lock overlay: serve TRIPLO tap
      if(_ordDblTapCount >= 2){
        _ordDblTapKey = null; _ordDblTapCount = 0;
        if(_ordDblTapEl){ _ordDblTapEl.style.outline=''; _ordDblTapEl.style.outlineOffset=''; }
        _ordDblTapEl = null;
        ordForceLock(arg1, arg2);
        return;
      }
      // Secondo tap: mostra feedback "ancora un tap"
      if(_ordDblTapEl){
        _ordDblTapEl.style.outline='2px solid #e53e3e';
        _ordDblTapEl.querySelector&&(_ordDblTapEl.querySelector('.ord-lock-msg')
          && (_ordDblTapEl.querySelector('.ord-lock-msg').style.opacity='0.5'));
      }
    } else {
      // Per edit normale: doppio tap
      _ordDblTapKey = null; _ordDblTapCount = 0;
      if(_ordDblTapEl){ _ordDblTapEl.style.outline=''; _ordDblTapEl.style.outlineOffset=''; }
      _ordDblTapEl = null;
      ordInlineEdit(el, arg1, arg2, action);
      return;
    }
  } else {
    if(_ordDblTapTimer) clearTimeout(_ordDblTapTimer);
    if(_ordDblTapEl){ _ordDblTapEl.style.outline=''; _ordDblTapEl.style.outlineOffset=''; }
    _ordDblTapKey = key;
    _ordDblTapEl = el;
    _ordDblTapCount = 0;
    el.style.outline = '2px solid var(--accent)';
    el.style.outlineOffset = '-2px';
  }
  _ordDblTapTimer = setTimeout(function(){
    if(_ordDblTapEl){ _ordDblTapEl.style.outline=''; _ordDblTapEl.style.outlineOffset=''; }
    _ordDblTapKey = null;
    _ordDblTapEl = null;
    _ordDblTapCount = 0;
  }, 600);
}

// ── SCAMPOLO/ROTOLO/NOTA negli ordini ────────────────────────────
function ordToggleScampolo(gi, ii){
  var ord=ordini[gi]; if(!ord||!ord.items[ii]) return;
  var it=ord.items[ii];
  if(!it.scampolo && !it.fineRotolo && !it._scaglionato){
    if(!ensurePrezzoOriginaleDaListino(it, true)){
      showToastGen('orange','Listino non disponibile: collega l\'articolo al magazzino o imposta il prezzo');
      return;
    }
    it.scampolo=true; it.fineRotolo=false; it._scaglionato=false;
    if(!it._scontoApplicato) it._scontoApplicato=SCONTO_SCAMPOLO_DEFAULT_PCT;
    it.prezzoUnit=(parsePriceIT(it._prezzoOriginale)*(1-it._scontoApplicato/100)).toFixed(2);
  } else if(it.scampolo){
    if(!ensurePrezzoOriginaleDaListino(it, true)) return;
    it.scampolo=false; it.fineRotolo=true; it._scaglionato=false;
    it._tuttoRotolo=true;
    it._scontoApplicato=SCONTO_ROTOLO_DEFAULT_PCT;
    it.prezzoUnit=(parsePriceIT(it._prezzoOriginale)*(1-it._scontoApplicato/100)).toFixed(2);
  } else if(it.fineRotolo || it._tuttoRotolo){
    if(!ensurePrezzoOriginaleDaListino(it, true)) return;
    it.scampolo=false; it.fineRotolo=false; it._tuttoRotolo=false;
    it._scaglionato=true;
    if(!it._scontoApplicato) it._scontoApplicato=SCONTO_SCAGLIONI_DEFAULT_PCT;
    if(!it._scaglioneQta) it._scaglioneQta=10;
    var q=parseFloat(it.qty||0);
    if(q >= it._scaglioneQta){
      it.prezzoUnit=(parsePriceIT(it._prezzoOriginale)*(1-it._scontoApplicato/100)).toFixed(2);
    } else {
      it.prezzoUnit=it._prezzoOriginale;
    }
  } else {
    it.scampolo=false; it.fineRotolo=false; it._tuttoRotolo=false; it._scaglionato=false;
    if(it._prezzoOriginale) it.prezzoUnit=it._prezzoOriginale;
    delete it._prezzoOriginale;
    delete it._scontoApplicato;
    delete it._scaglioneQta;
  }
  _ordRecalcSave(gi);
}

function ordSetSconto(gi, ii, val){
  var ord=ordini[gi]; if(!ord||!ord.items[ii]) return;
  var it=ord.items[ii];
  var sc=parseFloat(val)||0;
  if(!ensurePrezzoOriginaleDaListino(it, true)){
    showToastGen('orange','Listino non disponibile');
    return;
  }
  it._scontoApplicato=sc;
  if(it._scaglionato){
    var q=parseFloat(it.qty||0);
    var soglia=it._scaglioneQta||10;
    if(sc>0 && q>=soglia){
      it.prezzoUnit=(parsePriceIT(it._prezzoOriginale)*(1-sc/100)).toFixed(2);
    } else {
      it.prezzoUnit=it._prezzoOriginale;
    }
  } else if(sc>0){
    it.prezzoUnit=(parsePriceIT(it._prezzoOriginale)*(1-sc/100)).toFixed(2);
  } else {
    it.prezzoUnit=it._prezzoOriginale;
  }
  _ordRecalcSave(gi);
}

function ordEditNota(gi, ii){
  var ord=ordini[gi]; if(!ord||!ord.items[ii]) return;
  var nota=prompt('Nota articolo:', ord.items[ii].nota||'');
  if(nota===null) return;
  ord.items[ii].nota=nota;
  saveOrdini();
  if(ord.stato === 'bozza'){
    var cB = carrelli.find(function(x){ return x.bozzaOrdId === ord.id; });
    if(cB){ cB.items = JSON.parse(JSON.stringify(ord.items)); saveCarrelli(); }
  }
  renderOrdini();
}

function ordSetNotaOrdine(gi, val){
  var ord=ordini[gi]; if(!ord) return;
  ord.nota=val;
  saveOrdini();
}

function _ordRecalcSave(gi){
  var ord=ordini[gi]; if(!ord) return;
  var tot=ord.items.reduce(function(s,x){return s+parsePriceIT(x.prezzoUnit)*parseFloat(x.qty||0);},0);
  ord.totale=tot.toFixed(2);
  ord.modificato=true;
  ord.modificatoAt=new Date().toLocaleString('it-IT');
  saveOrdini();
  if(ord.stato === 'bozza'){
    var cB = carrelli.find(function(x){ return x.bozzaOrdId === ord.id; });
    if(cB){ cB.items = JSON.parse(JSON.stringify(ord.items)); saveCarrelli(); }
  }
  renderOrdini();
}

// ── SBLOCCA/RIBLOCCA ordine completato per modifiche ─────────────
// Usa ordSblocca/ordBlocca definiti sopra

// ── Cambia unità di misura ordine ────────────────────────────────
function ordSetUnit(gi, ii, val){
  var ord=ordini[gi]; if(!ord||!ord.items[ii]) return;
  ord.items[ii].unit=val;
  ord.modificato=true;
  ord.modificatoAt=new Date().toLocaleString('it-IT');
  saveOrdini();
  if(ord.stato === 'bozza'){
    var cB = carrelli.find(function(x){ return x.bozzaOrdId === ord.id; });
    if(cB){ cB.items = JSON.parse(JSON.stringify(ord.items)); saveCarrelli(); }
  }
  renderOrdini();
}

// ══ SCHEDA RAPIDA PRODOTTO — popup con foto, desc, posizione ════════════════
// Si apre cliccando sul nome articolo sia dalla tab ordini che inventario
function openSchedaRapida(rowIdx){
  if(!rows[rowIdx]) return;
  var r = rows[rowIdx];
  var m = magazzino[rowIdx] || {};
  
  // Crea overlay
  var ov = document.getElementById('scheda-rapida-ov');
  if(!ov){
    ov = document.createElement('div');
    ov.id = 'scheda-rapida-ov';
    ov.style.cssText = 'position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.7);display:flex;align-items:center;justify-content:center;';
    document.body.appendChild(ov);
  }
  
  var h = '<div style="background:#1a1a1a;border:1px solid var(--border);border-radius:14px;max-width:360px;width:92%;max-height:85vh;overflow-y:auto;box-shadow:0 8px 40px rgba(0,0,0,.8);">';
  
  // Header con X
  h += '<div style="display:flex;justify-content:space-between;align-items:center;padding:12px 16px;border-bottom:1px solid #2a2a2a;">';
  h += '<span style="font-size:14px;font-weight:800;color:var(--accent);">Scheda Prodotto</span>';
  h += '<button onclick="closeSchedaRapida()" style="background:none;border:none;color:#888;font-size:20px;cursor:pointer;">✕</button>';
  h += '</div>';
  
  // Foto
  h += '<div id="sr-foto" style="text-align:center;padding:12px;min-height:60px;">';
  h += '<div style="color:#555;font-size:11px;">Caricamento foto...</div>';
  h += '</div>';
  
  // Nome prodotto
  h += '<div style="padding:0 16px 8px;">';
  h += '<div style="font-size:18px;font-weight:900;color:var(--accent);line-height:1.3;">'+esc(r.desc||'—')+'</div>';
  h += '</div>';
  
  // Codici
  h += '<div style="padding:0 16px 10px;display:flex;gap:8px;flex-wrap:wrap;">';
  if(r.codM) h += '<span style="background:#2a2500;color:var(--accent);padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;">M: '+esc(r.codM)+'</span>';
  if(r.codF) h += '<span style="background:#2a1015;color:#fc8181;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:700;">F: '+esc(r.codF)+'</span>';
  h += '</div>';
  
  // Prezzo
  if(r.prezzo){
    h += '<div style="padding:0 16px 10px;">';
    h += '<span style="font-size:22px;font-weight:900;color:var(--accent);">€ '+esc(r.prezzo)+'</span>';
    h += '</div>';
  }
  
  // Specs
  if(m.specs){
    h += '<div style="padding:0 16px 10px;font-size:12px;color:#aaa;line-height:1.4;">'+esc(m.specs)+'</div>';
  }
  
  // Posizione — piccola, discreta, editabile
  h += '<div style="padding:4px 16px 6px;display:flex;align-items:center;gap:6px;">';
  h += '<span style="font-size:9px;color:#555;">📍</span>';
  h += '<input type="text" id="sr-pos" value="'+esc(m.posizione||'')+'" placeholder="posizione..." ';
  h += 'style="flex:1;padding:3px 6px;border:none;border-bottom:1px dashed #333;background:transparent;color:#666;font-size:10px;box-sizing:border-box;outline:none;" ';
  h += 'onchange="salvaPosizioneRapida('+rowIdx+',this.value)">';
  h += '</div>';
  
  // Quantità in magazzino
  h += '<div style="padding:8px 16px 14px;display:flex;justify-content:space-between;align-items:center;">';
  h += '<span style="font-size:11px;color:#888;">Quantità in magazzino</span>';
  h += '<span style="font-size:15px;font-weight:800;color:'+(m.qty>0?'#68d391':'#fc8181')+';">'+(m.qty!==undefined&&m.qty!==''?m.qty:'—')+'</span>';
  h += '</div>';
  
  h += '</div>';
  
  ov.innerHTML = h;
  ov.style.display = 'flex';
  ov.onclick = function(e){ if(e.target === ov) closeSchedaRapida(); };
  
  // Carica foto da IndexedDB
  if(typeof idbGetFoto === 'function'){
    idbGetFoto(rowIdx).then(function(dataURL){
      var fotoEl = document.getElementById('sr-foto');
      if(!fotoEl) return;
      if(dataURL){
        fotoEl.innerHTML = '<img src="'+dataURL+'" style="max-width:100%;max-height:200px;border-radius:8px;object-fit:contain;">';
      } else {
        fotoEl.innerHTML = '<div style="color:#444;font-size:11px;padding:20px;">Nessuna foto</div>';
      }
    });
  }
}

function closeSchedaRapida(){
  var ov = document.getElementById('scheda-rapida-ov');
  if(ov) ov.style.display = 'none';
}

function salvaPosizioneRapida(rowIdx, val){
  if(!magazzino[rowIdx]) magazzino[rowIdx] = {};
  magazzino[rowIdx].posizione = val;
  lsSet(MAGK, magazzino);
  // Salva anche su Firebase
  _fbSaveArticolo(rowIdx);
  showToastGen('green','📍 Posizione salvata');
}

// Trova l'indice in rows[] da un item ordine (tramite codM o codF+desc)
function _findRowIdx(it){
  if(it.rowIdx !== undefined && it.rowIdx !== null && rows[it.rowIdx]) return it.rowIdx;
  // Cerca per codice magazzino
  if(it.codM){
    for(var i=0;i<rows.length;i++){
      if(rows[i] && rows[i].codM === it.codM) return i;
    }
  }
  // Cerca per codice fornitore + desc
  if(it.codF){
    for(var i=0;i<rows.length;i++){
      if(rows[i] && rows[i].codF === it.codF) return i;
    }
  }
  return -1;
}

function openSchedaFromOrdine(gi, ii){
  var ord = ordini[gi];
  if(!ord || !ord.items[ii]) return;
  var it = ord.items[ii];
  var idx = _findRowIdx(it);
  if(idx >= 0){
    openSchedaRapida(idx);
  } else {
    showToastGen('orange','Articolo non trovato nel database');
  }
}

// ── Modifica nome cliente ordine ─────────────────────────────────
function ordEditCliente(gi){
  var ord = ordini[gi];
  if(!ord) return;
  var nome = prompt('Nome cliente:', ord.nomeCliente || '');
  if(nome === null) return;
  ord.nomeCliente = nome.trim();
  ord.modificato = true;
  ord.modificatoAt = new Date().toLocaleString('it-IT');
  saveOrdini();
  // Aggiorna anche il carrello collegato
  var cart = carrelli.find(function(c){ return c.ordId === ord.id; });
  if(cart){ cart.nome = nome.trim(); saveCarrelli(); }
  renderOrdini();
  showToastGen('green', '✏️ Cliente aggiornato');
}


// ── Stampa / WhatsApp doppio tap ─────────────────────────────────
var _stampaDblTimer = null;
var _stampaDblGi = null;

function ordStampaDblTap(btn, gi){
  if(_stampaDblGi === gi){
    // SECONDO TAP → WhatsApp
    clearTimeout(_stampaDblTimer);
    _stampaDblGi = null;
    btn.textContent = '🖨️ Stampa';
    btn.style.background = '';
    ordInviaWhatsApp(gi);
  } else {
    // PRIMO TAP → Stampa ricevuta
    if(_stampaDblTimer) clearTimeout(_stampaDblTimer);
    _stampaDblGi = gi;
    var ord = ordini[gi];
    if(ord) stampaRicevutaConSconti(ord);
    btn.textContent = '📱 WhatsApp?';
    btn.style.background = '#25d366';
    _stampaDblTimer = setTimeout(function(){
      _stampaDblGi = null;
      btn.textContent = '🖨️ Stampa';
      btn.style.background = '';
    }, 3000);
  }
}

// ── Ricevuta con sconti dettagliati ──────────────────────────────
function stampaRicevutaConSconti(ord){
  var items = ord.items || [];
  var h = '';
  h += '<div style="font-size:16px;font-weight:900;text-align:center;margin-bottom:4px;">FERRAMENTA RATTAZZI</div>';
  h += '<div style="font-size:10px;text-align:center;color:#666;margin-bottom:8px;">' + new Date().toLocaleString('it-IT') + '</div>';
  if(ord.nomeCliente) h += '<div style="font-size:13px;font-weight:700;text-align:center;margin-bottom:8px;">Cliente: ' + esc(ord.nomeCliente) + '</div>';
  if(ord.numero) h += '<div style="font-size:11px;text-align:center;color:#888;margin-bottom:6px;">Ordine #' + ord.numero + '</div>';
  h += '<div style="border-top:1px dashed #555;margin:6px 0;"></div>';

  var totaleRisparmio = 0;

  items.forEach(function(it){
    var pu = parsePriceIT(it.prezzoUnit);
    var q = parseFloat(it.qty || 0);
    var sub = (pu * q).toFixed(2);

    // Calcola prezzo originale e sconto
    var prezOrig = 0;
    var hasSconto = false;
    var scPct = 0;
    if(it._scontoApplicato && it._scontoApplicato > 0 && it._prezzoOriginale){
      prezOrig = parsePriceIT(it._prezzoOriginale);
      hasSconto = prezOrig > pu + 0.005;
      scPct = it._scontoApplicato;
    } else if(it._scaglioneAttivo && it._prezzoBase){
      prezOrig = parsePriceIT(it._prezzoBase);
      hasSconto = prezOrig > pu + 0.005;
      scPct = it._scaglioneAttivo.sconto || 0;
    }

    h += '<div style="padding:4px 0;border-bottom:1px solid #2a2a2a;">';
    h += '<div style="font-size:13px;font-weight:700;color:var(--text);">' + esc(it.desc || '') + '</div>';

    if(hasSconto){
      var savUnit = (prezOrig - pu).toFixed(2);
      var savTot = ((prezOrig - pu) * q).toFixed(2);
      totaleRisparmio += (prezOrig - pu) * q;

      var tipoSc = it.scampolo ? 'Scampolo' : (it.fineRotolo ? 'Rotolo' : 'Sconto');
      h += '<div style="font-size:10px;color:#f6ad55;font-weight:700;">' + tipoSc + ' -' + scPct + '%</div>';
      h += '<div style="display:flex;justify-content:space-between;font-size:11px;color:#888;">';
      h += '<span>' + q + ' ' + (it.unit || 'pz') + '</span>';
      h += '<span style="text-decoration:line-through;">€' + prezOrig.toFixed(2) + '</span>';
      h += '<span style="color:var(--accent);font-weight:900;">€' + pu.toFixed(2) + '</span>';
      h += '<span style="color:#f6ad55;">-€' + savUnit + '</span>';
      h += '</div>';
      h += '<div style="display:flex;justify-content:space-between;font-size:12px;font-weight:900;color:var(--accent);">';
      h += '<span>Totale</span>';
      h += '<span style="text-decoration:line-through;color:#888;font-weight:600;">€' + (prezOrig * q).toFixed(2) + '</span>';
      h += '<span>€' + sub + '</span>';
      h += '<span style="color:#f6ad55;">-€' + savTot + '</span>';
      h += '</div>';
    } else {
      h += '<div style="display:flex;justify-content:space-between;font-size:12px;color:var(--muted);">';
      h += '<span>' + q + ' ' + (it.unit || 'pz') + ' × €' + pu.toFixed(2) + '</span>';
      h += '<span style="font-weight:900;color:var(--accent);">€' + sub + '</span>';
      h += '</div>';
    }

    if(it.nota) h += '<div style="font-size:10px;color:var(--accent);font-style:italic;">📝 ' + esc(it.nota) + '</div>';
    h += '</div>';
  });

  h += '<div style="border-top:1px dashed #555;margin:6px 0;"></div>';
  h += '<div style="display:flex;justify-content:space-between;font-size:18px;font-weight:900;color:var(--accent);padding:4px 0;">';
  h += '<span>TOTALE</span><span>€ ' + (ord.totale || '0.00') + '</span></div>';

  if(totaleRisparmio > 0.01){
    h += '<div style="text-align:center;font-size:12px;color:#f6ad55;font-weight:800;padding:4px 0;">Risparmi: -€' + totaleRisparmio.toFixed(2) + '</div>';
  }

  if(ord.nota) h += '<div style="border-top:1px dashed #555;margin:6px 0;"></div><div style="font-size:11px;color:#666;font-style:italic;">' + esc(ord.nota) + '</div>';

  var ov = document.getElementById('ricevuta-overlay');
  document.getElementById('ricevuta-body').innerHTML = h;
  ov.classList.add('open');
}

// ── Invia ordine via WhatsApp ────────────────────────────────────
function ordInviaWhatsApp(gi){
  var ord = ordini[gi];
  if(!ord) return;
  var items = ord.items || [];

  var msg = '*FERRAMENTA RATTAZZI*\n';
  msg += '📋 Ordine' + (ord.numero ? ' #' + ord.numero : '') + '\n';
  msg += '👤 ' + (ord.nomeCliente || '—') + '\n';
  msg += '📅 ' + (ord.data || '') + ' ' + (ord.ora || '') + '\n';
  msg += '─────────────\n';

  var totaleRisparmio = 0;

  items.forEach(function(it){
    var pu = parsePriceIT(it.prezzoUnit);
    var q = parseFloat(it.qty || 0);
    var sub = (pu * q).toFixed(2);

    var prezOrig = 0;
    var hasSconto = false;
    var scPct = 0;
    if(it._scontoApplicato && it._scontoApplicato > 0 && it._prezzoOriginale){
      prezOrig = parsePriceIT(it._prezzoOriginale);
      hasSconto = prezOrig > pu + 0.005;
      scPct = it._scontoApplicato;
    } else if(it._scaglioneAttivo && it._prezzoBase){
      prezOrig = parsePriceIT(it._prezzoBase);
      hasSconto = prezOrig > pu + 0.005;
      scPct = it._scaglioneAttivo.sconto || 0;
    }

    msg += '• ' + (it.desc || '') + '\n';
    msg += '  ' + q + ' ' + (it.unit || 'pz');

    if(hasSconto){
      var savUnit = (prezOrig - pu).toFixed(2);
      var savTot = ((prezOrig - pu) * q).toFixed(2);
      totaleRisparmio += (prezOrig - pu) * q;
      var tipoSc = it.scampolo ? 'Scampolo' : (it.fineRotolo ? 'Rotolo' : 'Sconto');
      msg += ' × ~€' + prezOrig.toFixed(2) + '~ → *€' + pu.toFixed(2) + '* (' + tipoSc + ' -' + scPct + '%, -€' + savUnit + ')\n';
      msg += '  Totale: ~€' + (prezOrig * q).toFixed(2) + '~ → *€' + sub + '* (-€' + savTot + ')\n';
    } else {
      msg += ' × €' + pu.toFixed(2) + ' = *€' + sub + '*\n';
    }

    if(it.nota) msg += '  📝 ' + it.nota + '\n';
  });

  msg += '─────────────\n';
  msg += '*TOTALE: € ' + (ord.totale || '0.00') + '*\n';

  if(totaleRisparmio > 0.01){
    msg += '💰 _Risparmi: -€' + totaleRisparmio.toFixed(2) + '_\n';
  }

  if(ord.nota) msg += '\n📋 _' + ord.nota + '_';

  // Apri WhatsApp
  var url = 'https://wa.me/?text=' + encodeURIComponent(msg);
  window.open(url, '_blank');
}

// ── Imposta quantità minima per scaglione ────────────────────────
function ordSetScaglioneQta(gi, ii, val){
  var ord=ordini[gi]; if(!ord||!ord.items[ii]) return;
  var it=ord.items[ii];
  it._scaglioneQta = parseInt(val) || 10;
  if(!ensurePrezzoOriginaleDaListino(it, true)){
    showToastGen('orange','Listino non disponibile');
    return;
  }
  var q = parseFloat(it.qty || 0);
  if(it._scontoApplicato > 0 && q >= it._scaglioneQta){
    it.prezzoUnit = (parsePriceIT(it._prezzoOriginale) * (1 - it._scontoApplicato/100)).toFixed(2);
  } else {
    it.prezzoUnit = it._prezzoOriginale;
  }
  _ordRecalcSave(gi);
}

// ── Override avvisaUfficio: forza render tab ordini subito ────────────────
(function(){
  var _origAvvisa = (typeof avvisaUfficio === 'function') ? avvisaUfficio : null;
  if(!_origAvvisa) return;
  avvisaUfficio = function(cartId){
    _origAvvisa(cartId);
    // Forza aggiornamento tab ordini se aperta, e badge sempre
    _updateBozzaBadge();
    var toTab = document.getElementById('to');
    if(toTab && toTab.classList.contains('active')){
      renderOrdini();
    }
  };
})();

// ── Override inviaOrdine: promuove la bozza a 'nuovo' invece di ricrearla ──
(function(){
  var _origInvia = (typeof inviaOrdine === 'function') ? inviaOrdine : null;
  if(!_origInvia) return;
  inviaOrdine = function(cartId){
    var cart = carrelli.find(function(c){ return c.id === cartId; });
    // Se c'è una bozza collegata, promuovila invece di ricreare l'ordine
    if(cart && cart.bozzaOrdId){
      var bozza = ordini.find(function(o){ return o.id === cart.bozzaOrdId; });
      if(bozza && bozza.stato === 'bozza'){
        // Aggiorna la bozza con i dati finali del carrello
        var tot = (cart.items||[]).reduce(function(s,it){
          return s + (_prezzoEffettivo(it) * parseFloat(it.qty||0));
        }, 0);
        bozza.stato     = 'nuovo';
        bozza.numero    = getNextOrdNum();
        bozza.items     = JSON.parse(JSON.stringify(cart.items||[]));
        bozza.nota      = cart.nota || '';
        bozza.totale    = tot.toFixed(2);
        bozza.scontoGlobale = cart.scontoGlobale || null;
        bozza.commesso  = (typeof _currentUser !== 'undefined' && _currentUser) ? _currentUser.key : (cart.commesso || '');
        bozza.promozione= new Date().toLocaleString('it-IT');
        delete cart.bozzaOrdId;
        // Sposta in cima
        ordini = ordini.filter(function(o){ return o.id !== bozza.id; });
        ordini.unshift(bozza);
        saveOrdini();
        // Segna carrello come inviato
        cart.stato  = 'inviato';
        cart.locked = true;
        cart.ordId  = bozza.id;
        saveCarrelli();
        feedbackSend();
        renderCartTabs();
        showToastGen('green', '✅ Ordine #' + bozza.numero + ' confermato!');
        return; // non chiamare _origInvia
      }
    }
    // Nessuna bozza: comportamento originale
    _origInvia(cartId);
  };
})();

// ── Pulizia bozze orfane all'avvio ───────────────────────────────────────────
// Converte in 'nuovo' le bozze che non hanno più un carrello attivo collegato
// (es. create durante test, o carrello già inviato)
(function _pulisciBozzeOrfane(){
  var changed = false;
  ordini.forEach(function(o){
    if(o.stato !== 'bozza') return;
    // Cerca se esiste un carrello con questa bozza collegata
    var cartCollegato = carrelli.find(function(c){ return c.bozzaOrdId === o.id; });
    if(!cartCollegato){
      // Nessun carrello la "possiede" — promuovi a nuovo
      o.stato = 'nuovo';
      if(!o.numero) o.numero = getNextOrdNum();
      changed = true;
    }
  });
  if(changed){
    saveOrdini();
    setTimeout(function(){
      _updateBozzaBadge();
      renderOrdini && renderOrdini();
    }, 500);
  }
})();

// ── Popup modifiche ordine ────────────────────────────────────────────────────
function ordMostraModifiche(ordId){
  var ord = ordini.find(function(o){ return o.id === ordId; });
  if(!ord) return;
  // Rimuovi popup esistente se già aperto (toggle)
  var existing = document.getElementById('modpop_' + ordId);
  if(existing){ existing.remove(); return; }
  var diff = (ord.modificheDiff && ord.modificheDiff.length) ? ord.modificheDiff : null;
  var msg = diff ? diff.join('\n') : ('Modificato il ' + (ord.modificatoAt || '—'));
  // Trova la card e inserisce il popup subito dopo la banda stato
  var cards = document.querySelectorAll('.ord-card');
  var target = null;
  cards.forEach(function(c){
    if(c.innerHTML.indexOf(ordId) >= 0) target = c;
  });
  var pop = document.createElement('div');
  pop.id = 'modpop_' + ordId;
  pop.style.cssText = 'background:#1e1040;border:1px solid #6b46c1;border-radius:10px;padding:10px 14px;margin:0 12px 8px;font-size:12px;color:#d6bcfa;white-space:pre-wrap;word-break:break-word;line-height:1.6;';
  pop.innerHTML = '✏️ <b style="color:#e9d8fd;">Modifiche:</b>\n' + esc(msg) +
    '<div style="text-align:right;margin-top:6px;"><button onclick="document.getElementById(\'modpop_'+ordId+'\').remove()" style="background:transparent;border:none;color:#6b46c1;font-size:11px;cursor:pointer;">✕ chiudi</button></div>';
  // Inserisci dopo la banda stato dentro la card
  if(target){
    var stato = target.querySelector('.ord-card-stato');
    if(stato && stato.nextSibling) target.insertBefore(pop, stato.nextSibling);
    else if(stato) stato.after(pop);
    else target.prepend(pop);
  }
}
