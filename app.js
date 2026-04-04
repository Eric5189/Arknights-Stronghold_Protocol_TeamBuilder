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
let traitConfig = {};   // 从 traits.json 加载，key 为羁绊名称

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
        traitConfig[t.name] = { thresholds: t.thresholds, effects: t.effects };
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

  // 筛选事件
  document.getElementById('filter-cost').addEventListener('change', renderOperators);
  document.getElementById('filter-main-trait').addEventListener('change', renderOperators);
  document.getElementById('filter-sub-trait').addEventListener('change', renderOperators);

  // 重置筛选
  document.getElementById('btn-reset-filter').addEventListener('click', () => {
    document.getElementById('filter-cost').value = '';
    document.getElementById('filter-main-trait').value = '';
    document.getElementById('filter-sub-trait').value = '';
    renderOperators();
  });

  // 清空小队
  document.getElementById('btn-clear-squad').addEventListener('click', () => {
    squad = [];
    renderOperators();
    renderSquad();
  });
}

// ─── 筛选下拉选项填充 ────────────────────────────────────────────────────────

function populateFilterOptions() {
  const mainTraits = [...new Set(allOperators.map(op => op.mainTrait))].sort();
  const subTraits  = [...new Set(allOperators.flatMap(op => op.subTraits))].sort();

  const mainSelect = document.getElementById('filter-main-trait');
  mainTraits.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    mainSelect.appendChild(opt);
  });

  const subSelect = document.getElementById('filter-sub-trait');
  subTraits.forEach(t => {
    const opt = document.createElement('option');
    opt.value = t;
    opt.textContent = t;
    subSelect.appendChild(opt);
  });
}

// ─── 干员列表渲染 ────────────────────────────────────────────────────────────

function getFilteredOperators() {
  const costVal  = document.getElementById('filter-cost').value;
  const mainVal  = document.getElementById('filter-main-trait').value;
  const subVal   = document.getElementById('filter-sub-trait').value;

  return allOperators.filter(op => {
    if (costVal && op.cost !== Number(costVal)) return false;
    if (mainVal && op.mainTrait !== mainVal)    return false;
    if (subVal  && !op.subTraits.includes(subVal)) return false;
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
        <span class="op-cost cost-${op.cost}">${op.cost}费</span>
      </div>
      <div class="op-traits">
        <span class="trait main-trait">${escHtml(op.mainTrait)}</span>
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

  // 累计每种羁绊出现次数（主羁绊 + 子羁绊全部统计）
  const traitCount = {};
  squad.forEach(op => {
    traitCount[op.mainTrait] = (traitCount[op.mainTrait] || 0) + 1;
    op.subTraits.forEach(t => {
      traitCount[t] = (traitCount[t] || 0) + 1;
    });
  });

  container.innerHTML = '';

  Object.entries(traitCount)
    .sort(([nameA, cntA], [nameB, cntB]) => {
      // 先按激活档位降序，再按计数降序
      const cfgA = traitConfig[nameA];
      const cfgB = traitConfig[nameB];
      const tierA = cfgA ? getActiveTier(cntA, cfgA.thresholds) : 0;
      const tierB = cfgB ? getActiveTier(cntB, cfgB.thresholds) : 0;
      if (tierB !== tierA) return tierB - tierA;
      return cntB - cntA;
    })
    .forEach(([trait, count]) => {
      const cfg        = traitConfig[trait];
      const activeTier = cfg ? getActiveTier(count, cfg.thresholds) : 0;
      const tierClass  = activeTier > 0 ? `tier-active tier-${activeTier}-active` : 'tier-inactive';

      const row = document.createElement('div');
      row.className = `trait-row ${tierClass}`;

      if (cfg) {
        const maxThresh = cfg.thresholds[cfg.thresholds.length - 1];
        const displayCount = Math.min(count, maxThresh);
        const pipsHTML = buildPipsHTML(displayCount, cfg.thresholds);
        const threshLabel = cfg.thresholds.join('/');
        const tierBadge = activeTier > 0
          ? `<span class="tier-badge tier-badge-${activeTier}">Lv ${activeTier}</span>`
          : `<span class="tier-badge tier-badge-0">未激活</span>`;
        // 当前激活档效果提示
        const effectTitle = activeTier > 0
          ? escAttr(cfg.effects[activeTier - 1])
          : escAttr(`还需 ${cfg.thresholds[0] - count} 人激活`);

        row.innerHTML = `
          <span class="trait-row-name">${escHtml(trait)}</span>
          <div class="trait-pips" title="阈值：${threshLabel}">${pipsHTML}</div>
          <span class="trait-thresh-label">${threshLabel}</span>
          ${tierBadge}
          <span class="trait-row-count" title="${effectTitle}">${count}</span>
        `;
      } else {
        // 无阈值配置时降级显示
        row.innerHTML = `
          <span class="trait-row-name">${escHtml(trait)}</span>
          <span class="trait-row-count">${count}</span>
        `;
      }

      container.appendChild(row);
    });
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
