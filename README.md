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
npm start            # http://localhost:3000/host
URL=http://localhost:3000 N=12 npm test   # simula 12 clientes (N=60 para 60)
npm run qr -- https://TU-URL              # genera qr.png imprimible del sitio
```
Variable opcional `PUBLIC_URL` fuerza la URL base del QR; si no, se detecta de la petición (https detrás de proxy).

## Despliegue gratuito
- **Render**: Blueprint con `render.yaml` (plan free, soporta websockets). El plan gratis se duerme tras 15 min sin tráfico: abre `/host` unos minutos antes del evento.
- **Railway / Fly.io**: `npm start` o el `Dockerfile` incluido (puerto de la variable `PORT`).
Una sola instancia (el estado de las salas vive en memoria).

Editar preguntas: `questions.js` (campos `text`, `options`, `correct` = índice 0‑3, `explanation`, `duration`).
