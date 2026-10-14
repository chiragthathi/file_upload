const fs = require('fs');
const os = require('os');
const path = require('path');
const { exec } = require('child_process');
const express = require('express');
const multer = require('multer');
const QRCode = require('qrcode');
const config = require('./config');

const UPLOAD_ROOT = path.resolve(config.uploadDir);
const QR_FILE = path.join(__dirname, 'qr-code.png');
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i;

// ---------- Startup checks ----------
if (!fs.existsSync(UPLOAD_ROOT) || !fs.statSync(UPLOAD_ROOT).isDirectory()) {
  console.error(`\nUpload folder not found: ${UPLOAD_ROOT}`);
  console.error('Create the folder first, or change uploadDir in config.js.\n');
  process.exit(1);
}

// ---------- Name helpers ----------

// Make a string safe to use as a Windows file or folder name.
function sanitize(name, maxLength) {
  let s = String(name || '')
    .normalize('NFC')
    .replace(/[\u0000-\u001f\u007f<>:"/\\|?*]/g, '') // illegal / control chars
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^[.\s]+|[.\s]+$/g, ''); // no leading/trailing dots or spaces
  if (s.length > maxLength) s = s.slice(0, maxLength).trim();
  if (WINDOWS_RESERVED.test(s.split('.')[0])) s = '_' + s;
  return s;
}

// Busboy decodes filenames as latin1; recover UTF-8 names (e.g. Hindi, emoji) when possible.
function decodeOriginalName(name) {
  const utf8 = Buffer.from(name, 'latin1').toString('utf8');
  return utf8.includes('�') ? name : utf8;
}

function safeFileName(originalName) {
  const decoded = decodeOriginalName(originalName);
  const ext = path.extname(decoded); // original extension, case preserved
  let base = sanitize(path.basename(decoded, ext), 150);
  if (!base) base = 'photo';
  return { base, ext };
}

// Atomically create a new file that does not exist yet: "IMG.jpg", "IMG (1).jpg", "IMG (2).jpg" ...
// The 'wx' flag fails if the file exists, so an existing photo is never overwritten.
function createUniqueFile(dir, base, ext, cb, attempt = 0) {
  const name = attempt === 0 ? `${base}${ext}` : `${base} (${attempt})${ext}`;
  const fullPath = path.join(dir, name);
  fs.open(fullPath, 'wx', (err, fd) => {
    if (err && err.code === 'EEXIST' && attempt < 10000) {
      return createUniqueFile(dir, base, ext, cb, attempt + 1);
    }
    if (err) return cb(err);
    cb(null, fd, fullPath, name);
  });
}

// ---------- Multer storage (writes straight into the person's folder) ----------
const storage = {
  _handleFile(req, file, cb) {
    const person = sanitize(req.body && req.body.name, 60);
    if (!person) return cb(httpError(400, 'Please enter your name before choosing photos.'));

    const personDir = path.join(UPLOAD_ROOT, person);
    // Defence in depth: the folder must be directly inside the upload root.
    if (path.dirname(personDir) !== UPLOAD_ROOT) return cb(httpError(400, 'Invalid name.'));

    const { base, ext } = safeFileName(file.originalname);

    fs.mkdir(personDir, { recursive: true }, (mkErr) => {
      if (mkErr) return cb(mkErr);
      req.personDir = personDir;
      createUniqueFile(personDir, base, ext, (openErr, fd, fullPath, savedName) => {
        if (openErr) return cb(openErr);
        req.personFolder = person;
        const out = fs.createWriteStream(fullPath, { fd });
        let failed = false;
        const fail = (e) => {
          if (failed) return;
          failed = true;
          out.destroy();
          // Only removes the incomplete file this request just created.
          fs.unlink(fullPath, () => cb(e));
        };
        file.stream.on('error', fail);
        out.on('error', fail);
        out.on('finish', () => {
          if (!failed) cb(null, { path: fullPath, filename: savedName, size: out.bytesWritten });
        });
        file.stream.pipe(out);
      });
    });
  },
  // Called by multer only for files created by the current, failed request.
  _removeFile(req, file, cb) {
    fs.unlink(file.path, () => cb(null));
  },
};

function fileFilter(req, file, cb) {
  const ext = path.extname(decodeOriginalName(file.originalname)).toLowerCase();
  const mime = (file.mimetype || '').toLowerCase();
  const mimeOk = mime.startsWith('image/') || mime === 'application/octet-stream' || mime === '';
  if (!config.allowedExtensions.includes(ext) || !mimeOk) {
    return cb(httpError(400, `"${file.originalname}" is not a supported photo type.`));
  }
  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.maxFileSizeMB * 1024 * 1024,
    files: config.maxFiles,
    fields: 5,
    fieldSize: 1024,
  },
});

