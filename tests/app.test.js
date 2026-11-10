// Test automatici di Cumana Ste.
// Ogni test apre la pagina in un browser finto (jsdom) con l'orologio fermo a un'ora precisa
// e controlla quello che l'app mostra. Si lanciano con:  npm test
const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

const DIR = path.join(__dirname, '..');
const leggi = f => fs.readFileSync(path.join(DIR, f), 'utf8');
const HTML = leggi('index.html'), DATA = leggi('data.js'), APP = leggi('app.js');

const aperte = [];
after(() => aperte.forEach(w => w.close()));   // chiudo sempre tutte le pagine finte, anche se un test fallisce

// Apre l'app con l'orologio fermo a `quando` (ora UTC) e, se serve, con i ritardi EAV finti `live`
async function apri(quando, { live = null, hash = '#andata', chiave = null, profilo = null } = {}) {
  const errori = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errori.push(e.message));
  const dom = new JSDOM(HTML, { url: 'https://steruss.github.io/cumana/' + hash, runScripts: 'outside-only', virtualConsole: vc, pretendToBeVisual: true });
  const w = dom.window;
  aperte.push(w);
  const T = Date.parse(quando);
  w.eval(`(() => { const R = Date; class F extends R { constructor(...a){ a.length ? super(...a) : super(${T}); } static now(){ return ${T}; } } globalThis.Date = F; })()`);
  if (live) live.agg = live.agg || new Date(T).toISOString();
  w.scrollTo = () => {};                               // jsdom non sa scorrere la pagina
  const chiamate = [];
  if (chiave) w.localStorage.setItem('ghtok', chiave);
  if (profilo) w.localStorage.setItem('profilo', JSON.stringify(profilo));
  w.fetch = async (url, opt = {}) => { chiamate.push({ url: String(url), metodo: opt.method || 'GET' });
    if (opt.method === 'POST') return { ok: true, status: 204 };
    return live ? { ok: true, status: 200, json: async () => live } : { ok: false, status: 404 }; };
  w.eval(DATA);
  w.eval(APP);
  await new Promise(r => setTimeout(r, 30));          // lascio finire il caricamento dei ritardi
  const testo = id => (w.document.getElementById(id).textContent || '').replace(/\s+/g, ' ').trim();
  const chiudi = () => w.close();
  const richieste = () => chiamate.filter(c => c.metodo === 'POST' && c.url.includes('/dispatches')).length;
  return { w, testo, errori, chiudi, richieste };
}
const liveFinto = (extra = {}) => ({ ok: true, trencia_p: [], montesanto_a: [], montesanto_p: [], ...extra });

// ---------------- ANDATA ----------------
test('Andata giovedì 08:00: la 08:00 è persa, prendi la 08:24 e la Linea 2 delle 08:47', async () => {
  const a = await apri('2026-11-05T07:00:00Z');
  assert.equal(a.testo('a1t'), '08:24');
  assert.match(a.testo('a1l'), /08:00 ormai è persa/);
  assert.equal(a.testo('a2t'), '08:47');
  assert.equal(a.testo('gA'), 'tra 14 min');           // 08:24 - 10 min a piedi
  assert.equal(a.testo('gW'), '09:17');                // 08:47 + 10 + 20
  assert.deepEqual(a.errori, []);
  a.chiudi();
});

test('Andata alle 23:00: mostra la prima Cumana di domani', async () => {
  const a = await apri('2026-11-05T22:00:00Z');
  assert.equal(a.testo('a1t'), '06:00');
  assert.match(a.testo('a1n'), /domani/);
  assert.equal(a.testo('gA'), 'domani 05:50');
  assert.equal(a.testo('gW'), '06:54');
  a.chiudi();
});

test('Festivo infrasettimanale (8 dicembre) usa l\'orario festivo della Linea 2', async () => {
  const feriale = await apri('2026-11-05T08:20:00Z');   // giovedì 09:20
  const festivo = await apri('2026-12-08T08:20:00Z');   // martedì 8 dicembre 09:20
  assert.equal(feriale.testo('a1t'), '09:36');
  assert.equal(festivo.testo('a1t'), '09:36');
  assert.equal(feriale.testo('a2t'), '10:09');
  assert.equal(festivo.testo('a2t'), '10:17');            // la 10:09 la domenica/festivi non c'è
  assert.match(festivo.testo('day'), /festivo/);
  feriale.chiudi(); festivo.chiudi();
});

