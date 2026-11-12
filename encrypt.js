/* eslint-disable @typescript-eslint/no-require-imports */
/* ============================================================================
   encrypt.js  —  AES-256-GCM encryptor for the Private Gallery
   ----------------------------------------------------------------------------
   WHAT IT DOES
     • Reads every image in ./photo/ EXCEPT index.png / index.webp / index.jpg
       (the public portrait stays public).
     • For each file: generates a random 16-byte salt + 12-byte IV, derives a
       256-bit key with PBKDF2 (SHA-256, 250 000+ iterations) from a password
       you type at runtime, and encrypts the file with AES-256-GCM.
     • Writes each ciphertext to ./locked/<name>.enc (base64) and builds
       ./locked/manifest.json describing every file (salt, iv, mime, order).
     • The password is NEVER stored and NEVER written anywhere. It is only
       held in memory while the script runs.

   HOW TO RUN  (from the folder that contains ./photo)
     1.  Put all your private images inside the  `photo/`  folder.
         Keep exactly ONE public portrait named  index.png  (or index.webp /
         index.jpg) — that one is never encrypted.
     2.  Make sure Node.js 18+ is installed.
     3.  Run:
             node encrypt.js
     4.  Type your passphrase when prompted (characters are hidden).
         Re-type to confirm.  REMEMBER IT — there is no recovery.
     5.  Done. You will now have:
             photo/index.png        (public, untouched)
             locked/manifest.json
             locked/<name>.enc  (one per private image)
     6.  UPLOAD ONLY:  index.html ,  photo/index.png ,  and the whole  locked/
         folder.  Do NOT upload encrypt.js, do NOT upload the private source
         images, and do NOT upload anything that contains the password.

   TO RE-ENCRYPT (e.g. you change the password or add images)
     Just delete the  locked/  folder and run  node encrypt.js  again with a
     new passphrase.

   SECURITY NOTES
     • PBKDF2 iterations: 250 000 (override with ITERATIONS env var).
     • Per-file random salt + IV — never reused.
     • AES-256-GCM gives authenticated encryption (tamper-evident).
     • Decryption happens entirely in the visitor's browser via Web Crypto.
   ========================================================================== */

'use strict';
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const webcrypto = crypto.webcrypto; // Node 18+

// Resolve relative to the CURRENT working directory so this script works in your
// deployment: place it next to your `photo/` folder and run `node encrypt.js`
// from there. It reads ./photo and writes ./locked (both siblings of this file).
const ROOT = process.cwd();
const PHOTO_DIR = path.join(ROOT, 'photo');
const LOCKED_DIR = path.join(ROOT, 'locked');
const ITERATIONS = parseInt(process.env.ITERATIONS || '250000', 10);
if (ITERATIONS < 250000) {
  console.warn('⚠  ITERATIONS below 250000 is not recommended.');
}
const PUBLIC_NAMES = ['index.png', 'index.webp', 'index.jpg'];
const MIME = {
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.avif': 'image/avif'
};

/* ---------- password prompt: hidden on TTY, line-buffered when piped ---------- */
let _pipedLines = null;
function readAllStdin() {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (c) => (data += c));
    process.stdin.on('end', () => resolve(data.split(/\r?\n/)));
  });
}
async function askPassword(prompt) {
  process.stdout.write(prompt);
  // Non-interactive (piped stdin) — line-buffer the whole stream once.
  if (!process.stdin.isTTY) {
    if (_pipedLines === null) _pipedLines = await readAllStdin();
    return _pipedLines.shift() || '';
  }
  // Interactive TTY — per-character hidden input.
  return new Promise((resolve) => {
    const stdin = process.stdin, stdout = process.stdout;
    stdin.setEncoding('utf8');
    let data = '';
    function onData(ch) {
      const c = ch.toString();
      if (c === '\u0003' || c === '\u0004') { process.exit(0); }
      else if (c === '\r' || c === '\n') {
        stdin.removeListener('data', onData);
        if (stdin.setRawMode) stdin.setRawMode(false);
        stdout.write('\n'); resolve(data);
      } else if (c === '\u007f' || c === '\b') {
        if (data.length > 0) { data = data.slice(0, -1); stdout.write('\b \b'); }
      } else if (c >= ' ') { data += c; stdout.write('*'); }
    }
    stdin.resume();
    if (stdin.setRawMode) stdin.setRawMode(true);
    stdin.on('data', onData);
  });
}

