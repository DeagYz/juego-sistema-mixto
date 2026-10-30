// Capturas con Chrome headless: pantalla del anfitrión (1920x1080) y celular (390x844).
const puppeteer = require('puppeteer-core');
const { io } = require('socket.io-client');
const URL_ = process.env.URL || 'http://localhost:3000';
const Q = require('../questions');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const NAMES = ['Valeria', 'Dani', 'Lic. Morado', 'Sofi', 'Memo', 'Toga Loca', 'Karla', 'Fer', 'Juez Pepe', 'Ximena', 'Rodri', 'Ana Ley', 'Kilt Man', 'Paola'];
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--font-render-hinting=none'] });
  const host = await b.newPage(); await host.setViewport({ width: 1920, height: 1080 });
  await host.goto(URL_ + '/host'); await sleep(1500);
  const code = await host.$eval('#bigcode', (e) => e.textContent);
  const clients = [];
  for (let i = 0; i < NAMES.length; i++) {
    const c = io(URL_, { transports: ['websocket'], forceNew: true }); const o = { c, i, s: null }; c.on('state', (s) => (o.s = s));
    await new Promise((r) => c.emit('player:join', { code, name: NAMES[i], avatar: { animal: (i * 5) % 16, color: i % 8, hat: i % 5, body: i % 3, glasses: i % 4 === 0 } }, r)); clients.push(o);
  }
  await sleep(800); await host.screenshot({ path: 'shots/host_lobby.png' });
  // celular
  const ph = await b.newPage(); await ph.setViewport({ width: 390, height: 844, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await ph.goto(URL_ + '/?c=' + code); await sleep(800); await ph.screenshot({ path: 'shots/phone_join.png' });
  await ph.type('#nick', 'Mónica'); await ph.click('.pk[data-k="hat"][data-v="2"]'); await ph.click('.pk[data-k="body"][data-v="1"]'); await ph.click('#go'); await sleep(800);
  await ph.screenshot({ path: 'shots/phone_lobby.png' });
  const hostWait = async (ph_, n) => { for (let i = 0; i < 200; i++) { const t = await host.evaluate(() => document.body.innerText); if (ph_(t)) return; await sleep(100); } };
  await host.keyboard.press('Enter');
  for (let q = 0; q < Q.length; q++) {
    await hostWait((t) => t.includes('respondieron'));
    await sleep(1500);
    await Promise.all(clients.map(async (o) => { await sleep(q < 4 ? 300 + o.i * 400 : 100 + o.i * 30); const good = (o.i * 7 + q) % 4 !== 0; o.c.emit('player:answer', { c: good ? Q[q].correct : (Q[q].correct + 1 + o.i % 3) % 4, e: 1200 + o.i * 250 }); }));
    if (q === 0) { await ph.screenshot({ path: 'shots/phone_question.png' }); }
    if (q === 3) { await ph.click('.opt[data-i="3"]').catch(() => {}); await sleep(300); await host.screenshot({ path: 'shots/host_question.png' }); }
    if (q >= 4) { await sleep(600); await host.keyboard.press('Enter'); }
    await hostWait((t) => t.includes('Siguiente pregunta') || t.includes('Ver podio'));
    await sleep(1400);
    if (q === 3) { await host.screenshot({ path: 'shots/host_reveal.png' }); await ph.screenshot({ path: 'shots/phone_reveal.png', fullPage: true }); }
    if (q === 10) await host.screenshot({ path: 'shots/host_reveal_long.png' });
    await host.keyboard.press('Enter');
  }
  await hostWait((t) => t.includes('Podio final'));
  await sleep(2500); await host.screenshot({ path: 'shots/host_podio.png' }); await sleep(500); await ph.screenshot({ path: 'shots/phone_final.png', fullPage: true });
  await b.close(); process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
