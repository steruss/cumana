// Cumana Ste: il "motore" della pagina (orari, calcoli, schermate).
// Gli orari stanno in data.js; la grafica in index.html.
"use strict";
// Versione dell'app: si aumenta a ogni modifica (e va uguale in sw.js)
const VERSIONE = '2.9';
const O = window.ORARI;
const $ = id => document.getElementById(id);
const hm = m => { m = ((m % 1440) + 1440) % 1440; return String(Math.floor(m/60)).padStart(2,'0') + ':' + String(m%60).padStart(2,'0'); };
const DOW = ['domenica','lunedì','martedì','mercoledì','giovedì','venerdì','sabato'];
const MESI = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
const C = O.casaTrencia, X = O.cambioMontesanto, G = O.montesantoGaribaldi, W = O.garibaldiLavoro;

// ---------------- Date e festivi ----------------
function romeToday(){
  const p = new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Rome',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).formatToParts(new Date());
  const g = t => +p.find(x=>x.type===t).value;
  return {y:g('year'), mo:g('month'), d:g('day'), h:g('hour')%24, mi:g('minute'), s:g('second')};
}
function addDays(y,mo,d,n){ const t = new Date(Date.UTC(y,mo-1,d+n)); return {y:t.getUTCFullYear(), mo:t.getUTCMonth()+1, d:t.getUTCDate(), dow:t.getUTCDay()}; }
function pasqua(y){ // algoritmo di Gauss/Meeus
  const a=y%19,b=Math.floor(y/100),c=y%100,d=Math.floor(b/4),e=b%4,f=Math.floor((b+8)/25),g=Math.floor((b-f+1)/3),
  h=(19*a+b-d-g+15)%30,i=Math.floor(c/4),k=c%4,l=(32+2*e+2*i-h-k)%7,m=Math.floor((a+11*h+22*l)/451),
  mo=Math.floor((h+l-7*m+114)/31),day=((h+l-7*m+114)%31)+1; return {mo,d:day};
}
function festivo(day){
  const k = String(day.mo).padStart(2,'0')+'-'+String(day.d).padStart(2,'0');
  if (['01-01','01-06','04-25','05-01','06-02','08-15','11-01','12-08','12-25','12-26'].includes(k)) return true;
  const p = pasqua(day.y), pm = addDays(day.y,p.mo,p.d,1); // Pasquetta
  return day.mo===pm.mo && day.d===pm.d;
}
function tipo(day){ if (day.dow===0 || festivo(day)) return 'festivo'; if (day.dow===6) return 'sabato'; return 'feriale'; }
const TIPO_LBL = {feriale:'feriale', sabato:'sabato', festivo:'festivo'};

// ---------------- Calcoli viaggio ----------------
// Linea 2 andata: primo treno da Montesanto dopo "pronto" (in minuti)
function l2Andata(pronto, t){
  const L = O.linea2[t].andata, S = O.linea2Servizio;
  if (L){ const all = L.filter(x=>x[0]>=pronto).map(x=>({dep:x[0], lav:x[0]+G+W, n:x[2]})); return all.length ? {treni:all, stima:false} : null; }
  if (pronto > S.ultimaMontesanto) return null;
  const hw = O.frequenzaStima[t], dep = Math.max(pronto, S.primaMontesanto) + hw; // attesa peggiore
  return {treni:[{dep, lav:dep+G+W}], stima:true, hw};
}
// Una catena completa partendo da una certa Cumana
function catenaAndata(c, t){ const l = l2Andata(c.arr + X, t); return l ? {c, l2:l.treni[0], stima:l.stima, hw:l.hw, altri:l.treni.slice(1,4)} : {c, l2:null}; }

function andata(now, day, dom){
  const t = tipo(day);
  const tutte = O.cumanaAndata.filter(c=>c.dep - C >= now);
  const ok = tutte.filter(c => dom || !soppressa('trencia_p', c.dep));     // salto le soppresse
  if (!ok.length) return null;
  const persa = O.cumanaAndata.filter(c=>c.dep >= now && c.dep - C < now);
  const sopp = tutte.filter(c => c.dep < ok[0].dep);
  return Object.assign(catenaAndata(ok[0], t), {persa:persa[0], sopp, poi:ok.slice(1,4), tipo:t});
}

