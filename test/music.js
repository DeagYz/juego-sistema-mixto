// Música: solo en el anfitrión, carga perezosa tras el primer clic, M/botón silencian, fases cambian de pista, fanfarria en el podio.
const puppeteer = require('puppeteer-core'); const assert = require('assert'); const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
process.env.GITHUB_API = 'http://127.0.0.1:1'; const { server } = require('../server'); const { io } = require('socket.io-client');
(async () => {
  await new Promise((r) => server.listen(3340, r)); const U = 'http://127.0.0.1:3340';
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required'] });
  const h = await b.newPage(); const p = await b.newPage(); const mp3 = { h: [], p: [] }; const errs = [];
  h.on('request', (r) => /\.mp3/.test(r.url()) && mp3.h.push(r.url().split('/').pop().split('.')[0])); p.on('request', (r) => /\.mp3/.test(r.url()) && mp3.p.push(r.url())); h.on('pageerror', (e) => errs.push(e.message)); p.on('pageerror', (e) => errs.push(e.message));
  await h.goto(U + '/host'); await sleep(1500); const code = await h.$eval('#bigcode', (e) => e.textContent);
  assert.strictEqual(mp3.h.length, 0, 'nada de audio antes del primer clic'); assert(!(await h.$eval('#musicbar .chip', (e) => e.classList.contains('hidden'))), 'aviso "haz clic" visible');
  const st = () => h.evaluate(() => window.Music.state());
  await p.goto(U + '/?c=' + code); await p.type('#nick', 'Ana'); await p.click('#go'); await sleep(800);
  await h.bringToFront(); await h.mouse.click(600, 400); await sleep(1500);
  assert(mp3.h.includes('lobby'), 'carga lobby tras el clic'); let s = await st(); assert(s.started && s.running && s.want === 'lobby', JSON.stringify(s)); console.log('tras el primer clic: carga', mp3.h, s);
  await sleep(3500); assert(mp3.h.includes('tension') && mp3.h.includes('fanfare'), 'precarga tensión y fanfarria: ' + mp3.h);
  await h.keyboard.press('m'); s = await st(); assert.strictEqual(s.muted, true); assert.strictEqual(await h.$eval('#mute', (e) => e.textContent), '🔇'); await h.keyboard.press('m'); s = await st(); assert.strictEqual(s.muted, false);
  await h.click('#mute'); assert.strictEqual((await st()).muted, true); await h.click('#mute'); assert.strictEqual((await st()).muted, false); console.log('M y botón 🔊/🔇 OK');
  await h.keyboard.press('Enter'); const w = async (re) => { for (let i = 0; i < 150; i++) { if (re.test(await h.evaluate(() => document.body.innerText))) return; await sleep(100); } throw new Error('timeout ' + re); };
  await w(/respondieron/); assert.strictEqual((await st()).want, 'tension'); console.log('pregunta -> tensión OK');
  await h.keyboard.press('Enter'); await w(/Siguiente pregunta/); assert.strictEqual((await st()).want, 'lobbyLow'); console.log('revelar -> bucle suave OK');
  // saltar al podio: responder todo rápido
  for (let q = 1; q < 20; q++) { await h.keyboard.press('Enter'); await w(/respondieron/); await h.keyboard.press('Enter'); await w(/Siguiente pregunta|Ver podio/); }
  await h.keyboard.press('Enter'); await w(/Podio final/); await sleep(500); s = await st(); assert.strictEqual(s.want, 'fanfare'); console.log('podio -> fanfarria OK'); await sleep(5600); assert.strictEqual((await st()).want, 'lobbyLow');
  assert.strictEqual(mp3.p.length, 0, 'los celulares NO descargan audio'); assert.deepStrictEqual(errs, []);
  console.log('MÚSICA OK: celular sin audio; host descargó', [...new Set(mp3.h)].join(', ')); await b.close(); process.exit(0);
})().catch((e) => { console.error('FALLÓ', e); process.exit(1); });