test('Corsa "al volo": giovedì 15:00 sicura 15:39, al volo 15:32 con 5 minuti', async () => {
  const a = await apri('2026-11-05T14:00:00Z');
  assert.equal(a.testo('a2t'), '15:39');
  assert.equal(a.w.document.getElementById('a2v').hidden, false);
  assert.match(a.testo('a2v'), /15:32.*5 min/);
  a.chiudi();
});

// ---------------- USCITA ----------------
test('Uscita alle 07:00 (fine notte): Linea 2 07:26, Cumana 08:00, a casa 08:25', async () => {
  const a = await apri('2026-11-05T06:00:00Z');
  assert.equal(a.testo('r2t'), '07:26');               // partenza vera da Garibaldi (arriva a Montesanto 07:34)
  assert.equal(a.testo('r1t'), '08:00');
  assert.equal(a.testo('gR'), '08:25');                // 08:15 + 10 min a piedi
  a.chiudi();
});

// ---------------- RITARDI E SOPPRESSI ----------------
test('Cumana soppressa: la salta e lo dice', async () => {
  const a = await apri('2026-11-05T07:00:00Z', { live: liveFinto({ trencia_p: [{ treno: '5079', dest: 'MONTESANTO', ora: '08:24', rit: 0, info: 'SOPPRESSO' }] }) });
  assert.equal(a.testo('a1t'), '08:48');
  assert.match(a.testo('a1l'), /08:24 è SOPPRESSA/);
  a.chiudi();
});

test('Ritardo EAV: mostra il badge accanto alla Cumana', async () => {
  const a = await apri('2026-11-05T07:00:00Z', { live: liveFinto({ trencia_p: [{ treno: '5079', dest: 'MONTESANTO', ora: '08:24', rit: 6, info: '' }] }) });
  assert.match(a.testo('andata'), /\+6′/);
  assert.match(a.testo('livestato'), /Ritardi EAV delle/);
  a.chiudi();
});

test('Ritardi vecchi (oltre 20 minuti): non li usa', async () => {
  const live = liveFinto({ agg: '2026-11-05T06:30:00Z', trencia_p: [{ treno: '5079', dest: 'MONTESANTO', ora: '08:24', rit: 0, info: 'SOPPRESSO' }] });
  const a = await apri('2026-11-05T07:00:00Z', { live });
  assert.equal(a.testo('a1t'), '08:24');               // dato vecchio: la soppressione non conta
  assert.match(a.testo('livestato'), /troppo vecchi/);
  a.chiudi();
});

test('All\'apertura chiede da solo i ritardi se sono vecchi', async () => {
  const vecchi = await apri('2026-11-05T07:00:00Z', { chiave: 'x', live: liveFinto({ agg: '2026-11-05T06:40:00Z' }) });
  assert.equal(vecchi.richieste(), 1);
  assert.match(vecchi.testo('livestato'), /Aggiorno i ritardi/);   // mentre aspetta lo dice
  const freschi = await apri('2026-11-05T07:00:00Z', { chiave: 'x', live: liveFinto({ agg: '2026-11-05T06:58:00Z' }) });
  assert.equal(freschi.richieste(), 0);                  // dato di 2 minuti fa: non serve
  const notte = await apri('2026-11-05T02:00:00Z', { chiave: 'x', live: liveFinto({ agg: '2026-11-05T01:00:00Z' }) });
  assert.equal(notte.richieste(), 0);                    // alle 3 di notte la Cumana non gira
  const senza = await apri('2026-11-05T07:00:00Z', { live: liveFinto({ agg: '2026-11-05T06:40:00Z' }) });
  assert.equal(senza.richieste(), 0);                    // senza chiave non chiede niente
  assert.equal(senza.w.document.getElementById('tokbox').hidden, true);
});

test('Ritardi abbinati per numero treno: un treno diverso alla stessa ora non conta', async () => {
  const a = await apri('2026-11-05T07:00:00Z', { live: liveFinto({ trencia_p: [{ treno: '9999', dest: 'MONTESANTO', ora: '08:24', rit: 0, info: 'SOPPRESSO' }] }) });
  assert.equal(a.testo('a1t'), '08:24');               // il 9999 non è la nostra Cumana delle 08:24 (che è la 5079)
  assert.doesNotMatch(a.testo('a1l'), /SOPPRESSA/);
});