// Linea 2 ritorno: treni da Garibaldi che posso prendere arrivando al binario a "pronto"
function l2Ritorno(pronto, t){
  const L = O.linea2[t].ritorno, S = O.linea2Servizio;
  if (L){
    const all = L.map(x=>({g:x[0]+x[1]-G, ms:x[0]+x[1], n:x[2]})).filter(x=>x.g>=pronto);
    return all.length ? {treni:all, stima:false} : null;
  }
  if (pronto > S.ultimaGaribaldi) return null;
  const hw = O.frequenzaStima[t], g = Math.max(pronto, S.primaGaribaldi);
  return {treni:[{g, ms:g+hw+G}], stima:true, hw};
}
function ritorno(now, day, dom){
  const t = tipo(day);
  const l = l2Ritorno(now + W, t); if (!l) return null;
  const tutte = O.cumanaRitorno.filter(c=>c.dep >= l.treni[0].ms + X);
  const b = tutte.filter(c => dom || !soppressa('montesanto_p', c.dep));  // salto le soppresse
  if (!b.length) return null;
  const sopp = tutte.filter(c => c.dep < b[0].dep);
  const cum = b[0];
  // ultimo momento utile per uscire dal lavoro e prendere comunque quella Cumana
  let esci;
  if (!l.stima){ const ult = l.treni.filter(x=>x.ms + X <= cum.dep).pop(); esci = ult.g - W; }
  else esci = cum.dep - X - G - l.hw - W;
  return {l2:l.treni[0], altri:l.treni.slice(1,4), stima:l.stima, hw:l.hw, cum, poi:b.slice(1,4), esci:Math.max(esci, now), casa:cum.arr + C, tipo:t, sopp};
}

// Prova oggi, se non c'è niente passa a domani
function conDomani(fn, now, day){
  const r = fn(now, day); if (r) return {r, now, domani:false};
  const dd = addDays(day.y, day.mo, day.d, 1);
  return {r: fn(now - 1440, dd, true), now: now - 1440, domani:true};
}

// Prossimo turno: ultima Cumana che ti fa arrivare in tempo
// Proposte per un turno scelto, in un giorno scelto
function proposteTurno(tu, dd){
  const t = tipo(dd);
  // andata: tutte le combinazioni che arrivano in tempo, le ultime 3 (la più comoda per prima)
  const and = O.cumanaAndata.map(c=>catenaAndata(c,t)).filter(x=>x.l2 && x.l2.lav <= tu.inizio).slice(-3).reverse();
  // ritorno: dalla fine del turno, prime 3 Cumane diverse raggiungibili
  const fineDay = tu.fine < tu.inizio ? addDays(dd.y,dd.mo,dd.d,1) : dd, tf = tipo(fineDay);
  const rit = [], seen = new Set(), l = l2Ritorno(tu.fine + W, tf);
  if (l) for (const tr of l.treni){
    const c = O.cumanaRitorno.find(c=>c.dep >= tr.ms + X); if (!c || seen.has(c.dep)) continue;
    seen.add(c.dep);
    const ult = l.treni.filter(x=>x.ms + X <= c.dep).pop();   // l'ultimo treno che fa ancora in tempo
    rit.push({l2:ult, cum:c, casa:c.arr + C}); if (rit.length===3) break;
  }
  return {and, rit, fineGiornoDopo: fineDay !== dd};
}

// ---------------- Rendering ----------------
function txtTra(diff){ return diff<=0 ? 'adesso!' : diff<60 ? `tra ${diff} min` : `tra ${Math.floor(diff/60)} h ${diff%60} min`; }
function setIn(el, diff){ el.textContent = txtTra(diff); el.classList.toggle('soon', diff<=5); }
const D = s => s ? 'domani ' : '';

function renderAndata(now, day){
  const {r, now:n, domani} = conDomani(andata, now, day);
  if (!r){ ['a1t','a2t','gW'].forEach(i=>$(i).textContent='--:--'); return; }
  $('a1t').textContent = hm(r.c.dep); setIn($('a1i'), r.c.dep - n);
  badge($('a1i'), domani ? null : liveRit('trencia_p', r.c.dep));
  $('a1n').textContent = `Arrivo a Montesanto alle ${hm(r.c.arr)}` + (domani ? ' · 🌙 prima Cumana di domani' : '');
  $('a1l').textContent = [r.persa ? `Quella delle ${hm(r.persa.dep)} ormai è persa 🏃` : '',
    ...(r.sopp||[]).map(c => `❌ La Cumana delle ${hm(c.dep)} è SOPPRESSA`)].filter(Boolean).join(' · ');
  $('a1x').textContent = r.poi.length ? 'Poi: ' + r.poi.map(x=>hm(x.dep)).join(' · ') : '';
  $('a2tag').hidden = !r.stima;
  if (r.l2){
    $('a2t').textContent = (r.stima?'~':'') + hm(r.l2.dep); setIn($('a2i'), r.l2.dep - n);
    $('a2n').textContent = r.stima
      ? `Orario ${TIPO_LBL[r.tipo]} non disponibile: conto un treno ogni ${r.hw} min con l'attesa peggiore.`
      : `A Garibaldi alle ${hm(r.l2.dep+G)}, al lavoro verso le ${hm(r.l2.lav)}`;
    $('a2x').textContent = r.altri && r.altri.length ? 'Poi: ' + r.altri.map(x=>hm(x.dep)).join(' · ') : '';
    $('a2vt').innerHTML = vtBtn(r.l2.n); curL2.andata = r.l2.n;
    const v = r.stima ? null : voloL2(r.c.arr, r.l2.dep, r.tipo);
    $('a2v').hidden = !v; if (v) $('a2v').innerHTML = voloTxt(v, 'Linea 2', `al lavoro ${hm(v.lav)}`);
    $('gW').textContent = hm(r.l2.lav);
    $('gWs').textContent = `${D(domani)}con la Linea 2 delle ${hm(r.l2.dep)} e ${W} min a piedi`;
  } else {
    $('a2t').textContent='--:--'; $('a2i').textContent=''; $('a2n').textContent='Linea 2 già chiusa a quell\'ora.'; $('a2x').textContent='';
    $('gW').textContent='--:--'; $('gWs').textContent='';
  }
  const lv = r.c.dep - C, d = lv - n;
  $('gA').textContent = d<=0 ? 'adesso!' : d<60 ? `tra ${d} min` : (domani?'domani ':'') + hm(lv);
  $('gAs').textContent = `${domani?'Domani alle':'Alle'} ${hm(lv)}, per la Cumana delle ${hm(r.c.dep)}`;

  renderTurni(now);
}

