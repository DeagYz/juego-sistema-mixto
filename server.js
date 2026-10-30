'use strict';
const path = require('path');
const http = require('http');
const crypto = require('crypto');
const express = require('express');
const QRCode = require('qrcode');
const { Server } = require('socket.io');
const QUESTIONS = require('./questions');

const PORT = process.env.PORT || 3000;
const INTRO_MS = 3000;          // cuenta previa a cada pregunta
const GRACE_MS = 600;           // margen por latencia al cerrar la pregunta
const MAX_PLAYERS = 200;
const ROOM_TTL_MS = 8 * 3600 * 1000;
const BASE_POINTS = 600, SPEED_POINTS = 400; // acierto = 600 + hasta 400 por rapidez

const app = express();
const server = http.createServer(app);
const io = new Server(server, { pingInterval: 10000, pingTimeout: 20000, maxHttpBufferSize: 1e5 });

app.set('trust proxy', true);
app.use(express.static(path.join(__dirname, 'public'), { maxAge: '5m' }));
app.get('/healthz', (_, res) => res.json({ ok: true, rooms: rooms.size }));
app.get('/host', (_, res) => res.sendFile(path.join(__dirname, 'public', 'host.html')));
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
    created: Date.now(), touched: Date.now(),
  };
  rooms.set(room.code, room);
  return room;
}

const cleanName = (s) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, 14);
function cleanAvatar(a) {
  a = a || {};
  const int = (v, max) => { v = parseInt(v, 10); return Number.isFinite(v) && v >= 0 && v < max ? v : 0; };
  return { animal: int(a.animal, 16), color: int(a.color, 8), hat: int(a.hat, 5), body: int(a.body, 3), glasses: a.glasses ? 1 : 0 };
}

function ranking(room) {
  const arr = [...room.players.values()];
  arr.sort((a, b) => b.score - a.score || a.totalTime - b.totalTime || a.joined - b.joined);
  arr.forEach((p, i) => { p.rank = i + 1; });
  return arr;
}
const row = (p) => ({ id: p.id, name: p.name, avatar: p.avatar, score: p.score, rank: p.rank, gain: p.lastGain || 0, delta: p.delta || 0, streak: p.streak, connected: p.connected });

function publicQuestion(room) {
  const q = QUESTIONS[room.qIndex];
  if (!q) return null;
  return { n: room.qIndex + 1, total: QUESTIONS.length, kind: q.kind, text: q.text, options: q.options, duration: q.duration };
}

function snapshot(room, player) {
  const s = {
    phase: room.phase, code: room.code, total: QUESTIONS.length, now: Date.now(),
    count: room.players.size, qn: room.qIndex + 1,
  };
  const isHost = !player;
  if (room.phase === 'intro' || room.phase === 'question' || room.phase === 'reveal') {
    s.question = publicQuestion(room);
    s.endsAt = room.endsAt; s.startAt = room.startAt;
  }
  if (room.phase === 'question' || room.phase === 'intro') {
    s.answered = room.answers.size;
    s.active = activeCount(room);
  }
  if (room.phase === 'reveal') {
    s.reveal = room.reveal;
    const board = ranking(room);
    s.board = board.slice(0, isHost ? 10 : 5).map(row);
  }
  if (room.phase === 'final') {
    const board = ranking(room);
    s.board = board.slice(0, isHost ? 200 : 10).map(row);
  }
  if (isHost) {
    if (room.phase === 'lobby') s.players = [...room.players.values()].map((p) => ({ id: p.id, name: p.name, avatar: p.avatar, connected: p.connected }));
  } else {
    const p = player;
    ranking(room);
    s.you = { id: p.id, name: p.name, avatar: p.avatar, score: p.score, rank: p.rank, streak: p.streak, gain: p.lastGain || 0, delta: p.delta || 0, total: room.players.size };
    const a = room.answers.get(p.id);
    s.you.answered = !!a; s.you.choice = a ? a.choice : null;
    if (room.phase === 'reveal') { s.you.correct = !!p.lastCorrect; s.you.answeredThis = !!a; }
    if (room.phase === 'final') s.you.correctCount = p.correctCount;
  }
  return s;
}

const activeCount = (room) => [...room.players.values()].filter((p) => p.connected).length;

