// Genera dist/: JS+CSS minificados con hash en el nombre (caché inmutable). El servidor los sirve precomprimidos (br/gzip).
const esbuild = require('esbuild');
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.join(__dirname, '..'), src = path.join(root, 'src'), out = path.join(root, 'dist');
fs.rmSync(out, { recursive: true, force: true }); fs.mkdirSync(out);
const hash = (b) => crypto.createHash('sha1').update(b).digest('hex').slice(0, 8);
const iuv = 'data:image/png;base64,' + fs.readFileSync(path.join(src, 'img', 'iuv.png')).toString('base64');
const names = {};
const emit = (name, ext, content) => { const f = `${name}.${hash(content)}.${ext}`; fs.writeFileSync(path.join(out, f), content); names[name + '.' + ext] = '/' + f; };
for (const n of ['player', 'host']) {
  const r = esbuild.buildSync({ entryPoints: [path.join(src, n + '.entry.js')], bundle: true, minify: true, format: 'iife', target: ['es2018'], write: false, legalComments: 'none' });
  emit(n, 'js', r.outputFiles[0].contents);
}
const css = esbuild.transformSync(fs.readFileSync(path.join(src, 'css', 'app.css'), 'utf8').replace('__IUV__', iuv), { loader: 'css', minify: true, target: ['es2018'] }).code;
emit('app', 'css', css);
for (const h of ['index', 'host']) {
  let t = fs.readFileSync(path.join(src, h + '.html'), 'utf8');
  t = t.replace('/app.css', names['app.css']).replace(h === 'index' ? '/player.js' : '/host.js', names[(h === 'index' ? 'player' : 'host') + '.js']);
  t = t.replace(/>\s+</g, '><').replace(/\n/g, '');
  fs.writeFileSync(path.join(out, h + '.html'), t);
}
const size = fs.readdirSync(out).map((f) => `${f} ${fs.statSync(path.join(out, f)).size}`);
console.log(size.join('\n'));