let turnoSel = null, turnoDay = 0;
function renderTurni(now){
  const box = $('turno');
  if (turnoSel == null){ box.innerHTML = '<p class="note">Scegli il turno qui sopra 👆</p>'; return; }
  const t = romeToday(), dd = addDays(t.y,t.mo,t.d,turnoDay), tu = O.turni[turnoSel];
  const oggi = turnoDay===0 && simDay===0, p = proposteTurno(tu, dd);
  let h = `<div class="shift"><h3>Turno di ${tu.nome} · ${DOW[dd.dow]} ${dd.d}/${dd.mo} · ${hm(tu.inizio)}–${hm(tu.fine)}</h3>`;
  if (tu.auto) h += `<span class="note">🚗 Di solito questo turno lo fai in auto. Ecco comunque i mezzi.</span>`;
  h += `<span class="lbl">🏠→🏢 Andata</span>`;
  if (!p.and.length) h += `<span class="bad">⚠️ Nessuna combinazione arriva in tempo.</span>`;
  p.and.forEach((x,i) => {
    const lv = x.c.dep - C, past = oggi && lv < now;
    h += `<div class="opt${past?' past':''}"><span class="k">${hm(lv)}</span><span>esci di casa${i===0?' <span class="best">la più comoda</span>':''}${past?' · già passata':''}</span>
      <span></span><span class="note">Cumana ${hm(x.c.dep)} · Linea 2 ${hm(x.l2.dep)} · al lavoro ${hm(x.l2.lav)} (${tu.inizio - x.l2.lav} min prima)</span></div>`;
  });
  h += `<span class="lbl" style="margin-top:8px">🏢→🏠 Ritorno · fine turno ${hm(tu.fine)}${p.fineGiornoDopo?' del giorno dopo':''}</span>`;
  if (!p.rit.length) h += `<span class="bad">⚠️ Dopo le ${hm(tu.fine)} non ci sono più treni utili${tu.auto?' (per questo vai in auto 😉)':''}.</span>`;
  p.rit.forEach((x,i) => {
    h += `<div class="opt"><span class="k">${hm(x.casa)}</span><span>a casa${i===0?' <span class="best">la più veloce</span>':''}</span>
      <span></span><span class="note">esci entro ${hm(x.l2.g - W)} · Linea 2 ${hm(x.l2.g)} · Cumana ${hm(x.cum.dep)}</span></div>`;
  });
  box.innerHTML = h + '</div>';
}

function renderRitorno(now, day){
  const {r, now:n, domani} = conDomani(ritorno, now, day);
  if (!r){ ['r1t','r2t','gR'].forEach(i=>$(i).textContent='--:--'); return; }
  $('r2tag').hidden = !r.stima;
  $('r2t').textContent = (r.stima?'~':'') + hm(r.l2.g); setIn($('r2i'), r.l2.g - n);
  $('r2n').textContent = (domani ? '🌙 Stasera non ci sono più coincidenze: ecco la prima di domani. ' : `Uscendo dal lavoro adesso (${W} min a piedi). `)
    + (r.stima ? `Orario ${TIPO_LBL[r.tipo]} non disponibile: conto l'attesa peggiore (un treno ogni ${r.hw} min).` : `Arrivo a Montesanto alle ${hm(r.l2.ms)}`);
  $('r2x').textContent = r.altri.length ? 'Poi: ' + r.altri.map(x=>hm(x.g)).join(' · ') : '';
  $('r2vt').innerHTML = vtBtn(r.l2.n); curL2.ritorno = r.l2.n;
  $('r1t').textContent = hm(r.cum.dep); setIn($('r1i'), r.cum.dep - n);
  badge($('r1i'), domani ? null : liveRit('montesanto_p', r.cum.dep));
  $('r1n').textContent = `Arrivo a La Trencia alle ${hm(r.cum.arr)}` + ((r.sopp||[]).length ? ` · ❌ ${r.sopp.map(c=>hm(c.dep)).join(', ')} SOPPRESSA` : '');
  $('r1x').textContent = r.poi.length ? 'Poi: ' + r.poi.map(x=>hm(x.dep)).join(' · ') : '';
  const v = (r.stima || domani) ? null : voloCumana(r.l2.ms, r.cum.dep);
  $('r1v').hidden = !v; if (v) $('r1v').innerHTML = voloTxt(v, 'Cumana', `a casa ${hm(v.casa)}`);
  const dx = r.esci - n;
  $('gL').textContent = dx<=0 ? 'adesso!' : dx<60 ? `tra ${dx} min` : (domani?'domani ':'') + hm(r.esci);
  $('gLs').textContent = `${domani?'Domani e':'E'}ntro le ${hm(r.esci)}, per la Cumana delle ${hm(r.cum.dep)}`;
  $('gR').textContent = hm(r.casa);
  $('gRs').textContent = `${D(domani)}con ${C} min a piedi da La Trencia`;
}

