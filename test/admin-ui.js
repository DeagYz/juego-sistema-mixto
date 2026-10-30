// Prueba de la interfaz /admin con Chrome headless (laptop y celular) + capturas.
const puppeteer = require('puppeteer-core'); const fs = require('fs'); const assert = require('assert');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PW = fs.readFileSync(require('path').join(__dirname, '..', '.admin_password'), 'utf8').trim(); const PORT = 3310;
process.env.ADMIN_PASSWORD = PW; delete process.env.GITHUB_TOKEN; process.env.GITHUB_API = 'http://127.0.0.1:1'; // sin GitHub: guarda en memoria
const { server } = require('../server');
let clk, mclk;
(async () => {
  await new Promise((r) => server.listen(PORT, r));
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const p = await b.newPage(); clk = (s) => p.$eval(s, (e) => { e.scrollIntoView({ block: 'center' }); e.click(); }); await p.setViewport({ width: 1280, height: 800 }); const errs = []; p.on('pageerror', (e) => errs.push(e.message)); p.on('dialog', (d) => d.accept());
  await p.goto('http://127.0.0.1:' + PORT + '/admin'); await sleep(500); await p.screenshot({ path: 'shots/admin_login.png' });
  await p.type('#pw', 'incorrecta'); await clk('#lb'); await sleep(500); assert(/incorrecta/.test(await p.$eval('#le', (e) => e.textContent)), 'error de contraseña');
  await p.$eval('#pw', (e) => (e.value = '')); await p.type('#pw', PW); await clk('#lb'); await p.waitForSelector('.card'); await sleep(300);
  assert.strictEqual((await p.$$('.card')).length, 20); assert(await p.$eval('#save', (e) => e.disabled), 'guardar deshabilitado sin cambios');
  await p.screenshot({ path: 'shots/admin_laptop.png' });
  // editar texto, opciones, correcta
  await p.$eval('[data-f="text"]', (e) => (e.value = '')); await p.type('[data-f="text"]', 'Texto editado de prueba'); await sleep(100);
  assert(!(await p.$eval('#save', (e) => e.disabled)), 'guardar habilitado tras editar');
  assert.strictEqual(await p.$eval('[data-f="hint"]', (e) => e.value), 'La palabra «mixto» ya habla de combinar.'); await p.$eval('[data-f="hint"]', (e) => (e.value = '')); await p.type('[data-f="hint"]', 'Pista editada'); await sleep(100);
  await clk('[data-c="0"]'); await sleep(100); await clk('[data-rm="0"]'); await sleep(100);
  assert(await p.$eval('#save', (e) => e.disabled), 'sin correcta => no guarda'); assert(await p.$('.qerr'), 'muestra error');
  await clk('[data-c="0"]'); await sleep(100); assert(!(await p.$eval('#save', (e) => e.disabled))); await clk('[data-rm="2"]'); await sleep(100);
  assert.strictEqual((await p.$$('.opt')).length, 2); assert(!(await p.$eval('#save', (e) => e.disabled))); assert(await p.$eval('[data-rm="0"]', (e) => e.disabled), 'mínimo 2 opciones');
  // reordenar con ▼ y ▲
  const t0 = await p.$eval('.card[data-i="1"] .sum b', (e) => e.textContent); await clk('.card[data-i="1"] [data-up]'); await sleep(100);
  assert.strictEqual(await p.$eval('.card[data-i="0"] .sum b', (e) => e.textContent), t0, 'subir'); await clk('.card[data-i="0"] [data-down]'); await sleep(100);
  assert.strictEqual(await p.$eval('.card[data-i="1"] .sum b', (e) => e.textContent), t0, 'bajar');
  // vista previa
  await clk('.card.open [data-prev]'); await sleep(300); await p.screenshot({ path: 'shots/admin_preview.png' }); await p.screenshot({ path: 'shots/admin_preview.png' }); await clk('#pvc'); await sleep(100);
  // agregar, eliminar
  await clk('#add'); await sleep(200); assert.strictEqual((await p.$$('.card')).length, 21); assert(await p.$eval('#save', (e) => e.disabled), 'nueva vacía es inválida');
  await clk('.card.open [data-del]'); await sleep(100); assert.strictEqual((await p.$$('.card')).length, 20);
  // drag & drop (simulado con DataTransfer): mueve la pregunta 3 al lugar 1
  const names = await p.$$eval('.sum b', (a) => a.map((x) => x.textContent));
  await p.evaluate(() => { const c = document.querySelectorAll('.card'); const dt = new DataTransfer(); dt.setData('text/plain', '2'); c[2].draggable = true; c[2].dispatchEvent(new DragEvent('dragstart', { dataTransfer: dt, bubbles: true })); c[0].dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true })); }); await sleep(150);
  const n2 = await p.$$eval('.sum b', (a) => a.map((x) => x.textContent)); assert.strictEqual(n2[0], names[2], 'arrastrar y soltar');
  // exportar → importar
  const exported = await p.evaluate(() => 0);
  await clk('#save'); await sleep(800); const msg = await p.$eval('.savebar .msg', (e) => e.textContent); console.log('mensaje al guardar (sin GitHub):', msg); assert(/GITHUB_TOKEN/.test(msg)); assert(await p.$eval('#save', (e) => e.disabled));
  // reload: persiste en memoria
  const tk = await p.evaluate(() => sessionStorage.getItem('mixto_admin')); const lst = await (await fetch('http://127.0.0.1:' + PORT + '/admin/api/questions', { headers: { Authorization: 'Bearer ' + tk } })).json(); assert(lst.questions.some((x) => x.hint === 'Pista editada'), 'pista editada guardada'); console.log('pista editada y guardada OK');
  await p.reload(); await p.waitForSelector('.card'); assert.strictEqual((await p.$$eval('.sum b', (a) => a[0].textContent)).length > 0, true);
  const imp = await p.$('#file'); fs.writeFileSync('/tmp/imp.json', JSON.stringify([{ kind: 'concepto', duration: 12, text: 'Importada', options: ['x', 'y', 'z'], correct: 1, explanation: 'e' }])); await imp.uploadFile('/tmp/imp.json'); await sleep(300);
  assert.strictEqual((await p.$$('.card')).length, 1); assert(!(await p.$eval('#save', (e) => e.disabled)), 'importado válido');
  fs.writeFileSync('/tmp/imp2.json', JSON.stringify([{ text: 'mala', options: ['solo'], correct: 0 }])); await imp.uploadFile('/tmp/imp2.json'); await sleep(300); assert(await p.$eval('#save', (e) => e.disabled), 'importado inválido bloquea guardar');
  // celular
  const m = await b.newPage(); mclk = (s) => m.$eval(s, (e) => { e.scrollIntoView({ block: 'center' }); e.click(); }); await m.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true }); m.on('pageerror', (e) => errs.push(e.message));
  await m.goto('http://127.0.0.1:' + PORT + '/admin'); await m.evaluate((t) => 0); await m.type('#pw', PW); await mclk('#lb'); await m.waitForSelector('.card'); await sleep(200); await m.screenshot({ path: 'shots/admin_phone_list.png' });
  await mclk('.card[data-i="0"] [data-toggle]').catch(() => {}); await sleep(200); await mclk('.card[data-i="2"] [data-toggle]'); await sleep(300); await m.screenshot({ path: 'shots/admin_phone_edit.png' });
  assert(await m.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'sin desbordamiento horizontal en celular');
  assert.deepStrictEqual(errs, [], 'sin errores JS'); console.log('INTERFAZ /admin OK (login, edición, validación, orden ▲▼, arrastrar, vista previa, agregar/eliminar, importar, guardar, celular)');
  await b.close(); process.exit(0);
})().catch((e) => { console.error('FALLÓ:', e); process.exit(1); });
