// Uso: npm run qr -- https://tu-url-publica.example   -> escribe qr.png (1024px, navy sobre blanco, para imprimir)
const QRCode = require('qrcode');
const url = process.argv[2];
if (!url) { console.error('Falta la URL: npm run qr -- https://tu-sitio'); process.exit(1); }
QRCode.toFile(require('path').join(__dirname, '..', 'qr.png'), url, { width: 1024, margin: 3, errorCorrectionLevel: 'H', color: { dark: '#14213D', light: '#FFFFFF' } })
  .then(() => console.log('qr.png generado para', url));
