#!/usr/bin/env node
// Generates PNG icons by resizing the source favicon.png to each required size.
// Uses only Node built-ins + zlib — no npm deps.

const fs   = require('fs');
const path = require('path');
const zlib = require('zlib');

const SRC   = path.join(__dirname, '..', 'favicon.png');
const OUT   = path.join(__dirname, '..', 'icons');
const SIZES = [16, 32, 48, 128];

// ─── Minimal PNG parser (handles 8-bit RGB/RGBA) ────────────────────────────

function parsePNG(buf) {
  let pos = 8; // skip signature

  function readChunk() {
    const len  = buf.readUInt32BE(pos); pos += 4;
    const type = buf.slice(pos, pos + 4).toString('ascii'); pos += 4;
    const data = buf.slice(pos, pos + len); pos += len;
    pos += 4; // crc
    return { type, data };
  }

  let width, height, bitDepth, colorType;
  const idatChunks = [];

  while (pos < buf.length) {
    const { type, data } = readChunk();
    if (type === 'IHDR') {
      width     = data.readUInt32BE(0);
      height    = data.readUInt32BE(4);
      bitDepth  = data[8];
      colorType = data[9];
    } else if (type === 'IDAT') {
      idatChunks.push(data);
    } else if (type === 'IEND') {
      break;
    }
  }

  const channels = colorType === 2 ? 3 : colorType === 6 ? 4 : colorType === 0 ? 1 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idatChunks));

  // Un-filter rows
  const stride  = width * channels;
  const pixels  = Buffer.alloc(height * stride);

  for (let y = 0; y < height; y++) {
    const filterByte = raw[y * (stride + 1)];
    const rowStart   = y * (stride + 1) + 1;
    const prevRow    = y > 0 ? pixels.slice((y - 1) * stride, y * stride) : Buffer.alloc(stride);
    const outRow     = pixels.slice(y * stride, (y + 1) * stride);

    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? outRow[x - channels] : 0;
      const b = prevRow[x];
      const c = x >= channels ? prevRow[x - channels] : 0;
      const byte = raw[rowStart + x];
      switch (filterByte) {
        case 0: outRow[x] = byte; break;
        case 1: outRow[x] = (byte + a) & 0xff; break;
        case 2: outRow[x] = (byte + b) & 0xff; break;
        case 3: outRow[x] = (byte + Math.floor((a + b) / 2)) & 0xff; break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          const pr = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          outRow[x] = (byte + pr) & 0xff; break;
        }
      }
    }
  }

  return { width, height, channels, pixels };
}

// ─── Nearest-neighbour resize → RGBA ────────────────────────────────────────

function resize(src, dstSize) {
  const { width: sw, height: sh, channels, pixels } = src;
  const out = Buffer.alloc(dstSize * dstSize * 4);

  for (let dy = 0; dy < dstSize; dy++) {
    for (let dx = 0; dx < dstSize; dx++) {
      const sx  = Math.min(Math.floor(dx * sw / dstSize), sw - 1);
      const sy  = Math.min(Math.floor(dy * sh / dstSize), sh - 1);
      const si  = (sy * sw + sx) * channels;
      const di  = (dy * dstSize + dx) * 4;

      if (channels === 1) {
        out[di] = out[di + 1] = out[di + 2] = pixels[si];
        out[di + 3] = 255;
      } else if (channels === 3) {
        out[di]     = pixels[si];
        out[di + 1] = pixels[si + 1];
        out[di + 2] = pixels[si + 2];
        out[di + 3] = 255;
      } else {
        out[di]     = pixels[si];
        out[di + 1] = pixels[si + 1];
        out[di + 2] = pixels[si + 2];
        out[di + 3] = pixels[si + 3];
      }
    }
  }
  return out;
}

// ─── Minimal PNG encoder ────────────────────────────────────────────────────

function u32(n) { const b = Buffer.alloc(4); b.writeUInt32BE(n); return b; }

function crc32(buf) {
  let crc = 0xffffffff;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type, data) {
  const typeB = Buffer.from(type, 'ascii');
  const body  = Buffer.concat([typeB, data]);
  return Buffer.concat([u32(data.length), body, u32(crc32(body))]);
}

function encodePNG(rgba, size) {
  const IHDR = Buffer.alloc(13);
  IHDR.writeUInt32BE(size, 0);
  IHDR.writeUInt32BE(size, 4);
  IHDR[8] = 8; IHDR[9] = 6; // RGBA

  const rows = [];
  for (let y = 0; y < size; y++) {
    rows.push(Buffer.from([0x00]));
    rows.push(rgba.slice(y * size * 4, (y + 1) * size * 4));
  }
  const compressed = zlib.deflateRawSync(Buffer.concat(rows));

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', IHDR),
    pngChunk('IDAT', compressed),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

// ─── Main ────────────────────────────────────────────────────────────────────

fs.mkdirSync(OUT, { recursive: true });
const src = parsePNG(fs.readFileSync(SRC));

for (const size of SIZES) {
  const rgba = resize(src, size);
  const png  = encodePNG(rgba, size);
  const file = path.join(OUT, `icon${size}.png`);
  fs.writeFileSync(file, png);
  console.log(`  wrote ${file}  (${png.length} bytes)`);
}
console.log('Done.');
