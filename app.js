/**
 * 卫戍协议小队规划工具 — app.js
 *
 * 数据源：data/operators.json
 * 结构：
 *   allOperators  — 从 JSON 加载的全量干员数据
 *   squad         — 当前小队（干员对象数组）
 */

const SQUAD_SIZE_DEFAULT = 8;
const SQUAD_SIZE_MAX     = 9;

// 当前小队上限，默认 8，解锁道具后为 9
let squadMaxSize = SQUAD_SIZE_DEFAULT;

let allOperators = [];
let squad = [];
let traitConfig = {};   // 从 traits_real.json 加载，key 为羁绊名称

// 模式：'squad' | 'ban'
let currentMode = 'squad';

// 禁用干员集合（存 id），从 localStorage 恢复
const bannedIds = new Set(JSON.parse(localStorage.getItem('tb_banned') || '[]'));

function saveBanned() {
  localStorage.setItem('tb_banned', JSON.stringify([...bannedIds]));
}

// 切换模式
function setMode(mode) {
  currentMode = mode;
  document.getElementById('btn-mode-squad').classList.toggle('active', mode === 'squad');
  document.getElementById('btn-mode-ban').classList.toggle('active', mode === 'ban');
  document.body.classList.toggle('mode-ban', mode === 'ban');
  const banBadge  = document.getElementById('ban-count-badge');
  const clearBtn  = document.getElementById('btn-clear-ban');
  banBadge.classList.toggle('hidden', mode === 'squad');
  clearBtn.classList.toggle('hidden', mode === 'squad');
  updateBanBadge();
  renderOperators();
}

function updateBanBadge() {
  document.getElementById('ban-count-num').textContent = bannedIds.size;
}

// 筛选状态（Set 表示已选中的值，空 Set = 全部显示）
const activeFilters = {
  cost:      new Set(),
  mainTrait: new Set(),
  subTrait:  new Set(),
};

function getFilterSummaryHint(category, isOpen) {
  const count = activeFilters[category]?.size || 0;
  if (count > 0) return `已选 ${count}`;
  return isOpen ? '点击收起' : '点击展开';
}

function refreshFilterSectionStates() {
  document.querySelectorAll('details.filter-section').forEach(section => {
    const category = section.dataset.category;
    if (!category) return;
    const hint = section.querySelector('.filter-summary-hint');
    const count = activeFilters[category]?.size || 0;
    const isOpen = section.open;
    if (hint) {
      hint.textContent = getFilterSummaryHint(category, isOpen);
    }
    section.classList.toggle('has-active', count > 0);
  });
}

function toggleFilterTag(category, value, el) {
  if (activeFilters[category].has(value)) {
    activeFilters[category].delete(value);
    el.classList.remove('active');
  } else {
    activeFilters[category].add(value);
    el.classList.add('active');
  }
  renderOperators();
  refreshFilterSectionStates();
}

function resetFilters() {
  activeFilters.cost.clear();
  activeFilters.mainTrait.clear();
  activeFilters.subTrait.clear();
  document.querySelectorAll('.filter-tag.active').forEach(tag => {
    tag.classList.remove('active');
  });
  renderOperators();
  refreshFilterSectionStates();
}

function setupRightPanelResize() {
  const resizer = document.getElementById('panel-right-resizer');
  const panelRight = document.getElementById('panel-right');
  if (!resizer || !panelRight) return;

  let resizing = false;
  let startY = 0;
  let startHeight = 0;

  const clampHeight = height => Math.max(100, Math.min(height, window.innerHeight * 0.6));

  const beginResize = e => {
    if (e.pointerType === 'mouse' || e.pointerType === 'touch' || e.pointerType === 'pen') {
      resizing = true;
      startY = e.clientY;
      const squadPanel = document.getElementById('squad-panel');
      startHeight = squadPanel ? squadPanel.getBoundingClientRect().height : 180;
      resizer.setPointerCapture(e.pointerId);
      e.preventDefault();
    }
  };

  const onResize = e => {
    if (!resizing) return;
    const delta = e.clientY - startY;
    const newHeight = clampHeight(startHeight + delta);
    document.documentElement.style.setProperty('--squad-panel-height', `${newHeight}px`);
  };

  const stopResize = () => {
    if (!resizing) return;
    resizing = false;
  };

  resizer.addEventListener('pointerdown', beginResize);
  document.addEventListener('pointermove', onResize);
  document.addEventListener('pointerup', stopResize);
  document.addEventListener('pointercancel', stopResize);
}

