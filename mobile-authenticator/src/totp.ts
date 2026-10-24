// TOTP (RFC 6238) implementado desde cero: SHA-1 (FIPS 180-4), HMAC (RFC 2104),
// Base32 (RFC 4648) y truncamiento dinámico (RFC 4226). Sin librerías: funciona en
// modo avión, en Expo Go y en web exactamente igual.

const rotl = (x: number, n: number) => ((x << n) | (x >>> (32 - n))) >>> 0;

export function sha1(message: Uint8Array): Uint8Array {
  // Padding: 0x80, ceros y la longitud en bits (64 bits big-endian) hasta múltiplo de 64 bytes.
  const total = Math.ceil((message.length + 9) / 64) * 64;
  const msg = new Uint8Array(total);
  msg.set(message);
  msg[message.length] = 0x80;
  const view = new DataView(msg.buffer);
  const bitLength = message.length * 8;
  view.setUint32(total - 8, Math.floor(bitLength / 2 ** 32));
  view.setUint32(total - 4, bitLength >>> 0);

  let h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
  const w = new Uint32Array(80);
  for (let block = 0; block < total; block += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(block + i * 4);
    for (let i = 16; i < 80; i++) w[i] = rotl(w[i - 3] ^ w[i - 8] ^ w[i - 14] ^ w[i - 16], 1);

    let a = h0, b = h1, c = h2, d = h3, e = h4;
    for (let i = 0; i < 80; i++) {
      let f: number, k: number;
      if (i < 20) { f = (b & c) | (~b & d); k = 0x5a827999; }
      else if (i < 40) { f = b ^ c ^ d; k = 0x6ed9eba1; }
      else if (i < 60) { f = (b & c) | (b & d) | (c & d); k = 0x8f1bbcdc; }
      else { f = b ^ c ^ d; k = 0xca62c1d6; }
      const temp = (rotl(a, 5) + f + e + k + w[i]) >>> 0;
      e = d; d = c; c = rotl(b, 30); b = a; a = temp;
    }
    h0 = (h0 + a) >>> 0; h1 = (h1 + b) >>> 0; h2 = (h2 + c) >>> 0; h3 = (h3 + d) >>> 0; h4 = (h4 + e) >>> 0;
  }

  const out = new Uint8Array(20);
  const outView = new DataView(out.buffer);
  [h0, h1, h2, h3, h4].forEach((h, i) => outView.setUint32(i * 4, h));
  return out;
}

const BLOCK_SIZE = 64;

export function hmacSha1(key: Uint8Array, message: Uint8Array): Uint8Array {
  const k = new Uint8Array(BLOCK_SIZE);
  k.set(key.length > BLOCK_SIZE ? sha1(key) : key);
  const inner = new Uint8Array(BLOCK_SIZE + message.length);
  const outer = new Uint8Array(BLOCK_SIZE + 20);
  for (let i = 0; i < BLOCK_SIZE; i++) {
    inner[i] = k[i] ^ 0x36;
    outer[i] = k[i] ^ 0x5c;
  }
  inner.set(message, BLOCK_SIZE);
  outer.set(sha1(inner), BLOCK_SIZE);
  return sha1(outer);
}

const B32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Decode(input: string): Uint8Array {
  const clean = input.toUpperCase().replace(/[\s=-]/g, '');
  const out: number[] = [];
  let buffer = 0;
  let bits = 0;
  for (const ch of clean) {
    const value = B32_ALPHABET.indexOf(ch);
    if (value < 0) throw new Error(`Carácter Base32 inválido: "${ch}"`);
    buffer = (buffer << 5) | value;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      out.push((buffer >>> bits) & 0xff);
    }
  }
  if (out.length === 0) throw new Error('El secreto está vacío');
  return new Uint8Array(out);
}

export function hotp(key: Uint8Array, counter: number, digits = 6): string {
  // Contador de 8 bytes big-endian (JS no tiene enteros de 64 bits: se parte en dos de 32).
  const msg = new Uint8Array(8);
  const view = new DataView(msg.buffer);
  view.setUint32(0, Math.floor(counter / 2 ** 32));
  view.setUint32(4, counter >>> 0);
  const hash = hmacSha1(key, msg);
  // Truncamiento dinámico: el nibble bajo del último byte da el offset de 4 bytes.
  const offset = hash[hash.length - 1] & 0x0f;
  const binary =
    ((hash[offset] & 0x7f) << 24) | (hash[offset + 1] << 16) | (hash[offset + 2] << 8) | hash[offset + 3];
  return String(binary % 10 ** digits).padStart(digits, '0');
}

export function totp(secretBase32: string, nowMs = Date.now(), period = 30, digits = 6) {
  const seconds = Math.floor(nowMs / 1000);
  const counter = Math.floor(seconds / period);
  return {
    code: hotp(base32Decode(secretBase32), counter, digits),
    counter,
    remaining: period - (seconds % period),
  };
}

export type OtpAccount = {
  id: string;
  issuer: string;
  account: string;
  secret: string;
  digits: number;
  period: number;
};

// otpauth://totp/Issuer:cuenta?secret=XXXX&issuer=Issuer&algorithm=SHA1&digits=6&period=30
export function parseOtpAuthUri(uri: string): Omit<OtpAccount, 'id'> {
  const match = /^otpauth:\/\/totp\/([^?]*)\?(.*)$/i.exec(uri.trim());
  if (!match) throw new Error('No es una URI otpauth://totp/ válida');
  const params: Record<string, string> = {};
  for (const pair of match[2].split('&')) {
    const [k, v = ''] = pair.split('=');
    params[decodeURIComponent(k).toLowerCase()] = decodeURIComponent(v.replace(/\+/g, ' '));
  }
  if (!params.secret) throw new Error('La URI no trae el parámetro secret');
  if (params.algorithm && params.algorithm.toUpperCase() !== 'SHA1') {
    throw new Error(`Algoritmo no soportado: ${params.algorithm}`);
  }
  const label = decodeURIComponent(match[1]);
  const [labelIssuer, labelAccount] = label.includes(':') ? label.split(':', 2) : ['', label];
  const account = { secret: params.secret.toUpperCase().replace(/\s/g, ''), digits: Number(params.digits ?? 6), period: Number(params.period ?? 30) };
  base32Decode(account.secret); // valida antes de guardar
  return { ...account, issuer: params.issuer ?? labelIssuer, account: (labelAccount ?? label).trim() };
}
