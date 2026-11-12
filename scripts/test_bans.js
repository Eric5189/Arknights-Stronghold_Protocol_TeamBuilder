const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
const context = vm.createContext({
  localStorage: { getItem: () => null, setItem() {} },
  document: { getElementById: () => ({ checked: true }) },
  setTimeout, clearTimeout,
});
vm.runInContext(fs.readFileSync(path.join(root, 'app.js'), 'utf8').replace(/init\(\);\s*$/, ''), context);
const run = code => vm.runInContext(code, context);
context.operators = JSON.parse(fs.readFileSync(path.join(root, 'data/operators.json'), 'utf8'));
run('allOperators = operators;');
function check(label, mains, subs, bannedMain, bannedSub, expected) {
  context.op = { mainTrait: mains, subTraits: subs };
  context.mainBans = bannedMain; context.subBans = bannedSub;
  run('bannedTraits.main = new Set(mainBans); bannedTraits.sub = new Set(subBans);');
  assert.equal(run('isAutoBanned(op)'), expected, label);
}
check('single core banned despite available sub', ['炎'], ['迅捷'], ['炎'], [], true);
check('available core survives all sub bans', ['炎'], ['迅捷'], [], ['迅捷'], false);
check('two cores: one remains available', ['炎', '维多利亚'], ['迅捷'], ['炎'], ['迅捷'], false);
check('two cores: both banned', ['炎', '维多利亚'], ['迅捷'], ['炎', '维多利亚'], [], true);
check('three cores: one remains available', ['卡西米尔', '谢拉格', '莱塔尼亚'], [], ['卡西米尔', '谢拉格'], [], false);
check('no core: one sub remains available', [], ['精准', '助力'], [], ['精准'], false);
check('no core: all subs banned', [], ['精准', '助力'], ['炎'], ['精准', '助力'], true);
check('no traits is not vacuously banned', [], [], ['炎'], ['精准'], false);
check('no bans', ['炎'], ['迅捷'], [], [], false);

// Use actual season operators to verify squad removal and hidden-banned filtering.
run(`bannedTraits.main.clear(); bannedTraits.sub.clear();
  const thorn = allOperators.find(o => o.name === '引星棘刺');
  const blaze = allOperators.find(o => o.name === '烛煌');
  squad = [thorn, blaze];
  renderOperators = renderSquad = renderBanAutoOps = updateBanBadge = updateBanTraitUI = () => {};
  toggleBanTrait('main', '伊比利亚', { classList: { add() {}, remove() {} } });`);
assert.equal(run('squad.some(o => o.name === "引星棘刺")'), false);
assert.equal(run('getFilteredOperators().some(o => o.name === "引星棘刺")'), false);
run('toggleSquad(thorn.id)');
assert.equal(run('squad.some(o => o.name === "引星棘刺")'), false);
run(`toggleBanTrait('main', '炎', { classList: { add() {}, remove() {} } });`);
assert.equal(run('squad.some(o => o.name === "烛煌")'), true);
run(`toggleBanTrait('main', '维多利亚', { classList: { add() {}, remove() {} } });`);
assert.equal(run('squad.some(o => o.name === "烛煌")'), false);
assert.equal(run('getFilteredOperators().some(o => o.name === "烛煌")'), false);
console.log('Passed: primary-core ban rules, multiple/no cores, squad removal, blocked recruitment and hidden-banned filtering.');
