#!/usr/bin/env python3
"""Genera la música del anfitrión con código (síntesis propia, sin muestras ni terceros).
Obra original de este proyecto, dedicada al dominio público (CC0). Salida: src/audio/*.mp3 (mono, 64 kbps).
Uso: python3 scripts/make_music.py   (requiere numpy, scipy y ffmpeg)"""
import numpy as np, subprocess, os, wave
from scipy.signal import lfilter, butter
SR = 32000
OUT = os.path.join(os.path.dirname(__file__), '..', 'src', 'audio')
rng = np.random.default_rng(302)
def hz(m): return 440.0 * 2 ** ((m - 69) / 12)
def lp(x, fc, o=2):
    b, a = butter(o, fc / (SR / 2)); return lfilter(b, a, x)
def env(n, a, d, s, r_len):
    e = np.ones(n); na = max(1, int(a * SR)); nd = int(d * SR)
    e[:na] = np.linspace(0, 1, na)
    if nd: e[na:na + nd] = np.linspace(1, s, min(nd, max(0, n - na)))[: max(0, n - na)] if n - na > 0 else e[na:na + nd]
    e[na + nd:] = s
    nr = min(n, int(r_len * SR)); e[n - nr:] *= np.linspace(1, 0, nr); return e
def pluck(m, dur, vel=1.0, bright=1.0):
    n = int(dur * SR); t = np.arange(n) / SR; f = hz(m)
    x = sum(a * np.sin(2 * np.pi * f * k * t) * np.exp(-t * (3.0 + 2.2 * k) / max(.4, bright)) for k, a in ((1, 1), (2, .5), (3, .25), (4, .12)))
    return x * vel * np.exp(-t * 1.6)
def bell(m, dur, vel=1.0):
    n = int(dur * SR); t = np.arange(n) / SR; f = hz(m)
    return vel * (np.sin(2 * np.pi * f * t) + .4 * np.sin(2 * np.pi * f * 2.76 * t) * np.exp(-t * 6) + .2 * np.sin(2 * np.pi * f * 5.4 * t) * np.exp(-t * 10)) * np.exp(-t * 2.2)
def pad(ms, dur, vel=1.0):
    n = int(dur * SR); t = np.arange(n) / SR; x = np.zeros(n)
    for m in ms:
        for det in (-0.004, 0.0, 0.004):
            f = hz(m) * (1 + det); x += np.sin(2 * np.pi * f * t) + .3 * np.sin(2 * np.pi * 2 * f * t)
    x = lp(x, 1800) * vel / (len(ms) * 3)
    a = int(.35 * SR); r = int(.5 * SR); e = np.ones(n); e[:a] = np.linspace(0, 1, a); e[-r:] = np.linspace(1, 0, r); return x * e
def bass(m, dur, vel=1.0):
    n = int(dur * SR); t = np.arange(n) / SR; f = hz(m)
    x = np.sin(2 * np.pi * f * t) + .35 * np.sin(2 * np.pi * 2 * f * t); return x * vel * np.exp(-t * 3.2) * (1 - np.exp(-t * 400))
def kick(vel=1.0):
    n = int(.22 * SR); t = np.arange(n) / SR; f = 110 * np.exp(-t * 18) + 45
    return vel * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 14)
def hat(vel=1.0, dur=.05):
    n = int(dur * SR); x = rng.standard_normal(n); x = x - lp(x, 5000); return vel * x * np.exp(-np.arange(n) / SR * 70)
def shaker(vel=1.0):
    n = int(.09 * SR); x = rng.standard_normal(n); x = lp(x, 9000) - lp(x, 3000); e = np.exp(-((np.arange(n) / SR) - .03) ** 2 * 1500); return vel * x * e
def tick(vel=1.0):
    n = int(.04 * SR); t = np.arange(n) / SR; return vel * np.sin(2 * np.pi * 1700 * t) * np.exp(-t * 130)
def put(buf, x, at):
    i = int(at * SR); j = min(len(buf), i + len(x));
    if j > i: buf[i:j] += x[: j - i]
    else: pass
def loopify(buf, total):
    """pliega la cola (reverberación/notas largas) sobre el inicio para que el bucle sea continuo"""
    out = buf[:total].copy(); tail = buf[total:]; out[: len(tail)] += tail[: total]; return out
def reverb(x, wet=.18):
    y = x.copy()
    for d, g in ((0.043, .35), (0.071, .27), (0.113, .2), (0.167, .14)):
        k = int(d * SR); y[k:] += g * x[:-k]
    return (1 - wet) * x + wet * y
def finish(x, peak=.55):
    x = x - x.mean(); x = np.tanh(x * 1.2); return x / np.max(np.abs(x)) * peak
