# Adivina el país mixto — quiz multijugador (Expoferia, Facultad de Derecho)

Juego tipo Kahoot en español sobre **Sistema Jurídico Mixto**. 20 preguntas de opción múltiple (8 «¿Quién soy?» + 12 de conceptos), todas basadas en la guía del equipo.

## Cómo jugar
1. En la laptop/proyector abre `https://TU-URL/host` (pantalla del anfitrión). Aparece el QR, el código de sala y los jugadores que entran.
2. Los jugadores escanean el QR (o entran a la URL y escriben el código), eligen apodo y avatar (animal, color, birrete/peluca/boina/corona, toga/kilt, lentes).
3. El anfitrión pulsa **Comenzar** (o Enter). Cada pregunta: cuenta de 3 s → pregunta con temporizador (20 s conceptos, 30 s pistas) → respuesta, distribución de votos, dato curioso y clasificación (también en cada celular) → **Siguiente** (Enter/Espacio).
4. Al final: podio en pantalla y lugar final en cada celular. «Nueva partida» reinicia con los mismos jugadores.
Teclas del anfitrión: `Enter`/`Espacio` avanza, `F` pantalla completa.

## Puntaje
Acierto = 600 + hasta 400 por rapidez (lineal con el tiempo restante). Error o sin respuesta = 0. Desempate: menor tiempo acumulado.

## Ejecutar
```
npm install
npm run build        # (ya incluido en dist/) empaqueta y minifica con esbuild
npm start            # http://localhost:3000/host   (PORT=… para otro puerto)
npm test             # 12 clientes (N=60 para 60) con wifi escolar simulada: latencia, 100 KB/s, cortes y reconexión
npm run weight       # mide el peso real de la página del jugador
npm run qr -- https://TU-URL              # genera qr.png imprimible del sitio
```
Variable opcional `PUBLIC_URL` fuerza la URL base del QR; si no, se detecta de la petición (https detrás de proxy).

## Pensado para wifi escolar débil
- Página del jugador ≈ 22 KB transferidos (HTML+CSS+JS con brotli/gzip); fuentes del sistema, avatares emoji/SVG, logo embebido en el CSS (sin peticiones extra). Cachés `immutable`.
- socket.io con websocket y respaldo automático a *polling* si la red bloquea websocket. Mensajes diminutos (arreglos, sin repetir texto de pregunta) ≈ 25 KB de bajada por jugador en toda la partida.
- El temporizador es del servidor; el teléfono solo muestra una cuenta regresiva basada en el tiempo restante que envía el servidor (no depende del reloj del celular). Hay 1.2 s de gracia para respuestas que viajan por red lenta, y la respuesta se reintenta sola.
- Reconexión automática: el jugador se identifica con un token en `localStorage` y recupera apodo, avatar y puntaje; si se cae a media pregunta, su respuesta pendiente se envía al volver. Aparece el aviso «Sin conexión · reconectando…».

## Tema
Colores institucionales del IUV (azul marino `#001433`, azul `#2B6DFF`/`#0047D2`, turquesa `#58CDD4`) tomados del logo y de iuv.edu.mx. Rojo = civil law, azul = common law y morado = mixto se usan solo como acentos de contenido. Créditos: «Juego creado por el grupo de Derecho 302 E6 · Juan Daniel Chable Ramirez».

## Despliegue gratuito
- **Render**: Blueprint con `render.yaml` (plan free, soporta websockets). El plan gratis se duerme tras 15 min sin tráfico: abre `/host` unos minutos antes del evento.
- **Railway / Fly.io**: `npm start` o el `Dockerfile` incluido (puerto de la variable `PORT`).
Una sola instancia (el estado de las salas vive en memoria).

Editar preguntas: `questions.js` (campos `text`, `options`, `correct` = índice 0‑3, `explanation`, `duration`).