function httpError(status, message) {
  const e = new Error(message);
  e.status = status;
  return e;
}

// ---------- App ----------
const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  next();
});

const pageHtml = fs
  .readFileSync(path.join(__dirname, 'public', 'index.html'), 'utf8')
  .replace(/{{MAX_FILES}}/g, String(config.maxFiles))
  .replace(/{{MAX_FILE_SIZE_MB}}/g, String(config.maxFileSizeMB))
  .replace(/{{ALLOWED_EXT}}/g, config.allowedExtensions.join(','));

app.get('/', (req, res) => res.type('html').send(pageHtml));

app.post('/upload', upload.array('photos', config.maxFiles), (req, res) => {
  const files = req.files || [];
  if (files.length === 0) return res.status(400).json({ ok: false, error: 'No photos received.' });
  console.log(`[${new Date().toLocaleString()}] ${req.personFolder}: saved ${files.length} photo(s)`);
  res.json({ ok: true, folder: req.personFolder, saved: files.map((f) => f.filename) });
});

app.use((req, res) => res.status(404).send('Not found'));

// Error handler: friendly JSON messages for upload errors.
app.use((err, req, res, next) => {
  // If this failed request created a new, still-empty person folder, tidy it up.
  // rmdir only succeeds on an EMPTY folder, so existing photos can never be removed.
  if (req.personDir) fs.rmdir(req.personDir, () => {});
  let status = err.status || 500;
  let message = err.message || 'Upload failed.';
  if (err instanceof multer.MulterError) {
    status = 400;
    if (err.code === 'LIMIT_FILE_SIZE') message = `A photo is larger than ${config.maxFileSizeMB} MB.`;
    else if (err.code === 'LIMIT_FILE_COUNT' || err.code === 'LIMIT_UNEXPECTED_FILE')
      message = `You can upload at most ${config.maxFiles} photos at once.`;
  }
  if (status >= 500) console.error('Upload error:', err);
  res.status(status).json({ ok: false, error: status >= 500 ? 'Server error while saving photos.' : message });
});

// ---------- Network address + QR code ----------
function findLanIp() {
  if (config.hostIp) return config.hostIp;
  const virtual = /vethernet|virtualbox|vmware|hyper-v|wsl|docker|loopback|bluetooth|tailscale|zerotier/i;
  const candidates = [];
  for (const [ifName, addrs] of Object.entries(os.networkInterfaces())) {
    for (const a of addrs || []) {
      if (a.family !== 'IPv4' && a.family !== 4) continue;
      if (a.internal || a.address.startsWith('169.254.')) continue;
      candidates.push({ ifName, address: a.address, isVirtual: virtual.test(ifName) });
    }
  }
  const isPrivate = (ip) => /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip);
  const pick =
    candidates.find((c) => !c.isVirtual && /wi-?fi|wireless|wlan/i.test(c.ifName) && isPrivate(c.address)) ||
    candidates.find((c) => !c.isVirtual && isPrivate(c.address)) ||
    candidates.find((c) => !c.isVirtual) ||
    candidates[0];
  return pick ? pick.address : 'localhost';
}

const server = app.listen(config.port, '0.0.0.0', async () => {
  const url = config.publicUrl ? config.publicUrl.replace(/\/+$/, '') + '/' : `http://${findLanIp()}:${config.port}/`;

  await QRCode.toFile(QR_FILE, url, { type: 'png', width: 600, margin: 2, errorCorrectionLevel: 'M' });
  const terminalQr = await QRCode.toString(url, { type: 'terminal', small: true });

  console.log('\n==============================================');
  console.log(' Photo upload server is running');
  console.log('==============================================');
  console.log(` Upload page : ${url}`);
  console.log(` Saving to   : ${UPLOAD_ROOT}`);
  console.log(` QR code PNG : ${QR_FILE}`);
  console.log(` Limits      : ${config.maxFiles} photos, ${config.maxFileSizeMB} MB each`);
  console.log('\n Scan this QR code with a phone on the same Wi-Fi:\n');
  console.log(terminalQr);
  console.log(' Press Ctrl+C to stop the server.\n');

  if (config.openQrOnStart && process.platform === 'win32') {
    exec(`start "" "${QR_FILE}"`);
  }
});

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`\nPort ${config.port} is already in use. Close the other program or change the port in config.js.\n`);
  } else {
    console.error(err);
  }
  process.exit(1);
});
// Allow slow phone uploads on weak Wi-Fi.
server.requestTimeout = 30 * 60 * 1000;
