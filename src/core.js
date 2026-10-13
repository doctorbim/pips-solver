// Pips core: puzzle parser + logging solver. No DOM access here.
const PUZZLES = {
  easy: `# Easy
board:
..ab
cd.b
.d.e
.ffe
regions:
a 6 navy
b 6 purple
c 6 olive
d 6 pink
e = teal
f 2 orange
dominoes: 66 61 36 13 60`,
  medium: `# Medium
board:
..abcd
.efgcd
eefg.h
regions:
a >3 navy
b 3 purple
c 3 pink
d >3 olive
e <2 purple
f >8 teal
g <4 orange
h 2 pink
dominoes: 01 00 15 43 42 35 02`,
  hard: `# Hard
board:
ab#c.d..
e..f.d..
e..f.g..
ehhh.i..
j..k.l..
m..k.lnn
regions:
a 4 teal
b <2 orange
c 1 teal
d = olive
e = purple
f 7 orange
g 4 navy
h != pink
i >2 olive
j <3 pink
k 8 navy
l 10 purple
m <5 purple
n 4 pink
dominoes: 43 25 61 06 31 22 26 35 46 33 24 41`
};

const COLOR_NAMES = ['purple', 'pink', 'teal', 'orange', 'olive', 'navy', 'gray'];

function parsePuzzle(text) {
  const lines = text.replace(/\r/g, '').split('\n');
  let mode = null, title = '';
  const board = [], rules = {}, dominoes = [];
  const errors = [];
  lines.forEach((raw, ln) => {
    const line = raw.replace(/\s+$/, '');
    if (!line.trim()) return;
    if (line.trim().startsWith('#') && mode === null) { title = line.trim().slice(1).trim(); return; }
    const head = line.trim().toLowerCase();
    if (head === 'board:') { mode = 'board'; return; }
    if (head === 'regions:') { mode = 'regions'; return; }
    if (head.startsWith('dominoes:')) {
      mode = 'dominoes';
      const rest = line.trim().slice(9);
      if (rest.trim()) parseDominoLine(rest, ln);
      return;
    }
    if (mode === 'board') board.push(line);
    else if (mode === 'regions') {
      const m = line.trim().match(/^([A-Za-z])\s+(any|\*|=|!=|≠|<\s*\d+|>\s*\d+|\d+)\s*([a-z]+)?$/i);
      if (!m) { errors.push(`Line ${ln + 1}: can't read region rule "${line.trim()}". Use e.g. "a 6", "b <4", "c >2", "d =", "e !=".`); return; }
      const key = m[1];
      let t = m[2].replace(/\s+/g, ''), rule;
      if (t === '=') rule = { type: 'eq' };
      else if (t === '!=' || t === '≠') rule = { type: 'neq' };
      else if (t === 'any' || t === '*') rule = { type: 'none' };
      else if (t[0] === '<') rule = { type: 'lt', n: +t.slice(1) };
      else if (t[0] === '>') rule = { type: 'gt', n: +t.slice(1) };
      else rule = { type: 'sum', n: +t };
      const color = m[3] ? m[3].toLowerCase() : null;
      if (color && !COLOR_NAMES.includes(color)) { errors.push(`Line ${ln + 1}: unknown colour "${m[3]}". Use one of ${COLOR_NAMES.join(', ')}.`); }
      rules[key] = { ...rule, color: COLOR_NAMES.includes(color) ? color : null };
    } else if (mode === 'dominoes') parseDominoLine(line, ln);
  });
  function parseDominoLine(s, ln) {
    for (const tok of s.trim().split(/[\s,]+/)) {
      if (!tok) continue;
      const m = tok.match(/^([0-6])[-|/]?([0-6])$/);
      if (!m) { errors.push(`Line ${ln + 1}: "${tok}" isn't a domino. Write two pips like 63 or 6-3.`); continue; }
      dominoes.push([+m[1], +m[2]]);
    }
  }
  const cells = [], regionMap = {};
  board.forEach((row, r) => {
    [...row].forEach((ch, c) => {
      if (ch === '.' || ch === ' ') return;
      if (ch === '#') { cells.push({ r, c, key: null }); return; }
      if (!/[A-Za-z]/.test(ch)) { errors.push(`Board row ${r + 1}: "${ch}" isn't allowed. Use letters for regions, # for a free cell, . for a gap.`); return; }
      cells.push({ r, c, key: ch });
    });
  });
  if (!cells.length) errors.push('The board is empty. Add rows under "board:".');
  const regions = [];
  let auto = 0;
  for (const cell of cells) {
    if (cell.key === null) { cell.reg = -1; continue; }
    if (!(cell.key in regionMap)) {
      const rule = rules[cell.key] || { type: 'none', color: null };
      regionMap[cell.key] = regions.length;
      regions.push({ key: cell.key, ...rule, color: rule.color || COLOR_NAMES[auto++ % 6], cells: [] });
    }
    cell.reg = regionMap[cell.key];
  }
  cells.forEach((cell, i) => { cell.id = i; if (cell.reg >= 0) regions[cell.reg].cells.push(i); });
  for (const k of Object.keys(rules)) if (!(k in regionMap)) errors.push(`Region "${k}" has a rule but no cells on the board.`);
  if (cells.length && cells.length !== dominoes.length * 2)
    errors.push(`The board has ${cells.length} cells but ${dominoes.length} dominoes cover ${dominoes.length * 2}. They must match.`);
  const rows = board.length, cols = Math.max(0, ...board.map(b => b.length));
  return { title, cells, regions, dominoes, rows, cols, errors };
}

