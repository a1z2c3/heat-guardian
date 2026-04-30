# 热龄卫士

《热龄卫士：基于多源时空数据的城市适老化热健康风险预警与避险服务调度平台》项目代码仓库。

当前版本已经完成真实数据接入、空间分析、选址优化、后端接口和前端展示，可直接作为比赛提交版工程底座。
项目运行时会先执行数据流水线，再启动网站；前端展示的是本地处理后的真实数据结果，不是浏览器端临时拼接的演示数据。

## 当前已完成

- 武汉主城区研究范围配置
- `Open-Meteo` 天气数据抓取
- 武汉官方纳凉点 / 官方纳凉通报监测
- `OpenStreetMap / Overpass` 避险资源 POI 抓取
- `WorldPop` 中国 1km 老年人口栅格最新发布版自动识别与接入
- 基于 `Geofabrik` 路网数据的真实步行可达性分析
- 风险网格生成
- “覆盖优先 + 容量/开放时段/室内降温/片区短板优先”的选址优化与 `3 / 5 / 8` 点情景实验
- `FastAPI` 后端接口
- 可直接访问的前端仪表盘
- `Leaflet` 空间地图联动、GeoJSON 风险网格与推荐点位图层
- 权重敏感性、策略对比、公平性与 24 小时风险节律实验

## 当前数据层说明

### 1. 天气数据

- 来源：`Open-Meteo`
- 当前为真实接口抓取

### 2. POI 数据

- 来源：`OpenStreetMap / Overpass API`
- 当前为真实接口抓取

### 2.1 官方纳凉点与运行通报

- 来源：`武汉市政府门户网站 / 武汉市民政局 / 武汉市国防动员办公室`
- 当前为脚本自动刷新已纳入监测的官方公开页面
- 注意：
  - 全市级纳凉点总量来自官方通报
  - 可进入空间分析与可达性计算的，只纳入已完成位置校准的官方在运点位
  - 该模块不会把“新闻里提到过但无法定位”的内容直接混入路网计算

### 3. 老年人口数据

当前脚本支持三种导入方式，按优先级依次尝试：

1. `data/external/worldpop/*.csv`
2. `data/external/worldpop/*.geojson`
3. `data/external/worldpop/*65*.tif` 与可选 `*80*.tif`

如果以上文件都不存在，则自动退回到热点估计版人口网格，保证系统仍可运行。

### 4. 路网可达性

- 首选：真实步行路网
- 回退：若 Overpass 路网接口不可用，则自动使用距离代理法

当前环境已通过 `Geofabrik` 湖北路网数据构建真实步行网络，状态见 `data/raw/walk_network_status.json`，当前数据级别为 `walk_network`。

## 当前网站展示的到底是什么

网站里同时展示三类信息：

1. 上游真实数据：
   - 天气预报与历史气象
   - OSM / Geofabrik / WorldPop
   - 武汉官方纳凉点与官方通报
2. 基于真实数据计算的模型结果：
   - 风险分数
   - 步行可达性
   - 选址优化推荐
3. 明确拆分的资源口径：
   - `全部支撑资源`：城市整体支撑能力总览
   - `既有主动避暑资源`：优化基线
   - `官方公开在运纳凉点`：官方已开放且已校准位置的运行点位

因此，项目不会再用“人为抬高温度”或“随手补几个点位”的方式凑结果。

## 当前版本新增重点

- 风险网格细化到 `48 x 64 / 3072` 个栅格，空间联动与实验统计均基于同一套真实处理结果
- POI 扩展纳入 `购物中心` 与 `地铁站`，并修正地铁站筛选逻辑，避免把普通铁路站误计入避暑支撑资源
- 推荐点位输出增加容量代理、开放时段、片区优先级、适配度与入选原因，便于前端解释“为什么选这里”
- `competition_experiments` 新增真实权重敏感性、Kendall `τ` 排序稳定性、随机/贪心/MCLP 策略对比、公平性指标与 24 小时风险节律
- 前端空间板块升级为 `Leaflet` 地图，支持风险网格、现有纳凉点、推荐新增点、15 分钟等时圈四类图层联动展示

## 目录结构

```text
config/      项目配置
data/        原始数据与处理结果
scripts/     数据抓取与处理脚本
backend/     FastAPI 后端
frontend/    前端静态页面
docs/        文档
outputs/     导出结果
```

## 本地启动

### 1. 一键启动

```powershell
.\启动项目.ps1
```

执行逻辑：

1. 安装依赖
2. 运行 `scripts\run_pipeline.py`
3. 自动更新外部数据与官方通报
4. 生成 `data/processed` 下的最新结果
5. 启动 FastAPI 与前端页面

### 2. 仅更新数据

```powershell
.\更新数据.ps1
```

### 3. 手动启动

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python scripts\run_pipeline.py
uvicorn backend.app.main:app --reload
```

启动后访问：

- `http://127.0.0.1:8000/`

首页会展示“证据链”面板，直接说明本轮启动已自动刷新哪些上游数据、最近检查时间是什么、以及官方通报原文从哪里来。

当前版本还会在页面中同步展示：

- `Leaflet` 风险地图与图层控制
- `3 / 5 / 8` 点方案切换后的点位明细与空间聚焦
- 权重敏感性、策略对比、公平性、昼夜风险节律等实验面板

详细进入与使用说明见：

- `docs/网站进入与使用说明.md`

## 当前接口

- `GET /api/health`
- `GET /api/dashboard`
- `GET /api/weather`
- `GET /api/poi`
- `GET /api/official-cooling`
- `GET /api/data-sources`
- `GET /api/accessibility/summary`
- `GET /api/risk/summary`
- `GET /api/risk/grid`
- `GET /api/risk/grid/geojson`
- `GET /api/recommendations`
- `GET /api/optimization/experiments`

## 报告与材料

运行完整流水线并导出材料后，可在以下位置查看最新结果：

- 研究报告：`docs/研究报告-热龄卫士.md`
- 图表：`outputs/report_charts/`
- 表格：`outputs/report_tables/`

当前报告已纳入权重敏感性、策略对比、公平性、24 小时风险节律与文献支撑章节。

## WorldPop 导入方式

如果你已经手动下载了人口数据，把文件放到：

- `data/external/worldpop/`

推荐字段：

### CSV

至少包含：

- `lat`
- `lon`
- `age_65_plus`

可选：

- `age_80_plus`

### GeoJSON

属性字段同上，几何可以是点或面。

### GeoTIFF

建议命名：

- `worldpop_age65_plus.tif`
- `worldpop_age80_plus.tif`

放进去后重新运行：

```powershell
.\更新数据.ps1
```

## 路网状态文件

路网状态会写入：

- `data/raw/walk_network_status.json`

当前状态为 `ready`，来源为 `geofabrik_roads_shp`。只有在所有路网来源都不可用时，系统才会自动退回距离代理法。

如果需要重建路网缓存，可删除 `data/raw/walk_network.pkl` 与 `data/raw/walk_network_status.json` 后重新执行 `.\更新数据.ps1`。

## 可继续增强

1. 将官方纳凉点扩展到更多区级公开页面，继续提高空间覆盖
2. 在选址模型中加入容量、开放时段和公平性约束
3. 补充更细粒度的树荫、楼龄、独居老人等数据
4. 继续补充答辩 PPT、演示视频和部署材料
