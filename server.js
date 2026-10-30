'use strict';
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const QRCode = require('qrcode');
const { Server } = require('socket.io');
const store = require('./lib/store');
const admin = require('./lib/admin');

const PORT = process.env.PORT || 3000;
const INTRO_MS = 3000;          // cuenta previa a cada pregunta
const GRACE_MS = 1200;          // margen por latencia: se aceptan respuestas hasta 1.2 s después del cierre
const LAT_CREDIT_MS = 1500;     // máximo de latencia que se le perdona a un jugador al puntuar
const DC_GRACE_MS = 8000;       // un jugador desconectado < 8 s aún cuenta como activo (wifi inestable)
const MAX_PLAYERS = 200;
const ROOM_TTL_MS = 8 * 3600 * 1000;
const BASE_POINTS = 600, SPEED_POINTS = 400; // acierto = 600 + hasta 400 por rapidez

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  pingInterval: 10000, pingTimeout: 20000, maxHttpBufferSize: 1e4,
  transports: ['websocket', 'polling'],
  perMessageDeflate: { threshold: 400, zlibDeflateOptions: { level: 1, memLevel: 7 }, serverNoContextTakeover: true },
  httpCompression: { threshold: 400 },
  serveClient: false, // el cliente socket.io va dentro de nuestro bundle
});

app.set('trust proxy', true);
admin.mount(app, { store, rooms: () => rooms });
store.refresh().catch(() => {}); // carga las preguntas de GitHub al arrancar
app.use(require('./lib/assets')(path.join(__dirname, 'dist')));
app.get('/healthz', (_, res) => res.json({ ok: true, rooms: rooms.size }));
app.get('/j/:code', (req, res) => res.redirect('/?c=' + encodeURIComponent(req.params.code)));

const rooms = new Map();
const sha = () => crypto.randomBytes(12).toString('hex');

function newCode() {
  for (let i = 0; i < 200; i++) {
    const c = String(Math.floor(1000 + Math.random() * 9000));
    if (!rooms.has(c)) return c;
  }
  return String(Math.floor(100000 + Math.random() * 900000));
}

function createRoom() {
  const room = {
    code: newCode(), hostToken: sha(), hostSocket: null,
    phase: 'lobby', qIndex: -1, players: new Map(), answers: new Map(),
    startAt: 0, endsAt: 0, timer: null, lastBoard: new Map(), reveal: null,
    created: Date.now(), touched: Date.now(), qs: store.current(),
  };
  rooms.set(room.code, room);
  return room;
}

const cleanName = (s) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 14);
function cleanAvatar(a) {
  a = a || {};
  const int = (v, max) => { v = parseInt(v, 10); return Number.isFinite(v) && v >= 0 && v < max ? v : 0; };
  if (Array.isArray(a)) a = { animal: a[0], color: a[1], hat: a[2], body: a[3], glasses: a[4] };
  return [int(a.animal, 16), int(a.color, 8), int(a.hat, 5), int(a.body, 3), a.glasses ? 1 : 0]; // [animal,color,sombrero,traje,lentes]
}

function ranking(room) {
  const arr = [...room.players.values()];
  arr.sort((a, b) => b.score - a.score || a.totalTime - b.totalTime || a.joined - b.joined);
  arr.forEach((p, i) => { p.rank = i + 1; });
  return arr;
}
const row = (p) => [p.id, p.name, p.avatar, p.score, p.rank, p.lastGain || 0, p.delta || 0]; // fila compacta de ranking

function publicQuestion(room) {
  const q = room.qs[room.qIndex];
  if (!q) return null;
  return { n: room.qIndex + 1, total: room.qs.length, kind: q.kind, text: q.text, options: q.options, duration: q.duration };
}

