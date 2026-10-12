/* BER-TLV parser (EMV flavour): multi-byte tags, short/long form lengths, constructed tags, 00/FF padding. */
(function (root) {
  'use strict';
  const QF = root.QF;
  const { bytesToHex } = QF.util;

  function readTag(bytes, p, end) {
    const start = p;
    if (p >= end) throw new Error('Missing tag');
    const first = bytes[p++];
    if ((first & 0x1f) === 0x1f) {
      let b;
      do {
        if (p >= end) throw new Error(`Truncated multi-byte tag ${bytesToHex(bytes, start, p)}…`);
        b = bytes[p++];
      } while (b & 0x80);
    }
    return {
      tag: bytesToHex(bytes, start, p),
      length: p - start,
      constructed: (first & 0x20) !== 0,
      cls: first >> 6, // 0 universal, 1 application, 2 context-specific, 3 private
    };
  }

  function parse(bytes, opts = {}, start = 0, end = bytes.length, depth = 0) {
    const skipPadding = opts.skipPadding !== false;
    const nodes = [];
    let p = start;
    while (p < end) {
      const b = bytes[p];
      if (skipPadding && (b === 0x00 || b === 0xff)) {
        let q = p;
        while (q < end && bytes[q] === b) q++;
        nodes.push({ type: 'padding', offset: p, length: q - p, byte: b, depth });
        p = q;
        continue;
      }
      const offset = p;
      try {
        const t = readTag(bytes, p, end);
        p += t.length;
        if (p >= end) throw new Error(`Tag ${t.tag}: missing length`);
        let len = bytes[p++];
        let lenLen = 1;
        if (len & 0x80) {
          const n = len & 0x7f;
          if (n === 0) throw new Error(`Tag ${t.tag}: indefinite length (80) is not supported`);
          if (n > 4) throw new Error(`Tag ${t.tag}: invalid length byte ${bytesToHex([len])}`);
          if (p + n > end) throw new Error(`Tag ${t.tag}: truncated length field`);
          len = 0;
          for (let i = 0; i < n; i++) len = len * 256 + bytes[p++];
          lenLen = 1 + n;
        }
        if (p + len > end) {
          throw new Error(`Tag ${t.tag}: length ${len} exceeds the ${end - p} byte(s) remaining`);
        }
        const node = {
          type: 'tlv',
          tag: t.tag,
          cls: t.cls,
          constructed: t.constructed,
          offset,
          headerLength: t.length + lenLen,
          length: len,
          totalLength: t.length + lenLen + len,
          valueOffset: p,
          value: bytes.subarray(p, p + len),
          depth,
        };
        if (t.constructed) node.children = parse(bytes, opts, p, p + len, depth + 1);
        nodes.push(node);
        p += len;
      } catch (e) {
        nodes.push({ type: 'error', offset, length: end - offset, raw: bytes.subarray(offset, end), message: e.message, depth });
        break;
      }
    }
    return nodes;
  }

  function walk(nodes, fn, parent = null) {
    for (const n of nodes) {
      fn(n, parent);
      if (n.children) walk(n.children, fn, n);
    }
  }

  function hasError(nodes) {
    let err = false;
    walk(nodes, (n) => {
      if (n.type === 'error') err = true;
    });
    return err;
  }

  /**
   * Text TLV: ASCII tag + decimal ASCII length + value, e.g. "05" "05" "HELLO".
   * Length width may vary per item (lenDigits 'auto' tries 2 then 3 digits), so search for a
   * layout that consumes the whole input.
   */
  function parseText(bytes, opts = {}) {
    const tagLen = opts.tagLen || 2;
    const widths = !opts.lenDigits || opts.lenDigits === 'auto' ? [2, 3] : [+opts.lenDigits];
    const tagRe = opts.digitTags ? /^\d+$/ : /^[0-9A-Za-z]+$/;
    const minLen = opts.minLen || 0;
    const n = bytes.length;
    let s = '';
    for (let i = 0; i < n; i++) s += String.fromCharCode(bytes[i]);
    const dead = new Uint8Array(n + 1);
    let furthest = { pos: 0, items: [] };

    function dfs(p, items) {
      if (p === n) return items;
      if (dead[p]) return null;
      if (p > furthest.pos) furthest = { pos: p, items };
      for (const w of widths) {
        const tag = s.substr(p, tagLen);
        const lenText = s.substr(p + tagLen, w);
        if (tag.length < tagLen || !tagRe.test(tag) || lenText.length < w || !/^\d+$/.test(lenText)) continue;
        const len = parseInt(lenText, 10);
        const valueOffset = p + tagLen + w;
        if (len < minLen || valueOffset + len > n) continue;
        const node = {
          type: 'tlv',
          text: true,
          tag,
          lenText,
          constructed: false,
          offset: p,
          headerLength: tagLen + w,
          length: len,
          totalLength: tagLen + w + len,
          valueOffset,
          value: bytes.subarray(valueOffset, valueOffset + len),
          depth: 0,
        };
        const r = dfs(valueOffset + len, items.concat([node]));
        if (r) return r;
      }
      dead[p] = 1;
      return null;
    }

    const ok = n > 0 ? dfs(0, []) : [];
    if (ok) return ok;
    const p = furthest.pos;
    return furthest.items.concat([
      { type: 'error', offset: p, length: n - p, raw: bytes.subarray(p), depth: 0, message: `No tag/length layout fits the data from offset ${p}` },
    ]);
  }

  QF.tlv = { parse, parseText, readTag, walk, hasError };
})(typeof window !== 'undefined' ? window : globalThis);