def write_mp3(name, x):
    wav = os.path.join(OUT, name + '.wav'); pcm = (np.clip(x, -1, 1) * 32767).astype('<i2')
    with wave.open(wav, 'wb') as w: w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-codec:a', 'libmp3lame', '-b:a', '64k', '-ac', '1', os.path.join(OUT, name + '.mp3')], check=True); os.remove(wav)
    print(name, round(len(x) / SR, 1), 's', os.path.getsize(os.path.join(OUT, name + '.mp3')) // 1024, 'KB')

def lobby():
    bpm = 112; beat = 60 / bpm; bar = 4 * beat; bars = 16; total = int(bars * bar * SR)
    buf = np.zeros(total + int(4 * SR))
    ch = [((48, 52, 55), (60, 64, 67, 72), 36), ((45, 52, 57), (57, 64, 69, 72), 33), ((41, 48, 53), (57, 60, 65, 69), 29), ((43, 50, 55), (59, 62, 67, 71), 31)]  # C Am F G
    pent = [72, 74, 76, 79, 81, 84]  # C pentatónica
    for b in range(bars):
        c = ch[b % 4]; t0 = b * bar; half2 = b >= 8
        put(buf, pad(c[0] + (c[1][3] - 12,), bar + .4, .5), t0)
        for s in range(8):  # arpeggio de corcheas
            m = c[1][(s * 3 + (s // 4)) % 4] if not half2 else c[1][[0, 1, 2, 3, 2, 1, 3, 2][s]]
            put(buf, pluck(m, .5, .5 if s % 2 == 0 else .35), t0 + s * beat / 2)
        put(buf, bass(c[2], beat * 1.8, .9), t0); put(buf, bass(c[2] + 7, beat * .9, .55), t0 + beat * 2.5); put(buf, bass(c[2], beat * 1.5, .6), t0 + beat * 3)
        for q in range(4): put(buf, shaker(.22 if q % 2 else .15), t0 + q * beat + beat / 2)
        put(buf, hat(.1), t0 + beat * .5)
        if half2:
            for q in (0, 2): put(buf, kick(.5), t0 + q * beat)
        # melodía simple (pregunta/respuesta)
        mel = [(0, 0), (1.5, 2), (2, 3), (3, 2)] if b % 2 == 0 else [(0, 3), (1, 2), (2, 1), (3.5, 0)]
        if b >= 4:
            for pos, k in mel:
                m = pent[(k + (b // 4)) % len(pent)]
                put(buf, bell(m if not half2 else m + 12 if m < 80 else m, beat * 1.4, .28), t0 + pos * beat)
    x = loopify(reverb(buf, .22), total)
    return finish(x, .5)
def tension():
    bpm = 104; beat = 60 / bpm; bar = 4 * beat; bars = 8; total = int(bars * bar * SR)
    buf = np.zeros(total + int(3 * SR))
    ch = [(45, (57, 60, 64)), (41, (53, 57, 60)), (38, (50, 53, 57)), (40, (52, 56, 59))]  # Am F Dm E
    for b in range(bars):
        c = ch[(b // 2) % 4]; t0 = b * bar
        put(buf, pad(c[1], bar + .3, .35), t0)
        for s in range(8): put(buf, bass(c[0] + (12 if s % 4 == 3 else 0), beat * .45, .55 if s % 2 == 0 else .35), t0 + s * beat / 2)
        for q in range(4): put(buf, tick(.28 if q == 0 else .16), t0 + q * beat)
        for s in range(2, 16, 4): put(buf, hat(.07, .03), t0 + s * beat / 4)
        if b % 2 == 1:
            for k, m in enumerate((c[1][2] + 12, c[1][1] + 12, c[1][0] + 12)): put(buf, pluck(m, .4, .3), t0 + (2.5 + k * .5) * beat)
        if b % 4 == 0: put(buf, kick(.35), t0)
    x = loopify(reverb(buf, .15), total)
    return finish(x, .45)
def fanfare():
    total = int(5.2 * SR); buf = np.zeros(total)
    def brass(m, dur, vel):
        n = int(dur * SR); t = np.arange(n) / SR; f = hz(m); x = sum(np.sin(2 * np.pi * f * k * t) / k for k in range(1, 9))
        e = np.minimum(1, t / .04) * np.exp(-np.maximum(0, t - dur * .55) * 3); return lp(x, 2600) * e * vel
    t = .0
    for m, d in ((67, .22), (72, .22), (76, .22), (79, .5)):
        put(buf, brass(m, d + .15, .5), t); t += d
    t = 1.2
    for ms in ((60, 64, 67, 72), (62, 67, 71, 74), (64, 67, 72, 76)):
        for m in ms: put(buf, brass(m, .5, .28), t)
        t += .5
    for m in (48, 60, 64, 67, 72, 76, 79, 84): put(buf, brass(m, 3.2, .26 if m < 80 else .18), 2.7)
    for k, m in enumerate((84, 88, 91, 96)): put(buf, bell(m, 2, .25), 2.7 + k * .12)
    sw = rng.standard_normal(int(2.4 * SR)); sw = (lp(sw, 9000) - lp(sw, 4000)) * np.linspace(0, 1, len(sw)) ** 2 * np.exp(-np.linspace(0, 1, len(sw)) * 2) * .1; put(buf, sw, 2.7)
    put(buf, kick(.8), 2.7); put(buf, kick(.5), 0)
    x = reverb(buf, .25); fade = int(.4 * SR); x[-fade:] *= np.linspace(1, 0, fade)
    return finish(x, .6)
if __name__ == '__main__':
    os.makedirs(OUT, exist_ok=True)
    write_mp3('lobby', lobby()); write_mp3('tension', tension()); write_mp3('fanfare', fanfare())