// lite=true: omite la pregunta (el cliente ya la tiene desde la fase "intro"); reduce bytes por mensaje.
function snapshot(room, player, lite) {
  const now = Date.now();
  const s = { phase: room.phase, qn: room.qIndex + 1, count: room.players.size };
  if (!lite) { s.code = room.code; s.total = room.qs.length; }
  const isHost = !player;
  if (room.phase === 'intro' || room.phase === 'question') s.left = Math.max(0, (room.phase === 'intro' ? room.startAt : room.endsAt) - now); // ms restantes (sin depender del reloj del celular)
  if (!lite && (room.phase === 'intro' || room.phase === 'question' || room.phase === 'reveal')) s.question = publicQuestion(room);
  if (room.phase === 'question' || room.phase === 'intro') { s.answered = room.answers.size; s.active = activeCount(room); }
  if (room.phase === 'reveal') {
    s.reveal = room.reveal;
    s.board = ranking(room).slice(0, isHost ? 10 : 5).map(row);
  }
  if (room.phase === 'final') s.board = ranking(room).slice(0, isHost ? 200 : 10).map(row);
  if (isHost) {
    if (room.phase === 'lobby') s.players = [...room.players.values()].map((p) => [p.id, p.name, p.avatar, p.connected ? 1 : 0]);
  } else {
    const p = player;
    ranking(room);
    const y = { score: p.score, rank: p.rank, streak: p.streak, gain: p.lastGain || 0, delta: p.delta || 0 };
    const a = room.answers.get(p.id);
    if (a) { y.answered = 1; y.choice = a.choice; }
    if (room.phase === 'reveal') { y.correct = p.lastCorrect ? 1 : 0; y.answeredThis = a ? 1 : 0; }
    if (room.phase === 'final') y.correctCount = p.correctCount;
    s.you = y;
  }
  return s;
}

const activeCount = (room) => { const t = Date.now(); return [...room.players.values()].filter((p) => p.connected || (p.dcAt && t - p.dcAt < DC_GRACE_MS)).length; };

function emitRoom(room, lite) {
  room.touched = Date.now();
  if (room.hostSocket) io.to(room.hostSocket).emit('state', snapshot(room, null, lite));
  for (const p of room.players.values()) if (p.socket) io.to(p.socket).emit('state', snapshot(room, p, lite));
}
let pending = new Map();
function emitLobbySoon(room) { // junta cambios del lobby (muchos jugadores entrando a la vez)
  if (pending.has(room.code)) return;
  pending.set(room.code, setTimeout(() => {
    pending.delete(room.code);
    if (room.phase === 'lobby') emitRoom(room);
  }, 300));
}
let progTimers = new Map();
function emitProgress(room) { // se agrupa (máx. 4 por segundo) para no inundar al anfitrión cuando 60 contestan a la vez
  if (progTimers.has(room.code)) return;
  progTimers.set(room.code, setTimeout(() => {
    progTimers.delete(room.code);
    if (room.hostSocket && room.phase === 'question') io.to(room.hostSocket).emit('progress', [room.answers.size, activeCount(room)]);
  }, 250));
}

