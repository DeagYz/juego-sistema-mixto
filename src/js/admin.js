(function () {
  'use strict';
  var app = document.getElementById('app');
  var TOKEN = sessionStorage.getItem('mixto_admin') || '';
  var LT = ['A', 'B', 'C', 'D'], LC = ['#2B6DFF', '#58CDD4', '#5337ff', '#b8c6e8'];
  var S = { qs: [], base: '', open: 0, dirty: false, info: {}, github: false, live: 0, lim: { text: 400, opt: 200, expl: 700, maxQ: 60 }, msg: '', msgc: '', busy: false, preview: -1 };
  var esc = function (s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); };
  var $ = function (s, el) { return (el || document).querySelector(s); };

  function api(path, opt) {
    opt = opt || {};
    var h = { 'Content-Type': 'application/json' }; if (TOKEN) h.Authorization = 'Bearer ' + TOKEN;
    return fetch('/admin/api' + path, { method: opt.method || 'GET', headers: h, body: opt.body ? JSON.stringify(opt.body) : undefined })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (r.status === 401 && TOKEN) { TOKEN = ''; sessionStorage.removeItem('mixto_admin'); loginView('Sesión vencida. Inicia sesión de nuevo.'); } return { ok: r.ok, status: r.status, j: j }; }); })
      .catch(function () { return { ok: false, status: 0, j: { error: 'Sin conexión con el servidor.' } }; });
  }

  // ---------- validación (misma regla que el servidor) ----------
  function errs(q) {
    var e = [], L = S.lim;
    if (!String(q.text).trim()) e.push('Falta el texto de la pregunta.');
    if (String(q.text).length > L.text) e.push('El texto pasa de ' + L.text + ' caracteres.');
    if (q.options.length < 2 || q.options.length > 4) e.push('Debe tener de 2 a 4 opciones.');
    if (q.options.some(function (o) { return !String(o).trim(); })) e.push('Hay opciones vacías.');
    if (q.options.some(function (o) { return String(o).length > L.opt; })) e.push('Una opción pasa de ' + L.opt + ' caracteres.');
    if (!(q.correct >= 0 && q.correct < q.options.length)) e.push('Marca exactamente una respuesta correcta.');
    var d = +q.duration; if (!(Number.isInteger(d) && d >= 5 && d <= 120)) e.push('El tiempo debe ser de 5 a 120 segundos.');
    if (String(q.hint || '').length > (L.hint || 120)) e.push('La pista pasa de ' + (L.hint || 120) + ' caracteres.');
    if (String(q.explanation).length > L.expl) e.push('El dato curioso pasa de ' + L.expl + ' caracteres.');
    return e;
  }
  var allErr = function () { return S.qs.map(errs); };
  var nBad = function () { return allErr().filter(function (e) { return e.length; }).length; };
  var snap = function () { return JSON.stringify(S.qs); };
  function markDirty() { S.dirty = snap() !== S.base; S.msg = S.dirty ? 'Cambios sin guardar' : ''; S.msgc = S.dirty ? 'dirty' : ''; }
  function norm(list) {
    return list.map(function (q) {
      return { kind: q.kind === 'pais' ? 'pais' : 'concepto', duration: parseInt(q.duration, 10) || 20, text: String(q.text == null ? '' : q.text), options: (Array.isArray(q.options) ? q.options : []).slice(0, 4).map(function (o) { return String(o == null ? '' : o); }), correct: parseInt(q.correct, 10), hint: String(q.hint == null ? '' : q.hint), explanation: String(q.explanation == null ? '' : q.explanation) };
    });
  }

  // ---------- login ----------
  function loginView(m) {
    app.innerHTML = '<form class="login" id="lf"><i class="iuv" style="--h:46px"></i><h1>Administrar preguntas</h1><p>Adivina el país mixto · Expoferia</p>' +
      '<input id="pw" type="password" placeholder="Contraseña" autocomplete="current-password" autofocus><div class="err" id="le">' + esc(m || '') + '</div><button class="btn" id="lb">Entrar</button></form>';
    $('#lf').onsubmit = function (ev) {
      ev.preventDefault(); var b = $('#lb'); b.disabled = true;
      api('/login', { method: 'POST', body: { password: $('#pw').value } }).then(function (r) {
        b.disabled = false;
        if (r.ok) { TOKEN = r.j.token; sessionStorage.setItem('mixto_admin', TOKEN); load(); } else $('#le').textContent = r.j.error || 'No se pudo entrar.';
      });
    };
  }

  function load(keep) {
    api('/questions').then(function (r) {
      if (!r.ok) { if (r.status !== 401) loginView(r.j.error); return; }
      S.qs = norm(r.j.questions); S.base = snap(); S.dirty = false; S.info = r.j.info || {}; S.github = !!r.j.github; S.live = r.j.activeGames || 0; S.lim = r.j.limits || S.lim;
      if (!keep) { S.open = 0; S.msg = ''; S.msgc = ''; }
      draw();
    });
  }

  // ---------- vista principal ----------
  function draw() {
    var E = allErr(), bad = E.filter(function (e) { return e.length; }).length;
    var h = '<header class="top"><i class="iuv"></i><h1>Preguntas del juego<small>Adivina el país mixto · IUV Derecho</small></h1><div class="bar">' +
      '<span class="stat ' + (S.qs.length === 20 ? 'ok' : 'warn') + '">' + S.qs.length + ' preguntas</span>' +
      (bad ? '<span class="stat bad">' + bad + ' con errores</span>' : '') + '<button class="btn ghost sm" id="out">Salir</button></div></header><main>';
    if (!S.github) h += '<div class="notice">⚠️ El servidor no tiene <b>GITHUB_TOKEN</b>: los cambios solo se guardan en memoria y se pierden al reiniciar. Usa <b>Exportar</b> como respaldo.</div>';
    if (S.live) h += '<div class="notice info">🎮 Hay ' + S.live + (S.live === 1 ? ' partida en curso' : ' partidas en curso') + '. Los cambios se aplican a partir de la <b>siguiente partida</b>; las que ya empezaron no se alteran.</div>';
    h += '<div class="tools"><button class="btn sm" id="add"' + (S.qs.length >= S.lim.maxQ ? ' disabled' : '') + '>＋ Agregar pregunta</button><button class="btn ghost sm" id="exp">⬇ Exportar JSON</button><button class="btn ghost sm" id="imp">⬆ Importar JSON</button><button class="btn ghost sm" id="rel"' + (S.dirty ? '' : ' disabled') + '>↺ Descartar cambios</button><input type="file" id="file" accept="application/json,.json" hidden></div>';
    S.qs.forEach(function (q, i) { h += card(q, i, E[i]); });
    h += '</main><div class="savebar"><span class="msg ' + S.msgc + '">' + esc(S.msg || (S.info.source ? 'Fuente: ' + S.info.source : '')) + '</span><button class="btn" id="save"' + (!S.dirty || bad || S.busy ? ' disabled' : '') + '>' + (S.busy ? 'Guardando…' : '💾 Guardar cambios') + '</button></div>';
    if (S.preview >= 0 && S.qs[S.preview]) h += previewHtml(S.qs[S.preview], S.preview);
    var sy = window.scrollY; app.innerHTML = h; window.scrollTo(0, sy); wire();
  }
  function card(q, i, e) {
    var open = S.open === i, c = q.options[q.correct];
    var h = '<section class="card' + (open ? ' open' : '') + (e.length ? ' invalid' : '') + '" data-i="' + i + '" draggable="false"><div class="head"><span class="grip" data-grip title="Arrastra para reordenar">⠿</span><span class="num">' + (i + 1) + '</span>' +
      '<button class="sum" data-toggle><b>' + esc(q.text || '(sin texto)') + '</b><small><span class="tag' + (q.kind === 'pais' ? ' p' : '') + '">' + (q.kind === 'pais' ? '¿Quién soy?' : 'Concepto') + '</span>' + q.duration + ' s · ✔ ' + esc(c == null ? '—' : String(c).slice(0, 40)) + (e.length ? ' · ⚠️ ' + e.length : '') + '</small></button>' +
      '<div class="mv"><button data-up title="Subir"' + (i === 0 ? ' disabled' : '') + '>▲</button><button data-down title="Bajar"' + (i === S.qs.length - 1 ? ' disabled' : '') + '>▼</button></div></div>';
    if (open) {
      h += '<div class="edit"><label class="f">Pregunta</label><textarea data-f="text" maxlength="' + (S.lim.text + 100) + '">' + esc(q.text) + '</textarea>' +
        '<label class="f">Opciones (marca la correcta)</label>';
      q.options.forEach(function (o, k) {
        h += '<div class="opt' + (q.correct === k ? ' right' : '') + '"><input type="radio" name="c' + i + '" data-c="' + k + '"' + (q.correct === k ? ' checked' : '') + ' aria-label="Correcta"><span class="ltr" style="background:' + LC[k] + (k === 3 ? ';color:#001433' : '') + '">' + LT[k] + '</span><input type="text" data-o="' + k + '" value="' + esc(o) + '" placeholder="Opción ' + LT[k] + '"><button class="x" data-rm="' + k + '" title="Quitar opción"' + (q.options.length <= 2 ? ' disabled' : '') + '>✕</button></div>';
      });
      if (q.options.length < 4) h += '<button class="btn ghost sm" data-addopt>＋ Agregar opción</button>';
      h += '<div class="row2"><div><label class="f">Tiempo (segundos)</label><input type="number" min="5" max="120" step="1" data-f="duration" value="' + esc(q.duration) + '" inputmode="numeric"></div>' +
        '<div><label class="f">Tipo</label><select data-f="kind"><option value="concepto"' + (q.kind === 'concepto' ? ' selected' : '') + '>Concepto</option><option value="pais"' + (q.kind === 'pais' ? ' selected' : '') + '>¿Quién soy? (país)</option></select></div></div>' +
        '<label class="f">Pista (opcional, corta; aparece a los 5 s sin dar la respuesta)</label><input data-f="hint" maxlength="120" placeholder="Ej.: Piensa en la pirámide normativa" value="' + esc(q.hint || '') + '">' +
        '<label class="f">Dato curioso / explicación (se muestra al revelar)</label><textarea data-f="explanation">' + esc(q.explanation) + '</textarea>';
      if (e.length) h += '<div class="qerr">' + e.map(function (m) { return '<div>' + esc(m) + '</div>'; }).join('') + '</div>';
      h += '<div class="act"><button class="btn sm" data-prev>👁 Vista previa</button><button class="btn danger sm" data-del>🗑 Eliminar</button></div></div>';
    }
    return h + '</section>';
  }
  function previewHtml(q, i) {
    return '<div class="modal" id="pvm"><div class="pv"><div class="meta"><span>Pregunta ' + (i + 1) + ' / ' + S.qs.length + ' · ' + (q.kind === 'pais' ? '¿Quién soy?' : 'Concepto') + '</span><span class="timer">' + esc(q.duration) + '</span></div><div class="q">' + esc(q.text || '(sin texto)') + '</div>' +
      q.options.map(function (o, k) { return '<div class="o c' + k + (k === q.correct ? ' right' : '') + '"><span class="l">' + LT[k] + '</span>' + esc(o || '(vacía)') + (k === q.correct ? ' ✔' : '') + '</div>'; }).join('') +
      (q.hint ? '<div class="ex"><b>💡 Pista:</b> ' + esc(q.hint) + '</div>' : '') + (q.explanation ? '<div class="ex"><b>Dato:</b> ' + esc(q.explanation) + '</div>' : '') + '<div class="cl"><button class="btn sm" id="pvc">Cerrar</button></div></div></div>';
  }

  function wire() {
    $('#out').onclick = function () { if (S.dirty && !confirm('Hay cambios sin guardar. ¿Salir de todos modos?')) return; TOKEN = ''; sessionStorage.removeItem('mixto_admin'); loginView(); };
    $('#add').onclick = function () { S.qs.push({ kind: 'concepto', duration: 20, text: '', options: ['', '', '', ''], correct: -1, hint: '', explanation: '' }); S.open = S.qs.length - 1; markDirty(); draw(); var el = document.querySelector('.card.open'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' }); };
    $('#exp').onclick = exportJson;
    $('#imp').onclick = function () { $('#file').click(); };
    $('#file').onchange = importJson;
    $('#rel').onclick = function () { if (confirm('¿Descartar todos los cambios sin guardar?')) load(); };
    $('#save').onclick = save;
    var pc = $('#pvc'); if (pc) { pc.onclick = function () { S.preview = -1; draw(); }; $('#pvm').onclick = function (ev) { if (ev.target.id === 'pvm') { S.preview = -1; draw(); } }; }
    document.querySelectorAll('.card').forEach(function (el) {
      var i = +el.dataset.i, q = S.qs[i];
      var on = function (sel, fn) { var n = $(sel, el); if (n) n.onclick = fn; };
      on('[data-toggle]', function () { S.open = S.open === i ? -1 : i; draw(); });
      on('[data-up]', function () { move(i, i - 1); });
      on('[data-down]', function () { move(i, i + 1); });
      on('[data-prev]', function () { S.preview = i; draw(); });
      on('[data-del]', function () { if (!confirm('¿Eliminar la pregunta ' + (i + 1) + '?')) return; S.qs.splice(i, 1); S.open = -1; markDirty(); draw(); });
      on('[data-addopt]', function () { q.options.push(''); markDirty(); draw(); });
      el.querySelectorAll('[data-rm]').forEach(function (b) { b.onclick = function () { var k = +b.dataset.rm; q.options.splice(k, 1); if (q.correct === k) q.correct = -1; else if (q.correct > k) q.correct--; markDirty(); draw(); }; });
      el.querySelectorAll('[data-c]').forEach(function (r) { r.onchange = function () { q.correct = +r.dataset.c; markDirty(); draw(); }; });
      el.querySelectorAll('[data-o]').forEach(function (inp) { inp.oninput = function () { q.options[+inp.dataset.o] = inp.value; light(i); }; });
      el.querySelectorAll('[data-f]').forEach(function (inp) { inp.oninput = inp.onchange = function () { var f = inp.dataset.f; q[f] = f === 'duration' ? inp.value : inp.value; light(i); }; });
      // arrastrar para reordenar (escritorio): solo desde el asa ⠿
      var grip = $('[data-grip]', el);
      if (grip) {
        grip.onmousedown = function () { el.draggable = true; };
        el.ondragstart = function (ev) { if (!el.draggable) { ev.preventDefault(); return; } ev.dataTransfer.setData('text/plain', String(i)); ev.dataTransfer.effectAllowed = 'move'; };
        el.ondragend = function () { el.draggable = false; document.querySelectorAll('.dragover').forEach(function (n) { n.classList.remove('dragover'); }); };
      }
      el.ondragover = function (ev) { ev.preventDefault(); el.classList.add('dragover'); };
      el.ondragleave = function () { el.classList.remove('dragover'); };
      el.ondrop = function (ev) { ev.preventDefault(); var from = parseInt(ev.dataTransfer.getData('text/plain'), 10); if (from >= 0 && from !== i) move(from, i); else draw(); };
    });
  }
  // actualiza resumen/errores/botón sin redibujar (para no perder el foco al escribir)
  function light(i) {
    markDirty();
    var el = document.querySelector('.card[data-i="' + i + '"]'), q = S.qs[i], e = errs(q);
    if (el) {
      el.classList.toggle('invalid', e.length > 0);
      var b = $('.sum b', el); if (b) b.textContent = q.text || '(sin texto)';
      var er = $('.qerr', el); if (er) er.remove();
      if (e.length) { var d = document.createElement('div'); d.className = 'qerr'; d.innerHTML = e.map(function (m) { return '<div>' + esc(m) + '</div>'; }).join(''); var act = $('.act', el); act.parentNode.insertBefore(d, act); }
    }
    var bad = nBad(), sv = $('#save'); if (sv) sv.disabled = !S.dirty || bad > 0 || S.busy;
    var m = $('.savebar .msg'); if (m) { m.className = 'msg ' + S.msgc; m.textContent = S.msg || ''; }
    var rl = $('#rel'); if (rl) rl.disabled = !S.dirty;
    var st = document.querySelectorAll('.stat'); if (st[1] || bad) { /* contador de errores se actualiza al redibujar */ }
  }
  function move(a, b) {
    if (b < 0 || b >= S.qs.length) return;
    var q = S.qs.splice(a, 1)[0]; S.qs.splice(b, 0, q);
    if (S.open === a) S.open = b; else if (S.open >= Math.min(a, b) && S.open <= Math.max(a, b)) S.open += a < b ? -1 : 1;
    markDirty(); draw();
  }

  function save() {
    if (S.busy || nBad()) return;
    S.busy = true; S.msg = 'Guardando…'; S.msgc = ''; draw();
    api('/questions', { method: 'PUT', body: { questions: S.qs.map(function (q) { return { kind: q.kind, duration: parseInt(q.duration, 10), text: q.text.trim(), options: q.options.map(function (o) { return o.trim(); }), correct: q.correct, hint: (q.hint || '').trim(), explanation: q.explanation.trim() }; }) } }).then(function (r) {
      S.busy = false;
      if (r.ok) {
        S.qs = norm(S.qs.map(function (q) { q.text = q.text.trim(); q.options = q.options.map(function (o) { return o.trim(); }); q.explanation = q.explanation.trim(); q.hint = (q.hint || '').trim(); return q; })); S.base = snap(); S.dirty = false;
        S.msg = r.j.committed ? '✔ Guardado en GitHub. Aplica desde la próxima partida.' : '⚠️ ' + (r.j.warning || 'Guardado parcialmente.'); S.msgc = r.j.committed ? 'ok' : 'bad';
      } else { S.msg = (r.j.errors && r.j.errors[0]) || r.j.error || 'No se pudo guardar.'; S.msgc = 'bad'; }
      draw();
    });
  }
  function exportJson() {
    var blob = new Blob([JSON.stringify(S.qs, null, 2) + '\n'], { type: 'application/json' });
    var a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'preguntas-mixto-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }
  function importJson(ev) {
    var f = ev.target.files[0]; if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      try {
        var j = JSON.parse(rd.result); if (j && !Array.isArray(j) && Array.isArray(j.questions)) j = j.questions;
        if (!Array.isArray(j) || !j.length) throw new Error('El archivo debe ser una lista de preguntas.');
        if (j.length > S.lim.maxQ) throw new Error('Máximo ' + S.lim.maxQ + ' preguntas.');
        if (S.dirty && !confirm('Se reemplazarán las preguntas actuales (sin guardar). ¿Continuar?')) return;
        S.qs = norm(j); S.open = 0; markDirty(); var b = nBad();
        S.msg = 'Importadas ' + S.qs.length + ' preguntas' + (b ? ' (' + b + ' con errores por corregir)' : '') + '. Revisa y pulsa Guardar.'; S.msgc = b ? 'bad' : 'dirty'; if (!S.dirty) S.msg = 'El archivo es igual a lo guardado.';
        draw();
      } catch (e) { alert('No se pudo importar: ' + e.message); }
    };
    rd.readAsText(f); ev.target.value = '';
  }
  window.addEventListener('beforeunload', function (e) { if (S.dirty) { e.preventDefault(); e.returnValue = ''; } });
  if (TOKEN) load(); else loginView();
})();
