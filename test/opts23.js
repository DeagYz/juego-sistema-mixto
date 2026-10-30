// Verifica el anfitrión y el celular con preguntas de 2 y 3 opciones (editadas desde el admin).
const assert = require('assert');
const puppeteer = require('puppeteer-core'); const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
process.env.ADMIN_PASSWORD = 'x-test-pass1'; delete process.env.GITHUB_TOKEN; process.env.GITHUB_API = 'http://127.0.0.1:1';
const { server } = require('../server'); const { io } = require('socket.io-client');
(async () => {
  await new Promise((r) => server.listen(3320, r)); const U = 'http://127.0.0.1:3320';
  const t = (await (await fetch(U + '/admin/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: 'x-test-pass1' }) })).json()).token;
  const qs = [{ kind: 'concepto', duration: 20, text: 'Pregunta con tres opciones', options: ['Primera', 'Segunda', 'Tercera'], correct: 1, explanation: 'dato', hint: 'Piensa en el medio.' }, { kind: 'pais', duration: 20, text: 'Verdadero o falso', options: ['Verdadero', 'Falso'], correct: 0, explanation: '' }];
  console.log('save', (await fetch(U + '/admin/api/questions', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + t }, body: JSON.stringify({ questions: qs }) })).status);
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] }); const errs = [];
  const h = await b.newPage(); await h.setViewport({ width: 1280, height: 720 }); h.on('pageerror', (e) => errs.push('host ' + e.message)); await h.goto(U + '/host'); await sleep(1200);
  const code = await h.$eval('#bigcode', (e) => e.textContent);
  const o = []; for (let i = 0; i < 3; i++) { const c = io(U, { transports: ['websocket'], forceNew: true }); await new Promise((r) => c.emit('player:join', { code, name: 'Bot' + i, avatar: { animal: i, color: i, hat: 0, body: 0, glasses: false } }, r)); o.push(c); }
  const p = await b.newPage(); await p.setViewport({ width: 390, height: 760, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); p.on('pageerror', (e) => errs.push('player ' + e.message));
  await p.goto(U + '/?c=' + code); await sleep(500); await p.type('#nick', 'Mónica'); await p.click('#go'); await sleep(600);
  const w = async (re, host) => { for (let i = 0; i < 100; i++) { if (re.test(await (host ? h : p).evaluate(() => document.body.innerText))) return; await sleep(100); } throw new Error('timeout ' + re); };
  await h.keyboard.press('Enter'); await w(/respondieron/, true); await sleep(800);
  const op = (pg) => pg.$eval('#ph', (e) => getComputedStyle(e).opacity).catch(() => 'ausente');
  console.log('pista (a ~1 s) host/celular opacidad:', await op(h), await op(p));
  assert.strictEqual(await op(h), '0'); assert.strictEqual(await op(p), '0');
  await h.bringToFront(); await sleep(6200); const oh = await op(h); await p.bringToFront(); await sleep(1500); console.log('pista (a ~7 s) host/celular opacidad:', oh, await op(p), '|', await h.$eval('#ph', (e) => e.textContent));
  assert.strictEqual(oh, '1'); assert.strictEqual(await op(p), '1');
  console.log('host opts:', await h.$$eval('.opt', (a) => a.length), 'player opts:', await p.$$eval('.opt', (a) => a.length));
  await h.screenshot({ path: 'shots/host_3opts.png' }); await p.screenshot({ path: 'shots/phone_3opts.png' });
  await p.click('.opt[data-i="1"]'); o.forEach((c) => c.emit('player:answer', { c: 1, e: 900 })); await w(/Siguiente pregunta|Ver podio/, true); await sleep(900);
  await h.screenshot({ path: 'shots/host_3opts_reveal.png' }); await p.screenshot({ path: 'shots/phone_3opts_reveal.png' });
  await h.keyboard.press('Enter'); await w(/respondieron/, true); await sleep(800);
  assert.strictEqual(await op(h), 'ausente', 'sin pista no hay línea');
  console.log('2 opts -> host:', await h.$$eval('.opt', (a) => a.length), 'player:', await p.$$eval('.opt', (a) => a.length));
  await h.screenshot({ path: 'shots/host_2opts.png' }); await p.screenshot({ path: 'shots/phone_2opts.png' });
  console.log('errores JS:', errs); await b.close(); process.exit(errs.length ? 1 : 0);
})().catch((e) => { console.error('FALLÓ', e); process.exit(1); });
