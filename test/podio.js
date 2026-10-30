// Juego rápido (el anfitrión salta cada pregunta) para capturar el podio.
const puppeteer = require('puppeteer-core'); const { io } = require('socket.io-client');
const URL_ = process.env.URL || 'http://localhost:3000'; const Q = require('../questions'); const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox'] });
  const host = await b.newPage(); await host.setViewport({ width: 1920, height: 1080 }); await host.goto(URL_ + '/host'); await sleep(1200);
  const code = await host.$eval('#bigcode', (e) => e.textContent); const cl = [];
  const N = ['Valeria','Dani','Lic. Morado','Sofi','Memo','Toga Loca','Karla','Fer','Juez Pepe','Ximena','Rodri','Ana Ley','Kilt Man','Paola'];
  for (let i = 0; i < N.length; i++) { const c = io(URL_, { transports: ['websocket'], forceNew: true }); await new Promise((r) => c.emit('player:join', { code, name: N[i], avatar: { animal: (i*5)%16, color: i%8, hat: i%5, body: i%3, glasses: i%4===0 } }, r)); cl.push(c); }
  await sleep(500); await host.screenshot({ path: 'shots/host_lobby.png' }); await host.keyboard.press('Enter');
  for (let q = 0; q < Q.length; q++) {
    for (let t = 0; t < 100 && !(await host.evaluate(() => document.body.innerText)).includes('respondieron'); t++) await sleep(100);
    cl.forEach((c, i) => setTimeout(() => c.emit('player:answer', { c: (i * 7 + q) % 5 === 0 ? 0 : Q[q].correct, e: 800 + i * 150 }), 50 + i * 40));
    await sleep(1500);
    for (let t = 0; t < 100 && !(await host.evaluate(() => document.body.innerText)).match(/Siguiente pregunta|Ver podio/); t++) await sleep(100);
    if (q === 4) { await sleep(1300); await host.screenshot({ path: 'shots/host_reveal.png' }); }
    await host.keyboard.press('Enter');
  }
  await sleep(2800); await host.screenshot({ path: 'shots/host_podio.png' });
  await b.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