function emitRoom(room) {
  room.touched = Date.now();
  if (room.hostSocket) io.to(room.hostSocket).emit('state', snapshot(room, null));
  for (const p of room.players.values()) if (p.socket) io.to(p.socket).emit('state', snapshot(room, p));
}
let pending = new Map();
function emitLobbySoon(room) { // junta cambios del lobby (muchos jugadores entrando a la vez)
  if (pending.has(room.code)) return;
  pending.set(room.code, setTimeout(() => {
    pending.delete(room.code);
    if (room.phase === 'lobby') emitRoom(room);
  }, 150));
}
function emitProgress(room) {
  if (room.hostSocket) io.to(room.hostSocket).emit('progress', { answered: room.answers.size, active: activeCount(room) });
}

function startQuestion(room) {
  clearTimeout(room.timer);
  room.qIndex += 1;
  if (room.qIndex >= QUESTIONS.length) return finish(room);
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
  const q = QUESTIONS[room.qIndex];
  room.phase = 'question';
  room.startAt = Date.now();
  room.endsAt = room.startAt + q.duration * 1000;
  emitRoom(room);
  room.timer = setTimeout(() => closeQuestion(room), q.duration * 1000 + GRACE_MS);
}
function closeQuestion(room) {
  if (room.phase !== 'question') return;
  clearTimeout(room.timer);
  const q = QUESTIONS[room.qIndex];
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
  emitRoom(room);
}
function finish(room) {
  clearTimeout(room.timer);
  room.phase = 'final';
  ranking(room);
  emitRoom(room);
}
function resetRoom(room) {
  clearTimeout(room.timer);
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
    const qr = await QRCode.toString(joinUrl, { type: 'svg', margin: 1, errorCorrectionLevel: 'M', color: { dark: '#14213D', light: '#ffffff' } });
    ack({ code: room.code, token: room.hostToken, joinUrl, base, qr });
    socket.emit('state', snapshot(room, null));
  });
  socket.on('host:start', () => { if (role === 'host' && room.phase === 'lobby' && room.players.size > 0) startQuestion(room); });
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
      p = { id: sha().slice(0, 8), token: sha(), name: final, avatar: cleanAvatar(data.avatar), score: 0, streak: 0, correctCount: 0, totalTime: 0, joined: Date.now(), lastGain: 0, delta: 0, rank: 0, connected: true, socket: socket.id };
      r.players.set(p.id, p);
    } else {
      p.connected = true; p.socket = socket.id;
    }
    role = 'player'; room = r; player = p; r.touched = Date.now();
    ack({ ok: true, token: p.token, id: p.id, code: r.code });
    socket.emit('state', snapshot(r, p));
    if (r.phase === 'lobby') emitLobbySoon(r); else emitProgress(r);
  });
  socket.on('player:avatar', (data) => {
    if (role !== 'player' || !player) return;
    if (data && data.avatar) player.avatar = cleanAvatar(data.avatar);
    if (room.phase === 'lobby') emitLobbySoon(room);
    socket.emit('state', snapshot(room, player));
  });
  socket.on('player:answer', (data) => {
    if (role !== 'player' || !player || room.phase !== 'question') return;
    const now = Date.now();
    if (now > room.endsAt + GRACE_MS || room.answers.has(player.id)) return;
    const choice = parseInt(data && data.choice, 10);
    if (!(choice >= 0 && choice < 4)) return;
    room.answers.set(player.id, { choice, elapsed: Math.max(0, now - room.startAt) });
    socket.emit('state', snapshot(room, player));
    emitProgress(room);
    if (room.answers.size >= activeCount(room)) closeQuestion(room);
  });

  socket.on('disconnect', () => {
    if (!room) return;
    if (role === 'host' && room.hostSocket === socket.id) room.hostSocket = null;
    if (role === 'player' && player && player.socket === socket.id) {
      player.connected = false; player.socket = null;
      if (room.phase === 'lobby') emitLobbySoon(room);
      else if (room.phase === 'question') { emitProgress(room); if (room.answers.size >= activeCount(room) && activeCount(room) > 0) closeQuestion(room); }
    }
  });
});

setInterval(() => { // limpia salas viejas
  const now = Date.now();
  for (const [c, r] of rooms) if (now - r.touched > ROOM_TTL_MS && !r.hostSocket) { clearTimeout(r.timer); rooms.delete(c); }
}, 600000);

if (require.main === module) server.listen(PORT, () => console.log('Adivina el país mixto escuchando en :' + PORT));
module.exports = { server, io, rooms };
