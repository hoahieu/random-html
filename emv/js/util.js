/* Shared helpers: hex/byte conversion, a bounds-checked byte reader, formatting. */
(function (root) {
  'use strict';
  const QF = (root.QF = root.QF || {});

  class ParseError extends Error {
    constructor(message, offset) {
      super(message);
      this.name = 'ParseError';
      this.offset = offset;
    }
  }

  const HEX = '0123456789ABCDEF';

  function cleanHex(s) {
    return String(s).replace(/0x/gi, '').replace(/[\s:,;|_\-]/g, '').toUpperCase();
  }

  function looksLikeHex(s) {
    const h = cleanHex(s);
    return h.length > 0 && h.length % 2 === 0 && /^[0-9A-F]+$/.test(h);
  }

  function hexToBytes(s) {
    const h = cleanHex(s);
    const bad = h.match(/[^0-9A-F]/);
    if (bad) throw new ParseError(`Invalid hex character "${bad[0]}" at position ${bad.index}`, bad.index);
    if (h.length % 2) throw new ParseError(`Hex input has an odd number of digits (${h.length})`);
    const out = new Uint8Array(h.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(h.substr(i * 2, 2), 16);
    return out;
  }

  function bytesToHex(b, start = 0, end = b.length) {
    let s = '';
    for (let i = start; i < end; i++) s += HEX[b[i] >> 4] + HEX[b[i] & 15];
    return s;
  }

  function byteHex(c) {
    return HEX[c >> 4] + HEX[c & 15];
  }

  function textToBytes(s) {
    const out = new Uint8Array(s.length);
    for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i) & 0xff;
    return out;
  }

  function base64ToBytes(s) {
    const clean = String(s).replace(/\s+/g, '');
    if (!/^[A-Za-z0-9+/_-]*={0,2}$/.test(clean)) throw new ParseError('Input is not valid Base64');
    return textToBytes(atob(clean.replace(/-/g, '+').replace(/_/g, '/')));
  }

  /** Convert user input into bytes. mode: auto | hex | text | base64 */
  function toBytes(text, mode) {
    if (mode === 'auto') mode = looksLikeHex(text) ? 'hex' : 'text';
    if (mode === 'hex') return { bytes: hexToBytes(text), mode };
    if (mode === 'base64') return { bytes: base64ToBytes(text), mode };
    return { bytes: textToBytes(String(text).replace(/^[\r\n]+|[\r\n]+$/g, '')), mode: 'text' };
  }

  const isPrintable = (c) => c >= 0x20 && c <= 0x7e;

  function bytesToText(b) {
    let s = '';
    for (let i = 0; i < b.length; i++) s += isPrintable(b[i]) ? String.fromCharCode(b[i]) : '.';
    return s;
  }

  function countNonPrintable(b) {
    let n = 0;
    for (let i = 0; i < b.length; i++) if (!isPrintable(b[i])) n++;
    return n;
  }

  function bytesToInt(b) {
    let n = 0;
    for (let i = 0; i < b.length; i++) n = n * 256 + b[i];
    return n;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  const group3 = (s) => s.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

  /** "000000001050", 2 -> "10.50" */
  function formatAmount(digits, exp) {
    let d = String(digits).replace(/^0+(?=\d)/, '');
    if (!exp) return group3(d);
    d = d.padStart(exp + 1, '0');
    const i = d.length - exp;
    return group3(d.slice(0, i)) + '.' + d.slice(i);
  }

  /** Track 2 / Track 2 equivalent: PAN=YYMM SVC discretionary */
  function parseTrack2(s) {
    const t = String(s).toUpperCase().replace(/F+$/, '').replace(/^;|\?$/g, '');
    const i = t.search(/[D=]/);
    if (i < 0) return { text: t };
    const rest = t.slice(i + 1);
    const lines = [`PAN: ${t.slice(0, i)}`];
    if (rest.length >= 4) lines.push(`Expiry (YYMM): ${rest.slice(0, 4)}`);
    if (rest.length >= 7) lines.push(`Service code: ${rest.slice(4, 7)}`);
    if (rest.length > 7) lines.push(`Discretionary data: ${rest.slice(7)}`);
    return { text: t.slice(0, i) + '=' + rest, lines };
  }

  class Reader {
    constructor(bytes, pos = 0, end = bytes.length) {
      this.bytes = bytes;
      this.pos = pos;
      this.end = end;
    }
    remaining() {
      return this.end - this.pos;
    }
    read(n, what) {
      if (n < 0 || this.pos + n > this.end) {
        throw new ParseError(
          `${what ? what + ': ' : ''}needs ${n} byte(s) at offset ${this.pos}, only ${this.remaining()} left`,
          this.pos
        );
      }
      const out = this.bytes.subarray(this.pos, this.pos + n);
      this.pos += n;
      return out;
    }
  }

  QF.util = {
    ParseError,
    Reader,
    cleanHex,
    looksLikeHex,
    hexToBytes,
    bytesToHex,
    byteHex,
    textToBytes,
    base64ToBytes,
    toBytes,
    isPrintable,
    bytesToText,
    countNonPrintable,
    bytesToInt,
    esc,
    formatAmount,
    parseTrack2,
  };
})(typeof window !== 'undefined' ? window : globalThis);
