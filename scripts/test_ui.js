// Run from the repository directory: node scripts/test_ui.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const context = vm.createContext({
  localStorage: { getItem: () => null },
  clearTimeout, setTimeout,
});
vm.runInContext(fs.readFileSync(path.join(root, 'app.js'), 'utf8').replace(/init\(\);\s*$/, ''), context);
const run = source => vm.runInContext(source, context);
context.operators = JSON.parse(fs.readFileSync(path.join(root, 'data/operators.json'), 'utf8'));
context.traits = JSON.parse(fs.readFileSync(path.join(root, 'data/traits.json'), 'utf8'));
run(`allOperators = operators; traitOrder = {
  main: traits['主羁绊'].map(t => t.name), sub: traits['子羁绊'].map(t => t.name)
};`);
for (const [type, group] of [['main', '主羁绊'], ['sub', '子羁绊']]) {
  assert.equal(run(`JSON.stringify(getOrderedTraits('${type}'))`),
    JSON.stringify(context.traits[group].map(t => t.name)));
}
assert.equal(run('buildEffectHTML({effects:{normal:"<获得时>获得一件“迅捷作战粮”",elite:"<获得时>获得两件“迅捷作战粮”"}})'),
  '&lt;获得时&gt;获得一<span class="elite-effect-diff">（两）</span>件“迅捷作战粮”');
assert.equal(run('buildEffectHTML({effects:{normal:"提升12点",elite:"提升24点"}})'),
  '提升12<span class="elite-effect-diff">（24）</span>点');
assert.equal(run('buildEffectHTML({effects:{normal:"相同",elite:"相同"}})'), '相同');
assert.equal(run('buildEffectHTML({})'), '暂无效果数据');
assert(run('buildEffectHTML({effects:{normal:"普通",elite:"普通<script>"}})').includes('&lt;script&gt;'));
assert(run('buildEffectHTML({effects:{normal:"删除此项",elite:"删除"}})').includes('精锐移除'));
for (const op of context.operators) {
  context.op = op;
  const parts = JSON.parse(run('JSON.stringify(getEffectDiff(op.effects.normal, op.effects.elite))'));
  assert.equal(parts.map(p => p.normal).join(''), op.effects.normal, op.name);
  assert.equal(parts.map(p => p.elite).join(''), op.effects.elite, op.name);
}
console.log(`Passed: configured trait order, inline elite differences, whole-number changes, additions/deletions, HTML escaping and lossless diff for ${context.operators.length} operators.`);
