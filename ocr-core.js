/* Shared, DOM-free OCR matching and validation. */
(function (root) {
  const clean = text => text.replace(/[^\p{Script=Han}]/gu, '');
  function distance(a, b) {
    let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
    for (let i = 1; i <= a.length; i++) {
      const row = [i];
      for (let j = 1; j <= b.length; j++) {
        row[j] = Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + (a[i - 1] !== b[j - 1]));
      }
      prev = row;
    }
    return prev[b.length];
  }

  function matchRow(text, names, relaxed = false) {
    const input = clean(text);
    const dp = Array(input.length + 1).fill(null);
    dp[0] = { score: 0, matches: [] };
    const update = (end, candidate) => {
      if (!dp[end] || candidate.score > dp[end].score) dp[end] = candidate;
    };
    for (let i = 0; i < input.length; i++) {
      if (!dp[i]) continue;
      update(i + 1, { score: dp[i].score - 3, matches: dp[i].matches });
      for (const name of names) {
        // Single-character names must match exactly. Longer names permit one OCR error.
        for (const length of name.length >= 3 ? [name.length - 1, name.length, name.length + 1] : [name.length]) {
          if (i + length > input.length) continue;
          const raw = input.slice(i, i + length);
          const edits = distance(raw, name);
          const maxEdits = name.length === 1 ? 0 : (relaxed && name.length >= 3 ? 2 : 1);
          if (edits > maxEdits) continue;
          // A two-character correction must be the unique closest dictionary name.
          if (edits === 2 && names.some(other => other !== name && distance(raw, other) <= edits)) continue;
          update(i + length, {
            score: dp[i].score + name.length * 5 - edits * 8,
            matches: [...dp[i].matches, { name, raw, corrected: edits !== 0, inferred: edits === 2 }],
          });
        }
      }
    }
    return dp[input.length]?.matches || [];
  }

  function linesFromBlocks(data) {
    return (data.blocks || []).flatMap(b => (b.paragraphs || []).flatMap(p => p.lines || []));
  }

  function findTextBands(data, names, height) {
    const anchors = linesFromBlocks(data).filter(line => {
      const text = clean(line.text || '');
      return names.some(name => name.length > 1 && text.includes(name));
    }).sort((a, b) => a.bbox.y0 - b.bbox.y0);
    const rows = [];
    for (const line of anchors) {
      const { y0, y1 } = line.bbox;
      const center = (y0 + y1) / 2;
      let row = rows.find(r => Math.abs(r.center - center) < Math.max(y1 - y0, r.bottom - r.top) * 0.7);
      if (!row) rows.push(row = { center, top: y0, bottom: y1, anchors: 0 });
      row.top = Math.min(row.top, y0); row.bottom = Math.max(row.bottom, y1); row.anchors++;
    }
    return rows.filter(row => row.anchors >= 2).map(row => {
      const padding = Math.max(8, (row.bottom - row.top) * 0.4);
      const top = Math.max(0, Math.floor(row.top - padding));
      return { top, height: Math.min(height, Math.ceil(row.bottom + padding)) - top };
    });
  }

  function validateGroup(matches, order) {
    const relevant = matches.filter(m => order.includes(m.name)); // 绝技 never participates.
    const names = relevant.map(m => m.name);
    if (names.length !== order.length || new Set(names).size !== order.length) {
      return { valid: false, banned: [], missing: order.filter(name => !names.includes(name)), matches: relevant,
        reason: '名称缺失或重复，请重新截图或手动核对' };
    }
    const banned = names.slice(-5), active = names.slice(0, -5);
    const inOrder = group => group.every((name, i) => i === 0 || order.indexOf(group[i - 1]) < order.indexOf(name));
    if (!inOrder(active) || !inOrder(banned)) {
      return { valid: false, banned: [], missing: [], matches: relevant, reason: '组内顺序不符合本赛季配置，请手动核对' };
    }
    return { valid: true, banned, missing: [], matches: relevant, reason: '' };
  }

  function interpretRows(rows, main, sub) {
    const dictionary = [...main, ...sub, '绝技'];
    let matches = rows.flatMap(row => matchRow(row, dictionary));
    let mainResult = validateGroup(matches, main), subResult = validateGroup(matches, sub);
    if (!mainResult.valid || !subResult.valid) {
      const relaxed = rows.flatMap(row => matchRow(row, dictionary, true));
      const mainRetry = validateGroup(relaxed, main), subRetry = validateGroup(relaxed, sub);
      // Only use weaker matches when the entire group also passes count, uniqueness and order checks.
      const used = [];
      if (!mainResult.valid && mainRetry.valid) { mainResult = mainRetry; used.push(...mainRetry.matches); }
      else used.push(...mainResult.matches);
      if (!subResult.valid && subRetry.valid) { subResult = subRetry; used.push(...subRetry.matches); }
      else used.push(...subResult.matches);
      matches = used;
    }
    return { main: mainResult, sub: subResult,
      corrections: matches.filter(m => m.corrected && m.name !== '绝技') };
  }

  const api = { clean, distance, matchRow, linesFromBlocks, findTextBands, validateGroup, interpretRows };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.BanOcrCore = api;
})(typeof globalThis === 'object' ? globalThis : this);
