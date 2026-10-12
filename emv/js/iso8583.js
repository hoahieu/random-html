/* ISO 8583 parser with configurable encodings and auto-detection. */
(function (root) {
  'use strict';
  const QF = root.QF;
  const U = QF.util;
  const R = QF.ref;
  const { ParseError, Reader, bytesToHex, bytesToText } = U;

  const DEFAULT_CFG = {
    spec: 'auto', // auto (by MTI version) | 1987 | 1993
    header: 'none', // none | len2 | len2tpdu | tpdu | len4a
    skip: 0, // extra custom header bytes before everything
    mti: 'ascii', // ascii | bcd
    bitmap: 'binary', // binary | ascii (16 hex chars)
    lenPrefix: 'ascii', // ascii | bcd | binary
    numeric: 'ascii', // ascii | bcd
    binary: 'raw', // raw | ascii (hex chars, length = bytes) | asciiChars (hex chars, length = chars)
    overrides: {},
  };

  const OPTIONS = {
    spec: ['1987', '1993'],
    header: ['none', 'len2', 'len2tpdu', 'tpdu', 'len4a'],
    mti: ['bcd', 'ascii'],
    bitmap: ['binary', 'ascii'],
    lenPrefix: ['ascii', 'bcd', 'binary'],
    numeric: ['bcd', 'ascii'],
    binary: ['raw', 'asciiChars', 'ascii'],
  };

  const OPTION_LABELS = {
    spec: { auto: 'Auto (MTI version)', 1987: 'ISO 8583:1987', 1993: 'ISO 8583:1993' },
    header: { none: 'None', len2: '2-byte length', len2tpdu: '2-byte length + TPDU', tpdu: 'TPDU (5 bytes)', len4a: '4-digit ASCII length' },
    mti: { ascii: 'ASCII', bcd: 'BCD' },
    bitmap: { binary: 'Binary', ascii: 'ASCII hex' },
    lenPrefix: { ascii: 'ASCII', bcd: 'BCD', binary: 'Binary' },
    numeric: { ascii: 'ASCII', bcd: 'BCD' },
    binary: { raw: 'Raw bytes', asciiChars: 'ASCII hex (len = chars)', ascii: 'ASCII hex (len = bytes)' },
  };

  // ---------- definitions ----------
  function getDef(id, overrides, spec) {
    return (overrides && overrides[id]) || (spec === '1993' && QF.isoFields1993[id]) || QF.isoFields[id] || { id, type: 'ans', var: 3, len: 999, name: 'Unknown' };
  }

  function typeLabel(def) {
    const t = def.type === 'xn' ? 'x+n' : def.type;
    if (!def.var) return `${t} ${def.type === 'b' ? def.len * 8 : def.len}`;
    return `${t} ..${def.len} ${'L'.repeat(def.var)}VAR`;
  }

  /** "55:b:LLL:999, 48:ans:LLL:999:My name" -> overrides map */
  function parseOverrides(text) {
    const out = {};
    const items = String(text || '')
      .split(/[,;\n]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    for (const item of items) {
      const parts = item.split(':').map((s) => s.trim());
      const id = parseInt(parts[0], 10);
      if (!(id >= 2 && id <= 128) || parts.length < 4) {
        throw new Error(`Bad override "${item}" — use id:type:fixed|LL|LLL:maxLen[:name]`);
      }
      let type = parts[1].toLowerCase();
      const tlv = type === 'tlv';
      if (tlv) type = 'b';
      if (!['n', 'z', 'b', 'xn', 'a', 'an', 'ans', 'ns', 'anp'].includes(type)) throw new Error(`Unknown type "${parts[1]}" in "${item}"`);
      const lt = parts[2].toUpperCase().replace(/VAR$/, '');
      const v = { FIXED: 0, F: 0, '0': 0, LL: 2, '2': 2, LLL: 3, '3': 3, LLLL: 4, '4': 4 }[lt];
      if (v === undefined) throw new Error(`Unknown length type "${parts[2]}" in "${item}"`);
      const len = parseInt(parts[3], 10);
      if (!(len > 0)) throw new Error(`Bad length in "${item}"`);
      const base = QF.isoFields[id];
      out[id] = { id, type, var: v, len, name: parts[4] || (base ? base.name : 'Custom'), tlv: tlv || (id === 55 && type === 'b'), custom: true };
    }
    return out;
  }

  // ---------- low level readers ----------
  function readLenPrefix(r, digits, enc, what) {
    const off = r.pos;
    if (enc === 'ascii') {
      const s = bytesToText(r.read(digits, what));
      if (!/^\d+$/.test(s)) throw new ParseError(`${what}: expected ${digits} ASCII digits, got "${s}"`, off);
      return parseInt(s, 10);
    }
    if (enc === 'bcd') {
      const h = bytesToHex(r.read(Math.ceil(digits / 2), what));
      if (!/^\d+$/.test(h)) throw new ParseError(`${what}: invalid BCD length ${h}`, off);
      return parseInt(h, 10);
    }
    return U.bytesToInt(r.read(digits <= 2 ? 1 : 2, what));
  }

  /** BCD of odd length carries one pad nibble — leading 0 or trailing F/0. */
  function fitDigits(h, len) {
    if (h.length === len) return h;
    if (/F$/.test(h)) return h.slice(0, len);
    if (h[0] === '0') return h.slice(h.length - len);
    return h.slice(0, len);
  }

  function isHexText(b) {
    for (let i = 0; i < b.length; i++) {
      const c = b[i];
      if (!((c >= 0x30 && c <= 0x39) || (c >= 0x41 && c <= 0x46) || (c >= 0x61 && c <= 0x66))) return false;
    }
    return true;
  }

  function readBitmap(r, cfg, what) {
    const off = r.pos;
    if (cfg.bitmap === 'binary') return r.read(8, what);
    const t = bytesToText(r.read(16, what));
    if (!/^[0-9A-Fa-f]{16}$/.test(t)) throw new ParseError(`${what}: expected 16 hex characters, got "${t}"`, off);
    return U.hexToBytes(t);
  }

  function bitsOf(bm, base) {
    const out = [];
    for (let i = 0; i < 64; i++) if (bm[i >> 3] & (0x80 >> (i & 7))) out.push(base + i + 1);
    return out;
  }

  function parseField(r, def, cfg, res, strict) {
    const what = `DE ${def.id}`;
    const offset = r.pos;
    let len = def.len;
    if (def.var) {
      len = readLenPrefix(r, def.var, cfg.lenPrefix, `${what} length`);
      if (len > def.len) {
        const m = `${what}: length ${len} exceeds maximum ${def.len}`;
        if (strict) throw new ParseError(m, offset);
        res.warnings.push(m);
      }
    }
    const f = { id: def.id, def, offset, prefixLen: r.pos - offset, len, valueOffset: r.pos, valueScale: 1 };
    const t = def.type;

    if (t === 'n' || t === 'z') {
      if (cfg.numeric === 'bcd') {
        f.raw = r.read(Math.ceil(len / 2), what);
        f.value = fitDigits(bytesToHex(f.raw), len);
      } else {
        f.raw = r.read(len, what);
        f.value = bytesToText(f.raw);
      }
      const ok = t === 'n' ? /^\d*$/.test(f.value) : /^[0-9D=]*$/i.test(f.value);
      if (!ok) {
        res.penalty += 3;
        f.warn = 'Contains non-numeric characters';
      }
    } else if (t === 'xn') {
      if (cfg.numeric === 'bcd') {
        const sign = bytesToText(r.read(1, what));
        f.value = sign + fitDigits(bytesToHex(r.read(Math.ceil(len / 2), what)), len);
      } else {
        f.value = bytesToText(r.read(len + 1, what));
      }
      f.raw = r.bytes.subarray(f.valueOffset, r.pos);
      if (!/^[CD]\d+$/.test(f.value)) {
        res.penalty += 3;
        f.warn = 'Expected C/D followed by digits';
      }
    } else if (t === 'b') {
      if (cfg.binary === 'ascii' || cfg.binary === 'asciiChars') {
        const n = def.var && cfg.binary === 'asciiChars' ? len : len * 2;
        const txt = bytesToText(r.read(n, what));
        if (/^[0-9A-Fa-f]*$/.test(txt) && n % 2 === 0) {
          f.raw = U.hexToBytes(txt);
          f.valueScale = 2;
        } else {
          if (strict) throw new ParseError(`${what}: expected hex characters`, f.valueOffset);
          f.raw = r.bytes.subarray(f.valueOffset, r.pos);
          f.warn = 'Expected hex characters';
        }
      } else {
        f.raw = r.read(len, what);
        // Binary data that is really ASCII hex text: prefer an ASCII-hex encoding when auto-detecting,
        // and decode it so TLV fields (DE 55) still parse.
        if (len >= 2 && len % 2 === 0 && isHexText(f.raw)) {
          res.penalty += 1;
          if (def.tlv) {
            f.raw = U.hexToBytes(bytesToText(f.raw));
            f.valueScale = 2;
          }
        }
      }
      f.value = bytesToHex(f.raw);
    } else {
      f.raw = r.read(len, what);
      f.value = bytesToText(f.raw);
      const np = U.countNonPrintable(f.raw);
      if (np) {
        res.penalty += 1 + np;
        f.warn = `${np} non-printable byte(s)`;
      }
    }
    f.length = r.pos - offset;
    return f;
  }

  // ---------- main parse ----------
  function parse(bytes, cfgIn, opts = {}) {
    const cfg = Object.assign({}, DEFAULT_CFG, cfgIn);
    const strict = !!opts.strict;
    const res = { bytes, cfg, spec: cfg.spec === 'auto' ? '1987' : cfg.spec, elements: [], fields: [], errors: [], warnings: [], penalty: 0, mti: null, present: [], trailing: 0 };
    const r = new Reader(bytes);
    const el = (o) => (res.elements.push(o), o);

    try {
      if (cfg.skip > 0) {
        const off = r.pos;
        el({ id: 'hdr-skip', kind: 'header', label: 'Custom header', offset: off, length: cfg.skip, value: bytesToHex(r.read(cfg.skip, 'Custom header')) });
      }
      if (cfg.header === 'len2' || cfg.header === 'len2tpdu' || cfg.header === 'len4a') {
        const off = r.pos;
        let v;
        if (cfg.header === 'len4a') {
          const s = bytesToText(r.read(4, 'Length header'));
          if (!/^\d{4}$/.test(s)) throw new ParseError(`Length header: expected 4 ASCII digits, got "${s}"`, off);
          v = parseInt(s, 10);
        } else {
          v = U.bytesToInt(r.read(2, 'Length header'));
        }
        const rem = r.remaining();
        const ok = v === rem;
        el({
          id: 'hdr-len',
          kind: 'header',
          label: cfg.header === 'len4a' ? 'Length header (ASCII)' : 'Length header (binary)',
          offset: off,
          length: r.pos - off,
          value: String(v),
          desc: ok ? 'Matches message length' : `Message after header is ${rem} bytes`,
        });
        if (!ok) {
          const m = `Length header says ${v} bytes but ${rem} follow`;
          if (strict) throw new ParseError(m, off);
          res.warnings.push(m);
        }
      }
      if (cfg.header === 'tpdu' || cfg.header === 'len2tpdu') {
        const off = r.pos;
        const h = bytesToHex(r.read(5, 'TPDU'));
        el({ id: 'hdr-tpdu', kind: 'header', label: 'TPDU', offset: off, length: 5, value: h, desc: `ID ${h.slice(0, 2)} · Destination ${h.slice(2, 6)} · Source ${h.slice(6, 10)}` });
        if (h[0] !== '6') res.penalty += 3;
      }

      // MTI
      const mOff = r.pos;
      const mti = cfg.mti === 'bcd' ? bytesToHex(r.read(2, 'MTI')) : bytesToText(r.read(4, 'MTI'));
      if (!/^\d{4}$/.test(mti)) throw new ParseError(`Invalid MTI "${mti}" at offset ${mOff}`, mOff);
      res.mti = mti;
      res.spec = cfg.spec === 'auto' ? (mti[0] === '1' ? '1993' : '1987') : cfg.spec;
      if ((res.spec === '1993') !== (mti[0] === '1')) res.penalty += 2;
      el({ id: 'mti', kind: 'mti', label: 'Message type indicator', offset: mOff, length: r.pos - mOff, value: mti, desc: mtiInfo(mti).summary });
      if (!'0129'.includes(mti[0])) res.penalty += 4;
      if (mti[1] === '0') res.penalty += 4;
      if (+mti[3] > 5) res.penalty += 2;

      // Primary bitmap
      const bOff = r.pos;
      const bm = readBitmap(r, cfg, 'Primary bitmap');
      const present = bitsOf(bm, 0);
      res.present = present;
      el({ id: 'bm', kind: 'bitmap', label: 'Primary bitmap', offset: bOff, length: r.pos - bOff, value: bytesToHex(bm), desc: `${present.length} bit(s) set` });
      if (!present.length) res.penalty += 10;

      // Data elements (secondary bitmap = DE 1 extends the list while iterating)
      for (const id of present) {
        const def = getDef(id, cfg.overrides, res.spec);
        let f;
        if ((id === 1 || id === 65) && !def.custom) {
          const off = r.pos;
          const b = readBitmap(r, cfg, def.name);
          f = { id, def, offset: off, prefixLen: 0, len: 8, raw: b, value: bytesToHex(b), valueOffset: off, valueScale: cfg.bitmap === 'ascii' ? 2 : 1, length: r.pos - off };
          if (id === 1) present.push(...bitsOf(b, 64));
        } else {
          f = parseField(r, def, cfg, res, strict);
        }
        if (def.tlv && f.raw && f.raw.length) {
          f.tlv = QF.tlv.parse(f.raw);
          if (QF.tlv.hasError(f.tlv)) res.penalty += 2;
        }
        res.fields.push(f);
        el({ id: 'f' + id, kind: 'field', offset: f.offset, length: f.length, prefixLen: f.prefixLen, field: f });
      }

      if (r.remaining() > 0) {
        res.trailing = r.remaining();
        const off = r.pos;
        el({ id: 'trailing', kind: 'trailing', label: 'Unparsed trailing bytes', offset: off, length: res.trailing, value: bytesToHex(r.read(res.trailing)) });
        res.warnings.push(`${res.trailing} trailing byte(s) were not consumed by any field`);
      }
    } catch (e) {
      res.errors.push(e.message);
      const last = res.elements[res.elements.length - 1];
      const off = last ? last.offset + last.length : 0;
      res.errorOffset = typeof e.offset === 'number' ? e.offset : r.pos;
      if (off < bytes.length) {
        el({ id: 'unparsed', kind: 'trailing', label: 'Unparsed bytes', offset: off, length: bytes.length - off, value: bytesToHex(bytes, off) });
      }
    }

    if (!opts.skipDecode) decorate(res);
    return res;
  }

  function score(res) {
    let s = -res.penalty;
    if (res.errors.length) s -= 100000 - res.fields.length * 10;
    if (res.trailing) s -= 500 + res.trailing;
    if (res.cfg.header !== 'none') s -= 1;
    return s;
  }

  /** Try every encoding combination and keep the one that consumes the message most cleanly. */
  function autodetect(text, base = {}) {
    const modes = [];
    const inputMode = base.inputMode || 'auto';
    if (inputMode === 'auto') {
      if (U.looksLikeHex(text)) modes.push('hex');
      modes.push('text');
    } else {
      modes.push(inputMode);
    }
    // Raw text often picks up trailing whitespace when copied; try it trimmed too.
    const candidates = [];
    for (const mode of modes) {
      try {
        candidates.push({ mode, bytes: U.toBytes(text, mode).bytes, cost: mode === 'text' ? 1 : 0 });
        if (mode === 'text' && /\s$/.test(text)) {
          candidates.push({ mode, bytes: U.toBytes(text.replace(/\s+$/, ''), mode).bytes, cost: 2, trimmed: true });
        }
      } catch (e) {
        if (modes.length === 1) throw e;
      }
    }
    let best = null;
    for (const { mode, bytes, cost, trimmed } of candidates) {
      for (const spec of OPTIONS.spec)
      for (const header of OPTIONS.header)
        for (const mti of OPTIONS.mti)
          for (const bitmap of OPTIONS.bitmap)
            for (const lenPrefix of OPTIONS.lenPrefix)
              for (const numeric of OPTIONS.numeric)
                for (const binary of OPTIONS.binary) {
                  const cfg = { spec, header, mti, bitmap, lenPrefix, numeric, binary, skip: base.skip || 0, overrides: base.overrides || {} };
                  const res = parse(bytes, cfg, { strict: true, skipDecode: true });
                  const sc = score(res) - cost;
                  if (!best || sc > best.score) best = { score: sc, cfg, bytes, mode, trimmed };
                }
    }
    if (!best) throw new ParseError('Could not interpret input');
    return {
      cfg: best.cfg,
      inputMode: best.mode,
      trimmed: !!best.trimmed,
      confident: best.score > -500,
      result: parse(best.bytes, best.cfg),
    };
  }

  // ---------- semantics ----------
  const MTI_VERSION = { 0: 'ISO 8583:1987', 1: 'ISO 8583:1993', 2: 'ISO 8583:2003', 8: 'Reserved for national use', 9: 'Reserved for private use' };
  const MTI_CLASS = {
    1: 'Authorization',
    2: 'Financial',
    3: 'File actions',
    4: 'Reversal / chargeback',
    5: 'Reconciliation',
    6: 'Administrative',
    7: 'Fee collection',
    8: 'Network management',
    9: 'Reserved',
  };
  const MTI_FUNCTION = {
    0: 'Request',
    1: 'Request response',
    2: 'Advice',
    3: 'Advice response',
    4: 'Notification',
    5: 'Notification acknowledgement',
    6: 'Instruction',
    7: 'Instruction acknowledgement',
  };
  const MTI_ORIGIN = { 0: 'Acquirer', 1: 'Acquirer repeat', 2: 'Issuer', 3: 'Issuer repeat', 4: 'Other', 5: 'Other repeat' };

  function mtiInfo(mti) {
    const parts = [
      ['Version', MTI_VERSION[mti[0]] || 'Reserved'],
      ['Class', MTI_CLASS[mti[1]] || 'Reserved'],
      ['Function', MTI_FUNCTION[mti[2]] || 'Reserved'],
      ['Origin', MTI_ORIGIN[mti[3]] || 'Reserved'],
    ];
    return { parts, summary: `${parts[1][1]} ${parts[2][1].toLowerCase()} · ${parts[3][1]}` };
  }

  const lk = (table, code) => (table[code] ? `${code} ${table[code]}` : null);

  function amountWithCurrency(v, cur) {
    if (!/^\d+$/.test(v)) return null;
    const exp = cur ? R.currencyExp(cur) : null;
    if (exp == null) return { text: `${U.formatAmount(v, 0)} (minor units)` };
    return { text: `${U.formatAmount(v, exp)} ${R.currencyAlpha(cur)}` };
  }

  function mmdd(v) {
    return /^\d{4}$/.test(v) ? `${v.slice(0, 2)}-${v.slice(2)} (MM-DD)` : null;
  }

  function decodeField(f, ctx) {
    const v = f.value;
    switch (f.id) {
      case 3: {
        if (!/^\d{6}$/.test(v)) return null;
        const t = R.processingTypes[v.slice(0, 2)] || 'Unknown';
        return {
          text: t,
          lines: [`Transaction type: ${v.slice(0, 2)} ${t}`, `From account: ${lk(R.accountTypes, v.slice(2, 4)) || v.slice(2, 4)}`, `To account: ${lk(R.accountTypes, v.slice(4, 6)) || v.slice(4, 6)}`],
        };
      }
      case 4:
        return amountWithCurrency(v, ctx[49]);
      case 5:
        return amountWithCurrency(v, ctx[50]);
      case 6:
        return amountWithCurrency(v, ctx[51]);
      case 7:
        return /^\d{10}$/.test(v) ? { text: `${v.slice(0, 2)}-${v.slice(2, 4)} ${v.slice(4, 6)}:${v.slice(6, 8)}:${v.slice(8, 10)} (MM-DD hh:mm:ss)` } : null;
      case 12:
        if (/^\d{6}$/.test(v)) return { text: `${v.slice(0, 2)}:${v.slice(2, 4)}:${v.slice(4, 6)}` };
        if (/^\d{12}$/.test(v)) return { text: `20${v.slice(0, 2)}-${v.slice(2, 4)}-${v.slice(4, 6)} ${v.slice(6, 8)}:${v.slice(8, 10)}:${v.slice(10, 12)}` };
        return null;
      case 13:
      case 15:
      case 16:
      case 17: {
        const t = mmdd(v);
        return t ? { text: t } : null;
      }
      case 14:
        return /^\d{4}$/.test(v) ? { text: `${v.slice(2)}/${v.slice(0, 2)} (MM/YY)` } : null;
      case 18:
        return R.mcc[v] ? { text: R.mcc[v] } : null;
      case 19:
      case 20:
      case 21:
      case 68:
      case 69: {
        const t = R.countryText(v);
        return t ? { text: t } : null;
      }
      case 22: {
        if (!/^\d{3,4}$/.test(v)) return null;
        const d = v.length === 4 ? v.slice(1) : v;
        return { text: R.panEntryModes[d.slice(0, 2)] || 'Unknown PAN entry mode', lines: [`PAN entry: ${lk(R.panEntryModes, d.slice(0, 2)) || d.slice(0, 2)}`, `PIN entry: ${lk(R.pinEntryCaps, d[2]) || d[2]}`] };
      }
      case 25:
        return R.posConditionCodes[v] ? { text: R.posConditionCodes[v] } : null;
      case 35:
        return U.parseTrack2(v);
      case 39:
        return R.responseCodes[v] ? { text: R.responseCodes[v] } : null;
      case 49:
      case 50:
      case 51: {
        const t = R.currencyText(v);
        return t ? { text: t } : null;
      }
      case 52:
        return { text: 'Encrypted PIN block' };
      case 54: {
        const lines = [];
        for (let i = 0; i + 20 <= v.length; i += 20) {
          const b = v.slice(i, i + 20);
          const cur = b.slice(4, 7);
          const amt = amountWithCurrency(b.slice(8), cur);
          lines.push(`Account ${b.slice(0, 2)}, amount type ${b.slice(2, 4)}: ${b[7] === 'D' ? '-' : ''}${amt ? amt.text : b.slice(8)}`);
        }
        return lines.length ? { text: `${lines.length} amount(s)`, lines } : null;
      }
      case 64:
      case 128:
        return { text: 'MAC' };
      case 70:
        return R.networkMgmtCodes[v] ? { text: R.networkMgmtCodes[v] } : null;
      case 90:
        if (!/^\d{42}$/.test(v)) return null;
        return {
          text: `Original MTI ${v.slice(0, 4)}, STAN ${v.slice(4, 10)}`,
          lines: [`Original MTI: ${v.slice(0, 4)}`, `Original STAN: ${v.slice(4, 10)}`, `Original transmission date/time: ${v.slice(10, 20)}`, `Original acquirer ID: ${v.slice(20, 31)}`, `Original forwarder ID: ${v.slice(31, 42)}`],
        };
      default:
        return null;
    }
  }

  function decorate(res) {
    const ctx = {};
    for (const f of res.fields) ctx[f.id] = f.value;
    for (const f of res.fields) {
      try {
        f.decoded = decodeField(f, ctx);
      } catch (e) {
        f.decoded = null;
      }
      // Private-use text fields (e.g. DE 127) often carry text TLV: "05" "15" "attendedinpayee"…
      const t = f.def.type;
      if (!f.tlv && f.def.var && f.id !== 2 && /^(an|ans|ns|a|anp)$/.test(t) && f.raw && f.raw.length >= 8) {
        const nodes = QF.tlv.parseText(f.raw, { tagLen: 2, lenDigits: 'auto', digitTags: true, minLen: 1 });
        if (nodes.length >= 2 && !QF.tlv.hasError(nodes)) {
          f.tlv = nodes;
          f.textTlv = true;
        }
      }
    }
  }

  QF.iso = { DEFAULT_CFG, OPTIONS, OPTION_LABELS, parse, autodetect, parseOverrides, typeLabel, getDef, mtiInfo };
})(typeof window !== 'undefined' ? window : globalThis);