function startQuestion(room) {
  clearTimeout(room.timer);
  room.qIndex += 1;
  if (room.qIndex >= room.qs.length) return finish(room);
  room.answers = new Map();
  room.reveal = null;
  for (const p of room.players.values()) { p.lastGain = 0; p.lastCorrect = false; }
  room.phase = 'intro';
  room.startAt = Date.now() + INTRO_MS;
  room.endsAt = room.startAt; // se recalcula al iniciar
  emitRoom(room);
  room.timer = setTimeout(() => openQuestion(room), INTRO_MS);
}
function openQuestion(room) {
  const q = room.qs[room.qIndex];
  room.phase = 'question';
  room.startAt = Date.now();
  room.endsAt = room.startAt + q.duration * 1000;
  emitRoom(room, true);
  room.timer = setTimeout(() => closeQuestion(room), q.duration * 1000 + GRACE_MS);
}
function closeQuestion(room) {
  if (room.phase !== 'question') return;
  clearTimeout(room.timer);
  const q = room.qs[room.qIndex];
  const before = ranking(room); // ranking previo
  const prevRank = new Map(before.map((p) => [p.id, p.rank]));
  const counts = [0, 0, 0, 0];
  for (const p of room.players.values()) {
    const a = room.answers.get(p.id);
    p.lastGain = 0; p.lastCorrect = false;
    if (a) {
      counts[a.choice]++;
      p.totalTime += a.elapsed;
      if (a.choice === q.correct) {
        const frac = 1 - Math.min(1, a.elapsed / (q.duration * 1000));
        const gain = Math.round(BASE_POINTS + SPEED_POINTS * frac);
        p.score += gain; p.lastGain = gain; p.lastCorrect = true; p.streak += 1; p.correctCount += 1;
      } else p.streak = 0;
    } else { p.streak = 0; p.totalTime += q.duration * 1000; }
  }
  const after = ranking(room);
  after.forEach((p) => { p.delta = (prevRank.get(p.id) || p.rank) - p.rank; });
  room.reveal = { correct: q.correct, counts, explanation: q.explanation, answered: room.answers.size, correctCount: after.filter((p) => p.lastCorrect).length };
  room.phase = 'reveal';
  room.endsAt = 0;
  emitRoom(room, true);
}
function finish(room) {
  clearTimeout(room.timer);
  room.phase = 'final';
  ranking(room);
  emitRoom(room);
}
function resetRoom(room) {
  clearTimeout(room.timer); room.qs = store.current();
  room.phase = 'lobby'; room.qIndex = -1; room.answers = new Map(); room.reveal = null;
  for (const p of room.players.values()) Object.assign(p, { score: 0, streak: 0, correctCount: 0, totalTime: 0, lastGain: 0, lastCorrect: false, delta: 0 });
  // quita a los desconectados
  for (const [id, p] of room.players) if (!p.connected) room.players.delete(id);
  emitRoom(room);
}

function publicBase(socket) {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL.replace(/\/$/, '');
  const h = socket.handshake.headers;
  const proto = (h['x-forwarded-proto'] || (socket.handshake.secure ? 'https' : 'http')).split(',')[0].trim();
  return `${proto}://${h['x-forwarded-host'] || h.host}`;
}