test('Numeri dei treni Cumana come nel PDF EAV', () => {
  const w = {}; new Function('window', DATA)(w);
  const O = w.ORARI, trova = (L, m) => L.find(c => c.dep === m).n;
  assert.equal(trova(O.cumanaAndata, 360), 50545);       // La Trencia 06:00
  assert.equal(trova(O.cumanaAndata, 504), 5079);        // La Trencia 08:24
  assert.equal(trova(O.cumanaAndata, 1320), 5215);       // La Trencia 22:00
  assert.equal(trova(O.cumanaRitorno, 302), 50502);      // Montesanto 05:02
  assert.equal(trova(O.cumanaRitorno, 504), 5084);       // Montesanto 08:24
  assert.equal(trova(O.cumanaRitorno, 1272), 5212);      // Montesanto 21:12
  assert.equal(trova(O.cumanaRitorno, 1296), 52136);     // Montesanto 21:36, l'ultima
});

test('Dopo la richiesta, quando arriva il dato nuovo la barra torna verde', async () => {
  const live = liveFinto({ agg: '2026-11-05T06:40:00Z' });
  const a = await apri('2026-11-05T07:00:00Z', { chiave: 'x', live });
  assert.match(a.testo('livestato'), /Aggiorno i ritardi/);
  live.agg = '2026-11-05T07:00:00Z';                     // GitHub ha scritto il dato nuovo
  await new Promise(r => setTimeout(r, 4300));            // il prossimo controllo è dopo 4 secondi
  assert.match(a.testo('livestato'), /Ritardi EAV delle 08:00 \(adesso\)/);
});

// ---------------- IN CORSO ----------------
test('Andata in corso 08:35: sulla Cumana delle 08:24 prendi la Linea 2 delle 08:47', async () => {
  const a = await apri('2026-11-05T07:35:00Z', { hash: '#andata-corso' });
  const chip = a.w.document.querySelector('#acC button');
  assert.equal(chip.textContent, '08:24');
  assert.match(a.testo('acCr'), /08:47/);
  assert.equal(a.w.document.getElementById('andata-corso').hidden, false);
  a.chiudi();
});

test('Uscita in corso, sono a Garibaldi alle 15:47: come il tabellone (15:56, poi 16:04 16:11 16:19)', async () => {
  const a = await apri('2026-11-05T14:47:00Z', { hash: '#ritorno-corso' });
  const r = a.testo('rcG');
  assert.match(r, /Prossima Linea 2 ?15:56/);          // tabellone di P.zza Garibaldi del 5/11 alle 15:48
  assert.match(r, /Poi: 16:04 · 16:11 · 16:19/);
  assert.match(r, /Cumana delle 16:24/);
  assert.match(r, /a casa alle 16:49/);
  assert.match(r, /Copia 20964/);
});

test('Andata in corso, sono a La Trencia alle 08:00: Cumana 08:00, Linea 2 08:24', async () => {
  const a = await apri('2026-11-05T07:00:00Z', { hash: '#andata-corso' });
  const r = a.testo('acT');
  assert.match(r, /Prossima Cumana ?08:00/);
  assert.match(r, /Linea 2 delle 08:24/);
  assert.match(r, /al lavoro alle 08:54/);
});

test('Mappa del viaggio: c\'è, con le fermate giuste e il numero 5164 alle 16:24 come sul tabellone', async () => {
  const a = await apri('2026-11-05T15:08:00Z', { hash: '#ritorno' });
  const mappa = a.testo('mappabox');
  for (const f of ['La Trencia', 'Montesanto', 'Piazza Cavour', 'Piazza Garibaldi']) assert.match(mappa, new RegExp(f));
  const w = {}; new Function('window', DATA)(w);
  assert.equal(w.ORARI.cumanaRitorno.find(c => c.dep === 984).n, 5164);   // tabellone di Montesanto 5/11 ore 16:08
  assert.equal(w.ORARI.cumanaRitorno.find(c => c.dep === 1008).n, 5168);
});

// ---------------- PROFILO DI SABRINA: Pianura, 12 minuti, niente Linea 2 ----------------
const SABRINA = { stazione: 'pianura', casa: 12, linea2: false, montesantoLavoro: 0, turni: false };

