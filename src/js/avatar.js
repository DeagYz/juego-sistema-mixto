// Avatares: animal (emoji) + color + sombrero + cuerpo + lentes. Se dibujan igual en el anfitrión y en los celulares.
(function (root) {
  const ANIMALS = ['🦊', '🐼', '🦁', '🐯', '🐸', '🐵', '🦉', '🐙', '🦄', '🐧', '🐨', '🐰', '🐶', '🐱', '🦅', '🐢'];
  const COLORS = ['#2B6DFF', '#58CDD4', '#5337ff', '#B45F7F', '#D9893B', '#5C6F9A', '#7FA37A', '#C9A227'];
  const HATS = [
    { name: 'Sin sombrero', svg: '' },
    { name: 'Birrete', svg: '<polygon points="50,3 94,19 50,35 6,19" fill="#1a1a24"/><path d="M27 27v13q23 12 46 0V27q-23 10-46 0z" fill="#262633"/><path d="M86 20v20" stroke="#C9A227" stroke-width="3"/><circle cx="86" cy="42" r="4" fill="#C9A227"/>' },
    { name: 'Peluca', svg: '<g fill="#f6f2ea" stroke="#cdc6b6" stroke-width="1.5"><circle cx="16" cy="48" r="9"/><circle cx="14" cy="62" r="9"/><circle cx="84" cy="48" r="9"/><circle cx="86" cy="62" r="9"/><circle cx="24" cy="30" r="11"/><circle cx="76" cy="30" r="11"/><circle cx="36" cy="19" r="11"/><circle cx="64" cy="19" r="11"/><circle cx="50" cy="15" r="11"/></g>' },
    { name: 'Boina escocesa', svg: '<ellipse cx="50" cy="22" rx="36" ry="15" fill="#1f5f46"/><path d="M20 22h60M50 9v26" stroke="#9c2f2f" stroke-width="3" opacity=".85"/><path d="M33 12v20M67 12v20" stroke="#14213D" stroke-width="2" opacity=".6"/><circle cx="50" cy="6" r="5" fill="#9c2f2f"/>' },
    { name: 'Corona', svg: '<path d="M24 30L28 8l14 12L50 3l8 17 14-12 4 22z" fill="#C9A227" stroke="#8d7014" stroke-width="1.5" stroke-linejoin="round"/><circle cx="28" cy="8" r="3" fill="#fff3bf"/><circle cx="50" cy="3" r="3" fill="#fff3bf"/><circle cx="72" cy="8" r="3" fill="#fff3bf"/>' },
  ];
  const BODIES = [
    { name: 'Sin traje', svg: '' },
    { name: 'Toga', svg: '<path d="M10 102Q16 80 50 76Q84 80 90 102z" fill="#14141c"/><path d="M50 76v26" stroke="#2d2d3a" stroke-width="2"/><rect x="39" y="82" width="8" height="18" rx="1.5" fill="#fff"/><rect x="53" y="82" width="8" height="18" rx="1.5" fill="#fff"/>' },
    { name: 'Kilt', svg: '<path d="M16 102L24 80H76L84 102z" fill="#1f5f46"/><path d="M20 90h60M20 97h62" stroke="#9c2f2f" stroke-width="2.2"/><path d="M38 80l-5 22M62 80l5 22" stroke="#14213D" stroke-width="2" opacity=".6"/><rect x="43" y="82" width="14" height="12" rx="4" fill="#5a3b24"/><circle cx="50" cy="88" r="2" fill="#C9A227"/>' },
  ];
  const GLASSES = '<g fill="rgba(255,255,255,.22)" stroke="#14213D" stroke-width="3"><circle cx="35" cy="50" r="11"/><circle cx="65" cy="50" r="11"/></g><path d="M46 50h8" stroke="#14213D" stroke-width="3"/>';

  function html(av, size) {
    av = av || [];  // [animal, color, sombrero, traje, lentes]
    size = size || 56;
    const a = ANIMALS[av[0] | 0] || ANIMALS[0];
    const c = COLORS[av[1] | 0] || COLORS[0];
    const hat = (HATS[av[2] | 0] || HATS[0]).svg;
    const body = (BODIES[av[3] | 0] || BODIES[0]).svg;
    const gl = av[4] ? GLASSES : '';
    return `<span class="av" style="--s:${size}px"><span class="av-bg" style="background:radial-gradient(circle at 30% 25%,${c}ee,${c})"></span><span class="av-emoji">${a}</span><svg class="av-acc" viewBox="0 0 100 100" aria-hidden="true">${gl}${body}${hat}</svg></span>`;
  }
  root.Avatar = { ANIMALS, COLORS, HATS, BODIES, html };
})(window);