io.on('connection', (socket) => {
  let role = null, room = null, player = null;

  // ---------- ANFITRIÓN ----------
  socket.on('host:create', async (data, ack) => {
    if (typeof ack !== 'function') return;
    data = data || {};
    let r = data.code && rooms.get(String(data.code));
    if (!(r && r.hostToken === data.token)) r = createRoom();
    room = r; role = 'host'; room.hostSocket = socket.id; room.touched = Date.now();
    const base = publicBase(socket);
    const joinUrl = `${base}/?c=${room.code}`;
    const qr = await QRCode.toString(joinUrl, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#001433', light: '#ffffff' } });
    ack({ code: room.code, token: room.hostToken, joinUrl, base, qr });
    socket.emit('state', snapshot(room, null));
  });
  socket.on('host:sync', (_, ack) => { if (role === 'host' && typeof ack === 'function') ack(snapshot(room, null)); });
  socket.on('host:start', async () => {
    if (role !== 'host' || room.phase !== 'lobby' || room.players.size < 1 || room.starting) return;
    room.starting = true;
    try { room.qs = await store.refresh(); } finally { room.starting = false; } // preguntas vigentes al iniciar la partida (caché 30 s)
    if (room.phase === 'lobby' && room.players.size > 0) startQuestion(room);
  });
  socket.on('host:next', () => {
    if (role !== 'host') return;
    if (room.phase === 'reveal') startQuestion(room);
  });
  socket.on('host:skip', () => { if (role === 'host' && room.phase === 'question') closeQuestion(room); });
  socket.on('host:reset', () => { if (role === 'host') resetRoom(room); });
  socket.on('host:kick', (id) => {
    if (role !== 'host') return;
    const p = room.players.get(id);
    if (!p) return;
    if (p.socket) io.to(p.socket).emit('kicked');
    room.players.delete(id); room.answers.delete(id);
    emitLobbySoon(room); emitRoom(room);
  });

  // ---------- JUGADOR ----------
  socket.on('player:join', (data, ack) => {
    if (typeof ack !== 'function') return;
    data = data || {};
    const r = rooms.get(String(data.code || '').trim());
    if (!r) return ack({ ok: false, error: 'No encontramos esa sala. Revisa el código.' });
    let p = data.token && [...r.players.values()].find((x) => x.token === data.token);
    if (!p) {
      const name = cleanName(data.name);
      if (!name) return ack({ ok: false, error: 'Escribe un apodo.' });
      if (r.players.size >= MAX_PLAYERS) return ack({ ok: false, error: 'La sala está llena.' });
      let final = name, i = 2;
      const taken = (n) => [...r.players.values()].some((x) => x.name.toLowerCase() === n.toLowerCase());
      while (taken(final)) final = name.slice(0, 12) + ' ' + i++;
      p = { id: sha().slice(0, 6), token: sha(), name: final, avatar: cleanAvatar(data.avatar), score: 0, streak: 0, correctCount: 0, totalTime: 0, joined: Date.now(), lastGain: 0, delta: 0, rank: 0, connected: true, socket: socket.id };
      r.players.set(p.id, p);
    } else {
      p.connected = true; p.socket = socket.id; p.dcAt = 0;
    }
    role = 'player'; room = r; player = p; r.touched = Date.now();
    ack({ ok: true, token: p.token, id: p.id, code: r.code, name: p.name, avatar: p.avatar });
    socket.emit('state', snapshot(r, p));
    if (r.phase === 'lobby') emitLobbySoon(r); else emitProgress(r);
  });
  socket.on('player:avatar', (data) => {
    if (role !== 'player' || !player) return;
    if (data && data.avatar) player.avatar = cleanAvatar(data.avatar);
    if (room.phase === 'lobby') emitLobbySoon(room);
  });
  socket.on('player:sync', (_, ack) => { if (role === 'player' && player && typeof ack === 'function') ack(snapshot(room, player)); });
  // data: {c: opción 0-3, e: ms que el jugador vio transcurrir en su pantalla}. Responde con ack {ok}. Idempotente.
  socket.on('player:answer', (data, ack) => {
    const done = (ok) => typeof ack === 'function' && ack({ ok });
    if (role !== 'player' || !player || room.phase !== 'question') return done(room && room.answers && room.answers.has(player && player.id) ? 1 : 0);
    if (room.answers.has(player.id)) return done(1);
    const now = Date.now();
    if (now > room.endsAt + GRACE_MS) return done(0);
    const choice = parseInt(data && (data.c !== undefined ? data.c : data.choice), 10);
    if (!(choice >= 0 && choice < room.qs[room.qIndex].options.length)) return done(0);
    const dur = room.qs[room.qIndex].duration * 1000;
    const srv = Math.max(0, now - room.startAt);
    // Compensación de latencia: se cree al tiempo que reportó el cliente, pero nunca más de LAT_CREDIT_MS menos que el medido por el servidor.
    let e = Number.isFinite(+(data && data.e)) ? +data.e : srv;
    e = Math.min(Math.max(e, srv - LAT_CREDIT_MS), srv);
    room.answers.set(player.id, { choice, elapsed: Math.min(dur, Math.max(0, e)) });
    done(1);
    emitProgress(room);
    if (room.answers.size >= activeCount(room)) closeQuestion(room);
  });

  socket.on('disconnect', () => {
    if (!room) return;
    if (role === 'host' && room.hostSocket === socket.id) room.hostSocket = null;
    if (role === 'player' && player && player.socket === socket.id) {
      player.connected = false; player.socket = null; player.dcAt = Date.now();
      if (room.phase === 'lobby') emitLobbySoon(room);
      else if (room.phase === 'question') {
        emitProgress(room);
        const pr = room; // al vencer la gracia de reconexión, revisa si ya contestaron todos los activos
        setTimeout(() => { if (pr.phase === 'question' && pr.answers.size >= activeCount(pr) && activeCount(pr) > 0) closeQuestion(pr); }, DC_GRACE_MS + 50);
      }
    }
  });
});

setInterval(() => { // limpia salas viejas
  const now = Date.now();
  for (const [c, r] of rooms) if (now - r.touched > ROOM_TTL_MS && !r.hostSocket) { clearTimeout(r.timer); rooms.delete(c); }
}, 600000);

if (require.main === module) server.listen(PORT, () => console.log('Adivina el país mixto escuchando en :' + PORT));
module.exports = { server, io, rooms };
