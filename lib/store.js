'use strict';
// Preguntas editables: archivo questions.json del repo de GitHub (vía API de contenidos) con respaldo al archivo incluido.
const fs = require('fs');
const path = require('path');
const BUNDLED = path.join(__dirname, '..', 'questions.json');
const REPO = () => process.env.GITHUB_REPO || 'DeagYz/juego-sistema-mixto';
const BRANCH = () => process.env.GITHUB_BRANCH || 'master';
const FILE = 'questions.json';
const CACHE_MS = 30000;
const LIMITS = { maxQ: 60, text: 400, opt: 200, expl: 700 };

function validate(list) {
  const errors = [];
  if (!Array.isArray(list)) return { errors: ['El contenido debe ser una lista de preguntas.'], clean: null };
  if (list.length < 1) errors.push('Debe haber al menos 1 pregunta.');
  if (list.length > LIMITS.maxQ) errors.push(`Máximo ${LIMITS.maxQ} preguntas.`);
  const clean = list.map((q, i) => {
    const n = `Pregunta ${i + 1}`;
    q = q && typeof q === 'object' ? q : {};
    const text = String(q.text == null ? '' : q.text).trim();
    const options = Array.isArray(q.options) ? q.options.map((o) => String(o == null ? '' : o).trim()) : [];
    const correct = Number.isInteger(q.correct) ? q.correct : parseInt(q.correct, 10);
    const duration = Number.isInteger(q.duration) ? q.duration : parseInt(q.duration, 10);
    const kind = q.kind === 'pais' ? 'pais' : 'concepto';
    const explanation = String(q.explanation == null ? '' : q.explanation).trim();
    if (!text) errors.push(`${n}: falta el texto.`);
    if (text.length > LIMITS.text) errors.push(`${n}: el texto pasa de ${LIMITS.text} caracteres.`);
    if (options.length < 2 || options.length > 4) errors.push(`${n}: debe tener de 2 a 4 opciones.`);
    if (options.some((o) => !o)) errors.push(`${n}: hay opciones vacías.`);
    if (options.some((o) => o.length > LIMITS.opt)) errors.push(`${n}: una opción pasa de ${LIMITS.opt} caracteres.`);
    if (!(correct >= 0 && correct < options.length)) errors.push(`${n}: debe haber exactamente una respuesta correcta.`);
    if (!(duration >= 5 && duration <= 120)) errors.push(`${n}: el tiempo debe ser de 5 a 120 segundos.`);
    if (explanation.length > LIMITS.expl) errors.push(`${n}: el dato curioso pasa de ${LIMITS.expl} caracteres.`);
    return { kind, duration, text, options, correct, explanation };
  });
  return { errors, clean: errors.length ? null : clean };
}

const bundled = () => JSON.parse(fs.readFileSync(BUNDLED, 'utf8'));
let current = (() => { try { return validate(bundled()).clean || bundled(); } catch { return []; } })();
let memoryOnly = false;
let source = 'archivo incluido', sha = null, fetchedAt = 0, inflight = null, lastError = null;

const gh = (p, opt = {}) => fetch((process.env.GITHUB_API || 'https://api.github.com') + '/repos/' + REPO() + p, {
  ...opt, signal: AbortSignal.timeout(4000),
  headers: { 'User-Agent': 'adivina-pais-mixto', Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(process.env.GITHUB_TOKEN ? { Authorization: 'Bearer ' + process.env.GITHUB_TOKEN } : {}), ...(opt.headers || {}) },
});

async function load() {
  const r = await gh(`/contents/${FILE}?ref=${encodeURIComponent(BRANCH())}`);
  if (!r.ok) throw new Error('GitHub ' + r.status);
  const j = await r.json();
  const list = JSON.parse(Buffer.from(j.content || '', 'base64').toString('utf8'));
  const v = validate(list);
  if (!v.clean) throw new Error('questions.json inválido en GitHub: ' + v.errors[0]);
  return { list: v.clean, sha: j.sha };
}

// Devuelve las preguntas vigentes; consulta GitHub como máximo cada 30 s. Nunca lanza: si falla, usa lo último bueno.
async function refresh(force) {
  if (memoryOnly) return current; // edición sin GITHUB_TOKEN: no la pises con lo de GitHub
  if (!force && Date.now() - fetchedAt < CACHE_MS) return current;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { list, sha: s } = await load();
      current = list; sha = s; source = 'GitHub'; lastError = null;
    } catch (e) { lastError = String(e.message || e); }
    fetchedAt = Date.now(); inflight = null; return current;
  })();
  return inflight;
}

async function save(list) {
  const v = validate(list);
  if (!v.clean) return { ok: false, errors: v.errors };
  current = v.clean; fetchedAt = Date.now(); // aplica de inmediato a las próximas partidas
  if (!process.env.GITHUB_TOKEN) { memoryOnly = true; source = 'memoria (sin GITHUB_TOKEN)'; return { ok: true, committed: false, warning: 'Guardado solo en memoria: falta GITHUB_TOKEN, se perderá al reiniciar el servidor.' }; }
  const content = Buffer.from(JSON.stringify(v.clean, null, 2) + '\n').toString('base64');
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      let cur = null;
      const g = await gh(`/contents/${FILE}?ref=${encodeURIComponent(BRANCH())}`);
      if (g.ok) cur = (await g.json()).sha; else if (g.status !== 404) throw new Error('GitHub ' + g.status);
      const r = await gh(`/contents/${FILE}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: 'Actualizar preguntas desde /admin [skip render]', content, branch: BRANCH(), ...(cur ? { sha: cur } : {}) }) });
      if (r.status === 409 || r.status === 422) continue; // sha desactualizado: reintenta
      if (!r.ok) throw new Error('GitHub ' + r.status + ' ' + (await r.text()).slice(0, 120));
      sha = (await r.json()).content.sha; source = 'GitHub'; lastError = null;
      return { ok: true, committed: true };
    } catch (e) { lastError = String(e.message || e); if (attempt) return { ok: true, committed: false, warning: 'Se aplicó en memoria pero no se pudo guardar en GitHub (' + lastError + '). Reintenta o usa Exportar.' }; }
  }
  return { ok: true, committed: false, warning: 'No se pudo guardar en GitHub (conflicto). Reintenta.' };
}

module.exports = { validate, refresh, save, current: () => current, info: () => ({ source, lastError, fetchedAt, sha }), LIMITS };
