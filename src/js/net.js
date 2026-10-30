// Conexión resistente a wifi débil: websocket con respaldo a polling, reconexión con jitter,
// aviso visible cuando no hay conexión, y re-sincronización al volver a primer plano / recuperar red.
import { io } from 'socket.io-client';
window.mkSocket = function (onSync) {
  const socket = io({
    transports: ['websocket', 'polling'], tryAllTransports: true, // si el wifi bloquea websocket, cae a polling
    reconnectionDelay: 400, reconnectionDelayMax: 3000, randomizationFactor: 0.7, timeout: 8000,
  });
  const bn = document.createElement('div');
  bn.id = 'netbar'; bn.textContent = 'Sin conexión · reconectando…';
  document.body.appendChild(bn);
  let t = 0;
  const show = () => { clearTimeout(t); t = setTimeout(() => bn.classList.add('on'), 1500); };
  const hide = () => { clearTimeout(t); bn.classList.remove('on'); };
  socket.on('disconnect', show); socket.on('connect_error', show); socket.on('connect', hide);
  const kick = () => { if (!socket.connected) socket.connect(); else if (onSync) onSync(); };
  window.addEventListener('online', kick);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') kick(); });
  return socket;
};