function ruleLabel(reg) {
  switch (reg.type) {
    case 'sum': return String(reg.n);
    case 'lt': return '<' + reg.n;
    case 'gt': return '>' + reg.n;
    case 'eq': return '=';
    case 'neq': return '≠';
    default: return '';
  }
}

function solvePuzzle(P) {
  const N = P.cells.length, D = P.dominoes.length;
  const at = {};
  P.cells.forEach(c => { at[c.r + ',' + c.c] = c.id; });
  const nbrs = P.cells.map(c => [[-1, 0], [1, 0], [0, -1], [0, 1]]
    .map(([dr, dc]) => at[(c.r + dr) + ',' + (c.c + dc)]).filter(x => x !== undefined));
  let FULL = 0;
  P.dominoes.forEach(([a, b]) => { FULL |= (1 << a) | (1 << b); });
  const bit = v => 1 << v;
  const has = (m, v) => (m >> v) & 1;
  const vals = m => { const o = []; for (let v = 0; v <= 6; v++) if (has(m, v)) o.push(v); return o; };
  const minOf = m => { for (let v = 0; v <= 6; v++) if (has(m, v)) return v; return 99; };
  const maxOf = m => { for (let v = 6; v >= 0; v--) if (has(m, v)) return v; return -99; };
  const dkey = d => { const [a, b] = P.dominoes[d]; return Math.min(a, b) + '' + Math.max(a, b); };

  // ---- text helpers (HTML snippets; all inputs are digits or single letters) ----
  const cn = id => `<b class="cell" data-c="${id}">R${P.cells[id].r + 1}C${P.cells[id].c + 1}</b>`;
  const dm = (x, y) => `<span class="dm"><i>${x}</i><i>${y}</i></span>`;
  const set = m => '{' + vals(m).join(',') + '}';
  const rn = ri => {
    if (ri < 0) return '<span class="rg" style="--rc:var(--r-gray)">free cell</span>';
    const g = P.regions[ri], lab = ruleLabel(g).replace('<', '&lt;').replace('>', '&gt;');
    return `<span class="rg" style="--rc:var(--r-${g.color})">${g.color}${lab ? ' ' + lab : ''}</span>`;
  };
  const ruleText = g => {
    const k = g.cells.length;
    switch (g.type) {
      case 'sum': return k === 1 ? `a one-cell region worth ${g.n} must show exactly ${g.n}` : `its ${k} cells must add up to exactly ${g.n}`;
      case 'lt': return k === 1 ? `this cell must be less than ${g.n}` : `its ${k} cells must add up to less than ${g.n}`;
      case 'gt': return k === 1 ? `this cell must be more than ${g.n}` : `its ${k} cells must add up to more than ${g.n}`;
      case 'eq': return `all ${k} cells must show the same number`;
      case 'neq': return `all ${k} cells must show different numbers`;
      default: return 'no rule of its own';
    }
  };

  // ---- state ----
  const S0 = {
    val: Array(N).fill(null), mate: Array(N).fill(-1), link: Array(N).fill(-1),
    dom: Array(N).fill(FULL), used: Array(D).fill(false), placed: [], ban: new Set()
  };
  const clone = S => ({ val: S.val.slice(), mate: S.mate.slice(), link: S.link.slice(), dom: S.dom.slice(), used: S.used.slice(), placed: S.placed.slice(), ban: new Set(S.ban) });
  const banned = (S, a, b, x, y) => S.ban.has(`${a}-${b}-${x}-${y}`);
  const ban = (S, o) => { S.ban.add(`${o.a}-${o.b}-${o.x}-${o.y}`); S.ban.add(`${o.b}-${o.a}-${o.y}-${o.x}`); };
  const fits = (S, a, b, x, y) => !banned(S, a, b, x, y) && !rejectReason(S, a, b, x, y);

  const partners = (S, c) => S.link[c] >= 0 ? [S.link[c]] : nbrs[c].filter(n => S.mate[n] < 0 && S.link[n] < 0);

  function regionCheck(S, ri, ov, explain) {
    if (ri < 0) return null;
    const g = P.regions[ri];
    const known = [], unk = [];
    for (const c of g.cells) {
      const v = c in ov ? ov[c] : S.val[c];
      if (v !== null && v !== undefined) known.push(v); else unk.push(c);
    }
    const s = known.reduce((a, b) => a + b, 0);
    let lo = s, hi = s;
    for (const c of unk) { lo += minOf(S.dom[c]); hi += maxOf(S.dom[c]); }
    const full = unk.length === 0;
    const R = rn(ri);
    switch (g.type) {
      case 'sum':
        if (lo > g.n) return full ? `${R} would total ${s}, not ${g.n}` : `${R} would already be at least ${lo}, over ${g.n}`;
        if (hi < g.n) return full ? `${R} would total ${s}, not ${g.n}` : `${R} could reach at most ${hi}, short of ${g.n}`;
        return null;
      case 'lt':
        if (lo >= g.n) return full ? `${R} would total ${s}, not under ${g.n}` : `${R} would be at least ${lo}, not under ${g.n}`;
        return null;
      case 'gt':
        if (hi <= g.n) return full ? `${R} would total ${s}, not over ${g.n}` : `${R} could reach at most ${hi}, not over ${g.n}`;
        return null;
      case 'eq': {
        if (known.some(v => v !== known[0])) return `${R} would mix ${[...new Set(known)].join(' and ')}, but all must match`;
        if (known.length) { if (unk.some(c => !has(S.dom[c], known[0]))) return `${R} needs every cell to be ${known[0]}, and another cell there can't be`; }
        else { let m = FULL; unk.forEach(c => { m &= S.dom[c]; }); if (!m) return `${R} has no number all its cells could share`; }
        return null;
      }
      case 'neq': {
        const seen = new Set();
        for (const v of known) { if (seen.has(v)) return `${R} would repeat a ${v}`; seen.add(v); }
        let km = 0; known.forEach(v => { km |= bit(v); });
        if (unk.some(c => !(S.dom[c] & ~km))) return `${R} would leave another cell with no unused number`;
        return null;
      }
      default: return null;
    }
  }

  function rejectReason(S, a, b, x, y) {
    if (!has(S.dom[a], x)) return `${cn(a)} can't be ${x}`;
    if (!has(S.dom[b], y)) return `${cn(b)} can't be ${y}`;
    const ov = { [a]: x, [b]: y };
    const ra = P.cells[a].reg, rb = P.cells[b].reg;
    return regionCheck(S, ra, ov) || (rb !== ra ? regionCheck(S, rb, ov) : null);
  }

  function options(S, a, b) {
    const seen = new Set(), out = [];
    for (let d = 0; d < D; d++) {
      if (S.used[d]) continue;
      const k = dkey(d); if (seen.has(k)) continue; seen.add(k);
      const [p, q] = P.dominoes[d];
      const ors = p === q ? [[p, q]] : [[p, q], [q, p]];
      for (const [x, y] of ors) if (fits(S, a, b, x, y)) out.push({ d, a, b, x, y });
    }
    return out;
  }

  function place(S, o) {
    S.val[o.a] = o.x; S.val[o.b] = o.y;
    S.mate[o.a] = o.b; S.mate[o.b] = o.a;
    S.link[o.a] = S.link[o.b] = -1;
    S.dom[o.a] = bit(o.x); S.dom[o.b] = bit(o.y);
    S.used[o.d] = true;
    S.placed.push({ d: o.d, a: o.a, b: o.b, x: o.x, y: o.y });
  }

  function updateDomains(S) {
    const old = new Map();
    let changed = true;
    while (changed) {
      changed = false;
      for (let c = 0; c < N; c++) {
        if (S.mate[c] >= 0) continue;
        let m = 0;
        for (const p of partners(S, c)) for (const o of options(S, c, p)) m |= bit(o.x);
        m &= S.dom[c];
        if (m !== S.dom[c]) { if (!old.has(c)) old.set(c, S.dom[c]); S.dom[c] = m; changed = true; }
        if (!m) return old;
      }
    }
    return old;
  }

  // ---- logging ----
  const steps = [];
  let sink = steps, mode = 'main';
  let capped = false;
  function log(S, kind, title, text, extra = {}) {
    if (sink.length > 4000) { capped = true; return; }
    sink.push({
      kind, title, text, mode, cells: extra.cells || [], domino: extra.domino ?? null, depth: extra.depth || 0,
      snap: { val: S.val.slice(), mate: S.mate.slice(), link: S.link.slice(), dom: S.dom.slice(), used: S.used.slice(), placed: S.placed.slice() }
    });
  }

  function listRejections(S, a, b, keep) {
    const seen = new Set(), rows = [];
    for (let d = 0; d < D; d++) {
      if (S.used[d]) continue;
      const k = dkey(d); if (seen.has(k)) continue; seen.add(k);
      if (keep && d === keep.d) continue;
      const [p, q] = P.dominoes[d];
      const why = (x, y) => banned(S, a, b, x, y) ? 'was ruled out by an earlier what-if test' : rejectReason(S, a, b, x, y);
      const r1 = why(p, q);
      const r2 = p === q ? r1 : why(q, p);
      if (keep && dkey(keep.d) === k) continue;
      if (r1 && r2) rows.push(`<li>${dm(p, q)} ${r1 === r2 || p === q ? r1 : `${r1}; flipped, ${r2}`}</li>`);
    }
    return rows.length ? `<ul class="why">${rows.join('')}</ul>` : '';
  }

  function placeText(S, o, lead) {
    const rej = listRejections(S, o.a, o.b, o);
    return `${lead} The only domino that fits is ${dm(o.x, o.y)}, with ${o.x} on ${cn(o.a)} and ${o.y} on ${cn(o.b)}.` +
      (rej ? ` Every other remaining domino breaks a rule:${rej}` : '');
  }

  function deadCheck(S, depth, before) {
    for (let c = 0; c < N; c++) {
      if (S.mate[c] >= 0) continue;
      if (!partners(S, c).length) { log(S, 'dead', 'Dead end', `${cn(c)} is boxed in: every neighbour is already covered, so no domino can reach it.`, { cells: [c], depth }); return true; }
      if (!S.dom[c]) {
        const E = { ...S, dom: before || S.dom };
        const parts = partners(S, c).map(p => `<li>Pairing with ${cn(p)}:${listRejections(E, c, p) || ' nothing left to try'}</li>`).join('');
        log(S, 'dead', 'Dead end', `${cn(c)} can no longer be covered. Every remaining domino breaks a rule:<ul class="why">${parts}</ul>`, { cells: [c], depth });
        return true;
      }
    }
    return false;
  }

  function verify(S) {
    for (let ri = 0; ri < P.regions.length; ri++) if (regionCheck(S, ri, {})) return false;
    return true;
  }

  function propagate(S, depth) {
    for (;;) {
      if (S.placed.length * 2 === N) {
        if (verify(S)) {
          const lines = P.regions.filter(g => g.type !== 'none').map((g, i) => {
            const vs = g.cells.map(c => S.val[c]);
            const ri = P.regions.indexOf(g);
            const detail = g.type === 'eq' || g.type === 'neq' ? vs.join(', ') : `${vs.join(' + ')} = ${vs.reduce((a, b) => a + b, 0)}`;
            return `<li>${rn(ri)}: ${detail}</li>`;
          });
          log(S, 'solved', 'Solved', `Every cell is covered and every region checks out:<ul class="why">${lines.join('')}</ul>`, { depth });
          return 'solved';
        }
        log(S, 'dead', 'Dead end', 'Every cell is covered, but a region rule fails.', { depth });
        return 'dead';
      }

      const before = S.dom.slice();
      const ch = updateDomains(S);
      if (deadCheck(S, depth, before)) return 'dead';
      if (ch.size) {
        const byReg = new Map();
        for (const [c, m] of ch) { const ri = P.cells[c].reg; if (!byReg.has(ri)) byReg.set(ri, []); byReg.get(ri).push(c); }
        const parts = [];
        for (const [ri, cs] of byReg) {
          const why = ri < 0 ? 'it has no rule, so only its neighbours and the remaining dominoes limit it' : ruleText(P.regions[ri]);
          parts.push(`<li>${rn(ri)} (${why}): ${cs.map(c => `${cn(c)} ${set(before[c])} → <b>${set(S.dom[c])}</b>`).join('; ')}</li>`);
        }
        const singles = [...ch.keys()].filter(c => vals(S.dom[c]).length === 1);
        log(S, 'narrow', singles.length ? 'Pin down values' : 'Narrow candidates',
          `Checking each cell against its region rule and the dominoes still in the tray rules out some numbers:<ul class="why">${parts.join('')}</ul>` +
          (singles.length ? `${singles.map(cn).join(', ')} now ${singles.length > 1 ? 'have' : 'has'} only one possible value.` : ''),
          { cells: [...ch.keys()], depth });
      }

      // Rule 1: a forced pair with exactly one fitting domino
      let acted = false;
      for (let a = 0; a < N && !acted; a++) {
        const b = S.link[a];
        if (S.mate[a] >= 0 || b < a) continue;
        const opts = options(S, a, b);
        if (opts.length === 1) {
          place(S, opts[0]);
          log(S, 'place', 'Only one domino fits', placeText(S, opts[0], `${cn(a)} and ${cn(b)} must share a domino.`), { cells: [a, b], domino: opts[0].d, depth });
          acted = true;
        }
      }
      if (acted) continue;

      // Rule 2: a cell with only one neighbour it can pair with
      for (let c = 0; c < N && !acted; c++) {
        if (S.mate[c] >= 0 || S.link[c] >= 0) continue;
        const ps = partners(S, c);
        const ok = ps.filter(p => options(S, c, p).length);
        if (ok.length !== 1) continue;
        const p = ok[0];
        let lead;
        if (ps.length === 1) lead = `${cn(c)} has only one open neighbour, ${cn(p)}, so a single domino must cover both.`;
        else {
          const bad = ps.filter(q => q !== p).map(cn).join(' or ');
          lead = `${cn(c)} touches ${ps.length} open cells, but no remaining domino can sit across ${cn(c)} and ${bad} without breaking a rule. So ${cn(c)} must pair with ${cn(p)}.`;
        }
        const opts = options(S, c, p);
        if (opts.length === 1) {
          place(S, opts[0]);
          log(S, 'place', ps.length === 1 ? 'Forced pair' : 'Only workable neighbour', placeText(S, opts[0], lead), { cells: [c, p], domino: opts[0].d, depth });
        } else {
          S.link[c] = p; S.link[p] = c;
          log(S, 'link', ps.length === 1 ? 'Forced pair' : 'Only workable neighbour',
            `${lead} It could still be ${opts.length > 6 ? `any of ${opts.length} domino placements` : opts.map(o => dm(o.x, o.y)).join(', ')}, so mark the pair and come back to it.`, { cells: [c, p], depth });
        }
        acted = true;
      }
      if (acted) continue;

      // Rule 3: a domino with exactly one legal spot
      const pairs = [];
      for (let a = 0; a < N; a++) {
        if (S.mate[a] >= 0) continue;
        for (const b of partners(S, a)) if (b > a) pairs.push([a, b]);
      }
      const seen = new Set();
      for (let d = 0; d < D && !acted; d++) {
        if (S.used[d]) continue;
        const k = dkey(d); if (seen.has(k)) continue; seen.add(k);
        const copies = P.dominoes.filter((_, i) => !S.used[i] && dkey(i) === k).length;
        const [p, q] = P.dominoes[d];
        const spots = [];
        for (const [a, b] of pairs) {
          const ors = p === q ? [[p, q]] : [[p, q], [q, p]];
          for (const [x, y] of ors) if (fits(S, a, b, x, y)) spots.push({ d, a, b, x, y });
        }
        if (!spots.length) {
          log(S, 'dead', 'Dead end', `${dm(p, q)} has nowhere to go: no open pair of cells can hold it without breaking a rule.`, { domino: d, depth });
          return 'dead';
        }
        if (spots.length === 1 && copies === 1) {
          const o = spots[0];
          place(S, o);
          log(S, 'spot', 'Only one spot for this domino',
            `Look at it from the tray's side: ${dm(p, q)} has to go somewhere, and the only open pair that can hold it is ${cn(o.a)}–${cn(o.b)} (${o.x} on ${cn(o.a)}, ${o.y} on ${cn(o.b)}). Everywhere else it would break a region rule or a cell's candidates.`,
            { cells: [o.a, o.b], domino: d, depth });
          acted = true;
        }
      }
      if (acted) continue;
      return 'stuck';
    }
  }

  let guesses = 0, whatifs = 0;
  function candidates(S) {
    const out = [], seen = new Set();
    const cells = [];
    for (let c = 0; c < N; c++) {
      if (S.mate[c] >= 0) continue;
      const ch = [];
      for (const p of partners(S, c)) for (const o of options(S, c, p)) ch.push(o);
      cells.push({ c, ch });
    }
    cells.sort((u, v) => u.ch.length - v.ch.length);
    const lim = Math.max(2, cells.length ? cells[0].ch.length : 0);
    for (const { ch } of cells) if (ch.length <= lim) for (const o of ch) {
      const k = o.a < o.b ? `${o.a}-${o.b}-${o.x}-${o.y}` : `${o.b}-${o.a}-${o.y}-${o.x}`;
      if (!seen.has(k)) { seen.add(k); out.push(o); }
    }
    return { cells, out };
  }

  function search(S, depth) {
    for (;;) {
      const r = propagate(S, depth);
      if (r === 'solved') return S;
      if (r === 'dead') return null;

      // What-if test: try each option silently; if forced moves alone reach a contradiction, rule it out.
      const { cells, out } = candidates(S);
      let best = null;
      for (const o of out) {
        const T = clone(S); place(T, o);
        const temp = []; const keep = sink, keepMode = mode; sink = temp; mode = 'test';
        const r2 = propagate(T, depth + 1);
        sink = keep; mode = keepMode;
        if (r2 === 'dead' && (!best || temp.length < best.temp.length)) best = { o, temp };
        if (best && best.temp.length <= 2) break;
      }
      if (best) {
        const o = best.o;
        whatifs++;
        const T = clone(S); place(T, o);
        const keepMode = mode; mode = 'test';
        log(T, 'suppose', 'What if…?', `No rule forces a move, so test an option. Suppose ${dm(o.x, o.y)} sits on ${cn(o.a)}–${cn(o.b)}, with ${o.x} on ${cn(o.a)}. Follow the forced moves and see what happens.`, { cells: [o.a, o.b], domino: o.d, depth: depth + 1 });
        for (const st of best.temp) sink.push(st);
        mode = keepMode;
        ban(S, o);
        log(S, 'refute', 'Rule it out', `That chain ran into a contradiction, so ${dm(o.x, o.y)} with ${o.x} on ${cn(o.a)} and ${o.y} on ${cn(o.b)} is impossible. Cross it off and carry on from before the test.`, { cells: [o.a, o.b], depth });
        continue;
      }

      // Genuine guess: no single test breaks, so branch on the most constrained cell.
      const { c, ch } = cells[0];
      const o = ch[0];
      log(S, 'stuck', 'No forced move', `Nothing is forced, and none of the remaining options breaks when tested on its own. Pips puzzles often allow more than one correct answer, so a free choice is normal at this point. ${cn(c)} has the fewest ways to be covered (${ch.length}): ${ch.map(q => `${dm(q.x, q.y)} with ${cn(q.b)}`).join(', ')}. Commit to the first and keep reasoning; if it ever breaks, come back and try the next.`, { cells: [c], depth });
      const S2 = clone(S); place(S2, o);
      guesses++;
      const keepMode = mode; mode = 'guess';
      log(S2, 'guess', 'Pick one', `Pick ${dm(o.x, o.y)} on ${cn(o.a)}–${cn(o.b)}, with ${o.x} on ${cn(o.a)}.`, { cells: [o.a, o.b], domino: o.d, depth: depth + 1 });
      const res = search(S2, depth + 1);
      mode = keepMode;
      if (res) return res;
      ban(S, o);
      log(S, 'back', 'Undo that guess', `The guess ${dm(o.x, o.y)} on ${cn(o.a)}–${cn(o.b)} eventually broke, so cross it off and continue from before it.`, { cells: [o.a, o.b], depth });
    }
  }

  log(S0, 'start', 'Set up', `The board has ${N} cells and the tray holds ${D} dominoes. Each domino covers two touching cells, every cell gets covered, and every coloured region must satisfy its rule. Numbers on cells are the candidates still possible; they start as every pip value in the tray.`);
  const final = search(clone(S0), 0);
  return { steps, solved: !!final, final, guesses, whatifs, capped };
}

