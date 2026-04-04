/**
 * 卫戍协议小队规划工具 — app.js
 *
 * 数据源：data/operators.json
 * 结构：
 *   allOperators  — 从 JSON 加载的全量干员数据
 *   squad         — 当前小队（干员对象数组）
 */

const MAX_SQUAD_SIZE = 9;

let allOperators = [];
let squad = [];
let traitConfig = {};   // 从 traits_real.json 加载，key 为羁绊名称

// 筛选状态（Set 表示已选中的值，空 Set = 全部显示）
const activeFilters = {
  cost:      new Set(),
  mainTrait: new Set(),
  subTrait:  new Set(),
};

function toggleFilterTag(category, value, el) {
  if (activeFilters[category].has(value)) {
    activeFilters[category].delete(value);
    el.classList.remove('active');
  } else {
    activeFilters[category].add(value);
    el.classList.add('active');
  }
  renderOperators();
}

function resetFilters() {
  activeFilters.cost.clear();
  activeFilters.mainTrait.clear();
  activeFilters.subTrait.clear();
  document.querySelectorAll('.filter-tag').forEach(el => el.classList.remove('active'));
  renderOperators();
}

// ─── 启动 ────────────────────────────────────────────────────────────────────

async function init() {
  try {
    const [opsRes, traitsRes] = await Promise.all([
      fetch('data/operators.json'),
      fetch('data/traits.json'),
    ]);
    if (!opsRes.ok) throw new Error(`operators.json HTTP ${opsRes.status}`);
    allOperators = await opsRes.json();

    if (traitsRes.ok) {
      const raw = await traitsRes.json();
      // 将主羁绊和子羁绊展平为以 name 为 key 的查找表
      [...(raw['主羁绊'] || []), ...(raw['子羁绊'] || [])].forEach(t => {
        traitConfig[t.name] = { thresholds: t.thresholds, effects: t.effects, special: t.special || null };
      });
    }
  } catch (err) {
    document.querySelector('main').innerHTML =
      `<div style="padding:40px;color:#ef4444;font-size:0.95rem;">
        <strong>无法加载数据文件</strong><br><br>
        错误：${escHtml(err.message)}<br><br>
        请使用本地服务器打开此页面（推荐 VS Code 的 Live Server 插件）。
      </div>`;
    return;
  }

  populateFilterOptions();
  renderOperators();
  renderSquad();

  // 筛选事件（现由标签点击处理， init 中只绑重置按钞）

  // 重置筛选
  document.getElementById('btn-reset-filter').addEventListener('click', resetFilters);

  // 小队费用排序
  document.getElementById('btn-sort-squad').addEventListener('click', () => {
    squad.sort((a, b) => a.cost - b.cost);
    renderSquad();
  });

  // 清空小队
  document.getElementById('btn-clear-squad').addEventListener('click', () => {
    squad = [];
    renderOperators();
    renderSquad();
  });
}

// ─── 筛选标签填充 ────────────────────────────────────────────────────────────

function populateFilterOptions() {
  // 费用 1–6
  const costContainer = document.getElementById('filter-tags-cost');
  [1, 2, 3, 4, 5, 6].forEach(c => {
    const tag = document.createElement('span');
    tag.className = `filter-tag cost-tag-${c}`;
    tag.textContent = `${c}费`;
    tag.addEventListener('click', () => toggleFilterTag('cost', String(c), tag));
    costContainer.appendChild(tag);
  });

  const mainTraits = [...new Set(allOperators.flatMap(op => op.mainTrait))].sort();
  const mainContainer = document.getElementById('filter-tags-main');
  mainTraits.forEach(t => {
    const tag = document.createElement('span');
    tag.className = 'filter-tag';
    tag.textContent = t;
    tag.addEventListener('click', () => toggleFilterTag('mainTrait', t, tag));
    mainContainer.appendChild(tag);
  });

  const subTraits = [...new Set(allOperators.flatMap(op => op.subTraits))].sort();
  const subContainer = document.getElementById('filter-tags-sub');
  subTraits.forEach(t => {
    const tag = document.createElement('span');
    tag.className = 'filter-tag';
    tag.textContent = t;
    tag.addEventListener('click', () => toggleFilterTag('subTrait', t, tag));
    subContainer.appendChild(tag);
  });
}

// ─── 干员列表渲染 ────────────────────────────────────────────────────────────