async function deriveKey(password, salt, iterations) {
  const enc = new TextEncoder();
  const keyMaterial = await webcrypto.subtle.importKey(
    'raw', enc.encode(password), 'PBKDF2', false, ['deriveKey']
  );
  return webcrypto.subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations, hash: 'SHA-256' },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt']
  );
}

function bufToB64(buf) {
  return Buffer.from(buf).toString('base64');
}

async function encryptFile(absPath, password) {
  const ext = path.extname(absPath).toLowerCase();
  const mime = MIME[ext] || 'application/octet-stream';
  const fileBuffer = fs.readFileSync(absPath);
  const iv = webcrypto.getRandomValues(new Uint8Array(12)); // 96-bit nonce
  const salt = webcrypto.getRandomValues(new Uint8Array(16)); // 128-bit salt
  const key = await deriveKey(password, salt, ITERATIONS);
  const cipher = await webcrypto.subtle.encrypt(
    { name: 'AES-GCM', iv }, key, new Uint8Array(fileBuffer)
  );
  const baseName = path.basename(absPath, ext);
  const outFile = `${baseName}.enc`;
  fs.writeFileSync(
    path.join(LOCKED_DIR, outFile),
    Buffer.from(cipher).toString('base64'),
    'utf8'
  );
  return {
    name: path.basename(absPath),
    file: `locked/${outFile}`,
    mime,
    salt: bufToB64(salt),
    iv: bufToB64(iv),
    data: bufToB64(cipher) // also embedded so a single .enc is self-contained
  };
}

async function main() {
  console.log('');
  console.log('  ░ Private Gallery Encryptor ░');
  console.log('  AES-256-GCM · PBKDF2-SHA256 ·', ITERATIONS, 'iterations');
  console.log('');

  if (!fs.existsSync(PHOTO_DIR)) {
    console.error('✖  No ./photo folder found next to this script.');
    console.error('   Create ./photo, drop your images in it, then run again.');
    process.exit(1);
  }
  // collect candidate files
  const files = fs.readdirSync(PHOTO_DIR)
    .filter(f => !f.startsWith('.'))
    .filter(f => {
      const lower = f.toLowerCase();
      const ext = path.extname(lower);
      const isImage = Object.keys(MIME).includes(ext);
      const isPublic = PUBLIC_NAMES.includes(lower);
      return isImage && !isPublic && !lower.endsWith('.enc');
    });

  if (files.length === 0) {
    console.log('  No private images to encrypt (only index.* found, or empty).');
    console.log('  Put your private images in ./photo and run again.');
    process.exit(0);
  }

  console.log('  Found', files.length, 'private image(s):');
  files.forEach(f => console.log('    •', f));
  console.log('');

  const pw = await askPassword('  Passphrase: ');
  if (!pw || pw.length < 6) {
    console.error('\n✖  Passphrase must be at least 6 characters. Aborting.');
    process.exit(1);
  }
  const pw2 = await askPassword('  Confirm:     ');
  if (pw !== pw2) {
    console.error('\n✖  Passphrases did not match. Aborting.');
    process.exit(1);
  }

  if (!fs.existsSync(LOCKED_DIR)) fs.mkdirSync(LOCKED_DIR, { recursive: true });

  const manifest = {
    created: new Date().toISOString(),
    iterations: ITERATIONS,
    algorithm: 'AES-256-GCM',
    kdf: 'PBKDF2-SHA-256',
    files: []
  };

  for (const f of files) {
    const entry = await encryptFile(path.join(PHOTO_DIR, f), pw);
    manifest.files.push(entry);
    console.log('  ✓ encrypted', f, '→', entry.file);
  }

  fs.writeFileSync(
    path.join(LOCKED_DIR, 'manifest.json'),
    JSON.stringify(manifest, null, 2),
    'utf8'
  );

  console.log('');
  console.log('  ✔ Done. Locked', files.length, 'file(s) into ./locked');
  console.log('  ✔ Manifest written to ./locked/manifest.json');
  console.log('');
  console.log('  REMEMBER your passphrase — it is NOT stored anywhere.');
  console.log('  UPLOAD ONLY: index.html, photo/index.png, and the locked/ folder.');
  console.log('');
}

main().catch(err => {
  console.error('\n✖ Encryption failed:', err);
  process.exit(1);
});
