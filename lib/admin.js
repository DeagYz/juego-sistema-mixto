'use strict';
// Panel /admin: contraseña (ADMIN_PASSWORD) → token firmado de 12 h; API para leer/guardar preguntas.
const crypto = require('crypto');
const express = require('express');
const TTL = 12 * 3600 * 1000;
const sha = (s) => crypto.createHash('sha256').update(s).digest();
const safeEq = (a, b) => crypto.timingSafeEqual(sha(String(a)), sha(String(b)));
const sign = (exp) => crypto.createHmac('sha256', sha('admin:' + process.env.ADMIN_PASSWORD)).update(String(exp)).digest('base64url');

exports.mount = function mount(app, { store, rooms }) {
  const fails = new Map(); // ip -> {n, until}
  const wait = (ip) => { const f = fails.get(ip); return f && f.n >= 5 && f.until > Date.now() ? Math.ceil((f.until - Date.now()) / 1000) : 0; };
  const auth = (req, res, next) => {
    if (!process.env.ADMIN_PASSWORD) return res.status(503).json({ error: 'El panel está desactivado: falta ADMIN_PASSWORD en el servidor.' });
    const m = /^Bearer (\d+)\.([\w-]+)$/.exec(req.headers.authorization || '');
    if (m && +m[1] > Date.now() && safeEq(m[2], sign(m[1]))) return next();
    res.status(401).json({ error: 'Sesión vencida. Inicia sesión de nuevo.' });
  };
  const api = express.Router();
  api.use(express.json({ limit: '300kb' }));
  api.use((req, res, next) => { res.setHeader('Cache-Control', 'no-store'); res.setHeader('X-Robots-Tag', 'noindex'); next(); });
  api.get('/status', (req, res) => res.json({ enabled: !!process.env.ADMIN_PASSWORD, github: !!process.env.GITHUB_TOKEN }));
  api.post('/login', (req, res) => {
    if (!process.env.ADMIN_PASSWORD) return res.status(503).json({ error: 'El panel está desactivado: falta ADMIN_PASSWORD en el servidor.' });
    const ip = req.ip, w = wait(ip);
    if (w) return res.status(429).json({ error: `Demasiados intentos. Espera ${w} s.` });
    const pw = req.body && typeof req.body.password === 'string' ? req.body.password : '';
    if (!safeEq(pw, process.env.ADMIN_PASSWORD)) {
      const f = fails.get(ip) || { n: 0, until: 0 }; f.n += 1; f.until = Date.now() + 5 * 60 * 1000; fails.set(ip, f);
      return res.status(401).json({ error: 'Contraseña incorrecta.' });
    }
    fails.delete(ip);
    const exp = Date.now() + TTL;
    res.json({ token: `${exp}.${sign(exp)}` });
  });
  api.get('/questions', auth, async (req, res) => {
    const list = await store.refresh(true);
    const live = [...rooms().values()].filter((r) => r.phase !== 'lobby' && r.phase !== 'final').length;
    res.json({ questions: list, info: store.info(), github: !!process.env.GITHUB_TOKEN, activeGames: live, limits: store.LIMITS });
  });
  api.put('/questions', auth, async (req, res) => {
    const r = await store.save(req.body && req.body.questions);
    res.status(r.ok ? 200 : 400).json(r);
  });
  api.use((err, req, res, next) => res.status(400).json({ error: 'Datos inválidos.' }));
  app.use('/admin/api', api);
};
