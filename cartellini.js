// ══ CARTELLINI TOOL ═════════════════════════════════════════════
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
  // Carica e applica le impostazioni editor
  var savedEd = lsGet('cp4_editor', null);
  if(savedEd && typeof editorSettings !== 'undefined') Object.assign(editorSettings, savedEd);
  if(typeof applyEditorCSS==='function') applyEditorCSS();
  // Genera HTML direttamente da ctRows SENZA toccare rows/save
  var html = buildTagsHTML(ctRows, false);
  // Popola print-area per la stampa
  var printArea = document.getElementById('print-area');
  if(printArea) printArea.innerHTML = html;
  var t1area = document.getElementById('print-area-t1');
  if(t1area) t1area.innerHTML = html;
  // Popola anteprima overlay
  var pc = document.getElementById('pc');
  if(pc) pc.innerHTML = html;
  var pov = document.getElementById('pov');
  if(pov) pov.classList.add('open');
  if(typeof _scalePrevContainer==='function') _scalePrevContainer();
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
