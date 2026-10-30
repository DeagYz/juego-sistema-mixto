// Simula N clientes (por defecto 12) y verifica ranking, puntaje y flujo completo.
const { io } = require('socket.io-client');
const URL_ = process.env.URL || 'http://localhost:3000';
const N = parseInt(process.env.N || '12', 10);
const Q = require('../questions');
const assert = require('assert');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const mk = () => io(URL_, { transports: ['websocket'], forceNew: true });
const results = { reveals: 0 };

(async () => {
  const host = mk(); let hs = null; const hostStates = [];
  host.on('state', (s) => { hs = s; hostStates.push(s); });
  const info = await new Promise((r) => host.emit('host:create', {}, r));
  console.log('sala', info.code, info.joinUrl, 'qr svg bytes', info.qr.length);

  // Perfiles: jugador i acierta con probabilidad creciente (jugador 0 siempre acierta, jugador N-1 nunca)
  const players = [];
  for (let i = 0; i < N; i++) {
    const c = mk(); const p = { c, i, state: null, score: 0, id: null, token: null, gains: [] };
    c.on('state', (s) => { p.state = s; });
    const r = await new Promise((res) => c.emit('player:join', { code: info.code, name: 'Jugador' + (i % 3 === 0 ? '' : i) , avatar: { animal: i % 16, color: i % 8, hat: i % 5, body: i % 3, glasses: i % 2 } }, res));
    assert(r.ok, 'join falló'); p.id = r.id; p.token = r.token; players.push(p);
  }
  await sleep(500);
  assert.strictEqual(hs.phase, 'lobby'); assert.strictEqual(hs.players.length, N, 'lobby debe listar a todos');
  assert.strictEqual(new Set(hs.players.map((p) => p.name)).size, N, 'apodos únicos');
  console.log('lobby OK:', hs.players.length, 'jugadores');

  host.emit('host:start');
  const scores = new Map(players.map((p) => [p.id, 0]));
  for (let qi = 0; qi < Q.length; qi++) {
    await sleep(qi === 0 ? 100 : 0);
    while (!(hs.phase === 'question' && hs.qn === qi + 1)) await sleep(50);
    const q = Q[qi];
    // cada jugador responde con retardo distinto; jugador 0 el más rápido y siempre acierta
    await Promise.all(players.map(async (p) => {
      await sleep(200 + p.i * 150);
      const correct = p.i === 0 ? true : p.i === N - 1 ? false : ((qi * 7 + p.i * 3) % 10) / 10 < 1 - p.i / N;
      const choice = correct ? q.correct : (q.correct + 1 + (p.i % 3)) % 4;
      p.c.emit('player:answer', { choice });
      p.c.emit('player:answer', { choice: (choice + 1) % 4 }); // duplicado: debe ignorarse
      p.last = { choice, correct };
    }));
    while (hs.phase !== 'reveal' || hs.qn !== qi + 1) await sleep(50);
    await sleep(100);
    const r = hs.reveal;
    assert.strictEqual(r.correct, q.correct);
    const exp = [0, 0, 0, 0]; players.forEach((p) => exp[p.last.choice]++);
    assert.deepStrictEqual(r.counts, exp, 'distribución de respuestas');
    // validar puntajes: acierto => 600..1000, y el más rápido gana más
    let prev = Infinity;
    for (const p of players) {
      const y = p.state.you; assert.strictEqual(y.correct, p.last.correct, 'correcto/incorrecto en teléfono');
      if (p.last.correct) { assert(y.gain >= 600 && y.gain <= 1000, 'gain en rango ' + y.gain); scores.set(p.id, scores.get(p.id) + y.gain); }
      else assert.strictEqual(y.gain, 0);
      assert.strictEqual(y.score, scores.get(p.id), 'puntaje acumulado');
      assert(p.state.board && p.state.board.length === Math.min(5, N), 'ranking visible en teléfono');
    }
    const fastCorrect = players.filter((p) => p.last.correct).map((p) => p.state.you.gain);
    assert(fastCorrect[0] >= fastCorrect[fastCorrect.length - 1], 'más rápido => más puntos');
    // ranking del host consistente
    const hb = hs.board; for (let i = 1; i < hb.length; i++) assert(hb[i - 1].score >= hb[i].score, 'host ordenado');
    results.reveals++;
    if (qi < Q.length - 1) host.emit('host:next'); else host.emit('host:next');
  }
  while (hs.phase !== 'final') await sleep(50);
  await sleep(200);
  const board = hs.board;
  assert.strictEqual(board.length, N);
  for (let i = 1; i < board.length; i++) assert(board[i - 1].score >= board[i].score);
  const expSorted = [...scores.entries()].sort((a, b) => b[1] - a[1]);
  assert.strictEqual(board[0].score, expSorted[0][1], 'puntaje del campeón');
  assert.strictEqual(board[0].id, players[0].id, 'el jugador 0 (siempre acierta y más rápido) es 1°');
  assert.strictEqual(board[N - 1].id, players[N - 1].id, 'el que nunca acierta es último');
  for (const p of players) { const rk = board.find((b) => b.id === p.id).rank; assert.strictEqual(p.state.you.rank, rk, 'lugar final en teléfono'); assert(p.state.board.length === Math.min(10, N)); }
  console.log('Preguntas jugadas:', results.reveals, '/', Q.length);
  console.log('Top 5 final:', board.slice(0, 5).map((b) => `${b.rank}.${b.name}=${b.score}`).join('  '));

  // reconexión: un jugador se cae y vuelve con su token
  const p = players[3]; p.c.disconnect(); await sleep(200);
  const c2 = mk(); let st2; c2.on('state', (s) => { st2 = s; });
  const rj = await new Promise((r) => c2.emit('player:join', { code: info.code, token: p.token }, r));
  await sleep(200); assert(rj.ok && st2.you.id === p.id && st2.phase === 'final', 'reconexión conserva identidad'); console.log('reconexión OK');
  // reinicio
  host.emit('host:reset'); await sleep(300); assert.strictEqual(hs.phase, 'lobby'); assert(hs.players.every((x) => x));
  console.log('\nTODAS LAS PRUEBAS PASARON con', N, 'clientes');
  process.exit(0);
})().catch((e) => { console.error('FALLÓ:', e); process.exit(1); });
