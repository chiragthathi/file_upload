// All settings live here. Each one can also be overridden with an environment
// variable (shown in brackets), e.g. in start.bat:  set PORT=8080
const path = require('path');

module.exports = {
  // Folder where person folders and photos are saved: the "uploads" folder inside
  // this project. Created automatically if missing. [UPLOAD_DIR]
  uploadDir: process.env.UPLOAD_DIR || path.join(__dirname, 'uploads'),

  // Port the server listens on. [PORT]
  port: Number(process.env.PORT) || 3000,

  // Max size of a single photo, in MB. [MAX_FILE_SIZE_MB]
  maxFileSizeMB: Number(process.env.MAX_FILE_SIZE_MB) || 50,

  // Max number of photos per upload. [MAX_FILES]
  maxFiles: Number(process.env.MAX_FILES) || 30,

  // Force the address used in the QR code, e.g. 192.168.1.20 (leave empty to auto-detect). [HOST_IP]
  hostIp: process.env.HOST_IP || '',

  // Full public URL for the QR code when using an HTTPS tunnel,
  // e.g. https://abc-def.trycloudflare.com  (overrides hostIp/port). [PUBLIC_URL]
  publicUrl: process.env.PUBLIC_URL || '',

  // Open the QR code PNG in the Windows image viewer on startup. [OPEN_QR=false to disable]
  openQrOnStart: process.env.OPEN_QR !== 'false',

  // Allowed photo extensions (lower case).
  allowedExtensions: ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tif', '.tiff', '.heic', '.heif'],
};