function countSolutions(P, cap = 999, budgetMs = 1500) {
  const t0 = Date.now(); let out = false, ticks = 0;
  const N = P.cells.length, at = {};
  P.cells.forEach(c => { at[c.r + ',' + c.c] = c.id; });
  const val = Array(N).fill(null), used = Array(P.dominoes.length).fill(false), grids = new Set();
  const ok = () => P.regions.every(g => {
    const v = g.cells.map(c => val[c]);
    if (v.some(x => x === null)) return true;
    const s = v.reduce((a, b) => a + b, 0);
    return g.type === 'sum' ? s === g.n : g.type === 'lt' ? s < g.n : g.type === 'gt' ? s > g.n
      : g.type === 'eq' ? new Set(v).size === 1 : g.type === 'neq' ? new Set(v).size === v.length : true;
  });
  (function rec() {
    if (out || grids.size >= cap) return;
    if (++ticks % 2000 === 0 && Date.now() - t0 > budgetMs) { out = true; return; }
    const c = val.indexOf(null);
    if (c < 0) { grids.add(val.join(',')); return; }
    const cl = P.cells[c];
    for (const [dr, dc] of [[0, 1], [1, 0]]) {
      const n = at[(cl.r + dr) + ',' + (cl.c + dc)];
      if (n === undefined || val[n] !== null) continue;
      const seen = new Set();
      for (let d = 0; d < used.length; d++) {
        if (used[d]) continue;
        const [p, q] = P.dominoes[d];
        for (const [x, y] of p === q ? [[p, q]] : [[p, q], [q, p]]) {
          if (seen.has(x * 7 + y)) continue; seen.add(x * 7 + y);
          val[c] = x; val[n] = y; used[d] = true;
          if (ok()) rec();
          val[c] = val[n] = null; used[d] = false;
        }
      }
    }
  })();
  return { count: grids.size, complete: !out && grids.size < cap };
}

if (typeof module !== 'undefined') module.exports = { PUZZLES, parsePuzzle, solvePuzzle, ruleLabel, countSolutions };
