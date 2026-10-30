// Prueba con wifi escolar simulada (latencia 150±60 ms por sentido, 100 KB/s por conexión), 12 clientes,
// cortes de conexión a mitad de pregunta, reconexión con restauración de identidad/puntaje, y clientes con websocket bloqueado.
const { io } = require('socket.io-client');
const assert = require('assert');
const netproxy = require('./netproxy');
const Q = require('../questions');
const PORT = +process.env.PORT || 3111, N = +process.env.N || 12;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const { server } = require('../server');

(async () => {
  await new Promise((r) => server.listen(PORT, r));
  const P = netproxy({ listen: PORT + 1, target: { port: PORT }, latency: 150, jitter: 60, bw: 100 * 1024 });
  const PB = netproxy({ listen: PORT + 2, target: { port: PORT }, latency: 150, jitter: 60, bw: 100 * 1024, blockWs: true });
  const host = io('http://127.0.0.1:' + PORT, { transports: ['websocket'], forceNew: true });
  let hs = null; host.on('state', (s) => { if (hs && hs.qn === s.qn && !s.question) s.question = hs.question; hs = s; });
  const info = await new Promise((r) => host.emit('host:create', {}, r));

  // --- clientes que replican la lógica del teléfono (token, reintentos, respuesta pendiente) ---
  const clients = [];
  function mk(i, port, label) {
    const c = { i, label, name: 'Jug' + i, av: [i % 16, i % 8, i % 5, i % 3, i % 2], state: null, qStart: 0, pending: null, token: null, id: null, log: [], joins: 0, scoreBeforeDrop: null, sawScoreAfterRejoin: null };
    c.sock = io('http://127.0.0.1:' + port, { transports: ['websocket', 'polling'], tryAllTransports: true, reconnectionDelay: 400, reconnectionDelayMax: 3000, randomizationFactor: 0.7, timeout: 8000, forceNew: true });
    c.sock.on('connect', () => {
      c.sock.timeout(8000).emit('player:join', { code: info.code, name: c.name, avatar: c.av, token: c.token }, (e, r) => {
        if (e || !r.ok) return; c.joins++;
        if (c.id) { assert.strictEqual(r.id, c.id, 'misma identidad al reconectar'); assert.strictEqual(r.name, c.name); assert.deepStrictEqual(r.avatar, c.av); c.reconnected = (c.reconnected || 0) + 1; }
        c.id = r.id; c.token = r.token; c.transport = c.sock.io.engine.transport.name;
      });
    });
    c.sock.on('state', (s) => {
      if (c.state && c.state.qn === s.qn && !s.question) s.question = c.state.question;
      if (s.phase === 'question') { c.qStart = performance.now() - (s.question.duration * 1000 - s.left); }
      if (c.scoreBeforeDrop != null && s.you) { c.sawScoreAfterRejoin = s.you.score; assert.strictEqual(s.you.score, c.scoreBeforeDrop, 'puntaje restaurado tras reconexión'); c.scoreBeforeDrop = null; }
      if (c.pending && s.phase === 'question' && s.qn === c.pending.qn && s.you && !s.you.answered) send(c);
      else if (c.pending && (s.phase !== 'question' || s.qn !== c.pending.qn)) { if (s.you && !s.you.answeredThis && s.phase === 'reveal') c.lost = (c.lost || 0) + 1; c.pending = null; }
      c.state = s;
    });
    clients.push(c); return c;
  }
  function send(c) {
    const pk = c.pending; if (!pk || !c.sock.connected) return;
    c.sock.timeout(2500).emit('player:answer', { c: pk.c, e: pk.e }, (e, r) => { if (c.pending !== pk) return; if (e) return setTimeout(() => send(c), 300); c.pending = null; if (!r.ok) c.late = (c.late || 0) + 1; });
  }
  for (let i = 0; i < N - 2; i++) mk(i, PORT + 1, 'wifi');
  for (let i = N - 2; i < N; i++) mk(i, PORT + 2, 'ws-bloqueado');
  while (clients.some((c) => !c.id)) await sleep(100);
  await sleep(600);
  assert.strictEqual(hs.players.length, N); console.log(`lobby OK: ${N} jugadores conectados a través de red lenta (${clients.filter((c) => c.transport === 'polling').length} usan polling porque el proxy bloquea websocket)`);
  assert(clients.filter((c) => c.label === 'ws-bloqueado').every((c) => c.transport === 'polling'), 'clientes sin websocket caen a polling');
  assert(PB.stats.blocked > 0, 'el proxy bloqueó intentos de websocket');

  const dropLog = []; let dropped = 0, answeredAfterRejoin = 0;
  host.emit('host:start');
  const t0 = Date.now();
  for (let qi = 0; qi < Q.length; qi++) {
    while (!(hs.phase === 'question' && hs.qn === qi + 1)) await sleep(40);
    const q = Q[qi];
    const dropNow = qi % 3 === 1; // preguntas 2,5,8,11,14,17,20: cortes de red
    const victims = dropNow ? clients.filter((c) => (c.i + qi) % 4 === 0) : [];
    await Promise.all(clients.map(async (c) => {
      const mine = victims.includes(c);
      await sleep(500 + Math.random() * 2500);
      if (mine) { // corta la red de este cliente justo antes de contestar
        const sc = c.state.you ? c.state.you.score : 0; c.scoreBeforeDrop = sc;
        c.sock.io.engine.close(); dropped++; // equivalente a perder el wifi: el servidor ve disconnect y el cliente reconecta solo
        c.pending = { qn: qi + 1, c: ((c.i + qi) % 3 === 0) ? q.correct : (q.correct + 1) % 4, e: Math.round(performance.now() - c.qStart) };
        answeredAfterRejoin++;
        return; // la respuesta pendiente se envía sola al reconectar (state handler)
      }
      const ok = (c.i * 7 + qi * 3) % 5 !== 0;
      c.pending = { qn: qi + 1, c: ok ? q.correct : (q.correct + 1) % 4, e: Math.round(performance.now() - c.qStart) };
      c.expectCorrect = ok; send(c);
    }));
    const tq = Date.now();
    while (!(hs.phase === 'reveal' && hs.qn === qi + 1)) { await sleep(40); assert(Date.now() - tq < 20000, 'la pregunta ' + (qi + 1) + ' no cerró'); }
    await sleep(500);
    // todos (incl. los que se cayeron) deben tener su respuesta contada
    assert.strictEqual(hs.reveal.answered, N, `pregunta ${qi + 1}: contestaron ${hs.reveal.answered}/${N}`);
    for (const c of clients) assert(c.state.phase === 'reveal' || c.state.phase === 'question', 'cliente al día');
    host.emit('host:next');
    process.stderr.write('P'+(qi+1)+' ok\n'); if (dropNow) dropLog.push(`P${qi + 1}: ${victims.length} caídas`);
  }
  while (hs.phase !== 'final') await sleep(40);
  await sleep(1500); // deja que los últimos estados lleguen por la red lenta
  const board = hs.board;
  assert.strictEqual(board.length, N);
  for (const c of clients) {
    const row = board.find((b) => b[0] === c.id); assert(row, 'jugador en ranking final');
    assert.strictEqual(c.state.phase, 'final', 'cliente ' + c.i + ' llegó al final');
    assert.strictEqual(c.state.you.rank, row[4], 'lugar final coincide en teléfono y pantalla');
    assert.strictEqual(c.state.you.score, row[3]);
    assert.strictEqual(row[1], c.name); assert.deepStrictEqual(row[2], c.av);
  }
  const rec = clients.filter((c) => c.reconnected);
  const totalRecon = clients.reduce((a, c) => a + (c.reconnected || 0), 0);
  console.log(`Partida de ${Q.length} preguntas completada en ${Math.round((Date.now() - t0) / 1000)} s con red lenta.`);
  console.log(`Cortes forzados: ${dropped} (${dropLog.join(', ')}). Reconexiones exitosas: ${totalRecon} en ${rec.length} clientes distintos.`);
  console.log(`Respuestas enviadas desde el estado "desconectado" y contadas igualmente: ${answeredAfterRejoin} (0 perdidas; tardías: ${clients.reduce((a, c) => a + (c.late || 0), 0)})`);
  console.log('Identidad (id, apodo, avatar) y puntaje restaurados en todas las reconexiones: OK');
  const wifiN = clients.filter((c) => c.label === 'wifi').length;
  const dn = P.stats.down + PB.stats.down, up = P.stats.up + PB.stats.up;
  console.log(`Tráfico por jugador en toda la partida (20 preguntas): ↓${(dn / N / 1024).toFixed(1)} KB  ↑${(up / N / 1024).toFixed(1)} KB (incluye conexión, reconexiones y cabeceras TCP-nivel app)`);
  console.log('TODAS LAS PRUEBAS DE RED PASARON');
  P.close(); PB.close(); process.exit(0);
})().catch((e) => { console.error('FALLÓ:', e); process.exit(1); });
