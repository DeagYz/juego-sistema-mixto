(function () {
  const app = document.getElementById('app');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const LET = 'ABCD', SHAPE = ['▲', '◆', '●', '■'];
  const params = new URLSearchParams(location.search);
  const socket = io({ transports: ['websocket', 'polling'] });
  const store = { get: (k) => { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } }, set: (k, v) => localStorage.setItem(k, JSON.stringify(v)) };
  let me = store.get('mixto_me') || {}; // {code, token, name, avatar}
  let av = me.avatar || { animal: Math.floor(Math.random() * 16), color: Math.floor(Math.random() * 8), hat: 0, body: 0, glasses: 0 };
  let name = me.name || '';
  let code = (params.get('c') || me.code || '').replace(/\D/g, '');
  let joined = false, S = null, offset = 0, raf = 0, editing = false, err = '';
  const logo = '<div class="brand serif"><span class="mix"><i></i><i></i><b></b></span><span>Adivina el país mixto</span></div>';

  socket.on('connect', () => { if (me.token && me.code && (!params.get('c') || params.get('c') === me.code)) join(true); else renderJoin(); });
  socket.on('state', (s) => { S = s; offset = s.now - Date.now(); if (joined) render(); });
  socket.on('kicked', () => { joined = false; me.token = null; store.set('mixto_me', me); err = 'El anfitrión te sacó de la sala.'; renderJoin(); });

  function join(resume) {
    socket.emit('player:join', { code: resume ? me.code : code, name, avatar: av, token: resume ? me.token : undefined }, (r) => {
      if (!r.ok) {
        err = r.error || 'No se pudo entrar';
        if (resume) { me.token = null; store.set('mixto_me', me); }
        joined = false; return renderJoin();
      }
      joined = true; err = '';
      me = { code: r.code, token: r.token, name, avatar: av }; store.set('mixto_me', me);
    });
  }

  // ----- editor de avatar -----
  function editor() {
    const A = Avatar;
    const row = (t, id, items) => `<div class="row"><div class="t">${t}</div><div class="pick" id="${id}">${items}</div></div>`;
    return `<div class="card preview"><div id="prev">${A.html(av, 120)}</div></div>
      <div class="card edit">
        ${row('Animal', 'p-animal', A.ANIMALS.map((a, i) => `<button class="pk ${av.animal === i ? 'sel' : ''}" data-k="animal" data-v="${i}">${a}</button>`).join(''))}
        ${row('Color', 'p-color', A.COLORS.map((c, i) => `<button class="pk sw ${av.color === i ? 'sel' : ''}" data-k="color" data-v="${i}" style="background:${c}" aria-label="color ${i + 1}"></button>`).join(''))}
        ${row('Sombrero', 'p-hat', A.HATS.map((h, i) => `<button class="pk txt ${av.hat === i ? 'sel' : ''}" data-k="hat" data-v="${i}">${h.name}</button>`).join(''))}
        ${row('Traje', 'p-body', A.BODIES.map((h, i) => `<button class="pk txt ${av.body === i ? 'sel' : ''}" data-k="body" data-v="${i}">${h.name}</button>`).join(''))}
        ${row('Extra', 'p-gl', `<button class="pk txt ${av.glasses ? '' : 'sel'}" data-k="glasses" data-v="0">Sin lentes</button><button class="pk txt ${av.glasses ? 'sel' : ''}" data-k="glasses" data-v="1">🕶 Lentes</button>`)}
      </div>`;
  }
  function bindEditor(onChange) {
    app.querySelectorAll('.pk').forEach((b) => b.onclick = () => {
      av[b.dataset.k] = parseInt(b.dataset.v, 10);
      const sc = {}; app.querySelectorAll('.pick').forEach((p) => sc[p.id] = p.scrollLeft);
      onChange(); app.querySelectorAll('.pick').forEach((p) => { if (sc[p.id]) p.scrollLeft = sc[p.id]; });
    });
  }

  function renderJoin() {
    cancelAnimationFrame(raf);
    const keep = { n: (document.getElementById('nick') || {}).value, c: (document.getElementById('code') || {}).value };
    if (keep.n != null) name = keep.n; if (keep.c != null) code = keep.c.replace(/\D/g, '');
    app.innerHTML = `${logo}<h1>¡Únete al <span>juego</span>!</h1><p class="sub">Sistema Jurídico Mixto · Expoferia</p>
      ${code && params.get('c') ? '' : `<div class="field"><label>Código de sala</label><input id="code" class="code-in" inputmode="numeric" maxlength="6" placeholder="0000" value="${esc(code)}"></div>`}
      <div class="field"><label>Tu apodo</label><input id="nick" maxlength="14" placeholder="Ej. Lic. Morado" autocomplete="off" value="${esc(name)}"></div>
      ${editor()}
      <div class="err" id="err">${esc(err)}</div>
      <button class="btn" id="go" style="font-size:20px">Entrar ▶</button>`;
    const refresh = () => { const sy = window.scrollY; const n = document.getElementById('nick').value; name = n; renderJoin(); document.getElementById('nick').value = n; window.scrollTo(0, sy); };
    bindEditor(refresh);
    document.getElementById('go').onclick = () => {
      const c = document.getElementById('code'); if (c) code = c.value.replace(/\D/g, '');
      name = document.getElementById('nick').value.trim();
      if (!code) { err = 'Escribe el código de sala (lo ves en la pantalla grande).'; return renderJoin(); }
      if (!name) { err = 'Escribe un apodo.'; return renderJoin(); }
      join(false);
    };
  }

  // ----- helpers de ranking -----
  const mvh = (d) => d > 0 ? `<span class="mv up">▲${d}</span>` : d < 0 ? `<span class="mv down">▼${-d}</span>` : '';
  function lr(p, meId) { return `<div class="lr ${p.id === meId ? 'me' : ''}"><span class="rk">${p.rank}</span>${Avatar.html(p.avatar, 34)}<span class="nm">${esc(p.name)}</span><span class="gn">${p.gain ? '+' + p.gain : ''}</span><span class="pt">${p.score}${mvh(p.delta)}</span></div>`; }
  function boardHtml(s, n) {
    const rows = s.board.slice(0, n).map((p) => lr(p, s.you.id));
    const inTop = s.board.slice(0, n).some((p) => p.id === s.you.id);
    if (!inTop) rows.push('<div class="sep">···</div>', lr({ id: s.you.id, rank: s.you.rank, avatar: s.you.avatar, name: s.you.name + ' (tú)', gain: s.you.gain, score: s.you.score, delta: s.you.delta }, s.you.id));
    return rows.join('');
  }
  const top = (s) => `<div class="pqtop"><span class="chip">${Avatar.html(s.you.avatar, 30)} <b style="margin-left:6px">${esc(s.you.name)}</b></span><span class="chip"><b>${s.you.score}</b> pts</span></div>`;

  function render() {
    const s = S; if (!s || !s.you) return;
    cancelAnimationFrame(raf);
    if (s.phase === 'lobby') return lobby(s);
    if (editing) editing = false;
    if (s.phase === 'intro') {
      app.innerHTML = `${top(s)}<div class="wait"><div class="serif" style="font-size:20px;color:var(--mute)">Pregunta</div><div class="bignum" style="font-size:96px">${s.question.n}</div><div class="big">¡Prepárate!</div></div>`;
    } else if (s.phase === 'question') question(s);
    else if (s.phase === 'reveal') reveal(s);
    else if (s.phase === 'final') final(s);
  }

  function lobby(s) {
    if (editing) {
      app.innerHTML = `${logo}<h1>Tu <span>avatar</span></h1>${editor()}<button class="btn" id="ok">Listo ✓</button>`;
      bindEditor(() => { socket.emit('player:avatar', { avatar: av }); me.avatar = av; store.set('mixto_me', me); lobby(S); });
      document.getElementById('ok').onclick = () => { editing = false; lobby(S); };
      return;
    }
    app.innerHTML = `${logo}<div class="wait">${Avatar.html(s.you.avatar, 140)}<div class="big">${esc(s.you.name)}</div>
      <div class="sub">¡Ya estás dentro! Mira la pantalla grande.<br>Hay <b style="color:var(--gold2)">${s.count}</b> ${s.count === 1 ? 'jugador' : 'jugadores'} en la sala.</div>
      <div class="pulse"></div><div class="small">Esperando a que el anfitrión comience…</div>
      <button class="btn ghost" id="edit">Cambiar mi avatar</button></div>`;
    document.getElementById('edit').onclick = () => { editing = true; lobby(S); };
  }

  function question(s) {
    const q = s.question, y = s.you;
    app.innerHTML = `${top(s)}<div class="pq"><div class="pqtop"><span class="small">Pregunta ${q.n} / ${q.total}</span><span class="serif" id="tm" style="font-size:26px;color:var(--gold2)">${q.duration}</span></div>
      <div class="pbar"><i id="bar"></i></div>
      <div class="card ptext ${q.text.length > 120 ? 'long' : ''}">${esc(q.text)}</div>
      <div class="popts">${q.options.map((o, i) => `<button class="opt ${y.answered ? (y.choice === i ? 'mine' : 'dim') : ''}" data-i="${i}" ${y.answered ? 'disabled' : ''}><span class="ltr">${SHAPE[i]}</span><span>${esc(o)}</span></button>`).join('')}</div>
      ${y.answered ? '<div class="small">✔ Respuesta enviada. Esperando al resto…</div>' : ''}</div>`;
    app.querySelectorAll('.opt').forEach((b) => b.onclick = () => {
      if (S.you.answered) return;
      S.you.answered = true; S.you.choice = +b.dataset.i;
      socket.emit('player:answer', { choice: +b.dataset.i });
      if (navigator.vibrate) navigator.vibrate(30);
      question(S);
    });
    const tick = () => {
      const left = Math.max(0, s.endsAt - (Date.now() + offset));
      const bar = document.getElementById('bar'), tm = document.getElementById('tm');
      if (!bar) return; bar.style.transform = `scaleX(${left / (q.duration * 1000)})`; tm.textContent = Math.ceil(left / 1000);
      if (left > 0) raf = requestAnimationFrame(tick);
    };
    tick();
  }

  function reveal(s) {
    const q = s.question, y = s.you, r = s.reveal;
    const head = !y.answeredThis ? `<div class="card res no"><div class="em">⏱</div><div class="big">Sin respuesta</div><div>No alcanzaste a contestar</div></div>`
      : y.correct ? `<div class="card res ok"><div class="em">✅</div><div class="big">¡Correcto!</div><div class="pts">+${y.gain} puntos</div>${y.streak > 1 ? `<div>🔥 Racha de ${y.streak}</div>` : ''}</div>`
      : `<div class="card res no"><div class="em">❌</div><div class="big">Casi…</div><div>La respuesta era <b>${LET[r.correct]} · ${esc(q.options[r.correct])}</b></div></div>`;
    app.innerHTML = `${top(s)}${head}
      <div class="meRank"><div class="card"><b>#${y.rank}</b><span>Tu lugar</span></div><div class="card"><b>${y.score}</b><span>Puntos</span></div><div class="card"><b>${y.total}</b><span>Jugadores</span></div></div>
      <div class="card board"><h3 style="margin:0 0 6px;font-size:18px">🏆 Clasificación</h3>${boardHtml(s, 5)}</div>
      <div class="small">${esc(r.explanation)}</div><div class="small">Siguiente pregunta en la pantalla grande…</div>`;
  }

  function final(s) {
    const b = s.board, y = s.you, order = [b[1], b[0], b[2]], cls = ['p2', 'p1', 'p3'], pos = [2, 1, 3];
    const medal = y.rank === 1 ? '🥇' : y.rank === 2 ? '🥈' : y.rank === 3 ? '🥉' : '🎓';
    app.innerHTML = `${logo}<div class="card res ok"><div class="em">${medal}</div><div class="big">Quedaste en el lugar #${y.rank}</div><div class="pts">${y.score} puntos · ${y.correctCount} aciertos</div></div>
      <div class="podium">${order.map((p, i) => p ? `<div class="pod ${cls[i]}">${Avatar.html(p.avatar, pos[i] === 1 ? 70 : 54)}<div class="nm">${esc(p.name)}</div><div class="sc">${p.score}</div><div class="step">${pos[i]}</div></div>` : '').join('')}</div>
      <div class="card board"><h3 style="margin:0 0 6px;font-size:18px">🏆 Clasificación final</h3>${boardHtml(s, 10)}</div>
      <div class="small">Rojo + azul = morado. ¡Gracias por jugar! Visita el stand de Sistema Jurídico Mixto.</div>`;
  }
})();
