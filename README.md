# 卫戍协议小队规划工具

注意 本项目90%由AI帮助生成


一个基于浏览器的《明日方舟》**卫戍协议**小队组建辅助工具，帮助玩家快速筛选干员、搭配羁绊，实时预览羁绊激活等级与效果。

---

## 功能概述

| 功能 | 说明 |
|---|---|
| 干员列表 | 展示所有可用干员，包含费用（阶）、主羁绊、子羁绊 |
| 多维度筛选 | 按**费用**、**主羁绊**、**子羁绊**、**特质 Tag**组合筛选干员，列表按费用升序显示 |
| 特质 Tag | 展示普通／精锐特质的分类和触发时机，可多选筛选 |
| 本局禁用提示 | 筛选区的主／子羁绊标出“已禁用”，仍可点击查看相关干员 |
| 羁绊顺序 | 筛选和禁用区均按 `traits.json` 中的主／子羁绊顺序展示 |
| 干员效果预览 | 悬停或聚焦干员列表／小队卡片显示普通效果，黄色括号显示精锐差异；Esc 可关闭 |
| 隐藏已禁用 | 勾选后在干员列表中隐藏所有被禁用的干员 |
| 小队管理 | 点击干员卡片即可加入/移除小队，最多 **9** 名干员 |
| 小队排序 | 一键按费用从低到高排序小队 |
| 羁绊统计 | 实时统计主/子羁绊人数，显示激活档位（Lv1/2/3）及效果 |
| 调和加成 | 携带【调和】子羁绊的干员数量会为所有主羁绊计数加成 |
| 独行特判 | 【独行】羁绊仅 1 人时激活，2 人及以上时显示"已失效"警告 |
| **禁用模式** | 手动点选禁用单个干员，或选择本局 ban 的羁绊词条自动推算被禁干员 |

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

### 禁用模式

点击顶栏「🚫 禁用模式」进入。提供两种禁用方式，可同时使用：

**手动点选**：直接点击干员卡片将其标记为禁用（🚫），再次点击取消。

**羁绊自动推算**：每局游戏开始时系统会 ban 掉若干羁绊词条（本赛季为主羁绊 5 个、副羁绊 5 个）。在右侧「羁绊禁用」面板中选择本局被 ban 的词条后，工具会自动计算：**所有羁绊词条全部被覆盖的干员**将被自动禁用（🔒），并在下方列表中汇总展示。

> 例：禁用「叙拉古」后，荒芜拉普兰德、拉普兰德、普罗旺斯因仅有「叙拉古」这一词条而被自动 ban；若同时禁用「突袭」，缄默德克萨斯（词条：叙拉古 + 突袭）也将被 ban。

被禁用的干员无法加入小队，已在小队中的干员会被同步移除。设置持久保存，刷新页面后仍然生效。完成配置后点击「✓ 完成」一键返回组队模式。

---

### 筛选逻辑

- `activeFilters` 对象维护四个 `Set`：`cost`、`mainTrait`、`subTrait`、`tag`
- 点击标签执行 `toggleFilterTag()`，切换 Set 中的值并重新渲染
- 各维度之间为**与（AND）**；费用多选为**或（OR）**，主羁绊、子羁绊和特质 Tag 多选为**与（AND）**
- Tag 取普通／精锐特质分类及触发时机的并集，同一干员的重复 Tag 只显示一次
- 筛选结果及未筛选列表均按费用升序，同费用保留数据中的相对顺序
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
│  筛选栏（费用 / 主羁绊 / 子羁绊）│  【组队模式】              │
│─────────────────────────────│  当前小队（最多9人）        │
│  干员数量栏 + 隐藏已禁用开关   │  · 干员 chip + 移除按钮    │
│─────────────────────────────│  · 费用排序 / 清空按钮     │
│  干员列表（可滚动）            │─────────────────────────│
│  · 干员卡片（点击加入/移除）    │  羁绊统计                │
│  · 显示主/子羁绊标签           │  · 主羁绊 / 子羁绊分区    │
│  · 已加入小队的卡片高亮        │  · 圆点进度条 + 激活档位   │
│  · 被禁用的卡片变暗（🚫/🔒）   │  · 调和加成 / 独行失效提示  │
│                             │─────────────────────────│
│                             │  【禁用模式】（替换右侧面板）│
│                             │  · 羁绊词条选择（主5 副5）  │
│                             │  · 自动禁用干员汇总列表     │
│                             │  · 清空选择 / ✓完成 按钮   │
└─────────────────────────────┴─────────────────────────┘
```

---

## 技术栈

- **纯原生前端**：HTML5 / CSS3 / Vanilla JavaScript（ES2017+）
- 无任何外部框架依赖
- 使用 `async/await` + `Promise.all` 并行加载数据
- 所有输出均通过 `escHtml()` / `escAttr()` 转义，防止 XSS

## 从 PRTS 导入新赛季数据

需要 Python 3.10+，不需要安装第三方包。有系统 curl 时优先使用它下载，否则使用 Python 标准库。在仓库目录运行：

```powershell
# 查看上游当前提供的赛季和版本
python scripts/import_upstream.py --list