// ---------------- Ritardi EAV in tempo (quasi) reale ----------------
// GitHub legge i tabelloni EAV ogni 10 minuti (o quando premi "Aggiorna") e li salva in live.json sul ramo "live".
const LIVE_URL = 'https://api.github.com/repos/steruss/cumana/contents/live.json?ref=live';
const DISPATCH_URL = 'https://api.github.com/repos/steruss/cumana/actions/workflows/live.yml/dispatches';
const LIVE_MAX_ETA = 20;   // minuti: oltre, il dato è troppo vecchio e non lo uso
let LIVE = null;
function getTok(){ try { return localStorage.getItem('ghtok') || ''; } catch(e){ return ''; } }
function liveEta(){ return LIVE ? Math.round((Date.now() - Date.parse(LIVE.agg)) / 60000) : Infinity; }
function liveOk(){ return LIVE && LIVE.ok && liveEta() <= LIVE_MAX_ETA && simTime == null && simDay === 0; }
const SOPP = /soppress|cancellat|non effettuat/i;
function soppressa(lista, m){ const r = liveRit(lista, m); return !!(r && SOPP.test(r.info || '')); }
// Cerca il ritardo di una Cumana nel tabellone EAV usando il NUMERO del treno (non l'orario):
// "m" è l'orario in minuti della Cumana nei nostri dati, da cui ricavo il suo numero
const PER_NUMERO = {
  trencia_p:    m => O.cumanaAndata.find(c => c.dep === m),    // partenze da La Trencia
  montesanto_a: m => O.cumanaAndata.find(c => c.arr === m),    // arrivi a Montesanto
  montesanto_p: m => O.cumanaRitorno.find(c => c.dep === m)    // partenze da Montesanto
};
function liveRit(lista, m){
  if (!liveOk() || !LIVE[lista]) return null;
  const c = PER_NUMERO[lista] && PER_NUMERO[lista](m);
  if (!c || !c.n) return null;
  return LIVE[lista].find(x => x.treno === String(c.n)) || null;
}
function badge(el, lr){
  el.parentNode.querySelectorAll('.rit').forEach(x=>x.remove());
  if (!lr) return;
  const b = document.createElement('span');
  b.className = 'rit' + (lr.rit ? '' : ' zero');
  b.textContent = lr.info ? lr.info : (lr.rit ? `+${lr.rit}′` : 'in orario');
  el.parentNode.appendChild(b);
}
function liveStato(msg){
  const bar = $('livebar'), eta = liveEta();
  bar.classList.toggle('fresh', liveOk()); bar.classList.toggle('old', !!LIVE && !liveOk());
  if (msg){ $('livestato').textContent = msg; return; }
  if (inCorso && !liveOk()){ $('livestato').textContent = '📡 Sto aggiornando i ritardi… (circa 1 minuto)'; return; }
  if (!LIVE){ $('livestato').textContent = '📡 Ritardi EAV non disponibili'; return; }
  if (!LIVE.ok){ $('livestato').textContent = '📡 EAV non risponde, uso solo gli orari'; return; }
  const ora = new Date(LIVE.agg).toLocaleTimeString('it-IT', {hour:'2-digit', minute:'2-digit', timeZone:'Europe/Rome'});
  $('livestato').textContent = liveOk() ? `📡 Ritardi EAV delle ${ora} (${eta<1?'adesso':eta+' min fa'})`
    : `📡 Ritardi delle ${ora}: troppo vecchi, non li uso`;
}
async function caricaLive(){
  try {
    const h = {Accept:'application/vnd.github.raw+json'}, tk = getTok();
    if (tk) h.Authorization = 'Bearer ' + tk;
    const r = await fetch(LIVE_URL + '&t=' + Date.now(), {headers:h, cache:'no-store'});
    if (r.ok){ LIVE = await r.json(); }
  } catch(e){}
  liveStato(); render(true);
}
// Aggiornamento automatico all'apertura: chiedo a GitHub di controllare EAV
// solo se ho la chiave, se il dato ha più di 5 minuti, dalle 5 alle 23 e se non l'ho già chiesto da poco
const AUTO_ETA = 5, AUTO_PAUSA = 4 * 60000;
let inCorso = false;
function autoAggiorna(){
  if (!getTok() || inCorso || document.hidden) return;
  if (liveEta() <= AUTO_ETA) return;
  const t = romeToday(); if (t.h < 5 || t.h >= 23) return;
  let ultima = 0; try { ultima = +localStorage.getItem('ultimaRichiesta') || 0; } catch(e){}
  if (Date.now() - ultima < AUTO_PAUSA) return;
  chiediAggiornamento();
}