function getFilteredOperators() {
  const costs = activeFilters.cost;
  const mains = activeFilters.mainTrait;
  const subs  = activeFilters.subTrait;

  return allOperators.filter(op => {
    if (costs.size > 0 && !costs.has(String(op.cost))) return false;
    if (mains.size > 0 && !op.mainTrait.some(t => mains.has(t))) return false;
    if (subs.size  > 0 && !op.subTraits.some(t => subs.has(t)))  return false;
    return true;
  });
}

function renderOperators() {
  const filtered  = getFilteredOperators();
  const container = document.getElementById('operator-list');
  const countBar  = document.getElementById('operator-count-bar');

  countBar.textContent = `显示 ${filtered.length} / ${allOperators.length} 位干员`;
  container.innerHTML = '';

  const squadIds = new Set(squad.map(op => op.id));

  filtered.forEach(op => {
    const inSquad = squadIds.has(op.id);

    const card = document.createElement('div');
    card.className = `operator-card${inSquad ? ' in-squad' : ''}`;

    const subTraitHTML = op.subTraits
      .map(t => `<span class="trait sub-trait">${escHtml(t)}</span>`)
      .join('');

    card.innerHTML = `
      <div class="op-header">
        <span class="op-name" title="${escAttr(op.name)}">${escHtml(op.name)}</span>
        <span class="op-cost cost-${op.cost}">${op.cost}阶</span>
      </div>
      <div class="op-traits">
        ${op.mainTrait.map(t => `<span class="trait main-trait">${escHtml(t)}</span>`).join('')}
        ${subTraitHTML}
      </div>
      <button
        class="op-action-btn${inSquad ? ' remove' : ''}"
        data-id="${escAttr(op.id)}"
      >${inSquad ? '✓ 移除' : '+ 加入'}</button>
    `;

    container.appendChild(card);
  });

  // 事件委托，避免逐卡绑定
  container.querySelectorAll('.op-action-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      toggleSquad(btn.dataset.id);
    });
  });
}

// ─── 小队管理 ────────────────────────────────────────────────────────────────

function toggleSquad(id) {
  const idx = squad.findIndex(op => op.id === id);

  if (idx >= 0) {
    squad.splice(idx, 1);
  } else {
    if (squad.length >= MAX_SQUAD_SIZE) {
      alert(`小队最多 ${MAX_SQUAD_SIZE} 名干员！`);
      return;
    }
    const op = allOperators.find(op => op.id === id);
    if (op) squad.push(op);
  }

  renderOperators();
  renderSquad();
}

// ─── 小队面板渲染 ────────────────────────────────────────────────────────────

function renderSquad() {
  const container = document.getElementById('squad-list');
  const badge     = document.getElementById('squad-count-badge');

  badge.textContent = `${squad.length} / ${MAX_SQUAD_SIZE}`;
  container.innerHTML = '';

  if (squad.length === 0) {
    container.innerHTML = '<p class="empty-hint">点击干员卡片的「加入」按钮</p>';
    renderTraits();
    return;
  }

  squad.forEach(op => {
    const chip = document.createElement('div');
    chip.className = 'squad-chip';
    chip.innerHTML = `
      <span class="op-cost cost-${op.cost}" style="font-size:0.68rem;padding:1px 5px;">${op.cost}</span>
      <span class="squad-chip-name">${escHtml(op.name)}</span>
      <button class="squad-remove-btn" data-id="${escAttr(op.id)}" title="移除">✕</button>
    `;
    container.appendChild(chip);
  });

  container.querySelectorAll('.squad-remove-btn').forEach(btn => {
    btn.addEventListener('click', () => toggleSquad(btn.dataset.id));
  });

  renderTraits();
}

// ─── 羁绊统计渲染 ────────────────────────────────────────────────────────────

/** 返回当前激活的最高档位（0 = 未激活） */
function getActiveTier(count, thresholds) {
  let tier = 0;
  thresholds.forEach((t, i) => { if (count >= t) tier = i + 1; });
  return tier;
}

/**
 * 处理特殊羁绊的档位计算：
 *   solo    — 独行：恰好 1 人激活，2+ 人时失效（返回 -1 表示失效警告）
 *   harmony — 调和：effectiveCount 已由调用方加过 bonus，正常计算即可
 */
function getActiveTierSpecial(cfg, effectiveCount, rawCount) {
  if (cfg.special === 'solo') {
    return rawCount === 1 ? 1 : rawCount >= 2 ? -1 : 0;
  }
  return getActiveTier(effectiveCount, cfg.thresholds);
}

/** 构建分段圆点进度 HTML */
function buildPipsHTML(count, thresholds) {
  let html = '';
  let prev = 0;
  thresholds.forEach((threshold, ti) => {
    for (let i = prev + 1; i <= threshold; i++) {
      const filled = i <= count;
      html += `<span class="pip tier-${ti + 1}${filled ? ' filled' : ''}"></span>`;
    }
    if (ti < thresholds.length - 1) {
      html += '<span class="pip-sep"></span>';
    }
    prev = threshold;
  });
  return html;
}