# 生成默认赛季 act3autochess / V3_1 的数据（不会替换正式数据）
python scripts/import_upstream.py

# 显式指定赛季和版本
python scripts/import_upstream.py --season act3autochess --version V3_1
```

结果位于 `data/generated/`：

- `operators.json`：兼容现有页面的基础字段，另有 `effects.normal/elite`（游戏内完整特质文案）、`abilities.normal/elite`（各特质的触发时机、分类、效果类型及来源 ID）和 `source`（上游干员、棋子 ID）。导出 ID 自动编号。
- `traits.json`：按主／子羁绊分类的名称、人数档位、各档效果，以及独行／调和的特殊规则。
- `import-report.json`：来源 URL、原始文件 SHA-256、赛季版本、生成时间、数量和排除记录。

当前页面使用特质分类和触发时机生成 Tag 并提供筛选；“经济”等自定义标签不由脚本猜测。

检查结果后，可归档旧版并替换正式数据：

```powershell
python scripts/import_upstream.py --season act3autochess --version V3_1 --install
```

该命令会重新获取并生成数据，将替换前的两个正式 JSON 复制到 `data/legacy/before-<赛季>-<版本>-<UTC时间>/`，再替换 `data/operators.json` 和 `data/traits.json`。已有 legacy 文件会保留。跨赛季编号可能变化，部署时应清理或迁移旧版浏览器禁用记录。

离线导入：将 `activity_table.json` 和 `character_table.json` 放进同一目录，使用 `--source-dir <目录>`。可通过 `--output-dir <目录>` 指定生成目录，但不能直接指定为正式 `data/`。

数据读取自 `https://torappu.prts.wiki/gamedata/latest/excel/`，参考 [SPDatabase](https://github.com/Yanstory/SPDatabase) 和 [ASP Assistant 的数据脚本](https://github.com/Moonfair/ASP_Assistant/blob/main/data/fetch_spdatabase.py)。同时支持新结构 `activity.AUTOCHESS.<赛季>.<版本>` 和旧结构 `activity.AUTOCHESS_SEASON.<赛季>`。

导入规则：

- 排除隐藏棋子和 DIY 自选棋子，保留普通棋子及对应精锐特质；不生成自由自选干员名单。
- 人数档位从激活人数和文案中的“在场 N 名”条件提取；“达到 N 层”等层数条件留在效果原文中。
- 排除上游标记 `noSelect` 的内部盟约（本版本为“绝技”）。
- 只去掉文字颜色等富文本标记，保留 `<获得时>` 等语义标记。
- 部分内部特质记录没有独立文案，其 `text` 为 `null`，仍保留类型和来源；完整展示文案以干员的 `effects` 字段为准。
- 合并相同内容、相同类型的重复特质展示记录，保留全部来源 ID；不据此推算游戏内数值叠加。
- 上游缺失关联数据、人数档位异常或重复干员／等阶时停止导入，避免生成不完整正式数据。

转换规则测试：

```powershell
python -m unittest discover -s scripts -p "test_*.py"
```
