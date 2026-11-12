const assert = require('node:assert/strict');
const path = require('node:path');
const core = require('../ocr-core.js');
const traits = require('../data/traits.json');
const main = traits['主羁绊'].map(t => t.name), sub = traits['子羁绊'].map(t => t.name);
const rows = [
  '阿戈尔 卡西米尔 马防斯 伊比利亚 且塔尼亚 炎 萨尔贡 维多利亚 谢拉格 有叙拉古',
  '精准 过捷 坚守 助力 投资人 突笋 调和 协防干员 独行 绝技',
  '聚合 逐巧 远见 奇迹 不屈 奥林',
];
const result = core.interpretRows(rows, main, sub);
assert(result.main.valid && result.sub.valid);
assert.deepEqual(result.main.banned, ['炎', '萨尔贡', '维多利亚', '谢拉格', '叙拉古']);
assert.deepEqual(result.sub.banned, ['灵巧', '远见', '奇迹', '不屈', '奥术']);
assert(result.corrections.find(m => m.name === '乌萨斯' && m.inferred));
assert(!result.sub.banned.includes('绝技'));
assert(!core.interpretRows(rows.slice(0, 2), main, sub).sub.valid);
assert(!core.interpretRows([rows[0], ...rows], main, sub).main.valid);
assert(!core.validateGroup([...main].reverse().map(name => ({ name })), main).valid);
assert(!core.interpretRows(['这不是盟约截图'], main, sub).main.valid);
// Exercise changing ban combinations while keeping the original within-group order.
for (let seed = 0; seed < 30; seed++) {
  const groups = [main, sub].map((order, index) => {
    const shuffled = order.map((name, i) => ({ name, key: ((i + seed * 3 + index) * 73) % 97 }))
      .sort((a, b) => a.key - b.key).slice(0, 5).map(x => x.name);
    return { banned: order.filter(n => shuffled.includes(n)),
      text: [...order.filter(n => !shuffled.includes(n)), ...order.filter(n => shuffled.includes(n))].join(' ') };
  });
  const parsed = core.interpretRows([groups[0].text, groups[1].text + ' 绝技'], main, sub);
  assert.deepEqual(parsed.main.banned, groups[0].banned);
  assert.deepEqual(parsed.sub.banned, groups[1].banned);
}
console.log('Passed: real OCR text, dictionary corrections, 30 ban combinations, non-bannable 绝技, missing/duplicate/out-of-order rejection.');
