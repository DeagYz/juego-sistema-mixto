// Proxy TCP que simula wifi escolar: latencia, ancho de banda limitado, jitter, cortes y bloqueo de websocket.
const net = require('net');
module.exports = function netproxy({ listen, target, latency = 150, jitter = 60, bw = 100 * 1024, blockWs = false }) {
  const conns = new Set(); const stats = { up: 0, down: 0, conns: 0, blocked: 0 };
  const srv = net.createServer((c) => {
    let first = true; stats.conns++;
    const u = net.connect(target.port, target.host || '127.0.0.1');
    const rec = { c, u, up: 0, down: 0 }; conns.add(rec);
    const pipe = (from, to, dir) => {
      let free = 0, last = 0;
      from.on('data', (buf) => {
        if (dir === 'up' && first) {
          first = false;
          if (blockWs && /upgrade:\s*websocket/i.test(buf.toString('latin1', 0, 1024))) { stats.blocked++; c.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\nContent-Length: 0\r\n\r\n'); u.destroy(); return; }
        }
        rec[dir] += buf.length; stats[dir] += buf.length;
        const now = Date.now();
        free = Math.max(free, now) + (buf.length / bw) * 1000;               // serialización por ancho de banda
        const at = Math.max(last, free + latency + Math.random() * jitter);  // latencia + jitter, sin reordenar
        last = at;
        setTimeout(() => { if (!to.destroyed) to.write(buf); }, Math.max(0, at - now));
      });
      from.on('close', () => setTimeout(() => to.destroy(), Math.max(latency, last - Date.now()) + 5));
      from.on('error', () => {});
    };
    pipe(c, u, 'up'); pipe(u, c, 'down');
    c.on('close', () => conns.delete(rec)); u.on('error', () => c.destroy());
  });
  srv.listen(listen);
  return {
    stats, close: () => { srv.close(); for (const r of conns) { r.c.destroy(); r.u.destroy(); } },
    // corta de golpe n conexiones (como perder el wifi un momento). Devuelve cuántas cortó.
    kill(n = 1e9) { let k = 0; for (const r of [...conns]) { if (k >= n) break; r.c.destroy(); r.u.destroy(); k++; } return k; },
    count: () => conns.size,
  };
};
