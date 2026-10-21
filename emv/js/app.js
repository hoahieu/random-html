/* UI wiring: tabs, rendering, hex view linking, persistence. */
(function () {
  'use strict';
  const { util: U, iso, tlv, emv } = QF;
  const { esc } = U;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

  // Saved inputs live under "qf2.". Older builds saved their built-in sample data under "qf.",
  // so drop those keys once to make sure the inputs start empty.
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith('qf.'))
      .forEach((k) => localStorage.removeItem(k));
  } catch (e) {
    /* storage unavailable */
  }

  const store = {
    get(k, d) {
      try {
        const v = localStorage.getItem('qf2.' + k);
        return v === null ? d : JSON.parse(v);
      } catch (e) {
        return d;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem('qf2.' + k, JSON.stringify(v));
      } catch (e) {
        /* storage unavailable */
      }
    },
  };

  // ---------- small helpers ----------
  function debounce(fn, ms) {
    let t;
    return (...a) => {
      clearTimeout(t);
      t = setTimeout(() => fn(...a), ms);
    };
  }

  let toastTimer;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => (el.hidden = true), 1600);
  }

  async function copy(text, msg = 'Copied to clipboard') {
    try {
      await navigator.clipboard.writeText(text);
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      ta.remove();
    }
    toast(msg);
  }

  function statusHTML(items) {
    return items.map(([cls, text]) => `<div class="msg ${cls}">${esc(text)}</div>`).join('');
  }

  function decodedHTML(d, warn) {
    let h = '';
    if (d) {
      h += `<div class="dtext${d.guess ? ' guess' : ''}">${esc(d.text)}</div>`;
      if (d.lines && d.lines.length) h += `<ul class="dlines">${d.lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`;
    }
    if (warn) h += `<div class="fwarn">⚠ ${esc(warn)}</div>`;
    return h;
  }

  // ---------- share links: ?iso8583=… ?tlv=… ?urldecode=… ----------
  const SHARE = {
    iso: { param: 'iso8583', input: '#iso-input' },
    tlv: { param: 'tlv', input: '#tlv-input' },
    url: { param: 'urldecode', input: '#url-input' },
  };

  function shareLink(tab) {
    const value = $(SHARE[tab].input).value.trim();
    if (!value) return toast('Nothing to share yet');
    const u = new URL(location.pathname, location.origin);
    u.searchParams.set(SHARE[tab].param, value);
    copy(u.toString(), 'Link copied');
  }

  /** Fill inputs from the query string; returns the tab to open, if any. */
  function loadShareParams() {
    const qs = new URLSearchParams(location.search);
    let tab = null;
    for (const [t, { param, input }] of Object.entries(SHARE)) {
      const v = qs.get(param) ?? (t === 'url' ? qs.get('url') : null);
      if (v == null) continue;
      $(input).value = v;
      tab = tab || t;
      // Shared links decode with auto-detection, regardless of options saved in this browser
      if (t === 'iso') {
        $('#iso-inputMode').value = 'auto';
        $('#iso-auto').checked = true;
      }
      if (t === 'tlv') $('#tlv-inputMode').value = 'auto';
    }
    return tab;
  }

  /** Once the input is edited, the shared query no longer matches it — drop it from the address bar. */
  function clearShareParams() {
    if (location.search) history.replaceState(null, '', location.pathname + location.hash);
  }

  // ---------- tabs & theme ----------
  function showTab(name) {
    if (!['iso', 'tlv', 'url', 'ref'].includes(name)) name = 'iso';
    $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
    $$('.view').forEach((v) => (v.hidden = v.id !== 'view-' + name));
    // Drop a deep-link hash once used, so a reload goes back to the default (ISO 8583) tab
    if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  }

  function applyTheme(t) {
    if (t) document.documentElement.dataset.theme = t;
    else delete document.documentElement.dataset.theme;
  }

  // ---------- hex view ----------
  function createHexView(el) {
    const api = { owner: [], segs: {}, current: null };
    let bytesEls = [];
    let asciiEls = [];

    api.render = function (bytes, segList) {
      const n = bytes.length;
      const color = new Array(n).fill(null);
      const pfx = new Uint8Array(n);
      const owner = new Array(n).fill(null);
      const segs = {};
      for (const s of segList) {
        segs[s.id] = s;
        const end = Math.min(n, s.offset + s.length);
        for (let i = s.offset; i < end; i++) {
          owner[i] = s.id;
          if (s.color != null) color[i] = s.color;
          if (i < s.offset + (s.prefixLen || 0)) pfx[i] = 1;
        }
      }
      let html = '';
      for (let r = 0; r < n; r += 16) {
        let hb = '';
        let ha = '';
        for (let i = r; i < Math.min(n, r + 16); i++) {
          const cls = (color[i] != null ? ' c' + color[i] : '') + (pfx[i] ? ' p' : '');
          hb += `<span class="hb${cls}" data-i="${i}">${U.byteHex(bytes[i])}</span>`;
          ha += `<span class="ha${cls}" data-i="${i}">${U.isPrintable(bytes[i]) ? esc(String.fromCharCode(bytes[i])) : '.'}</span>`;
        }
        html += `<div class="hx-row"><span class="hx-off">${r.toString(16).toUpperCase().padStart(4, '0')}</span><span class="hx-bytes">${hb}</span><span class="hx-ascii">${ha}</span></div>`;
      }
      el.innerHTML = html;
      bytesEls = el.querySelectorAll('.hb');
      asciiEls = el.querySelectorAll('.ha');
      api.owner = owner;
      api.segs = segs;
      api.current = null;
    };

    function mark(id, on) {
      const s = api.segs[id];
      if (!s) return;
      const end = Math.min(bytesEls.length, s.offset + s.length);
      for (let i = s.offset; i < end; i++) {
        bytesEls[i].classList.toggle('hl', on);
        asciiEls[i].classList.toggle('hl', on);
      }
    }

    function ensureVisible(i) {
      const b = bytesEls[i];
      if (!b) return;
      const c = el.getBoundingClientRect();
      const r = b.getBoundingClientRect();
      if (r.top < c.top || r.bottom > c.bottom) el.scrollTop += r.top - c.top - c.height / 3;
    }

    api.highlight = function (id, scroll) {
      if (api.current) mark(api.current, false);
      api.current = id;
      if (!id) return;
      mark(id, true);
      if (scroll && api.segs[id]) ensureVisible(api.segs[id].offset);
    };

    return api;
  }

  /** Two-way hover linking between table rows (tr[data-seg]) and hex bytes. */
  function linkViews(tableRoot, hexEl, hex) {
    let current = null;
    const rowsOf = (id) => $$(`tr[data-seg="${CSS.escape(id)}"]`, tableRoot);
    function set(id, scrollHex) {
      if (current === id) return;
      if (current) rowsOf(current).forEach((r) => r.classList.remove('hl'));
      current = id;
      hex.highlight(id, scrollHex);
      if (id) rowsOf(id).forEach((r) => r.classList.add('hl'));
    }
    tableRoot.addEventListener('mouseover', (e) => {
      const tr = e.target.closest('tr[data-seg]');
      if (tr) set(tr.dataset.seg, true);
    });
    tableRoot.addEventListener('mouseleave', () => set(null));
    hexEl.addEventListener('mouseover', (e) => {
      const s = e.target.closest('[data-i]');
      if (s) set(hex.owner[+s.dataset.i] || null, false);
    });
    hexEl.addEventListener('mouseleave', () => set(null));
    hexEl.addEventListener('click', (e) => {
      const s = e.target.closest('[data-i]');
      const id = s && hex.owner[+s.dataset.i];
      const row = id && rowsOf(id)[0];
      if (row && row.offsetParent) row.scrollIntoView({ block: 'center', behavior: 'smooth' });
    });
    return {
      reset() {
        current = null;
      },
      focus(id) {
        set(null);
        set(id, true);
        const row = rowsOf(id)[0];
        if (row) row.scrollIntoView({ block: 'center', behavior: 'smooth' });
      },
    };
  }

  // ---------- TLV rendering (shared by TLV tab and ISO DE 55) ----------
  function assignIds(nodes, prefix, path = '') {
    nodes.forEach((n, i) => {
      n._path = path ? `${path}.${i}` : String(i);
      n._id = prefix + n._path;
      if (n.children) assignIds(n.children, prefix, n._path);
    });
  }

  function unknownName(n) {
    return n.cls === 3 ? 'Proprietary tag (private class)' : 'Unknown tag';
  }

  function tlvRows(nodes, ctx) {
    let html = '';
    tlv.walk(nodes, (n) => {
      const attrs = `data-seg="${esc(n._id)}" data-path="${esc(n._path)}" style="--d:${n.depth}"`;
      if (n.type === 'padding') {
        html += `<tr ${attrs} class="pad"><td class="tag">··</td><td>Padding</td><td class="num">${n.length}</td><td class="val mono">${U.byteHex(n.byte)} × ${n.length}</td><td></td></tr>`;
        return;
      }
      if (n.type === 'error') {
        html += `<tr ${attrs} class="bad"><td class="tag">!</td><td>${esc(n.message)}</td><td class="num">${n.length}</td><td class="val mono">${U.bytesToHex(n.raw)}</td><td></td></tr>`;
        return;
      }
      if (n.text) {
        html += `<tr ${attrs}><td class="tag">${esc(n.tag)}</td><td class="tname"><span class="unknown">Text TLV</span></td><td class="num">${esc(n.lenText)}</td><td class="val mono">${esc(U.bytesToText(n.value))}</td><td></td></tr>`;
        return;
      }
      const def = emv.lookup(n.tag);
      const name = def ? `${esc(def.name)}<span class="src">${esc(def.fmt)}</span>` : `<span class="unknown">${unknownName(n)}</span>`;
      if (n.constructed) {
        html += `<tr ${attrs} class="constructed"><td class="tag"><button class="caret" data-toggle aria-label="Collapse">▼</button>${n.tag}</td><td class="tname">${name}</td><td class="num">${n.length}</td><td class="val mono">(${U.bytesToHex(n.value)}) <span class="muted">${n.children.length} item(s)</span></td><td></td></tr>`;
      } else {
        const dec = emv.decode(n, ctx);
        const val = n.length ? U.bytesToHex(n.value) : '<span class="muted">(empty)</span>';
        html += `<tr ${attrs}><td class="tag">${n.tag}</td><td class="tname">${name}</td><td class="num">${n.length}</td><td class="val mono">${val}</td><td class="desc">${decodedHTML(dec)}</td></tr>`;
      }
    });
    return html;
  }

  function tlvTableHTML(nodes, ctx) {
    return `<table class="grid tlv-table"><thead><tr><th>Tag</th><th>Name</th><th class="num">Len</th><th>Value</th><th>Decoded</th></tr></thead><tbody>${tlvRows(nodes, ctx)}</tbody></table>`;
  }

  function updateCollapse(table) {
    const rows = $$(':scope > tbody > tr[data-path]', table);
    const collapsed = rows.filter((r) => r.classList.contains('collapsed')).map((r) => r.dataset.path + '.');
    for (const r of rows) r.hidden = collapsed.some((c) => r.dataset.path.startsWith(c));
  }

  function bindCollapse(root) {
    root.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-toggle]');
      if (!btn) return;
      btn.closest('tr').classList.toggle('collapsed');
      updateCollapse(btn.closest('table'));
    });
  }

  function tlvSegments(nodes, base = 0, scale = 1, colorTop = true) {
    const segs = [];
    let c = 0;
    tlv.walk(nodes, (n) => {
      const len = n.type === 'tlv' ? n.totalLength : n.length;
      segs.push({
        id: n._id,
        offset: base + n.offset * scale,
        length: len * scale,
        prefixLen: n.type === 'tlv' ? n.headerLength * scale : 0,
        color: n.type === 'error' ? 'x' : colorTop && n.depth === 0 ? c++ % 6 : null,
      });
    });
    return segs;
  }

  function tlvJSON(nodes, ctx) {
    return nodes
      .filter((n) => n.type !== 'padding')
      .map((n) => {
        if (n.type === 'error') return { error: n.message, offset: n.offset };
        if (n.text) return { tag: n.tag, length: n.lenText, value: U.bytesToText(n.value) };
        const def = emv.lookup(n.tag);
        const o = { tag: n.tag, name: def ? def.name : null, length: n.length };
        if (n.constructed) {
          o.value = U.bytesToHex(n.value);
          o.children = tlvJSON(n.children, ctx);
        }
        else {
          o.value = U.bytesToHex(n.value);
          const d = emv.decode(n, ctx);
          if (d) o.decoded = d.lines ? { text: d.text, details: d.lines } : d.text;
        }
        return o;
      });
  }

  // ---------- ISO 8583 tab ----------
  const ENC_KEYS = ['spec', 'header', 'mti', 'bitmap', 'lenPrefix', 'numeric', 'binary'];
  const ENC_TITLES = { spec: 'Spec', header: 'Header', mti: 'MTI', bitmap: 'Bitmap', lenPrefix: 'Length prefix', numeric: 'Numeric', binary: 'Binary' };
  const isoHexEl = $('#iso-hex');
  const isoHex = createHexView(isoHexEl);
  const isoLink = linkViews($('#iso-out'), isoHexEl, isoHex);
  let isoLast = null;

  function isoCfgFromUI() {
    const cfg = {};
    for (const k of ENC_KEYS) cfg[k] = $('#iso-' + k).value;
    cfg.skip = Math.max(0, parseInt($('#iso-skip').value, 10) || 0);
    return cfg;
  }

  function isoSaveUI() {
    const cfg = isoCfgFromUI();
    store.set('iso', {
      input: $('#iso-input').value,
      inputMode: $('#iso-inputMode').value,
      auto: $('#iso-auto').checked,
      overrides: $('#iso-overrides').value,
      cfg,
    });
  }

  function runISO() {
    isoSaveUI();
    const text = $('#iso-input').value;
    const status = $('#iso-status');
    const out = $('#iso-out');
    $('.options', $('#view-iso')).classList.toggle('auto', $('#iso-auto').checked);
    if (!text.trim()) {
      status.innerHTML = '';
      out.hidden = true;
      return;
    }
    let overrides;
    try {
      overrides = iso.parseOverrides($('#iso-overrides').value);
    } catch (e) {
      status.innerHTML = statusHTML([['err', e.message]]);
      out.hidden = true;
      return;
    }
    const base = isoCfgFromUI();
    const inputMode = $('#iso-inputMode').value;
    let res;
    let usedMode;
    let auto = $('#iso-auto').checked;
    let confident = true;
    let trimmed = false;
    try {
      if (auto) {
        const det = iso.autodetect(text, { inputMode, skip: base.skip, overrides });
        res = det.result;
        usedMode = det.inputMode;
        confident = det.confident;
        trimmed = det.trimmed;
        for (const k of ENC_KEYS) $('#iso-' + k).value = det.cfg[k];
      } else {
        const { bytes, mode } = U.toBytes(text, inputMode);
        usedMode = mode;
        res = iso.parse(bytes, Object.assign({}, base, { overrides }));
      }
    } catch (e) {
      status.innerHTML = statusHTML([['err', e.message]]);
      out.hidden = true;
      return;
    }
    isoLast = res;

    const msgs = [];
    for (const e of res.errors) msgs.push(['err', e]);
    if (auto && !confident) msgs.push(['warn', 'No encoding parsed this message cleanly — showing the closest match. Adjust the options or add field overrides.']);
    for (const w of res.warnings) msgs.push(['warn', w]);
    if (trimmed) msgs.push(['warn', 'Ignored trailing whitespace at the end of the input']);
    if (!res.errors.length) {
      msgs.push(['ok', `Parsed ${res.fields.length} data element(s) from ${res.bytes.length} bytes${auto ? ' · encoding auto-detected' : ''}`]);
    }
    status.innerHTML = statusHTML(msgs);

    if (!res.mti) {
      out.hidden = true;
      return;
    }
    out.hidden = false;
    renderISOSummary(res, usedMode, auto);
    renderISOTable(res);
    renderISOHex(res);
  }

  function renderISOSummary(res, mode, auto) {
    const info = iso.mtiInfo(res.mti);
    const max = res.present.some((n) => n > 64) || res.present.includes(1) ? 128 : 64;
    const on = new Set(res.present);
    let bits = '';
    for (let i = 1; i <= max; i++) {
      bits += on.has(i) ? `<div class="bit on" data-goto="f${i}" title="DE ${i}: ${esc(iso.getDef(i, res.cfg.overrides, res.spec).name)}">${i}</div>` : `<div class="bit">${i}</div>`;
    }
    const chips = [`<span class="chip">Input <b>${{ hex: 'Hex', text: 'Raw text', base64: 'Base64' }[mode]}</b></span>`]
      .concat(ENC_KEYS.map((k) => `<span class="chip">${ENC_TITLES[k]} <b>${esc(k === 'spec' ? iso.OPTION_LABELS.spec[res.spec] : iso.OPTION_LABELS[k][res.cfg[k]])}</b></span>`))
      .concat(res.cfg.skip ? [`<span class="chip">Skip <b>${res.cfg.skip}</b></span>`] : []);
    $('#iso-summary').innerHTML = `
      <div class="sum-block">
        <h3>MTI</h3>
        <div class="mti-big">${res.mti
          .split('')
          .map((d) => `<span>${d}</span>`)
          .join('')}</div>
        <dl class="mti-parts">${info.parts.map(([k, v], i) => `<dt>${k} (${res.mti[i]})</dt><dd>${esc(v)}</dd>`).join('')}</dl>
      </div>
      <div class="sum-block">
        <h3>Bitmap · ${res.present.length} field(s)</h3>
        <div class="bitmap">${bits}</div>
      </div>
      <div class="sum-block" style="flex:1;min-width:220px">
        <h3>Encoding${auto ? ' (auto-detected)' : ''}</h3>
        <div class="detect">${chips.join('')}</div>
      </div>`;
  }

  const META_LABEL = { header: 'HDR', mti: 'MTI', bitmap: 'BMP', trailing: '—' };

  function renderISOTable(res) {
    const rows = [];
    for (const e of res.elements) {
      const title = `offset ${e.offset}, ${e.length} byte(s)`;
      if (e.kind !== 'field') {
        const bad = e.kind === 'trailing';
        const desc = bad && res.errors.length ? res.errors[0] : e.desc;
        rows.push(
          `<tr data-seg="${e.id}" class="meta${bad ? ' bad' : ''}" title="${title}"><td class="de">${META_LABEL[e.kind]}</td><td class="name">${esc(e.label)}</td><td class="type"></td><td class="num">${e.length}</td><td class="val mono">${esc(e.value)}</td><td class="desc">${decodedHTML(desc ? { text: desc } : null)}</td></tr>`
        );
        continue;
      }
      const f = e.field;
      const def = f.def;
      let val = esc(f.value);
      let desc = decodedHTML(f.decoded, f.warn);
      if (f.tlv) {
        assignIds(f.tlv, `f${f.id}-`);
        const count = f.tlv.filter((n) => n.type === 'tlv').length;
        desc = decodedHTML({ text: `${count} ${f.textTlv ? 'text ' : ''}TLV tag(s) — see below` }, f.warn);
      }
      rows.push(
        `<tr data-seg="${e.id}" title="${title}"${f.warn ? ' class="warnrow"' : ''}><td class="de">${f.id}</td><td class="name">${esc(def.name)}${def.custom ? ' <span class="chip">override</span>' : ''}</td><td class="type mono">${esc(iso.typeLabel(def))}</td><td class="num">${f.len}</td><td class="val mono">${val}</td><td class="desc">${desc}</td></tr>`
      );
      if (f.tlv) {
        const ctx = emv.context(f.tlv);
        rows.push(
          `<tr class="nested"><td></td><td colspan="5"><div class="nested-title"><span>DE ${f.id} · ${f.textTlv ? 'Text TLV' : 'BER-TLV'}</span><button class="btn link" data-open-tlv="${esc(f.textTlv ? U.bytesToText(f.raw) : U.bytesToHex(f.raw))}" data-mode="${f.textTlv ? 'text' : 'auto'}">Open in TLV tab →</button></div>${tlvTableHTML(f.tlv, ctx)}</td></tr>`
        );
      }
    }
    const table = $('#iso-table');
    table.innerHTML = `<thead><tr><th>DE</th><th>Name</th><th>Type</th><th class="num">Len</th><th>Value</th><th>Decoded</th></tr></thead><tbody>${rows.join('')}</tbody>`;
    isoLink.reset();
  }

  function renderISOHex(res) {
    const segs = [];
    let c = 0;
    for (const e of res.elements) {
      segs.push({ id: e.id, offset: e.offset, length: e.length, prefixLen: e.prefixLen || 0, color: e.kind === 'trailing' ? 'x' : c++ % 6 });
      if (e.kind === 'field' && e.field.tlv) {
        segs.push(...tlvSegments(e.field.tlv, e.field.valueOffset, e.field.valueScale, false));
      }
    }
    isoHex.render(res.bytes, segs);
    $('#iso-bytecount').textContent = `${res.bytes.length} bytes`;
  }

  function isoJSON(res) {
    const fields = {};
    for (const f of res.fields) {
      const o = { name: f.def.name, length: f.len, value: f.value };
      if (f.decoded) o.decoded = f.decoded.lines ? { text: f.decoded.text, details: f.decoded.lines } : f.decoded.text;
      if (f.tlv) o.tlv = tlvJSON(f.tlv, emv.context(f.tlv));
      fields[f.id] = o;
    }
    const enc = {};
    for (const k of ENC_KEYS.concat('skip')) enc[k] = res.cfg[k];
    return JSON.stringify({ mti: res.mti, encoding: enc, header: res.elements.filter((e) => e.kind === 'header').map((e) => ({ label: e.label, value: e.value })), fields, errors: res.errors, warnings: res.warnings }, null, 2);
  }

  // ---------- TLV tab ----------
  const tlvHexEl = $('#tlv-hex');
  const tlvHex = createHexView(tlvHexEl);
  const tlvLink = linkViews($('#tlv-out'), tlvHexEl, tlvHex);
  let tlvLast = null;

  function textTlvOpts() {
    return { tagLen: +$('#tlv-tagLen').value, lenDigits: $('#tlv-lenDigits').value };
  }

  const trimText = (text) => text.replace(/^\s+|\s+$/g, '');

  /** Returns { bytes, mode, nodes? } — text TLV is tried before Base64 in auto mode. */
  function tlvBytes(text, mode) {
    if (mode === 'text') {
      const bytes = U.textToBytes(trimText(text));
      return { bytes, mode, nodes: tlv.parseText(bytes, textTlvOpts()) };
    }
    if (mode === 'auto') {
      if (/^[0-9A-F]*$/.test(U.cleanHex(text))) return U.toBytes(text, 'hex');
      const bytes = U.textToBytes(trimText(text));
      const nodes = tlv.parseText(bytes, textTlvOpts());
      if (!tlv.hasError(nodes)) return { bytes, mode: 'text', nodes };
      try {
        return { bytes: U.base64ToBytes(text), mode: 'base64' };
      } catch (e) {
        return { bytes, mode: 'text', nodes };
      }
    }
    return U.toBytes(text, mode);
  }

  function runTLV() {
    const text = $('#tlv-input').value;
    store.set('tlv', { input: text, inputMode: $('#tlv-inputMode').value, padding: $('#tlv-padding').checked, tagLen: $('#tlv-tagLen').value, lenDigits: $('#tlv-lenDigits').value });
    const status = $('#tlv-status');
    const out = $('#tlv-out');
    if (!text.trim()) {
      status.innerHTML = '';
      out.hidden = true;
      return;
    }
    let bytes;
    let mode;
    let nodes;
    try {
      ({ bytes, mode, nodes } = tlvBytes(text, $('#tlv-inputMode').value));
    } catch (e) {
      status.innerHTML = statusHTML([['err', e.message]]);
      out.hidden = true;
      return;
    }
    if (!nodes) nodes = tlv.parse(bytes, { skipPadding: $('#tlv-padding').checked });
    assignIds(nodes, 't');
    const ctx = emv.context(nodes);
    tlvLast = { nodes, ctx };

    let count = 0;
    let unknown = 0;
    const msgs = [];
    tlv.walk(nodes, (n) => {
      if (n.type === 'tlv') {
        count++;
        if (!n.text && !emv.lookup(n.tag)) unknown++;
      }
      if (n.type === 'error') msgs.push(['err', `Offset ${n.offset}: ${n.message}`]);
    });
    msgs.push([msgs.length ? 'warn' : 'ok', `${count} tag(s) in ${bytes.length} bytes${mode === 'base64' ? ' (Base64 input)' : mode === 'text' ? ' (text TLV)' : ''}${unknown ? ` · ${unknown} not in dictionary` : ''}`]);
    status.innerHTML = statusHTML(msgs);

    out.hidden = false;
    $('#tlv-table').innerHTML = tlvTableHTML(nodes, ctx);
    tlvHex.render(bytes, tlvSegments(nodes));
    $('#tlv-bytecount').textContent = `${bytes.length} bytes`;
    tlvLink.reset();
  }

  function setAllCollapsed(collapsed) {
    const table = $('#tlv-table table');
    if (!table) return;
    $$('tr.constructed', table).forEach((r) => r.classList.toggle('collapsed', collapsed));
    updateCollapse(table);
  }

  // ---------- URL decode tab ----------
  let urlLast = null;

  /** Spot values worth decoding further: EMV TLV hex and Track 2 data. */
  function urlNotes(value) {
    if (value == null) return '';
    const v = value.trim();
    if (v.length >= 6 && v.length % 2 === 0 && /^[0-9A-Fa-f]+$/.test(v) && !/^\d+$/.test(v)) {
      const nodes = tlv.parse(U.hexToBytes(v));
      let tags = 0;
      let known = 0;
      tlv.walk(nodes, (n) => {
        if (n.type === 'tlv') {
          tags++;
          if (emv.lookup(n.tag)) known++;
        }
      });
      if (tags >= 2 && known && !tlv.hasError(nodes)) {
        return `<div class="dtext">BER-TLV · ${tags} EMV tag(s)</div><button class="btn link" data-open-tlv="${esc(v)}" data-mode="hex">Open in TLV tab →</button>`;
      }
    }
    if (/^\d{12,19}[=D]\d{4}/i.test(v)) return decodedHTML(U.parseTrack2(v));
    return '';
  }

  function runURL() {
    const text = $('#url-input').value;
    const opts = { plus: $('#url-plus').checked, keepSeparators: $('#url-keep').checked };
    store.set('url', { input: text, plus: opts.plus, keep: opts.keepSeparators });
    const status = $('#url-status');
    const show = (on) => {
      $('#url-text-panel').hidden = !on;
      $('#url-table-panel').hidden = !on;
    };
    if (!text.trim()) {
      status.innerHTML = '';
      show(false);
      return;
    }
    const res = QF.url.parse(text, opts);
    urlLast = res;
    status.innerHTML = statusHTML([['ok', `${res.params.length} parameter(s)${res.url ? ` · URL ${res.url}` : ''}`]]);
    show(true);
    const out = $('#url-text');
    out.value = res.params.map((p) => p.line).join('\n');
    out.style.height = 'auto';
    out.style.height = Math.min(out.scrollHeight + 4, 600) + 'px';
    $('#url-table').innerHTML =
      `<thead><tr><th class="num">#</th><th>Key</th><th>Value</th><th>Decoded</th></tr></thead><tbody>` +
      res.params
        .map(
          (p, i) =>
            `<tr><td class="num muted">${i + 1}</td><td class="key">${esc(p.key)}</td><td class="val mono">${p.value == null ? '<span class="muted">(no value)</span>' : esc(p.value)}</td><td class="desc">${urlNotes(p.value)}</td></tr>`
        )
        .join('') +
      `</tbody>`;
  }

  // ---------- reference tab ----------
  function renderReference() {
    const emvRows = emv.TAG_LIST.map(
      ([tag, name, fmt, src]) => `<tr data-q="${esc((tag + ' ' + name).toLowerCase())}"><td class="tag">${tag}</td><td>${esc(name)}</td><td class="fmt">${esc(fmt)}</td><td class="muted">${esc(src)}</td></tr>`
    ).join('');
    $('#ref-table').innerHTML = `<thead><tr><th>Tag</th><th>Name</th><th>Format</th><th>Source</th></tr></thead><tbody>${emvRows}</tbody>`;
    const isoRows = Object.values(QF.isoFields)
      .map((d) => `<tr data-q="${esc(('de ' + d.id + ' ' + d.name).toLowerCase())}"><td class="tag">${d.id}</td><td>${esc(d.name)}</td><td class="fmt">${esc(iso.typeLabel(d))}</td></tr>`)
      .join('');
    $('#ref-iso-table').innerHTML = `<thead><tr><th>DE</th><th>Name</th><th>Format</th></tr></thead><tbody>${isoRows}</tbody>`;
  }

  function filterReference() {
    const q = $('#ref-search').value.trim().toLowerCase();
    for (const tr of $$('#view-ref tbody tr')) tr.hidden = !!q && !tr.dataset.q.includes(q);
  }

  // ---------- init ----------
  function populateSelects() {
    for (const k of ENC_KEYS) {
      const labels = iso.OPTION_LABELS[k];
      $('#iso-' + k).innerHTML = Object.keys(labels)
        .map((v) => `<option value="${v}">${esc(labels[v])}</option>`)
        .join('');
    }
  }

  function restore() {
    const s = store.get('iso', null);
    if (s) {
      $('#iso-input').value = s.input || '';
      $('#iso-inputMode').value = s.inputMode || 'auto';
      $('#iso-auto').checked = s.auto !== false;
      $('#iso-overrides').value = s.overrides || '';
      if (s.cfg) {
        for (const k of ENC_KEYS) if (s.cfg[k]) $('#iso-' + k).value = s.cfg[k];
        $('#iso-skip').value = s.cfg.skip || 0;
      }
      if (s.overrides) $('.overrides').open = true;
    }
    const t = store.get('tlv', null);
    if (t) {
      $('#tlv-input').value = t.input || '';
      $('#tlv-inputMode').value = t.inputMode || 'auto';
      $('#tlv-padding').checked = t.padding !== false;
      if (t.tagLen) $('#tlv-tagLen').value = t.tagLen;
      if (t.lenDigits) $('#tlv-lenDigits').value = t.lenDigits;
    }
  }

  function init() {
    populateSelects();
    restore();
    applyTheme(store.get('theme', null));

    $$('.tab').forEach((t) => t.addEventListener('click', () => showTab(t.dataset.tab)));
    window.addEventListener('hashchange', () => showTab(location.hash.slice(1)));

    $('#theme-btn').addEventListener('click', () => {
      const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      const next = cur === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      store.set('theme', next);
    });

    // Bytes box expand/collapse (collapsed by default)
    document.addEventListener('click', (e) => {
      const b = e.target.closest('[data-collapse]');
      if (!b) return;
      const collapsed = b.closest('.results').classList.toggle('bytes-collapsed');
      b.setAttribute('aria-expanded', String(!collapsed));
    });

    // ISO events
    const runISOSoon = debounce(runISO, 150);
    $('#iso-input').addEventListener('input', runISOSoon);
    $('#iso-overrides').addEventListener('input', runISOSoon);
    $('#iso-skip').addEventListener('input', runISOSoon);
    $('#iso-inputMode').addEventListener('change', runISO);
    $('#iso-auto').addEventListener('change', runISO);
    for (const k of ENC_KEYS) {
      $('#iso-' + k).addEventListener('change', () => {
        $('#iso-auto').checked = false;
        runISO();
      });
    }
    $('#iso-clear').addEventListener('click', () => {
      $('#iso-input').value = '';
      runISO();
      $('#iso-input').focus();
    });
    $('#iso-copy').addEventListener('click', () => isoLast && copy(isoJSON(isoLast)));
    $('#iso-summary').addEventListener('click', (e) => {
      const b = e.target.closest('[data-goto]');
      if (b) isoLink.focus(b.dataset.goto);
    });
    $('#iso-out').addEventListener('click', (e) => {
      const b = e.target.closest('[data-open-tlv]');
      if (!b) return;
      $('#tlv-input').value = b.dataset.openTlv;
      $('#tlv-inputMode').value = b.dataset.mode || 'auto';
      runTLV();
      showTab('tlv');
      window.scrollTo({ top: 0 });
    });
    bindCollapse($('#iso-out'));

    // TLV events
    const runTLVSoon = debounce(runTLV, 150);
    $('#tlv-input').addEventListener('input', runTLVSoon);
    $('#tlv-inputMode').addEventListener('change', runTLV);
    $('#tlv-padding').addEventListener('change', runTLV);
    $('#tlv-tagLen').addEventListener('change', runTLV);
    $('#tlv-lenDigits').addEventListener('change', runTLV);
    $('#tlv-clear').addEventListener('click', () => {
      $('#tlv-input').value = '';
      runTLV();
      $('#tlv-input').focus();
    });
    $('#tlv-expand').addEventListener('click', () => setAllCollapsed(false));
    $('#tlv-collapse').addEventListener('click', () => setAllCollapsed(true));
    $('#tlv-copy').addEventListener('click', () => tlvLast && copy(JSON.stringify(tlvJSON(tlvLast.nodes, tlvLast.ctx), null, 2)));
    bindCollapse($('#tlv-out'));

    // URL decode
    const u = store.get('url', null);
    $('#url-input').value = u ? u.input || '' : '';
    if (u) {
      $('#url-plus').checked = u.plus !== false;
      $('#url-keep').checked = u.keep !== false;
    }
    $('#url-input').addEventListener('input', debounce(runURL, 150));
    $('#url-plus').addEventListener('change', runURL);
    $('#url-keep').addEventListener('change', runURL);
    $('#url-clear').addEventListener('click', () => {
      $('#url-input').value = '';
      runURL();
      $('#url-input').focus();
    });
    $('#url-copy-text').addEventListener('click', () => copy($('#url-text').value));
    $('#url-copy-json').addEventListener('click', () => urlLast && copy(JSON.stringify(QF.url.toObject(urlLast.params), null, 2)));
    $('#view-url').addEventListener('click', (e) => {
      const b = e.target.closest('[data-open-tlv]');
      if (!b) return;
      $('#tlv-input').value = b.dataset.openTlv;
      $('#tlv-inputMode').value = b.dataset.mode || 'auto';
      runTLV();
      showTab('tlv');
      window.scrollTo({ top: 0 });
    });

    // Reference
    renderReference();
    $('#ref-search').addEventListener('input', filterReference);

    // Applied last so a shared link wins over inputs restored from this browser
    const sharedTab = loadShareParams();
    $$('[data-share]').forEach((b) => b.addEventListener('click', () => shareLink(b.dataset.share)));
    Object.values(SHARE).forEach(({ input }) => $(input).addEventListener('input', clearShareParams));

    showTab(location.hash.slice(1) || sharedTab || 'iso');
    runISO();
    runTLV();
    runURL();
  }

  init();
})();
