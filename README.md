# 卫戍协议小队规划工具

一个基于浏览器的《明日方舟》**卫戍协议**小队规划器，用于筛选干员、搭配盟约，并预览小队的盟约激活人数与效果。支持静态部署，可在电脑和手机浏览器中使用。

> 本项目约 90% 由 AI 辅助生成，为非官方玩家工具。

[在线使用](https://eric5189.github.io/Arknights-Stronghold_Protocol_TeamBuilder/)

## 本次版本适配

已适配「卫戍协议·规程·序列Ⅰ」，对应上游数据版本 **`act3autochess / V3_1`**。

- 更新为 **141 名预设干员、10 个核心盟约（主羁绊）、15 个附加盟约（子／副羁绊）**，包含乌萨斯、伊比利亚、莱塔尼亚等本赛季盟约。
- 更新干员等阶、盟约归属、普通／精锐特质，以及盟约激活档位和效果。
- 本局禁用上限调整为 **5 个主羁绊 + 5 个副羁绊**。
- 新旧赛季的禁用缓存已隔离，更新后的干员编号不会沿用旧赛季禁用记录。
- 替换前的数据已归档至 `data/legacy/`，保留历史备份。

小队默认上限为 **8 人**，勾选「人事部档案」后可解锁第 9 格。支持费用／羁绊／特质 Tag 筛选、手动禁用、盟约统计，以及悬停查看普通效果与精锐差异。

## OCR 截图识别本局禁用

在原有禁用面板中增加了可展开的截图识别模块，无需安装额外客户端。

### 使用步骤

1. 进入「🚫 禁用模式」，展开「截图识别禁用羁绊」。
2. 点击「选择截图」、拖入图片，或在禁用模式下按 **Ctrl + V** 粘贴截图。
3. 等待识别完成，核对下方选中的主、副羁绊；可点击标签手动修正。
4. 确认每类均为 5 个后，点击「应用本局禁用」。
5. 点击「✓ 完成」返回组队模式。

请使用包含**完整核心盟约和附加盟约列表**的清晰截图。首次使用需加载识别引擎和中文模型，后续可复用浏览器缓存。

### 识别规则

识别以盟约名称为依据，不处理「所属干员阵容不完整」图标。先定位文字行并增强对比度，再根据本赛季名单校正识别结果。

游戏中的排列规律为：**未禁用盟约在前，已禁用盟约在后；两组内部各自保持原始顺序**。工具使用 `traits.json` 中的顺序校验，分别取核心、附加盟约末尾的 5 个名称作为禁用项。

**「绝技」永远不会被禁用**，识别时会忽略它，不计入可禁用副羁绊名单。

### 核对与应用

- 识别后先显示核对结果，**点击应用前不会改变当前禁用设置**。
- 名称校正会显示提示，低置信度结果会单独标注；可展开「查看识别文字」核对原文。
- 出现名称缺失、重复或组内顺序异常时，不生成该组的自动选择，可重新截图或手动补选。
- 应用时替换主、副羁绊禁用选择，**保留手动禁用的干员**，并重新计算自动禁用名单。
- 可随时取消识别；识别失败后仍可使用原有的手动禁用功能。

已使用提供的真实截图及其缩放、变暗版本验证。其他分辨率、截图布局或模糊图片仍可能需要人工修正。

### 本地识别与静态部署

OCR 使用 **Tesseract.js + WebAssembly + 简体中文模型**，在浏览器的 Web Worker 中处理图片：

- **截图不上传服务器**，无需 API Key 或后端服务。
- 引擎和模型由站点自身提供，仅在开始识别时加载。
- GitHub Pages 或本地 HTTP 服务器均可使用。
- 部署时须包含整个 **`vendor/ocr/`** 目录；依赖版本、来源及许可证见 [OCR 资源说明](vendor/ocr/README.md)。

## 手动禁用与组队

禁用模式中，可直接点击干员卡片手动禁用，也可按顺序选择本局的主、副禁用羁绊。

自动禁用的条件是：**一名干员的所有盟约词条都被禁用选择覆盖**。例如，本赛季荒芜拉普兰德只有「叙拉古」词条，选择禁用「叙拉古」后会被自动禁用；带有多个盟约的干员需要全部词条被覆盖才会被自动禁用。

被禁用的干员无法加入小队，已在小队中的相关干员会同步移除。设置保存在浏览器本地，刷新后仍然生效。

## 本地运行

不能直接双击 `index.html`，需通过 HTTP 服务器加载数据及 OCR 资源。

在仓库目录打开终端并运行：

```powershell
python -m http.server 8080
```

浏览器访问 [http://localhost:8080](http://localhost:8080)。修改文件后刷新页面；如仍显示旧内容，按 **Ctrl + F5** 强制刷新。终端按 **Ctrl + C** 停止服务。也可使用 VS Code Live Server。

## 从 PRTS 更新赛季数据

导入脚本需要 **Python 3.10+**，无需安装第三方 Python 包。有系统 curl 时优先使用它下载，否则使用 Python 标准库。

```powershell
# 查看上游提供的赛季和版本
python scripts/import_upstream.py --list

# 生成本赛季数据，不替换正式文件
python scripts/import_upstream.py --season act3autochess --version V3_1

# 核对结果后，归档旧数据并替换正式文件
python scripts/import_upstream.py --season act3autochess --version V3_1 --install
```

生成结果位于 `data/generated/`：

| 文件 | 内容 |
|---|---|
| `operators.json` | 干员名称、等阶、盟约归属、普通／精锐特质及来源信息 |
| `traits.json` | 主／副羁绊名称、人数档位、各档效果和特殊规则 |
| `import-report.json` | 数据来源、赛季版本、生成时间、SHA-256 校验值及排除记录 |

`--install` 会先把原有的两个正式 JSON 复制到 `data/legacy/before-<赛季>-<版本>-<UTC时间>/`，再替换 `data/operators.json` 和 `data/traits.json`。已有历史备份会保留。

脚本排除隐藏棋子、DIY 自选棋子和不可选择的内部盟约，保留预设干员的普通／精锐信息。人数档位与层数条件分别处理，不将「达到 N 层」误作人数档位。关联数据缺失或档位异常时停止导入。

如需离线生成，将 `activity_table.json`、`character_table.json` 放在同一目录，并添加 `--source-dir <目录>`。可使用 `--output-dir <目录>` 修改生成目录。

> 重新导入会覆盖目标文件中的人工修改。手动维护的标签等信息请另行备份。切换到后续赛季时，也需同步调整页面中的禁用缓存前缀及赛季规则。

数据来自 [PRTS 游戏数据接口](https://torappu.prts.wiki/gamedata/latest/excel/activity_table.json)，数据解析参考 [SPDatabase](https://github.com/Yanstory/SPDatabase) 和 [ASP Assistant 的数据提取脚本](https://github.com/Moonfair/ASP_Assistant/blob/main/data/fetch_spdatabase.py)。

## 项目结构

```text
├── index.html                 # 页面结构
├── style.css                  # 页面样式
├── app.js                     # 筛选、组队、禁用及盟约统计
├── ban-ocr.js                 # 图片输入、OCR 流程及结果核对界面
├── ocr-core.js                # 名称匹配、顺序及完整性校验
├── data/
│   ├── operators.json         # 当前赛季干员数据
│   ├── traits.json            # 当前赛季盟约配置，数组顺序用于页面和 OCR
│   ├── generated/             # 导入脚本生成结果及报告
│   └── legacy/                # 历史数据备份
├── scripts/
│   ├── import_upstream.py     # 上游数据导入脚本
│   ├── test_import_upstream.py
│   ├── test_ui.js
│   └── test_ocr.js
└── vendor/ocr/                 # 本地 OCR 引擎、中文模型及许可证
```

前端使用原生 HTML、CSS、JavaScript，无需构建即可静态部署。数据导入和测试在开发时运行，不是网站运行的前置要求。

## 开发验证

```powershell
# 数据转换与归档规则
python -m unittest discover -s scripts -p "test_*.py"

# 羁绊顺序及普通／精锐效果差异
node scripts/test_ui.js

# OCR 名称校正、禁用组合及异常输入校验
node scripts/test_ocr.js
```
