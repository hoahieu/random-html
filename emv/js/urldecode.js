/* URL / form-encoded query string decoder. */
(function (root) {
  'use strict';
  const QF = root.QF;

  // Characters that would make a decoded "key=value&…" line ambiguous: = & %
  const KEEP = new Set(['%3D', '%26', '%25']);

  function decodeRun(run) {
    try {
      return decodeURIComponent(run);
    } catch (e) {
      // Not valid UTF-8: fall back to one byte per escape (Latin-1)
      return run.replace(/%([0-9A-Fa-f]{2})/g, (_, h) => String.fromCharCode(parseInt(h, 16)));
    }
  }

  /** Decode %XX escapes (and + as space when plus=true), optionally keeping = & % encoded. */
  function decode(s, { plus = true, keepSeparators = false } = {}) {
    if (plus) s = s.replace(/\+/g, ' ');
    return s.replace(/(?:%[0-9A-Fa-f]{2})+/g, (run) => {
      if (!keepSeparators) return decodeRun(run);
      const tokens = run.match(/%[0-9A-Fa-f]{2}/g);
      let out = '';
      let pending = '';
      for (const t of tokens) {
        if (KEEP.has(t.toUpperCase())) {
          out += decodeRun(pending) + t.toUpperCase();
          pending = '';
        } else {
          pending += t;
        }
      }
      return out + decodeRun(pending);
    });
  }

  /** Accepts a full URL, a query string ("?a=1&b=2") or form body; splits on & and newlines. */
  function parse(input, opts = {}) {
    let s = String(input).trim();
    const m = s.match(/^[a-z][a-z0-9+.-]*:\/\/[^?#\s]*\?([^#]*)/i);
    let url = null;
    if (m) {
      url = s.slice(0, s.indexOf('?'));
      s = m[1];
    } else if (s.startsWith('?')) {
      s = s.slice(1);
    }
    const params = [];
    for (const part of s.split(/&|\r?\n/)) {
      if (!part) continue;
      const i = part.indexOf('=');
      const rawKey = i < 0 ? part : part.slice(0, i);
      const rawValue = i < 0 ? null : part.slice(i + 1);
      params.push({
        rawKey,
        rawValue,
        key: decode(rawKey, { plus: opts.plus }),
        value: rawValue == null ? null : decode(rawValue, { plus: opts.plus }),
        line:
          decode(rawKey, { plus: opts.plus }) +
          (rawValue == null ? '' : '=' + decode(rawValue, { plus: opts.plus, keepSeparators: opts.keepSeparators })),
      });
    }
    return { url, params };
  }

  /** card[number]=… pos[terminal_data][cvm]=… → nested object (a[]=x appends to an array). */
  function toObject(params) {
    const out = {};
    for (const { key, value } of params) {
      const m = key.match(/^([^[\]]*)((?:\[[^\]]*\])*)$/);
      const path = m ? [m[1]].concat((m[2].match(/\[([^\]]*)\]/g) || []).map((p) => p.slice(1, -1))) : [key];
      let node = out;
      for (let i = 0; i < path.length; i++) {
        const k = path[i];
        const last = i === path.length - 1;
        if (Array.isArray(node) && k === '') {
          if (last) node.push(value);
          else node.push((node = {}));
          continue;
        }
        if (last) {
          if (k in node) node[k] = [].concat(node[k], value);
          else node[k] = value;
        } else {
          if (node[k] == null || typeof node[k] !== 'object') node[k] = path[i + 1] === '' ? [] : {};
          node = node[k];
        }
      }
    }
    return out;
  }

  QF.url = { decode, parse, toObject };
})(typeof window !== 'undefined' ? window : globalThis);
