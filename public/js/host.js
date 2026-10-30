(function () {
  const $ = (s) => document.querySelector(s);
  const stage = $('#stage');
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const LET = 'ABCD';
  const socket = io({ transports: ['websocket', 'polling'] });
  let info = null, S = null, offset = 0, raf = 0, lastPhase = '', lastKey = '';

  function create() {
    const saved = JSON.parse(localStorage.getItem('mixto_host') || 'null') || {};
    socket.emit('host:create', saved, (r) => {
      info = r; localStorage.setItem('mixto_host', JSON.stringify({ code: r.code, token: r.token }));
      $('#chipCode').classList.remove('hidden'); $('#chipCodeV').textContent = r.code;
    });
  }
  socket.on('connect', create);
  socket.on('state', (s) => { S = s; offset = s.now - Date.now(); render(); });
  socket.on('progress', (p) => {
    if (!S) return; S.answered = p.answered; S.active = p.active;
    const el = $('#ans'); if (el) el.innerHTML = `<b>${p.answered}</b> / ${p.active} respondieron`;
  });

  const logoSmall = '<span class="mix"><i></i><i></i><b></b></span>';
  function optHtml(q, i, extra) { return `<div class="opt ${extra || ''}" data-i="${i}"><span class="ltr">${LET[i]}</span><span>${esc(q.options[i])}</span></div>`; }
  const isLong = (q) => q.text.length > 120;

  function render() {
    const s = S; if (!s) return;
    $('#chipCount').textContent = s.count + (s.count === 1 ? ' jugador' : ' jugadores');
    cancelAnimationFrame(raf);
    const key = s.phase + ':' + s.qn;
    const fresh = key !== lastKey; lastKey = key;
    if (s.phase === 'lobby') lobby(s);
    else if (s.phase === 'intro') intro(s);
    else if (s.phase === 'question') question(s);
    else if (s.phase === 'reveal') reveal(s);
    else if (s.phase === 'final') final(s, fresh);
  }

  function lobby(s) {
    const prev = $('#plist');
    if (!$('#qrbox')) {
      stage.innerHTML = `<div class="lobby">
        <div class="joincard card">
          <div class="lbl">Escanea para unirte</div>
          <div class="qr" id="qrbox"></div>
          <div class="lbl">o entra a</div>
          <div class="url" id="joinurl"></div>
          <div class="lbl">Código de sala</div>
          <div class="code" id="bigcode"></div>
        </div>
        <div class="lobbyR">
          <div class="hero"><h1>Sistema Jurídico <span>Mixto</span></h1><p>Rojo (civil law) + azul (common law) = morado. ¡Elige tu avatar y demuestra cuánto sabes!</p></div>
          <div class="players" id="plist"></div>
          <div class="startbar"><div class="hint">Pasa el mouse sobre un jugador para expulsarlo · Enter para comenzar</div><button class="btn" id="start">Comenzar juego ▶</button></div>
        </div></div>`;
      $('#start').onclick = () => socket.emit('host:start');
    }
    if (info) {
      if (!$('#qrbox').dataset.done) { $('#qrbox').innerHTML = info.qr; $('#qrbox').dataset.done = 1; }
      $('#joinurl').textContent = info.joinUrl.replace(/^https?:\/\//, '').replace(/\?c=.*/, '');
      $('#bigcode').textContent = info.code;
    }
    const list = s.players || [];
    $('#start').disabled = list.length === 0;
    const el = $('#plist'), have = new Map([...el.children].map((c) => [c.dataset.id, c]));
    const ids = new Set(list.map((p) => p.id));
    for (const [id, c] of have) if (!ids.has(id)) c.remove();
    list.forEach((p) => {
      const sig = JSON.stringify(p.avatar) + p.name + p.connected;
      let c = have.get(p.id);
      if (!c || c.dataset.sig !== sig) {
        const n = document.createElement('div');
        n.className = 'pl' + (p.connected ? '' : ' off'); n.dataset.id = p.id; n.dataset.sig = sig;
        n.innerHTML = Avatar.html(p.avatar, 84) + `<div class="nm">${esc(p.name)}</div><button class="x" title="Expulsar">×</button>`;
        n.querySelector('.x').onclick = () => socket.emit('host:kick', p.id);
        if (c) c.replaceWith(n); else el.appendChild(n);
      }
    });
  }

  function intro(s) {
    const q = s.question;
    stage.innerHTML = `<div class="center"><div class="lbl">Pregunta</div><div class="bignum">${q.n}<span style="font-size:.3em;color:var(--mute)"> / ${q.total}</span></div>
      <h2 style="font-size:clamp(20px,3vw,48px);margin:0">${q.kind === 'pais' ? '¿Quién soy? Adivina el país' : 'Sistema jurídico mixto'}</h2><div class="hint">¡Prepárense!</div></div>`;
  }

  function question(s) {
    const q = s.question;
    stage.innerHTML = `<div class="qwrap">
      <div class="qhead"><span class="chip">Pregunta <b>${q.n}</b> / ${q.total}</span><div class="bar"><i id="bar"></i></div><div class="timer" id="tm">${q.duration}</div><span class="chip" id="ans"><b>${s.answered}</b> / ${s.active} respondieron</span></div>
      <div class="qtext card ${isLong(q) ? 'long' : ''}"><div class="kind">${q.kind === 'pais' ? '¿Quién soy?' : 'Concepto'}</div><div>${esc(q.text)}</div></div>
      <div class="opts">${q.options.map((_, i) => optHtml(q, i)).join('')}</div>
      <div class="nextbar"><span class="hint">Espacio / Enter: cerrar la pregunta ahora</span><button class="btn ghost" id="skip">Mostrar respuesta</button></div></div>`;
    $('#skip').onclick = () => socket.emit('host:skip');
    const tick = () => {
      const now = Date.now() + offset, left = Math.max(0, s.endsAt - now), tot = q.duration * 1000;
      $('#bar').style.transform = `scaleX(${left / tot})`;
      $('#tm').textContent = Math.ceil(left / 1000);
      if (left > 0) raf = requestAnimationFrame(tick);
    };
    tick();
  }

  function mv(d) { return d > 0 ? `<span class="mv up">▲${d}</span>` : d < 0 ? `<span class="mv down">▼${-d}</span>` : ''; }
  function boardHtml(list, n) {
    return list.slice(0, n).map((p, i) => `<div class="lr" style="animation-delay:${i * 60}ms"><span class="rk">${p.rank}</span>${Avatar.html(p.avatar, 40)}<span class="nm">${esc(p.name)}</span><span class="gn">${p.gain ? '+' + p.gain : ''}</span><span class="pt">${p.score}${mv(p.delta)}</span></div>`).join('');
  }

  function reveal(s) {
    const q = s.question, r = s.reveal, max = Math.max(1, ...r.counts);
    const last = q.n >= q.total;
    stage.innerHTML = `<div class="qwrap">
      <div class="qhead"><span class="chip">Pregunta <b>${q.n}</b> / ${q.total}</span><span class="chip"><b>${r.correctCount}</b> de ${r.answered} acertaron</span></div>
      <div class="rev">
        <div class="revL">
          <div class="qtext card ${q.text.length > 80 ? 'long' : ''}" style="padding:1.4vh 1.6vw;font-size:clamp(15px,1.8vw,30px)">${esc(q.text)}</div>
          <div class="dist">${q.options.map((o, i) => `<div class="drow ${i === r.correct ? 'right' : 'dim'}"><div class="opt" data-i="${i}" id="d${i}"><span class="ltr">${LET[i]}</span><span>${esc(o)}</span><span class="cnt">${r.counts[i]}</span></div></div>`).join('')}</div>
          <div class="fact card"><b>✔ Respuesta: ${LET[r.correct]} · ${esc(q.options[r.correct])}.</b> ${esc(r.explanation)}</div>
        </div>
        <div class="board card"><h3>🏆 Clasificación</h3>${boardHtml(s.board, 8)}<div class="hint" style="margin-top:auto">${s.count > 8 ? `…y ${s.count - 8} más. ` : ''}Todos ven su posición en su celular.</div></div>
      </div>
      <div class="nextbar"><span class="hint">Espacio / Enter: continuar</span><button class="btn" id="next">${last ? 'Ver podio 🏆' : 'Siguiente pregunta ▶'}</button></div></div>`;
    requestAnimationFrame(() => q.options.forEach((_, i) => { const e = $('#d' + i); if (e) e.style.setProperty('--w', (r.counts[i] / max * 100) + '%'); }));
    $('#next').onclick = () => socket.emit('host:next');
  }

  function final(s, fresh) {
    const b = s.board, top = [b[1], b[0], b[2]];
    const cls = ['p2', 'p1', 'p3'], pos = [2, 1, 3];
    stage.innerHTML = `<div class="qwrap"><div class="center" style="flex:none"><h1 class="serif" style="font-size:clamp(26px,4vw,64px);margin:0">¡Podio final!</h1><div class="hint">Gracias por jugar «Adivina el país mixto»</div></div>
      <div class="podium">${top.map((p, i) => p ? `<div class="pod ${cls[i]}">${pos[i] === 1 ? '<div class="crown">👑</div>' : ''}${Avatar.html(p.avatar, pos[i] === 1 ? 100 : 76)}<div class="nm">${esc(p.name)}</div><div class="sc">${p.score} pts</div><div class="step">${pos[i]}</div></div>` : '').join('')}</div>
      <div class="rest nogain">${boardHtml(b.slice(3), 200)}</div>
      <div class="nextbar"><span class="hint">Todos pueden ver su lugar final en su celular.</span><button class="btn purple" id="again">Nueva partida (mismos jugadores)</button></div></div>`;
    $('#again').onclick = () => socket.emit('host:reset');
    if (fresh) confetti();
  }
  function confetti() {
    const cols = ['#C9A227', '#6A3D9A', '#e6c65a', '#8a5cb8', '#f4f1ea'];
    for (let i = 0; i < 70; i++) {
      const d = document.createElement('i'); d.className = 'conf';
      d.style.left = Math.random() * 100 + 'vw'; d.style.background = cols[i % cols.length];
      d.style.animationDuration = 3 + Math.random() * 3 + 's'; d.style.animationDelay = Math.random() * 1.5 + 's';
      document.body.appendChild(d); setTimeout(() => d.remove(), 8000);
    }
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'f' || e.key === 'F') { document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen().catch(() => {}); return; }
    if (e.key === 'Enter' || e.key === ' ') {
      if (!S) return; e.preventDefault();
      if (S.phase === 'lobby') socket.emit('host:start');
      else if (S.phase === 'question') socket.emit('host:skip');
      else if (S.phase === 'reveal') socket.emit('host:next');
    }
  });
  $('#fs').onclick = () => document.documentElement.requestFullscreen().catch(() => {});
})();