function renderTraits() {
  const container = document.getElementById('trait-list');

  if (squad.length === 0) {
    container.innerHTML = '<p class="empty-hint">小队为空</p>';
    return;
  }

  // 分别统计主羁绊和子羁绊
  const mainCount = {};
  const subCount  = {};
  squad.forEach(op => {
    op.mainTrait.forEach(t => { mainCount[t] = (mainCount[t] || 0) + 1; });
    op.subTraits.forEach(t => { subCount[t]  = (subCount[t]  || 0) + 1; });
  });

  // 调和加成：每名携带【调和】子羁绊的干员，所有主羁绊计数 +1
  const harmonyBonus = subCount['调和'] || 0;

  container.innerHTML = '';

  const renderSection = (label, entries, isMain) => {
    if (entries.length === 0) return;

    const header = document.createElement('div');
    header.className = 'trait-section-label';
    header.textContent = label;
    container.appendChild(header);

    entries
      .sort(([nameA, cntA], [nameB, cntB]) => {
        const cfgA = traitConfig[nameA];
        const cfgB = traitConfig[nameB];
        const effA = isMain ? cntA + harmonyBonus : cntA;
        const effB = isMain ? cntB + harmonyBonus : cntB;
        const tierA = cfgA ? getActiveTierSpecial(cfgA, effA, cntA) : 0;
        const tierB = cfgB ? getActiveTierSpecial(cfgB, effB, cntB) : 0;
        if (tierB !== tierA) return tierB - tierA;
        return effB - effA;
      })
      .forEach(([trait, count]) => {
        const cfg          = traitConfig[trait];
        const effectiveCount = isMain ? count + harmonyBonus : count;
        const activeTier   = cfg ? getActiveTierSpecial(cfg, effectiveCount, count) : 0;
        // activeTier === -1 表示「独行」2+人失效
        const isFailed     = activeTier === -1;
        const tierClass    = isFailed
          ? 'tier-warn'
          : activeTier > 0 ? `tier-active tier-${activeTier}-active` : 'tier-inactive';

        const row = document.createElement('div');
        row.className = `trait-row ${tierClass}`;

        if (cfg) {
          const displayTier  = isFailed ? 0 : activeTier;
          const maxThresh    = cfg.thresholds[cfg.thresholds.length - 1];
          const displayCount = Math.min(effectiveCount, maxThresh);
          const pipsHTML     = buildPipsHTML(displayCount, cfg.thresholds);
          const threshLabel  = cfg.thresholds.join('/');

          let tierBadge;
          if (isFailed) {
            tierBadge = `<span class="tier-badge tier-badge-warn">已失效</span>`;
          } else if (activeTier > 0) {
            tierBadge = `<span class="tier-badge tier-badge-${activeTier}">Lv ${activeTier}</span>`;
          } else {
            tierBadge = `<span class="tier-badge tier-badge-0">未激活</span>`;
          }

          const effectTitle = isFailed
            ? escAttr('在场2名及以上时失效')
            : activeTier > 0
              ? escAttr(cfg.effects[activeTier - 1])
              : escAttr(`还需 ${cfg.thresholds[0] - effectiveCount} 人激活`);

          // 调和加成提示标签（仅主羁绊且有加成时显示）
          const harmonyLabel = (isMain && harmonyBonus > 0)
            ? `<span class="harmony-bonus" title="调和羁绊加成">+${harmonyBonus}</span>`
            : '';

          row.innerHTML = `
            <span class="trait-row-name">${escHtml(trait)}</span>
            <div class="trait-pips" title="阈值：${threshLabel}">${pipsHTML}</div>
            <span class="trait-thresh-label">${threshLabel}</span>
            ${tierBadge}
            <span class="trait-row-count" title="${effectTitle}">${count}${harmonyLabel}</span>
          `;
        } else {
          row.innerHTML = `
            <span class="trait-row-name">${escHtml(trait)}</span>
            <span class="trait-row-count">${count}</span>
          `;
        }

        container.appendChild(row);
      });
  };

  renderSection('主羁绊', Object.entries(mainCount), true);
  renderSection('子羁绊', Object.entries(subCount), false);
}

// ─── 工具函数（防 XSS）────────────────────────────────────────────────────────

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escAttr(str) {
  return String(str)
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── 入口 ────────────────────────────────────────────────────────────────────

init();