async function chiediAggiornamento(){
  if (inCorso) return;
  inCorso = true;
  try { await chiediAggiornamentoVero(); } finally { inCorso = false; }
}
async function chiediAggiornamentoVero(){
  const tk = getTok();
  if (!tk){ $('tokbox').hidden = false; return; }
  const prima = LIVE ? LIVE.agg : '';
  try { localStorage.setItem('ultimaRichiesta', String(Date.now())); } catch(e){}
  liveStato('📡 Chiedo a GitHub di controllare… (circa 1 minuto)');
  try {
    const r = await fetch(DISPATCH_URL, {method:'POST', headers:{Authorization:'Bearer '+tk, Accept:'application/vnd.github+json', 'Content-Type':'application/json'}, body:JSON.stringify({ref:'main'})});
    if (!r.ok){ if (r.status !== 401 && r.status !== 403 && r.status !== 404){ liveStato(`⚠️ GitHub ha risposto ${r.status}, riprova`); return; } liveStato('⚠️ Chiave GitHub non valida: inseriscila di nuovo'); $('tokbox').hidden = false; return; }
  } catch(e){ liveStato('⚠️ Niente rete, riprova'); return; }
  for (let i=0; i<16; i++){            // controllo ogni 10 secondi per ~3 minuti
    await new Promise(ok => setTimeout(ok, 10000));
    await caricaLive();
    if (LIVE && LIVE.agg !== prima) return;
    liveStato(`📡 GitHub sta controllando… (${(i+1)*10} s)`);
  }
  liveStato();
}
$('liveagg').addEventListener('click', chiediAggiornamento);
$('toksave').addEventListener('click', () => {
  const v = $('tok').value.trim(); if (!v) return;
  try { localStorage.setItem('ghtok', v); } catch(e){}
  $('tok').value = ''; $('tokbox').hidden = true; chiediAggiornamento();
});

// ---------------- Ritardo Linea 2: copia il numero e apre ViaggiaTreno ----------------
const VT_URL = 'http://www.viaggiatreno.it/infomobilitamobile/pages/cercaTreno/cercaTreno.jsp';
const vtBtn = n => n ? `<div class="vtbox"><div class="vtrow">
  <button type="button" class="vtcopy" data-copy="${n}">📋 Copia ${n}</button>
  <a class="vt" href="${VT_URL}" target="_blank" rel="noopener">📡 Apri ViaggiaTreno ↗</a></div>
  <small class="vtmsg"></small></div>` : '';
// Copia sincrona (funziona anche se subito dopo si apre un'altra pagina), più la copia "moderna" come rinforzo
function copia(testo){
  let ok = false;
  try {
    const ta = document.createElement('textarea');
    ta.value = testo; ta.setAttribute('readonly', ''); ta.style.cssText = 'position:fixed;top:0;left:0;opacity:0';
    document.body.appendChild(ta); ta.focus(); ta.select(); ta.setSelectionRange(0, testo.length);
    ok = document.execCommand('copy'); ta.remove();
  } catch(err){}
  try { if (navigator.clipboard) navigator.clipboard.writeText(testo).then(()=>{}, ()=>{}); } catch(err){}
  return ok;
}
const curL2 = {andata:null, ritorno:null};
document.addEventListener('click', async e => {
  const b = e.target.closest && e.target.closest('.vtcopy'); if (!b) return;
  const n = b.dataset.copy, msg = b.closest('.vtbox').querySelector('.vtmsg');
  let ok = false;
  try { if (navigator.clipboard){ await navigator.clipboard.writeText(n); ok = true; } } catch(err){}
  if (!ok) ok = copia(n);
  b.textContent = ok ? `✅ Copiato ${n}` : `📋 Copia ${n}`;
  msg.innerHTML = ok ? '' : `Non riesco a copiare: il numero è <b style="font-size:1.2rem;user-select:all">${n}</b>`;
});
// Il pulsante grande in fondo usa il treno consigliato nel tab aperto
function aggiornaL2Btn(){
  const n = (tabAttivo.startsWith('ritorno') ? curL2.ritorno : curL2.andata);
  const box = $('l2box'); if (!box) return;
  box.hidden = tabAttivo.endsWith('-corso');
  const html = n ? `<span class="lbl">Ritardo Linea 2 · treno consigliato</span>${vtBtn(n)}`
                 : `<a class="vt" href="${VT_URL}" target="_blank" rel="noopener">📡 Apri ViaggiaTreno ↗</a>`;
  if (box.dataset.n !== String(n)){ box.innerHTML = html; box.dataset.n = String(n); }   // non cancello il "Copiato" a ogni minuto
}