test('Sabrina, andata alle 08:00: Cumana da Pianura 08:22, esce tra 10 min, a Montesanto 08:39', async () => {
  const a = await apri('2026-11-05T07:00:00Z', { profilo: SABRINA });
  assert.equal(a.testo('a1t'), '08:22');                 // La Trencia 08:24 - 2 minuti
  assert.equal(a.testo('gA'), 'tra 10 min');             // 08:22 - 12 min a piedi
  assert.equal(a.testo('gW'), '08:39');                  // arrivo a Montesanto
  const b = a.w.document.body;
  assert.ok(b.classList.contains('no-l2') && b.classList.contains('no-turni'));
  assert.equal(a.testo('dest'), 'Montesanto');
  assert.match(a.w.document.querySelector('a.lvstaz').href, /stazione=824/);
  assert.deepEqual(a.errori, []);
});

test('Sabrina, uscita alle 17:00: Cumana da Montesanto 17:12, a Pianura 17:32, a casa 17:44', async () => {
  const a = await apri('2026-11-05T16:00:00Z', { profilo: SABRINA, hash: '#ritorno' });
  assert.equal(a.testo('r1t'), '17:12');
  assert.match(a.testo('r1n'), /Arrivo a Pianura alle 17:32/);   // La Trencia 17:27 + 5 minuti
  assert.equal(a.testo('gR'), '17:44');
  assert.equal(a.testo('gL'), 'tra 12 min');
});

test('Sabrina: la prima da Montesanto (05:02) arriva a Pianura alle 05:18, le altre 5 min dopo La Trencia', async () => {
  const a = await apri('2026-11-05T07:00:00Z', { profilo: SABRINA });
  const R = a.w.ORARI.cumanaRitorno;
  assert.equal(R[0].arr, 318);                           // 05:18 come sul PDF EAV
  assert.equal(R[1].arr, 356);                           // 05:56
});

test('Sabrina: Cumana soppressa sul tabellone di Pianura, la salta', async () => {
  const a = await apri('2026-11-05T07:00:00Z', { profilo: SABRINA, live: liveFinto({ pianura_p: [{ treno: '5079', dest: 'MONTESANTO', ora: '08:22', rit: 0, info: 'SOPPRESSO' }] }) });
  assert.equal(a.testo('a1t'), '08:46');
  assert.match(a.testo('a1l'), /08:22 è SOPPRESSA/);
});

test('Pulsante 🔄: nascosto a chi non ha la chiave GitHub (come Sabrina), visibile con la chiave', async () => {
  const senza = await apri('2026-11-05T07:00:00Z', { profilo: SABRINA });
  assert.equal(senza.w.document.getElementById('liveagg').hidden, true);
  const con = await apri('2026-11-05T07:00:00Z', { chiave: 'x' });
  assert.equal(con.w.document.getElementById('liveagg').hidden, false);
});

// ---------------- COERENZA DEI FILE ----------------
test('Versione uguale in app.js e sw.js', () => {
  const v = APP.match(/const VERSIONE = '([\d.]+)'/)[1];
  const c = leggi('sw.js').match(/const CACHE = 'cumana-([\d.]+)'/)[1];
  assert.equal(v, c);
  assert.match(leggi('sw.js'), /'\.\/app\.js'/);         // app.js deve funzionare anche offline
});

test('Orari in data.js: in ordine, durate sensate, numero treno presente', () => {
  const w = {}; new Function('window', DATA)(w);
  const O = w.ORARI;
  for (const tipo of ['feriale', 'sabato', 'festivo']) {
    for (const verso of ['andata', 'ritorno']) {
      const L = O.linea2[tipo][verso];
      assert.ok(L && L.length > 50, `${tipo} ${verso}: pochi treni`);
      L.forEach((x, i) => {
        assert.ok(x[1] >= 12 && x[1] <= 25, `${tipo} ${verso}: durata strana ${x}`);
        assert.ok(x[2] > 1000, `${tipo} ${verso}: manca il numero treno ${x}`);
        if (i) assert.ok(x[0] >= L[i - 1][0], `${tipo} ${verso}: orari non in ordine`);
      });
    }
  }
  assert.equal(O.cumanaAndata[0].dep, 360);              // prima Cumana da La Trencia 06:00
  assert.equal(O.cumanaRitorno.at(-1).dep, 1296);        // ultima da Montesanto 21:36
});
