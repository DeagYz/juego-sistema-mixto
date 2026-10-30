// Mide el peso REAL de la página del jugador (sin caché) con Chrome headless: bytes transferidos por red.
const puppeteer = require('puppeteer-core'); const zlib = require('zlib'); const fs = require('fs'); const path = require('path');
const { server } = require('../server');
(async () => {
  await new Promise((r) => server.listen(3160, r));
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', args: ['--no-sandbox'], headless: 'new' });
  for (const [label, url] of [['jugador (celular)', '/'], ['host (pantalla)', '/host']]) {
    const p = await b.newPage(); const cdp = await p.target().createCDPSession(); await cdp.send('Network.enable'); await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    const reqs = new Map(), done = []; cdp.on('Network.requestWillBeSent', (e) => reqs.set(e.requestId, e.request.url)); cdp.on('Network.loadingFinished', (e) => done.push([reqs.get(e.requestId), e.encodedDataLength]));
    await p.goto('http://127.0.0.1:3160' + url, { waitUntil: 'networkidle0' }); await new Promise((r) => setTimeout(r, 1000));
    const doc = done.filter((d) => !/socket\.io/.test(d[0])); let t = 0; console.log('\n' + label + ':'); for (const [u, n] of doc) { t += n; console.log('  ', u.replace('http://127.0.0.1:3160', '') || '/', (n / 1024).toFixed(2), 'KB'); }
    console.log('   TOTAL transferido (brotli, sin caché):', (t / 1024).toFixed(2), 'KB'); await p.close();
  }
  const d = path.join(__dirname, '../dist'); let g = 0, br = 0, raw = 0;
  for (const f of fs.readdirSync(d)) { if (/^host\./.test(f)) continue; const x = fs.readFileSync(path.join(d, f)); raw += x.length; g += zlib.gzipSync(x, { level: 9 }).length; br += zlib.brotliCompressSync(x).length; }
  console.log(`\nPágina del jugador (index.html+css+js): sin comprimir ${(raw / 1024).toFixed(1)} KB · gzip ${(g / 1024).toFixed(1)} KB · brotli ${(br / 1024).toFixed(1)} KB`);
  await b.close(); process.exit(0);
})();