// ---------------- "Al volo": la corsa prima di quella sicura ----------------
// Linea 2 che parte dopo l'arrivo a Montesanto ma con meno dei 7 minuti di cambio
function voloL2(arr, sicura, t){
  const L = O.linea2[t].andata; if (!L) return null;
  const x = L.filter(x => x[0] < sicura && x[0] - arr >= 1).pop();
  return x ? {dep:x[0], margine:x[0]-arr, lav:x[0]+G+W} : null;
}
// Cumana che parte da Montesanto dopo l'arrivo della Linea 2, ma con poco margine (conta anche il suo ritardo)
function voloCumana(ms, sicura){
  const c = O.cumanaRitorno.filter(c => !soppressa('montesanto_p', c.dep) && c.dep < sicura && c.dep + ((liveRit('montesanto_p', c.dep)||{}).rit||0) - ms >= 1).pop();
  if (!c) return null;
  const rit = (liveRit('montesanto_p', c.dep)||{}).rit || 0;
  return {dep:c.dep, rit, margine:c.dep + rit - ms, casa:c.arr + rit + C};
}
const voloTxt = (v, cosa, fine) => `⚡ <b>Al volo:</b> ${cosa} delle <b>${hm(v.dep)}</b>${v.rit?` (+${v.rit}′)`:''}, hai solo ${v.margine} min per il cambio · ${fine}`;

// ---------------- Tab "in corso": scegli il treno su cui sei ----------------
const scelto = {};   // treno scelto per ogni gruppo (null = il più recente)
function chips(id, items, now){
  const box = $(id);
  if (!items.length){ box.innerHTML = ''; return null; }
  let sel = items.find(x => x.k === scelto[id]) || items[0];
  box.innerHTML = items.map(x => `<button type="button" data-k="${x.k}" aria-pressed="${x===sel}">${x.lbl}</button>`).join('');
  return sel;
}
['acC','acL','rcL','rcC'].forEach(id => $(id).addEventListener('click', e => {
  const b = e.target.closest('button'); if (!b) return; scelto[id] = +b.dataset.k; render(true);
}));
const nessuno = msg => `<span class="note">${msg}</span>`;
const ritTxt = lr => lr ? (lr.rit ? ` <span class="rit">+${lr.rit}′</span>` : ' <span class="rit zero">in orario</span>') : '';

