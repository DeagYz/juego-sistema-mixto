// Música de fondo SOLO para la pantalla del anfitrión (carga perezosa, tras el primer clic/tecla).
// Tres pistas generadas con código (ver README): lobby (calma), tensión (durante preguntas) y fanfarria (podio).
(function () {
  const URLS = __AUDIO__; // { lobby, tension, fanfare } con hash, lo inyecta scripts/build.js
  const KEY = 'mixto_music';
  let pref = {}; try { pref = JSON.parse(localStorage.getItem(KEY) || '{}'); } catch (e) {}
  let muted = !!pref.muted, vol = typeof pref.vol === 'number' ? pref.vol : 0.5;
  let ctx = null, master = null, want = 'lobby', started = false;
  const tr = {}; // nombre -> {gain, src, buf, loading}
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify({ muted, vol })); } catch (e) {} };
  const level = () => (muted ? 0 : vol * vol); // curva suave

  function ensure() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false;
    ctx = new AC(); master = ctx.createGain(); master.gain.value = level(); master.connect(ctx.destination); return true;
  }
  function load(name) {
    const t = tr[name] || (tr[name] = { loading: null, buf: null, gain: null, src: null });
    if (t.loading) return t.loading;
    t.loading = fetch(URLS[name]).then((r) => r.arrayBuffer()).then((ab) => new Promise((ok, no) => ctx.decodeAudioData(ab, ok, no))).then((b) => { t.buf = b; return t; }).catch(() => { t.loading = null; return null; });
    return t.loading;
  }
  function play(t, loop) { // arranca en silencio; el volumen real lo da apply()
    t.gain = ctx.createGain(); t.gain.gain.value = 0; t.gain.connect(master);
    t.src = ctx.createBufferSource(); t.src.buffer = t.buf; t.src.loop = loop; t.src.connect(t.gain); t.src.start();
  }
  function fade(t, to, secs) { const g = t.gain.gain, now = ctx.currentTime; g.cancelScheduledValues(now); g.setValueAtTime(g.value, now); g.linearRampToValueAtTime(to, now + secs); }
  // Los dos bucles suenan en paralelo (uno en silencio) para conservar su posición; solo se cruzan los volúmenes.
  const MIX = { lobby: { lobby: 1, tension: 0 }, lobbyLow: { lobby: 0.55, tension: 0 }, tension: { lobby: 0, tension: 1 }, fanfare: { lobby: 0, tension: 0 } };
  function apply() {
    if (!ctx || ctx.state !== 'running') return;
    const m = MIX[want] || MIX.lobby;
    ['lobby', 'tension'].forEach((n) => { const t = tr[n]; if (t && t.buf) { if (!t.src) play(t, true); fade(t, m[n], 1.2); } });
  }
  function boot() {
    if (started || !ensure()) return; started = true;
    ctx.resume().then(() => { load('lobby').then(() => { apply(); setTimeout(() => { load('tension').then(apply); load('fanfare'); }, 2500); }); });
  }
  function gesture() { if (!started) boot(); else if (ctx && ctx.state !== 'running') ctx.resume().then(apply); ui(); }
  ['pointerdown', 'keydown'].forEach((ev) => document.addEventListener(ev, gesture, { passive: true }));

  let fanfareTimer = 0;
  function fanfare() {
    want = 'fanfare'; apply(); const t = tr.fanfare;
    const go = (tt) => { if (!tt || !tt.buf || !ctx || ctx.state !== 'running') return; const s = ctx.createBufferSource(), g = ctx.createGain(); g.gain.value = 1; s.buffer = tt.buf; s.connect(g); g.connect(master); s.start(); };
    if (t && t.buf) go(t); else load('fanfare').then(go);
    clearTimeout(fanfareTimer); fanfareTimer = setTimeout(() => { want = 'lobbyLow'; apply(); }, 5200);
  }
  // Fase del juego -> música
  function phase(p, fresh) {
    if (p === 'final') { if (fresh) fanfare(); return; }
    clearTimeout(fanfareTimer);
    const w = p === 'question' ? 'tension' : p === 'reveal' ? 'lobbyLow' : 'lobby';
    if (w !== want) { want = w; apply(); }
  }
  function setMuted(m) { muted = m; save(); if (master) { const now = ctx.currentTime; master.gain.cancelScheduledValues(now); master.gain.setTargetAtTime(level(), now, 0.05); } ui(); }
  // Botón 🔊 / 🔇 + control de volumen y tecla M
  let btn, rng, hint;
  function ui() {
    if (!btn) return;
    btn.textContent = muted || vol === 0 ? '🔇' : vol < 0.4 ? '🔈' : '🔊';
    btn.setAttribute('aria-pressed', muted ? 'true' : 'false');
    if (hint) hint.classList.toggle('hidden', started);
  }
  function mount() {
    const bar = document.getElementById('musicbar'); if (!bar) return;
    hint = document.createElement('span'); hint.className = 'chip'; hint.textContent = '🎵 Haz clic para activar la música'; bar.appendChild(hint);
    rng = document.createElement('input'); rng.type = 'range'; rng.min = 0; rng.max = 100; rng.value = Math.round(vol * 100); rng.id = 'vol'; rng.className = 'vol'; rng.setAttribute('aria-label', 'Volumen de la música');
    rng.oninput = () => { vol = rng.value / 100; if (muted && vol > 0) muted = false; save(); if (master) master.gain.setTargetAtTime(level(), ctx.currentTime, 0.05); ui(); };
    btn = document.createElement('button'); btn.className = 'chip'; btn.id = 'mute'; btn.title = 'Silenciar / activar música (M)';
    btn.onclick = (e) => { e.stopPropagation(); setMuted(!muted); };
    bar.appendChild(btn); bar.appendChild(rng); ui();
  }
  document.addEventListener('keydown', (e) => { if ((e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.metaKey) setMuted(!muted); });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount); else mount();
  window.Music = { phase, setMuted, state: () => ({ muted, vol, started, want, running: !!ctx && ctx.state === 'running' }) };
})();
