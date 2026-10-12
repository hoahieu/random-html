/* UI wiring: tabs, rendering, hex view linking, persistence. */
(function () {
  'use strict';
  const { util: U, iso, tlv, emv } = QF;
  const { esc } = U;
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => Array.from(el.querySelectorAll(s));

  const store = {
    get(k, d) {
      try {
        const v = localStorage.getItem('qf.' + k);
        return v === null ? d : JSON.parse(v);
      } catch (e) {
        return d;
      }
    },
    set(k, v) {
      try {
        localStorage.setItem('qf.' + k, JSON.stringify(v));
      } catch (e) {
        /* storage unavailable */
      }
    },
  };

  const SAMPLES = {
    'iso-pos': {
      tab: 'iso',
      text: '00E560000100000200703C078020C092001647617390010101190000000000001500000001231430151012281200510001001900344761739001010119D281220112345678905445524D303030314D45524348414E54303030303030313730341A2B3C4D5E6F708101259F26087A3B9C1D2E4F50619F2701809F100706010A03A0B8009F37041A2B3C4D9F36020012950500800480009A032610129C01009F02060000001500005F2A020704820219809F1A0207049F03060000000000009F3303E0F8C89F34031F03029F3501228407A00000000310109F0902008C9F4104000001235F340101',
    },
    'iso-host': {
      tab: 'iso',
      text: '0210F23800010EE0840004000000040000001654133300896000100030000000000125501012143015000456143015101206123456628514000456A1B2C300ATM00042BANKBRANCH00042MAIN STREET ATM          SPRINGFIELD  US8400401002840C0000000500001001840C0000000450003011400112233445566',
    },
    'tlv-icc': {
      tab: 'tlv',
      text: '9F26087A3B9C1D2E4F50619F2701809F100706010A03A0B8009F37041A2B3C4D9F36020012950500800480009A032610129C01009F02060000001500005F2A020704820219809F1A0207049F03060000000000009F3303E0F8C89F34031F03029F3501228407A00000000310109F0902008C9F4104000001235F340101',
    },
    'tlv-fci': {
      tab: 'tlv',
      text: '6F488407A0000000031010A53D500B56495341204352454449548701019F38189F66049F02069F03069F1A0295055F2A029A039C019F37045F2D04656E6672BF0C089F5A051108400840',
    },
    'tlv-rec': {
      tab: 'tlv',
      text: '705057114761739001010119D281220112345678905F2008444F452F4A4F484E5A0847617390010101195F24032812318E0E000000000000000042031E031F00941008010100100102011801020018010100',
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

  async function copy(text) {
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
    toast('Copied to clipboard');
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

  // ---------- tabs & theme ----------
  function showTab(name) {
    if (!['iso', 'tlv', 'ref'].includes(name)) name = 'iso';
    $$('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
    $$('.view').forEach((v) => (v.hidden = v.id !== 'view-' + name));
    store.set('tab', name);
    if (location.hash !== '#' + name) history.replaceState(null, '', '#' + name);
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
      const def = emv.lookup(n.tag);
      const name = def ? `${esc(def.name)}<span class="src">${esc(def.fmt)}</span>` : `<span class="unknown">${unknownName(n)}</span>`;
      if (n.constructed) {
        html += `<tr ${attrs} class="constructed"><td class="tag"><button class="caret" data-toggle aria-label="Collapse">▼</button>${n.tag}</td><td class="tname">${name}</td><td class="num">${n.length}</td><td class="val"><span class="muted">${n.children.length} item(s)</span></td><td></td></tr>`;
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
        const def = emv.lookup(n.tag);
        const o = { tag: n.tag, name: def ? def.name : null, length: n.length };
        if (n.constructed) o.children = tlvJSON(n.children, ctx);
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
      raw: $('#iso-raw').checked,
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

  function rawHTML(bytes, offset, length, prefixLen) {
    const p = U.bytesToHex(bytes, offset, offset + prefixLen);
    const v = U.bytesToHex(bytes, offset + prefixLen, offset + length);
    return (p ? `<span class="pfx">${p}</span> ` : '') + v;
  }

  function renderISOTable(res) {
    const rows = [];
    for (const e of res.elements) {
      const title = `offset ${e.offset}, ${e.length} byte(s)`;
      const raw = `<td class="raw mono">${rawHTML(res.bytes, e.offset, e.length, e.prefixLen || 0)}</td>`;
      if (e.kind !== 'field') {
        const bad = e.kind === 'trailing';
        const desc = bad && res.errors.length ? res.errors[0] : e.desc;
        rows.push(
          `<tr data-seg="${e.id}" class="meta${bad ? ' bad' : ''}" title="${title}"><td class="de">${META_LABEL[e.kind]}</td><td class="name">${esc(e.label)}</td><td class="type"></td><td class="num">${e.length}</td><td class="val mono">${esc(e.value)}</td><td class="desc">${decodedHTML(desc ? { text: desc } : null)}</td>${raw}</tr>`
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
        val = `<span class="muted">${f.raw.length} bytes</span>`;
        desc = decodedHTML({ text: `${count} TLV tag(s) — see below` }, f.warn);
      }
      rows.push(
        `<tr data-seg="${e.id}" title="${title}"${f.warn ? ' class="warnrow"' : ''}><td class="de">${f.id}</td><td class="name">${esc(def.name)}${def.custom ? ' <span class="chip">override</span>' : ''}</td><td class="type mono">${esc(iso.typeLabel(def))}</td><td class="num">${f.len}</td><td class="val mono">${val}</td><td class="desc">${desc}</td>${raw}</tr>`
      );
      if (f.tlv) {
        const ctx = emv.context(f.tlv);
        rows.push(
          `<tr class="nested"><td></td><td colspan="6"><div class="nested-title"><span>DE ${f.id} · BER-TLV</span><button class="btn link" data-open-tlv="${U.bytesToHex(f.raw)}">Open in TLV tab →</button></div>${tlvTableHTML(f.tlv, ctx)}</td></tr>`
        );
      }
    }
    const table = $('#iso-table');
    table.classList.toggle('show-raw', $('#iso-raw').checked);
    table.innerHTML = `<thead><tr><th>DE</th><th>Name</th><th>Type</th><th class="num">Len</th><th>Value</th><th>Decoded</th><th class="raw">Raw</th></tr></thead><tbody>${rows.join('')}</tbody>`;
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

  function tlvBytes(text, mode) {
    if (mode === 'auto') {
      if (/^[0-9A-F]*$/.test(U.cleanHex(text))) mode = 'hex';
      else {
        try {
          return { bytes: U.base64ToBytes(text), mode: 'base64' };
        } catch (e) {
          throw new Error('Input is neither valid hex nor Base64');
        }
      }
    }
    return U.toBytes(text, mode);
  }

  function runTLV() {
    const text = $('#tlv-input').value;
    store.set('tlv', { input: text, inputMode: $('#tlv-inputMode').value, padding: $('#tlv-padding').checked });
    const status = $('#tlv-status');
    const out = $('#tlv-out');
    if (!text.trim()) {
      status.innerHTML = '';
      out.hidden = true;
      return;
    }
    let bytes;
    let mode;
    try {
      ({ bytes, mode } = tlvBytes(text, $('#tlv-inputMode').value));
    } catch (e) {
      status.innerHTML = statusHTML([['err', e.message]]);
      out.hidden = true;
      return;
    }
    const nodes = tlv.parse(bytes, { skipPadding: $('#tlv-padding').checked });
    assignIds(nodes, 't');
    const ctx = emv.context(nodes);
    tlvLast = { nodes, ctx };

    let count = 0;
    let unknown = 0;
    const msgs = [];
    tlv.walk(nodes, (n) => {
      if (n.type === 'tlv') {
        count++;
        if (!emv.lookup(n.tag)) unknown++;
      }
      if (n.type === 'error') msgs.push(['err', `Offset ${n.offset}: ${n.message}`]);
    });
    msgs.push([msgs.length ? 'warn' : 'ok', `${count} tag(s) in ${bytes.length} bytes${mode === 'base64' ? ' (Base64 input)' : ''}${unknown ? ` · ${unknown} not in dictionary` : ''}`]);
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
      $('#iso-raw').checked = !!s.raw;
      if (s.cfg) {
        for (const k of ENC_KEYS) if (s.cfg[k]) $('#iso-' + k).value = s.cfg[k];
        $('#iso-skip').value = s.cfg.skip || 0;
      }
      if (s.overrides) $('.overrides').open = true;
    } else {
      $('#iso-input').value = SAMPLES['iso-pos'].text;
    }
    const t = store.get('tlv', null);
    if (t) {
      $('#tlv-input').value = t.input || '';
      $('#tlv-inputMode').value = t.inputMode || 'auto';
      $('#tlv-padding').checked = t.padding !== false;
    } else {
      $('#tlv-input').value = SAMPLES['tlv-icc'].text;
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

    $$('[data-sample]').forEach((b) =>
      b.addEventListener('click', () => {
        const s = SAMPLES[b.dataset.sample];
        if (s.tab === 'iso') {
          $('#iso-input').value = s.text;
          $('#iso-auto').checked = true;
          runISO();
        } else {
          $('#tlv-input').value = s.text;
          runTLV();
        }
      })
    );

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
    $('#iso-raw').addEventListener('change', () => {
      $('#iso-table').classList.toggle('show-raw', $('#iso-raw').checked);
      isoSaveUI();
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
    $('#tlv-clear').addEventListener('click', () => {
      $('#tlv-input').value = '';
      runTLV();
      $('#tlv-input').focus();
    });
    $('#tlv-expand').addEventListener('click', () => setAllCollapsed(false));
    $('#tlv-collapse').addEventListener('click', () => setAllCollapsed(true));
    $('#tlv-copy').addEventListener('click', () => tlvLast && copy(JSON.stringify(tlvJSON(tlvLast.nodes, tlvLast.ctx), null, 2)));
    bindCollapse($('#tlv-out'));

    // Reference
    renderReference();
    $('#ref-search').addEventListener('input', filterReference);

    showTab(location.hash.slice(1) || store.get('tab', 'iso'));
    runISO();
    runTLV();
  }

  init();
})();
