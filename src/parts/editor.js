  // ---------- creator ----------
  const LETTERS = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const RULES = [['sum', 'Sum ='], ['lt', 'Sum <'], ['gt', 'Sum >'], ['eq', 'All equal'], ['neq', 'All different'], ['none', 'No rule']];
  let M = null, brush = '#', painting = false;
  const esc = t => String(t).replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);

  function modelFromText(text) {
    const p = parsePuzzle(text);
    const rows = Math.max(1, p.rows), cols = Math.max(1, p.cols);
    const grid = Array.from({ length: rows }, () => Array(cols).fill('.'));
    p.cells.forEach(c => { grid[c.r][c.c] = c.key === null ? '#' : c.key; });
    const regions = {};
    p.regions.forEach(g => { regions[g.key] = { type: g.type, n: g.n ?? 0, color: g.color }; });
    return { title: p.title || '', rows, cols, grid, regions, dominoes: p.dominoes.map(d => d.slice()) };
  }
  function textFromModel(m) {
    const used = new Set(m.grid.flat());
    const lines = [];
    if (m.title) lines.push('# ' + m.title);
    lines.push('board:', ...m.grid.map(r => r.join('').replace(/\.+$/, '') || '.'));
    lines.push('regions:');
    for (const k of Object.keys(m.regions)) {
      if (!used.has(k)) continue;
      const g = m.regions[k];
      const rule = g.type === 'sum' ? g.n : g.type === 'lt' ? '<' + g.n : g.type === 'gt' ? '>' + g.n : g.type === 'eq' ? '=' : g.type === 'neq' ? '!=' : 'any';
      lines.push(`${k} ${rule} ${g.color}`);
    }
    lines.push('dominoes: ' + m.dominoes.map(d => d.join('')).join(' '));
    return lines.join('\n');
  }
  function sync() { $('#src').value = textFromModel(M); store.set('pips-custom', $('#src').value); }
  function nextKey() { return [...LETTERS].find(k => !(k in M.regions)); }
  function nextColor() {
    const counts = {}; COLOR_NAMES.slice(0, 6).forEach(c => { counts[c] = 0; });
    Object.values(M.regions).forEach(g => { if (g.color in counts) counts[g.color]++; });
    return Object.keys(counts).sort((a, b) => counts[a] - counts[b])[0];
  }
  const tintOf = color => `color-mix(in srgb, var(--r-${color}) var(--tint), var(--board))`;

  function drawBrushes() {
    if (brush !== '#' && brush !== '.' && !(brush in M.regions)) brush = '#';
    const items = [['#', 'Free cell', 'color-mix(in srgb, var(--surface) 30%, var(--board))'], ['.', 'Eraser', 'var(--bg)'],
      ...Object.keys(M.regions).map(k => [k, `${k} · ${M.regions[k].color} ${ruleLabel(M.regions[k]) || 'no rule'}`, `var(--r-${M.regions[k].color})`])];
    $('#brushes').innerHTML = items.map(([k, label, col]) =>
      `<button class="brush" data-b="${esc(k)}" aria-pressed="${k === brush}"><span class="sw" style="background:${col}"></span>${esc(label)}</button>`).join('');
  }
  function drawPaint() {
    const g = $('#paint');
    g.style.gridTemplateColumns = `repeat(${M.cols}, 42px)`;
    const anchors = {};
    M.grid.forEach((row, r) => row.forEach((k, c) => { if (k in M.regions) anchors[k] = [r, c]; }));
    g.innerHTML = M.grid.map((row, r) => row.map((k, c) => {
      let cls = 'pc', style = '', lab = '', txt = '';
      if (k === '.') cls += ' gap';
      else if (k === '#') cls += ' free';
      else {
        const reg = M.regions[k] || { color: 'gray', type: 'none' };
        style = `background:${tintOf(reg.color)};box-shadow:inset 0 0 0 2px var(--r-${reg.color})`;
        const a = anchors[k];
        if (a && a[0] === r && a[1] === c) lab = ruleLabel(reg);
        txt = k;
      }
      const what = k === '.' ? 'gap' : k === '#' ? 'free cell' : 'region ' + k;
      return `<button class="${cls}" style="${style}" data-r="${r}" data-c="${c}" aria-label="Row ${r + 1} column ${c + 1}: ${esc(what)}"><span style="color:var(--ink)">${esc(txt)}</span><span class="lab" style="color:var(--ink)">${esc(lab)}</span></button>`;
    }).join('')).join('');
  }
  function drawRegs() {
    const used = new Set(M.grid.flat());
    const keys = Object.keys(M.regions);
    $('#regs').innerHTML = keys.length ? keys.map(k => {
      const g = M.regions[k], needsN = ['sum', 'lt', 'gt'].includes(g.type);
      return `<div class="reg" data-k="${esc(k)}">
        <span class="key" style="background:var(--r-${g.color})" title="${used.has(k) ? 'Region ' + esc(k) : 'Not painted on the board yet'}">${esc(k)}</span>
        <select data-f="type" aria-label="Rule for region ${esc(k)}">${RULES.map(([v, l]) => `<option value="${v}"${v === g.type ? ' selected' : ''}>${l}</option>`).join('')}</select>
        <input data-f="n" type="number" min="0" max="99" value="${g.n}" ${needsN ? '' : 'disabled'} aria-label="Number for region ${esc(k)}">
        <select data-f="color" aria-label="Colour for region ${esc(k)}">${COLOR_NAMES.map(c => `<option${c === g.color ? ' selected' : ''}>${c}</option>`).join('')}</select>
        <button class="btn" data-f="del" aria-label="Delete region ${esc(k)}" style="min-width:0;padding:6px">✕</button>
      </div>`;
    }).join('') : '<p class="check">No regions yet. Add one, then paint its cells.</p>';
  }
  function drawTrayEd() {
    $('#dlist').innerHTML = M.dominoes.map(([a, b], i) => `<span class="dchip"><span class="dm"><i>${a}</i><i>${b}</i></span><button data-i="${i}" aria-label="Remove domino ${a}-${b}">✕</button></span>`).join('') || '<span class="check">No dominoes yet.</span>';
    const cells = M.grid.flat().filter(k => k !== '.').length, need = cells / 2;
    const t = $('#tally');
    if (cells % 2) { t.className = 'check bad'; t.textContent = `The board has ${cells} cells, an odd number. Every domino covers two, so check the board.`; }
    else if (M.dominoes.length !== need) { t.className = 'check bad'; t.textContent = `${M.dominoes.length} of ${need} dominoes added (the board has ${cells} cells).`; }
    else { t.className = 'check good'; t.textContent = `${M.dominoes.length} dominoes for ${cells} cells. Ready to solve.`; }
  }
  function drawEditor() { drawBrushes(); drawPaint(); drawRegs(); drawTrayEd(); $('#rows').value = M.rows; $('#cols').value = M.cols; }
  function setModel(m) { M = m; drawEditor(); sync(); }

  // painting
  function paintAt(el) {
    if (!el || el.dataset.r === undefined) return;
    const r = +el.dataset.r, c = +el.dataset.c;
    if (M.grid[r][c] === brush) return;
    M.grid[r][c] = brush;
    drawPaint(); drawRegs(); drawTrayEd(); sync();
  }
  $('#paint').addEventListener('pointerdown', e => { const el = e.target.closest('.pc'); if (!el) return; painting = true; e.preventDefault(); paintAt(el); });
  $('#paint').addEventListener('pointermove', e => { if (!painting) return; const el = document.elementFromPoint(e.clientX, e.clientY); paintAt(el && el.closest('.pc')); });
  window.addEventListener('pointerup', () => { painting = false; });
  $('#paint').addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); e.stopPropagation(); paintAt(e.target.closest('.pc')); } });
  $('#brushes').onclick = e => { const b = e.target.closest('.brush'); if (b) { brush = b.dataset.b; drawBrushes(); } };
  function resize() {
    const rows = Math.max(1, Math.min(12, +$('#rows').value || 1)), cols = Math.max(1, Math.min(12, +$('#cols').value || 1));
    M.grid = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => (M.grid[r] && M.grid[r][c]) || '.'));
    M.rows = rows; M.cols = cols; drawPaint(); drawRegs(); drawTrayEd(); sync();
  }
  $('#rows').onchange = $('#cols').onchange = resize;
  $('#clearBoard').onclick = () => { M.grid = M.grid.map(r => r.map(() => '.')); drawPaint(); drawRegs(); drawTrayEd(); sync(); };
  $('#newReg').onclick = () => {
    const k = nextKey(); if (!k) return;
    M.regions[k] = { type: 'sum', n: 0, color: nextColor() };
    brush = k; drawBrushes(); drawRegs(); sync();
  };
  $('#regs').addEventListener('change', e => {
    const row = e.target.closest('.reg'); if (!row) return;
    const g = M.regions[row.dataset.k], f = e.target.dataset.f;
    if (f === 'type') g.type = e.target.value;
    if (f === 'n') g.n = Math.max(0, +e.target.value || 0);
    if (f === 'color') g.color = e.target.value;
    drawEditor(); sync();
  });
  $('#regs').addEventListener('click', e => {
    const b = e.target.closest('[data-f="del"]'); if (!b) return;
    const k = b.closest('.reg').dataset.k;
    delete M.regions[k];
    M.grid = M.grid.map(r => r.map(x => x === k ? '#' : x));
    drawEditor(); sync();
  });
  const opts = [0, 1, 2, 3, 4, 5, 6].map(v => `<option value="${v}">${v}</option>`).join('');
  $('#dA').innerHTML = opts; $('#dB').innerHTML = opts;
  $('#addD').onclick = () => { M.dominoes.push([+$('#dA').value, +$('#dB').value]); drawTrayEd(); sync(); };
  $('#dlist').onclick = e => { const b = e.target.closest('button[data-i]'); if (b) { M.dominoes.splice(+b.dataset.i, 1); drawTrayEd(); sync(); } };
  $('#applyText').onclick = () => { setModel(modelFromText($('#src').value)); showErrors(parsePuzzle($('#src').value).errors); };
  $('#src').oninput = () => store.set('pips-custom', $('#src').value);
  $('#solve').onclick = () => { stop(); const p = run(textFromModel(M)); showErrors(p.errors); if (!p.errors.length) document.querySelector('.app').scrollIntoView({ behavior: 'smooth', block: 'start' }); };

  // saved puzzles (kept in this browser only)
  const loadSavedList = () => { try { return JSON.parse(store.get('pips-saved') || '[]'); } catch (e) { return []; } };
  function drawSaved() {
    $('#saved').innerHTML = '<option value="">My saved puzzles…</option>' + loadSavedList().map((p, i) => `<option value="${i}">${esc(p.name)}</option>`).join('');
  }
  $('#save').onclick = () => {
    const name = $('#saveName').value.trim() || M.title || `Puzzle ${new Date().toLocaleDateString()}`;
    M.title = name; sync();
    const list = loadSavedList().filter(p => p.name !== name);
    list.unshift({ name, text: textFromModel(M) });
    store.set('pips-saved', JSON.stringify(list.slice(0, 50)));
    drawSaved(); $('#saveName').value = '';
    shotStatus(`Saved "${name}" in this browser.`, 'ok');
  };
  $('#loadSaved').onclick = () => { const v = $('#saved').value, p = loadSavedList()[+v]; if (v !== '' && p) { setModel(modelFromText(p.text)); showErrors([]); } };
  $('#delSaved').onclick = () => { const v = $('#saved').value; if (v === '') return; const list = loadSavedList(); list.splice(+v, 1); store.set('pips-saved', JSON.stringify(list)); drawSaved(); };

  // screenshot reading through Claude
  let shotBlob = null, shotCtl = null, sample = null;
  function shotStatus(msg, kind) { const s = $('#shotStatus'); s.hidden = !msg; s.className = 'status ' + (kind || ''); s.textContent = msg; }
  function takeImage(file) {
    if (!file || !/^image\//.test(file.type)) return;
    shotBlob = file;
    const img = $('#shotImg'); img.src = URL.createObjectURL(file); img.hidden = false;
    $('#readShot').disabled = !sample; shotStatus('');
  }
  $('#shotFile').onchange = e => takeImage(e.target.files[0]);
  const shot = $('#shot');
  shot.addEventListener('dragover', e => { e.preventDefault(); shot.classList.add('drag'); });
  shot.addEventListener('dragleave', () => shot.classList.remove('drag'));
  shot.addEventListener('drop', e => { e.preventDefault(); shot.classList.remove('drag'); takeImage(e.dataTransfer.files[0]); });
  document.addEventListener('paste', e => {
    if (tab !== 'custom') return;
    const item = [...((e.clipboardData && e.clipboardData.items) || [])].find(i => i.type.startsWith('image/'));
    if (item) { e.preventDefault(); takeImage(item.getAsFile()); }
  });
  const SHOT_PROMPT = [
    'This image is a screenshot of a NYT "Pips" domino puzzle. Transcribe it exactly into the text format below.',
    '',
    'Format rules:',
    '- "board:" then one line per grid row, top to bottom. Treat the board as a square grid where every cell position is one character. A letter marks a cell in a region: cells inside the same dashed outline share a letter, and separate regions get different letters even when they share a colour. "#" is a playable cell with no region (a plain tile with no dashed outline). "." is a position with no cell. Keep empty columns or rows between separate parts of the board as "." so positions line up.',
    '- "regions:" then one line per region letter: the letter, the rule from its diamond badge, then its colour word. Rules: a number N means the cells add up to N; "<N" means the sum is less than N; ">N" means greater than N; "=" means all equal; "!=" means all different. A region with no badge uses "any". Colour is one of: purple, pink, teal, orange, olive, navy, gray.',
    '- "dominoes:" then every domino in the tray, left to right, top row first, as two digits (pips on the left half, then the right half; a blank half is 0), separated by spaces.',
    '- The number of cells (letters and #) must equal twice the number of dominoes. Count carefully.',
    '',
    'Example:',
    PUZZLES.easy.replace('# Easy\n', ''),
    '',
    'Reply with only the puzzle text in this format and nothing else.'
  ].join('\n');
  $('#readShot').onclick = async () => {
    if (!sample || !shotBlob) return;
    shotCtl = new AbortController();
    $('#readShot').disabled = true; $('#stopShot').hidden = false;
    shotStatus('Claude is reading the screenshot. This usually takes under a minute…');
    try {
      const { text } = await sample(SHOT_PROMPT, { images: [shotBlob], modelTier: 'complex', signal: shotCtl.signal });
      const body = text.replace(/```[a-z]*\n?/g, '').trim();
      const p = parsePuzzle(body);
      setModel(modelFromText(body));
      showErrors(p.errors);
      shotStatus(p.errors.length ? 'Read the screenshot, but some details need fixing (listed below). Compare with the image and adjust.' : 'Done. Compare the board, rules and tray with your screenshot, fix anything that looks off, then solve.', p.errors.length ? 'err' : 'ok');
    } catch (e) {
      const code = e && e.code;
      const msg = { cancelled: '', not_granted: 'This page isn’t allowed to use Claude, so build the puzzle by hand below.', sampling_disabled: 'Claude isn’t available on this account. Build the puzzle by hand below.', rate_limited: 'Too many requests right now. Try again in a little while.', image_rejected: 'That image couldn’t be used. Try a PNG or JPEG screenshot.', images_unavailable: 'This view can’t send images to Claude. Build the puzzle by hand below.', refused: 'Claude couldn’t read that image. Try a tighter screenshot of just the puzzle.' }[code];
      shotStatus(msg ?? 'Something went wrong reading the screenshot. Try again.', 'err');
      if (['not_granted', 'images_unavailable', 'sampling_disabled'].includes(code)) { $('#shotOn').hidden = true; }
    } finally {
      $('#readShot').disabled = !shotBlob || !sample; $('#stopShot').hidden = true;
    }
  };
  $('#stopShot').onclick = () => { if (shotCtl) shotCtl.abort(); };
  (async () => {
    try {
      if (!window.claude || !window.claude.use) return;
      const s = await window.claude.use('sample');
      if (!s) return;
      const lim = await s.limits().catch(() => null);
      if (!lim || !lim.images) return;
      sample = s;
      $('#shotOn').hidden = false; $('#shotOff').hidden = true;
      $('#shotFile').accept = lim.images.mediaTypes.join(',');
      $('#readShot').disabled = !shotBlob;
    } catch (e) {}
  })();

  function showErrors(list) {
    const ul = $('#errs');
    ul.hidden = !list.length;
    ul.innerHTML = list.map(e => `<li>${esc(e)}</li>`).join('');
  }
  function selectTab(k) {
    stop(); tab = k; store.set('pips-tab', k);
    document.querySelectorAll('.tabs button').forEach(b => b.setAttribute('aria-selected', String(b.dataset.k === k)));
    $('#editor').hidden = k !== 'custom';
    if (k === 'custom') {
      if (!M) setModel(modelFromText(store.get('pips-custom') || PUZZLES.hard.replace('# Hard', '# My puzzle')));
      drawSaved();
      const p = run(textFromModel(M)); showErrors(p.errors);
    } else { showErrors([]); run(PUZZLES[k]); }
  }
  document.querySelectorAll('.tabs button').forEach(b => { b.onclick = () => selectTab(b.dataset.k); });