function renderCorso(now, day){
  const t = tipo(day);

  // ===== ANDATA IN CORSO =====
  // 1) Sulla Cumana: partite da La Trencia negli ultimi 40 minuti
  const cA = O.cumanaAndata.filter(c => c.dep <= now && c.dep >= now - 40).reverse()
    .map(c => ({k:c.dep, lbl:hm(c.dep), c}));
  let sel = chips('acC', cA, now);
  if (sel){
    const c = sel.c, lr = liveRit('montesanto_a', c.arr), arr = c.arr + (lr ? lr.rit : 0);
    const l = l2Andata(arr + X, t);
    $('acCr').innerHTML = `<span>Arrivo a Montesanto alle <b>${hm(arr)}</b>${ritTxt(lr)}</span>` + (l
      ? `<div class="row"><span>Prendi la Linea 2 delle</span><span class="tt">${hm(l.treni[0].dep)}</span></div>
         <span>Al lavoro alle <b>${hm(l.treni[0].lav)}</b></span>
         ${l.treni.length>1 ? `<span class="soft">Se perdi quella: ${l.treni.slice(1,4).map(x=>hm(x.dep)).join(' · ')}</span>` : ''}
         ${(v => v ? `<span class="volo">${voloTxt(v, 'Linea 2', `al lavoro ${hm(v.lav)}`)}</span>` : '')(l.stima ? null : voloL2(arr, l.treni[0].dep, t))}`
      : nessuno('Linea 2 già chiusa.'));
  } else $('acCr').innerHTML = nessuno('Nessuna Cumana partita da La Trencia negli ultimi 40 minuti.');

  // 2) A Montesanto: prossime Linea 2 (3 min per arrivare al binario)
  const lm = l2Andata(now + 3, t);
  $('acM').innerHTML = lm
    ? `<div class="row"><span>Prossima Linea 2</span><span class="tt">${hm(lm.treni[0].dep)}</span><span>${txtTra(lm.treni[0].dep - now)}</span></div>
       <span>Al lavoro alle <b>${hm(lm.treni[0].lav)}</b></span>${vtBtn(lm.treni[0].n)}
       <span class="soft">Poi: ${lm.treni.slice(1,4).map(x=>hm(x.dep)).join(' · ')}</span>`
    : nessuno('Linea 2 chiusa a quest\'ora.');

  // 3) Sulla Linea 2: partite da Montesanto negli ultimi 15 minuti
  const La = (O.linea2[t].andata || []).filter(x => x[0] <= now && x[0] >= now - 15).reverse()
    .map(x => ({k:x[0], lbl:hm(x[0]), dep:x[0], n:x[2]}));
  sel = chips('acL', La, now);
  $('acLr').innerHTML = sel
    ? `<span>A Garibaldi alle <b>${hm(sel.dep + G)}</b></span><div class="row"><span>Al lavoro alle</span><span class="tt">${hm(sel.dep + G + W)}</span></div>`
    : nessuno('Nessuna Linea 2 partita da Montesanto negli ultimi 15 minuti.');

  // ===== USCITA IN CORSO =====
  // 1) Sulla Linea 2: partite da Garibaldi negli ultimi 20 minuti
  const Lr = (O.linea2[t].ritorno || []).map(x => ({g:x[0]+x[1]-G, ms:x[0]+x[1], n:x[2]})).filter(x => x.g <= now && x.g >= now - 20).reverse()
    .map(x => ({k:x.g, lbl:hm(x.g), x}));
  sel = chips('rcL', Lr, now);
  if (sel){
    const cs = O.cumanaRitorno.filter(c => c.dep >= sel.x.ms + X && !soppressa('montesanto_p', c.dep));
    if (cs.length){
      const lr = liveRit('montesanto_p', cs[0].dep), rit = lr ? lr.rit : 0;
      $('rcLr').innerHTML = `<span>Arrivo a Montesanto alle <b>${hm(sel.x.ms)}</b></span>
        <div class="row"><span>Prendi la Cumana delle</span><span class="tt">${hm(cs[0].dep)}</span>${ritTxt(lr)}</div>
        <span>A casa alle <b>${hm(cs[0].arr + rit + C)}</b></span>
        ${cs[1] ? `<span class="soft">Se perdi quella: ${cs.slice(1,3).map(c=>hm(c.dep)).join(' · ')}</span>` : ''}
        ${(v => v ? `<span class="volo">${voloTxt(v, 'Cumana', `a casa ${hm(v.casa)}`)}</span>` : '')(voloCumana(sel.x.ms, cs[0].dep))}`;
    } else $('rcLr').innerHTML = nessuno('Nessuna Cumana utile stasera.');
  } else $('rcLr').innerHTML = nessuno('Nessuna Linea 2 partita da Garibaldi negli ultimi 20 minuti.');

  // 2) A Montesanto: prossime Cumane
  const cm = O.cumanaRitorno.filter(c => c.dep >= now + 3 && !soppressa('montesanto_p', c.dep));
  if (cm.length){
    const lr = liveRit('montesanto_p', cm[0].dep), rit = lr ? lr.rit : 0;
    $('rcM').innerHTML = `<div class="row"><span>Prossima Cumana</span><span class="tt">${hm(cm[0].dep)}</span>${ritTxt(lr)}<span>${txtTra(cm[0].dep + rit - now)}</span></div>
      <span>A casa alle <b>${hm(cm[0].arr + rit + C)}</b></span>
      ${cm[1] ? `<span class="soft">Poi: ${cm.slice(1,3).map(c=>hm(c.dep)).join(' · ')}</span>` : ''}`;
  } else $('rcM').innerHTML = nessuno('Ultima Cumana da Montesanto alle 21:36.');

  // 3) Sulla Cumana: partite da Montesanto negli ultimi 30 minuti
  const cR = O.cumanaRitorno.filter(c => c.dep <= now && c.dep >= now - 30).reverse()
    .map(c => ({k:c.dep, lbl:hm(c.dep), c}));
  sel = chips('rcC', cR, now);
  if (sel){
    const lr = liveRit('montesanto_p', sel.c.dep), rit = lr ? lr.rit : 0;
    $('rcCr').innerHTML = `<span>Arrivo a La Trencia alle <b>${hm(sel.c.arr + rit)}</b>${ritTxt(lr)}</span>
      <div class="row"><span>A casa alle</span><span class="tt">${hm(sel.c.arr + rit + C)}</span></div>`;
  } else $('rcCr').innerHTML = nessuno('Nessuna Cumana partita da Montesanto negli ultimi 30 minuti.');
}

// ---------------- Stato e simulazione ----------------
let simTime = null, simDay = 0, lastKey = '';
function currentDay(){
  const t = romeToday(), base = addDays(t.y, t.mo, t.d, simDay);
  return {t, day:base, now: simTime ?? (t.h*60 + t.mi)};
}
function render(force){
  const {t, day, now} = currentDay();
  const sim = simTime!=null || simDay!==0;
  $('clock').textContent = sim ? hm(now) : `${hm(now)}:${String(t.s).padStart(2,'0')}`;
  $('day').textContent = `${DOW[day.dow]} ${day.d} ${MESI[day.mo-1]}` + (tipo(day)==='festivo' && day.dow!==0 ? ' · festivo' : '') + (sim ? ' · simulato' : '');
  $('day').classList.toggle('sim', sim);
  const key = `${day.y}-${day.mo}-${day.d}-${now}`;
  if (!force && key === lastKey) return;   // i treni si ricalcolano solo quando cambia il minuto
  lastKey = key;
  renderAndata(now, day);
  renderRitorno(now, day);
  renderCorso(now, day);
  aggiornaL2Btn();
  const sc = O.scadenza.split('-').map(Number), oggi = t.y*10000 + t.mo*100 + t.d;
  const sca = $('scaduto'); sca.hidden = oggi < sc[0]*10000 + sc[1]*100 + sc[2];
  sca.textContent = `⚠️ Gli orari sono stati controllati il ${O.controllati} e potrebbero essere cambiati. Rifai le simulazioni su Lefrecce e aggiorna data.js.`;
}

