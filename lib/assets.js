// Sirve dist/ con brotli/gzip precomprimidos, ETag y caché inmutable para archivos con hash en el nombre.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.mp3': 'audio/mpeg' };
module.exports = function assets(dir) {
  const files = new Map(); // url -> {raw, br, gz, type, etag, immutable}
  const add = (url, rel) => {
    const raw = fs.readFileSync(path.join(dir, rel));
    const ext = path.extname(rel);
    const compressible = ext !== '.png' && ext !== '.mp3';
    files.set(url, {
      raw, type: TYPES[ext] || 'application/octet-stream', etag: '"' + require('crypto').createHash('sha1').update(raw).digest('base64url').slice(0, 16) + '"',
      br: compressible ? zlib.brotliCompressSync(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11 } }) : null,
      gz: compressible ? zlib.gzipSync(raw, { level: 9 }) : null,
      immutable: /\.[0-9a-f]{8}\.[a-z]+$/.test(rel),
    });
  };
  if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) {
    if (f === 'index.html') { add('/', f); add('/index.html', f); } else if (f === 'host.html') { add('/host', f); } else if (f === 'admin.html') { add('/admin', f); add('/admin/', f); } else add('/' + f, f);
  }
  return (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return next();
    const f = files.get(req.path);
    if (!f) return next();
    const ae = req.headers['accept-encoding'] || '';
    let body = f.raw, enc = null;
    if (f.br && /\bbr\b/.test(ae)) { body = f.br; enc = 'br'; } else if (f.gz && /\bgzip\b/.test(ae)) { body = f.gz; enc = 'gzip'; }
    res.setHeader('Content-Type', f.type);
    res.setHeader('Vary', 'Accept-Encoding');
    res.setHeader('ETag', f.etag);
    res.setHeader('Cache-Control', f.immutable ? 'public, max-age=31536000, immutable' : 'no-cache');
    if (enc) res.setHeader('Content-Encoding', enc);
    if (req.headers['if-none-match'] === f.etag) return res.status(304).end();
    res.setHeader('Content-Length', body.length);
    res.end(req.method === 'HEAD' ? undefined : body);
  };
};