function setupPanelResize() {
  // 右侧面板内部垂直拖拽
  setupRightPanelResize();

  // 动态高度分配
  const adjustPanelHeights = () => {
    if (window.innerWidth > 768) {
      // PC端：使用固定比例
      return;
    }

    // 手机端动态调整逻辑保持不变
    const viewportHeight = window.innerHeight;
    const headerHeight = document.querySelector('header')?.offsetHeight || 0;
    const filterBarHeight = document.querySelector('#filter-bar')?.offsetHeight || 0;
    const operatorCountHeight = document.querySelector('#operator-count-bar')?.offsetHeight || 0;

    // 计算左侧面板占用的高度
    const leftPanelUsedHeight = headerHeight + filterBarHeight + operatorCountHeight + 20; // 20px for margins
    const availableHeight = viewportHeight - leftPanelUsedHeight;

    // 确保最小可用高度
    const minAvailableHeight = 300; // 最小需要300px用于右侧面板
    const effectiveAvailableHeight = Math.max(minAvailableHeight, availableHeight);

    // 动态分配右侧面板高度
    const squadMinHeight = 100;
    const traitMinHeight = 120;
    const resizerHeight = 8;
    const totalMinHeight = squadMinHeight + traitMinHeight + resizerHeight;

    if (effectiveAvailableHeight >= totalMinHeight) {
      // 有足够空间，动态分配
      const squadHeight = Math.max(squadMinHeight, Math.floor(effectiveAvailableHeight * 0.4));
      const traitHeight = effectiveAvailableHeight - squadHeight - resizerHeight;

      if (traitHeight >= traitMinHeight) {
        document.documentElement.style.setProperty('--squad-panel-height', `${squadHeight}px`);
      } else {
        // 羁绊统计空间不足，压缩小队面板
        const adjustedSquadHeight = effectiveAvailableHeight - traitMinHeight - resizerHeight;
        document.documentElement.style.setProperty('--squad-panel-height', `${Math.max(squadMinHeight, adjustedSquadHeight)}px`);
      }
    } else {
      // 空间严重不足，设置最小值
      document.documentElement.style.setProperty('--squad-panel-height', `${squadMinHeight}px`);
    }
  };

  // 监听窗口大小变化
  window.addEventListener('resize', adjustPanelHeights);
  window.addEventListener('orientationchange', () => {
    setTimeout(adjustPanelHeights, 100); // 等待方向改变完成
  });

  // 初始调整
  adjustPanelHeights();
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
  refreshFilterSectionStates();
  renderOperators();
  renderSquad();

  // 解锁第9格
  document.getElementById('chk-unlock-9').addEventListener('change', (e) => {
    squadMaxSize = e.target.checked ? SQUAD_SIZE_MAX : SQUAD_SIZE_DEFAULT;
    // 若解锁被取消且当前小队已有9人，移除最后一人
    if (!e.target.checked && squad.length > squadMaxSize) {
      squad.splice(squadMaxSize);
    }
    renderSquad();
  });

  // 隐藏未激活羁绊开关
  document.getElementById('chk-hide-inactive').addEventListener('change', renderTraits);

  // 模式切换
  document.getElementById('btn-mode-squad').addEventListener('click', () => setMode('squad'));
  document.getElementById('btn-mode-ban').addEventListener('click',   () => setMode('ban'));

  // 清空禁用
  document.getElementById('btn-clear-ban').addEventListener('click', () => {
    bannedIds.clear();
    saveBanned();
    updateBanBadge();
    // 把被禁用干员从小队中也移除
    squad = squad.filter(op => !bannedIds.has(op.id));
    renderOperators();
    renderSquad();
  });

  // 重置筛选
  document.getElementById('btn-reset-filter').addEventListener('click', resetFilters);

  document.querySelectorAll('details.filter-section').forEach(section => {
    section.addEventListener('toggle', refreshFilterSectionStates);
  });

  setupPanelResize();

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
    if (mains.size > 0 && ![...mains].every(t => op.mainTrait.includes(t))) return false;
    if (subs.size  > 0 && ![...subs].every(t => op.subTraits.includes(t)))  return false;
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
    const isBanned = bannedIds.has(op.id);

    const card = document.createElement('div');
    if (currentMode === 'ban') {
      card.className = `operator-card${isBanned ? ' is-banned' : ''}`;
    } else {
      card.className = `operator-card${isBanned ? ' is-banned' : (inSquad ? ' in-squad' : '')}`;
    }

    const subTraitHTML = op.subTraits
      .map(t => `<span class="trait sub-trait">${escHtml(t)}</span>`)
      .join('');

    const banOverlay = isBanned
      ? `<span class="ban-overlay-icon">🚫</span>`
      : '';

    card.innerHTML = `
      <div class="op-header">
        <span class="op-name" title="${escAttr(op.name)}">${escHtml(op.name)}</span>
        <span class="op-cost cost-${op.cost}">${op.cost}阶</span>
      </div>
      <div class="op-traits">
        ${op.mainTrait.map(t => `<span class="trait main-trait">${escHtml(t)}</span>`).join('')}
        ${subTraitHTML}
      </div>
      ${banOverlay}
    `;

    card.dataset.id = op.id;
    if (currentMode === 'ban') {
      card.addEventListener('click', () => toggleBan(op.id));
    } else if (!isBanned) {
      card.addEventListener('click', () => toggleSquad(op.id));
    }
    container.appendChild(card);
  });
}

