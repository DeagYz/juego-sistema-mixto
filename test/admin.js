// Prueba del panel /admin con un GitHub falso: login, validación, guardado (commit con [skip render]), carga desde "GitHub",
// aplicación en la siguiente partida (no a media partida), límite de intentos.
const http = require('http'); const assert = require('assert'); const fs = require('fs'); const path = require('path');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const PORT = +process.env.PORT || 3300, GH = PORT + 1, PW = 'prueba-Secreta1';
let file = { content: Buffer.from(fs.readFileSync(path.join(__dirname, '..', 'questions.json'))).toString('base64'), sha: 'sha0' }, commits = [], tokenSeen = null;
const gh = http.createServer((req, res) => {
  let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => {
    tokenSeen = req.headers.authorization;
    if (!/^\/repos\/DeagYz\/juego-sistema-mixto\/contents\/questions\.json/.test(req.url)) { res.statusCode = 404; return res.end('{}'); }
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'GET') return res.end(JSON.stringify({ content: file.content, sha: file.sha, encoding: 'base64' }));
    const j = JSON.parse(b); if (j.sha !== file.sha) { res.statusCode = 409; return res.end('{}'); }
    file = { content: j.content, sha: 'sha' + (commits.length + 1) }; commits.push(j); res.end(JSON.stringify({ content: { sha: file.sha } }));
  });
}).listen(GH);
process.env.ADMIN_PASSWORD = PW; process.env.GITHUB_TOKEN = 'ghp_fake'; process.env.GITHUB_API = 'http://127.0.0.1:' + GH; process.env.GITHUB_REPO = 'DeagYz/juego-sistema-mixto'; process.env.GITHUB_BRANCH = 'master';
const { server } = require('../server'); const { io } = require('socket.io-client');
const U = 'http://127.0.0.1:' + PORT;
const call = async (p, o = {}, tok) => { const r = await fetch(U + p, { method: o.method || 'GET', headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: 'Bearer ' + tok } : {}) }, body: o.body ? JSON.stringify(o.body) : undefined }); return { s: r.status, j: await r.json().catch(() => ({})) }; };
(async () => {
  await new Promise((r) => server.listen(PORT, r));
  assert.strictEqual((await call('/admin/api/questions')).s, 401, 'sin token => 401');
  assert.strictEqual((await call('/admin/api/questions', {}, '9999999999999.abc')).s, 401, 'token falso');
  assert.strictEqual((await call('/admin/api/questions', {}, '1.' + 'x')).s, 401, 'token vencido/mal formado');
  const html = await fetch(U + '/admin'); assert.strictEqual(html.status, 200); assert(/Administrar preguntas/.test(await html.text()), 'página /admin');
  const lg = await call('/admin/api/login', { method: 'POST', body: { password: PW } }); assert.strictEqual(lg.s, 200); const T = lg.j.token; assert(T);
  const g = await call('/admin/api/questions', {}, T); assert.strictEqual(g.j.questions.length, 20); assert.strictEqual(g.j.info.source, 'GitHub'); console.log('login + lectura desde GitHub OK (20 preguntas)');
  // validación
  const base = g.j.questions; const bad = async (mut, re, label) => { const q = JSON.parse(JSON.stringify(base)); mut(q); const r = await call('/admin/api/questions', { method: 'PUT', body: { questions: q } }, T); assert.strictEqual(r.s, 400, label); assert(r.j.errors.some((e) => re.test(e)), label + ': ' + r.j.errors); };
  await bad((q) => { q[0].options = ['solo una']; q[0].correct = 0; }, /2 a 4 opciones/, '1 opción');
  await bad((q) => { q[0].options = ['a', 'b', 'c', 'd', 'e']; }, /2 a 4 opciones/, '5 opciones');
  await bad((q) => { q[1].correct = -1; }, /exactamente una respuesta correcta/, 'sin correcta');
  await bad((q) => { q[1].correct = 9; }, /exactamente una respuesta correcta/, 'correcta fuera de rango');
  await bad((q) => { q[2].options[1] = '  '; }, /vacías/, 'opción vacía');
  await bad((q) => { q[3].text = ''; }, /falta el texto/, 'sin texto');
  await bad((q) => { q[4].duration = 3; }, /5 a 120/, 'tiempo');
  await bad((q) => q.splice(0, 20), /al menos 1/, 'vacía');
  assert.strictEqual(commits.length, 0, 'nada inválido llegó a GitHub'); console.log('validación OK (8 casos inválidos rechazados, 0 commits)');
  // partida en curso con las preguntas originales
  const mkc = () => io(U, { transports: ['websocket'], forceNew: true });
  const host = mkc(); let hs; host.on('state', (s) => (hs = s)); const info = await new Promise((r) => host.emit('host:create', {}, r));
  const pl = mkc(); const jr = await new Promise((r) => pl.emit('player:join', { code: info.code, name: 'Ana', avatar: [1, 1, 1, 1, 0] }, r)); assert(jr.ok);
  host.emit('host:start'); await sleep(500); assert.strictEqual(hs.total, 20);
  // edición mientras hay partida: 2 preguntas, una de 3 opciones y otra de 2
  const nuevo = [{ kind: 'concepto', duration: 15, text: 'Pregunta nueva A', options: ['uno', 'dos', 'tres'], correct: 2, explanation: 'porque sí' }, { kind: 'pais', duration: 25, text: 'Pregunta nueva B', options: ['sí', 'no'], correct: 0, explanation: '' }];
  const sv = await call('/admin/api/questions', { method: 'PUT', body: { questions: nuevo } }, T);
  assert(sv.s === 200 && sv.j.committed === true, 'guardado y commit: ' + JSON.stringify(sv.j));
  assert.strictEqual(commits.length, 1); assert(/\[skip render\]/.test(commits[0].message), 'mensaje con [skip render]'); assert.strictEqual(commits[0].branch, 'master'); assert.strictEqual(commits[0].sha, 'sha0'); assert.strictEqual(tokenSeen, 'Bearer ghp_fake');
  assert.deepStrictEqual(JSON.parse(Buffer.from(commits[0].content, 'base64').toString()), nuevo, 'contenido commiteado');
  assert.strictEqual(hs.total, 20, 'la partida en curso conserva sus 20 preguntas'); console.log('commit a GitHub OK, mensaje:', JSON.stringify(commits[0].message));
  // siguiente partida usa las nuevas (reset + start)
  host.emit('host:reset'); await sleep(300); host.emit('host:start'); await sleep(800);
  assert.strictEqual(hs.total, 2, 'nueva partida con 2 preguntas'); console.log('partida nueva usa las preguntas editadas (total=' + hs.total + ') y la anterior no se alteró');
  // juega la pregunta de 3 opciones: opción 3 (índice 3) debe rechazarse, 2 aceptarse
  while (hs.phase !== 'question') await sleep(100);
  const a3 = await new Promise((r) => pl.emit('player:answer', { c: 3, e: 500 }, r)); assert.strictEqual(a3.ok, 0, 'opción inexistente rechazada');
  const a2 = await new Promise((r) => pl.emit('player:answer', { c: 2, e: 500 }, r)); assert.strictEqual(a2.ok, 1);
  while (hs.phase !== 'reveal') await sleep(100); assert.strictEqual(hs.reveal.correct, 2); console.log('pregunta de 3 opciones juega bien');
  // GitHub cambia por fuera (otra persona edita el archivo): admin y juego lo ven
  file = { content: Buffer.from(JSON.stringify([{ kind: 'concepto', duration: 10, text: 'Desde GitHub', options: ['a', 'b'], correct: 1, explanation: '' }])).toString('base64'), sha: 'shaExt' };
  const g2 = await call('/admin/api/questions', {}, T); assert.strictEqual(g2.j.questions[0].text, 'Desde GitHub'); console.log('cambio externo en GitHub se ve en el panel OK');
  // conflicto de sha: reintenta solo
  const sv2 = await call('/admin/api/questions', { method: 'PUT', body: { questions: nuevo } }, T); assert(sv2.j.committed && commits[commits.length - 1].sha === 'shaExt'); console.log('guardado con sha actualizado OK');
  // GitHub caído: se aplica en memoria con aviso, el juego sigue
  gh.close(); gh.closeAllConnections && gh.closeAllConnections();
  const sv3 = await call('/admin/api/questions', { method: 'PUT', body: { questions: nuevo } }, T); assert(sv3.s === 200 && sv3.j.committed === false && sv3.j.warning, 'aviso si GitHub falla'); console.log('GitHub caído: aviso sin romper OK');
  // límite de intentos
  let last; for (let i = 0; i < 6; i++) last = await call('/admin/api/login', { method: 'POST', body: { password: 'mal' } }); assert.strictEqual(last.s, 429, 'bloqueo tras 5 fallos'); console.log('límite de intentos OK (429)');
  assert.strictEqual((await call('/admin/api/login', { method: 'POST', body: { password: PW } })).s, 429, 'bloqueado incluso con la correcta'); 
  console.log('\nTODAS LAS PRUEBAS DE /admin PASARON'); process.exit(0);
})().catch((e) => { console.error('FALLÓ:', e); process.exit(1); });