function setSim(m){
  if (m == null){ simTime = null; simDay = 0; $('t').value = ''; $('d').value = '0'; }
  else { simTime = ((m % 1440) + 1440) % 1440; $('t').value = hm(simTime); }
  render(true);
}
// selettore giorno (usato in "Simula" e in "Verifica turni"): oggi + 6 giorni
function riempiGiorni(sel){
  const t = romeToday();
  for (let i=0;i<7;i++){ const dd = addDays(t.y,t.mo,t.d,i); const o = document.createElement('option'); o.value = i;
    o.textContent = (i===0?'Oggi':i===1?'Domani':DOW[dd.dow][0].toUpperCase()+DOW[dd.dow].slice(1)) + ` ${dd.d}/${dd.mo}`; sel.appendChild(o); }
}
riempiGiorni($('d'));
$('d').addEventListener('change', e => { simDay = +e.target.value; render(true); });
let ignoreUntil = 0;
function fromInput(){
  if (Date.now() < ignoreUntil) return;
  const v = $('t').value; if (!v) return;
  const [h,m] = v.split(':').map(Number); if (!isNaN(h) && !isNaN(m)) setSim(h*60+m);
}
['input','change'].forEach(ev => $('t').addEventListener(ev, fromInput));
document.querySelectorAll('.step').forEach(b => b.addEventListener('click', () => setSim(currentDay().now + Number(b.dataset.step))));
$('now').addEventListener('click', () => { ignoreUntil = Date.now() + 800; $('t').blur(); setSim(null); });
// pulsanti "fine turno" solo per i turni fatti coi mezzi
O.turni.filter(t=>!t.auto).forEach(t => {
  const b = document.createElement('button'); b.type = 'button'; b.textContent = `${hm(t.fine)} (${t.nome})`;
  b.addEventListener('click', () => { setSim(t.fine); $('simbox').open = true; });
  $('endbtns').appendChild(b);
});

// ---------------- Verifica turni ----------------
(function(){
  const sel = $('tday');
  riempiGiorni(sel);
  sel.addEventListener('change', e => { turnoDay = +e.target.value; render(true); });
  O.turni.forEach((tu,i) => {
    const b = document.createElement('button'); b.type = 'button'; b.setAttribute('aria-pressed','false');
    b.textContent = tu.nome[0].toUpperCase() + tu.nome.slice(1) + (tu.auto ? ' 🚗' : '');
    b.addEventListener('click', () => { turnoSel = i; document.querySelectorAll('#tsel button').forEach((x,k)=>x.setAttribute('aria-pressed', k===i)); render(true); });
    $('tsel').appendChild(b);
  });
})();

// ---------------- Tab ----------------
const TABS = ['andata','andata-corso','ritorno','ritorno-corso'];
let tabAttivo = 'andata';
function showTab(name){
  tabAttivo = name; setTimeout(aggiornaL2Btn, 0);
  TABS.forEach(n => { $(n).hidden = n !== name; $('tab-'+n).setAttribute('aria-selected', n === name); });
  try { localStorage.setItem('tab', name); } catch(e){}
  if (location.hash !== '#'+name) history.replaceState(null, '', '#'+name);
}
document.querySelectorAll('.tabs button').forEach(b => b.addEventListener('click', () => showTab(b.dataset.tab)));
window.addEventListener('hashchange', () => { const h = location.hash.slice(1); if (TABS.includes(h)) showTab(h); });
let start = location.hash.slice(1);
if (!TABS.includes(start)){ try { start = localStorage.getItem('tab'); } catch(e){} }
showTab(TABS.includes(start) ? start : 'andata');
window.scrollTo(0,0); setTimeout(() => window.scrollTo(0,0), 50);   // il #tab nel link non deve far scorrere la pagina

// ---------------- Footer dai dati (si aggiorna da solo) ----------------
$('foot').textContent = `Orari controllati il ${O.controllati}. Cumana: PDF EAV, un treno ogni 24 minuti (stesso orario tutti i giorni). `
  + `Linea 2: simulazioni Trenitalia; dove mancano, stima prudente. Margini: ${C} min casa↔La Trencia, ${X} min di cambio a Montesanto, `
  + `${G} min Montesanto↔Garibaldi, ${W} min Garibaldi↔lavoro. Festivi infrasettimanali trattati come domenica. `
  + (O.turni.some(t=>t.auto) ? `Turno di ${O.turni.filter(t=>t.auto).map(t=>t.nome).join(', ')} in auto 🚗: non lo considero.` : '');

render(true);
setInterval(render, 1000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) render(true); });

caricaLive().then(autoAggiorna);
setInterval(() => { if (!document.hidden) caricaLive(); }, 120000);       // ogni 2 minuti
document.addEventListener('visibilitychange', () => { if (!document.hidden) caricaLive().then(autoAggiorna); });
setInterval(() => liveStato(), 30000);

$('ver').textContent = `Versione ${VERSIONE}`;

// ---------------- Offline ----------------
if ('serviceWorker' in navigator){
  navigator.serviceWorker.register('sw.js', {updateViaCache:'none'}).then(reg => reg.update()).catch(()=>{});
  // Quando arriva una versione nuova, ricarico da solo (una volta sola)
  let ricaricata = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (!ricaricata){ ricaricata = true; location.reload(); } });
}