// ─── 禁用管理 ────────────────────────────────────────────────────────────────

function toggleBan(id) {
  if (bannedIds.has(id)) {
    bannedIds.delete(id);
  } else {
    bannedIds.add(id);
    // 如果该干员在小队中，同步移除
    const idx = squad.findIndex(op => op.id === id);
    if (idx >= 0) squad.splice(idx, 1);
  }
  saveBanned();
  updateBanBadge();
  renderOperators();
  renderSquad();
}

// ─── 小队管理 ────────────────────────────────────────────────────────────────

function toggleSquad(id) {
  const idx = squad.findIndex(op => op.id === id);

  if (idx >= 0) {
    squad.splice(idx, 1);
  } else {
    if (squad.length >= squadMaxSize) {
      alert(`小队最多 ${squadMaxSize} 名干员！`);
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

  badge.textContent = `${squad.length} / ${squadMaxSize}`;
  container.innerHTML = '';

  if (squad.length === 0) {
    container.innerHTML = '<p class="empty-hint">点击干员卡片来加入</p>';
    renderTraits();
    return;
  }

  squad.forEach(op => {
    const card = document.createElement('div');
    card.className = 'squad-card';
    const subTraitHTML = op.subTraits
      .map(t => `<span class="trait sub-trait">${escHtml(t)}</span>`)
      .join('');
    card.innerHTML = `
      <div class="squad-card-header">
        <span class="op-cost cost-${op.cost}">${op.cost}</span>
        <span class="squad-card-name" title="${escAttr(op.name)}">${escHtml(op.name)}</span>
        <button class="squad-remove-btn" data-id="${escAttr(op.id)}" title="移除">✕</button>
      </div>
      <div class="op-traits">
        ${op.mainTrait.map(t => `<span class="trait main-trait">${escHtml(t)}</span>`).join('')}
        ${subTraitHTML}
      </div>
    `;
    container.appendChild(card);
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
  const hideInactive = document.getElementById('chk-hide-inactive')?.checked ?? false;

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
        if (hideInactive && activeTier === 0) return;
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
              ? cfg.effects
                  .slice(0, activeTier)
                  .map((eff, i) => escAttr(`Lv${i + 1}（${cfg.thresholds[i]}人）: ${eff}`))
                  .join('&#10;')
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
