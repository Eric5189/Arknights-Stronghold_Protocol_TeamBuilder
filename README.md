# 卫戍协议小队规划工具

一个基于浏览器的《明日方舟》**卫戍协议**小队组建辅助工具，帮助玩家快速筛选干员、搭配羁绊，实时预览羁绊激活等级与效果。

---

## 功能概述

| 功能 | 说明 |
|---|---|
| 干员列表 | 展示所有可用干员，包含费用（阶）、主羁绊、子羁绊 |
| 多维度筛选 | 按**费用**、**主羁绊**、**子羁绊**标签组合筛选干员 |
| 小队管理 | 点击干员卡片即可加入/移除小队，最多 **9** 名干员 |
| 小队排序 | 一键按费用从低到高排序小队 |
| 羁绊统计 | 实时统计主/子羁绊人数，显示激活档位（Lv1/2/3）及效果 |
| 调和加成 | 携带【调和】子羁绊的干员数量会为所有主羁绊计数加成 |
| 独行特判 | 【独行】羁绊仅 1 人时激活，2 人及以上时显示"已失效"警告 |

---

## 项目结构

```
TB/
├── index.html          # 页面结构（左侧干员面板 + 右侧小队/羁绊面板）
├── style.css           # 深色主题 UI 样式（两列布局）
├── app.js              # 全部业务逻辑
└── data/
    ├── operators.json  # 干员数据（id / name / cost / mainTrait / subTraits）
    ├── traits.json     # 羁绊配置（thresholds / effects / special）
    └── legacy/         # 历史数据备份
        ├── operators.json
        └── traits.json
```

---

## 数据格式

### `data/operators.json`

每个干员对象包含以下字段：

```json
{
  "id": "7",
  "name": "德克萨斯",
  "cost": 1,
  "mainTrait": ["叙拉古"],
  "subTraits": ["独行"]
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `id` | string | 干员唯一标识 |
| `name` | string | 干员名称 |
| `cost` | number | 费用阶（1–6） |
| `mainTrait` | string[] | 主羁绊列表 |
| `subTraits` | string[] | 子羁绊列表 |

### `data/traits.json`

分为 `"主羁绊"` 和 `"子羁绊"` 两个数组，每条记录结构如下：

```json
{
  "name": "炎",
  "thresholds": [3, 6, 9],
  "effects": ["效果1描述", "效果2描述", "效果3描述"],
  "special": null
}
```

| 字段 | 类型 | 说明 |
|---|---|---|
| `name` | string | 羁绊名称 |
| `thresholds` | number[] | 各档激活所需人数 |
| `effects` | string[] | 各档效果描述（与 thresholds 一一对应） |
| `special` | string \| null | 特殊规则：`"solo"`（独行）/ `"harmony"`（调和）/ `null` |

---

## 核心逻辑说明（`app.js`）

### 初始化流程

```
init()
 ├── 并行 fetch operators.json + traits.json
 ├── 将 traits.json 展平为以 name 为 key 的查找表 traitConfig
 ├── populateFilterOptions()  — 生成筛选标签
 ├── renderOperators()        — 渲染干员列表
 └── renderSquad()            — 渲染小队（含羁绊统计）
```

### 筛选逻辑

- `activeFilters` 对象维护三个 `Set`：`cost`、`mainTrait`、`subTrait`
- 点击标签执行 `toggleFilterTag()`，切换 Set 中的值并重新渲染
- `getFilteredOperators()` 对三个维度做**与（AND）**过滤，各维度内部为**或（OR）**匹配
- 重置按钮清空所有 Set，恢复全量展示

### 小队管理

- `toggleSquad(id)` 实现「点击加入/点击移除」双向切换
- 小队上限 `MAX_SQUAD_SIZE = 9`，超出时弹出提示
- 干员卡片在已加入小队时添加 `.in-squad` 样式高亮

### 羁绊统计

1. 分别统计当前小队中所有干员的主/子羁绊出现次数
2. 计算**调和加成**：`harmonyBonus = subCount['调和'] || 0`，加到每个主羁绊的 `effectiveCount`
3. **独行（solo）特判**：`rawCount === 1` 时激活，`rawCount >= 2` 时返回 `-1`（失效）
4. `getActiveTier()` 按 `thresholds` 升序比较 count，返回最高激活档位
5. `buildPipsHTML()` 生成分段圆点进度条，颜色按档位区分
6. 统计结果按激活档位降序、有效人数降序排列展示

---

## 使用方式

> ⚠️ 因使用 `fetch` 加载 JSON 数据，**不能直接双击打开 `index.html`**，需通过本地 HTTP 服务器访问。

**推荐方式：VS Code Live Server 插件**

1. 安装 VS Code 插件 [Live Server](https://marketplace.visualstudio.com/items?itemName=ritwickdey.LiveServer)
2. 右键 `index.html` → **Open with Live Server**
3. 浏览器自动打开 `http://127.0.0.1:5500`

**其他方式：**

```powershell
# Python 3
python -m http.server 8080
# 访问 http://localhost:8080
```

---

## 界面说明

```
┌─────────────────────────────┬─────────────────────────┐
│  筛选栏（费用 / 主羁绊 / 子羁绊）│  当前小队（最多9人）       │
│─────────────────────────────│  · 干员 chip + 移除按钮    │
│  干员列表（可滚动）            │  · 费用排序 / 清空按钮     │
│  · 干员卡片（点击加入/移除）    │─────────────────────────│
│  · 显示主/子羁绊标签           │  羁绊统计                │
│  · 已加入小队的卡片高亮        │  · 主羁绊 / 子羁绊分区    │
│                             │  · 圆点进度条 + 激活档位   │
│                             │  · 调和加成 / 独行失效提示  │
└─────────────────────────────┴─────────────────────────┘
```

---

## 技术栈

- **纯原生前端**：HTML5 / CSS3 / Vanilla JavaScript（ES2017+）
- 无任何外部框架依赖
- 使用 `async/await` + `Promise.all` 并行加载数据
- 所有输出均通过 `escHtml()` / `escAttr()` 转义，防止 XSS
