# CFSM Glassmorphism

一套基于 [komari-theme-Glassmorphism](https://github.com/sanrokamlan-prog/komari-theme-Glassmorphism) 视觉风格，为 **CF-Server-Monitor** 定制的「玻璃拟态」监控面板主题。

- **前端**：Vue 3 + Vite + Tailwind CSS v4 + ECharts
- **后端**：接入 CF-Server-Monitor 的公开 REST + WebSocket API（见 `CF-Server-Monitor/theme-develop.md`）
- **只实现 CF-Server-Monitor 已有能力**，未接入其不支持的功能（球状/地图、拓扑、性价比、健康摘要、快照导出、审计日志、访客信息、内嵌后台等均未包含）。

## 功能范围

| 模块 | 说明 |
| :--- | :--- |
| 首页驾驶舱 | 总览指标卡（内存用量/硬盘用量/剩余价值/累计流量/实时上行/实时下行，聚合值）+ 分组标签 + 快捷筛选（收藏/总流量/上/下行/峰值/离线/高负载/即将到期）+ 搜索 + 卡片/列表双视图 + 节点卡片 |
| 节点卡片 | 在线状态、CPU/内存/硬盘/流量进度、负载、实时上下行、月流量、到期剩余天数、三网延迟/丢包迷你柱（CT/CU/CM/BGP）、价格、标签 |
| 详情页 | 8 个指标卡（节点价格/月均支出/剩余时间/剩余价值/累计流量/流量配额/运行时间/连接数）、硬件/系统/存储/网络信息、历史图表 |
| 历史图表 | 依据 `/api/history/all`：CPU、内存与 Swap、磁盘、磁盘 IO、实时网络、连接数、进程、GPU |
| 实时推送 | `/api/ws` 三网延迟窗口（`server.ping` / `server.loss`）与实时指标合并；页面隐藏自动断连、恢复可见自动重连 |
| 外观 | 深浅色（跟随系统 / 手动）、毛玻璃配色预设、自定义背景图、动画减弱 |

未登录的私有站点，主题会提示跳转到 `/admin#admin` 登录（主题不实现登录页）。

## 开发

环境要求：Node.js `^20.19.0` 或 `>=22.12.0`。

```bash
npm install
npm run dev        # vite 开发服务器（可通过 VITE_API_TARGET 指定后端，默认代理到同源 /api）
npm run type-check # vue-tsc 类型检查
npm run build      # 类型检查 + 生产构建
npm run build-only # 仅构建
```

构建产物在 `dist/`，即为 CF-Server-Monitor 主题所需：`index.html` + `assets/`。

## 后端配置

主题通过同源 `/api` 访问后端；跨域部署时在 HTML 中写入：

```html
<meta name="apiBase" content="https://<your-worker-domain>">
```

并在对应 Cloudflare Workers 环境变量中添加 `CORS_ALLOWED_ORIGINS`。

## 主题设置（配置模型，对齐 CFSM-Theme-LuminaPlus）

配置是**分层叠加**的：

```text
默认值  ←  后端 theme_options（站点预设，站长配置）  ←  本机覆盖（访客自己的调整）
```

- 原生变量（默认深浅色按系统、视角深浅色按钮）等优先级最低；`/api/config` 下发的 `theme_options` 是
  全站预设；**右侧标题栏的「主题设置」**按钮里调整的结果只存当前设备浏览器 `localStorage`，
  不影响他人。
- **登录站长**：主题设置里多一个「保存到后端」——把当前配置发布到后端
  （`POST /api/theme_options`），所有访客都会用这套。后台对外观设置约有 2 分钟缓存，
  刚保存完换浏览器可能还是旧值。
- **「改用后端配置」**：丢掉本机存过的设置，改用后端当前下发的配置。
- **「复制配置 JSON」**：未登录 / 纯静态部署时，把导出的 JSON 粘到后台「外观设置 → 主题自定义配置」
  保存，效果一致（键名与主题设置一致）。
- 后台下发了什么配置，可在控制台跑
  `fetch('/api/config').then(r=>r.json()).then(c=>console.log(c.theme_options))` 确认。

`theme_options` 支持的键（仅主题外观参数）：

| 键 | 类型 | 默认 | 说明 |
| :--- | :--- | :--- | :--- |
| `defaultViewMode` | `card`/`list` | `card` | 默认节点视图 |
| `nodeCardSize` | `mini`/`compact`/`comfortable`/`large` | `compact` | 卡片密度 |
| `cardBlur` | number | `14` | 卡片背景模糊度（px，0–40） |
| `cardOpacity` | number | `0.74` | 卡片不透明度（0.15–1） |
| `hideGeneralCard` | boolean | `false` | 隐藏总览指标卡 |
| `offlineNodesLast` | boolean | `false` | 离线节点置底 |
| `homeQuickControlsEnabled` | boolean | `true` | 快捷筛选栏 |
| `disablePageAnimation` | boolean | `false` | 减弱过渡动画 |

> 站点标题、背景图（`custom_bg` / `custom_bg_mobile`）、自定义 head / 脚本由 CF 后台「外观设置」
> 统一下发（注入页面 `<body>` 背景），主题不接管；主题设置只保存外观参数。

## 实时与请求频率

借鉴 CFSM-Theme-LuminaPlus 的取值策略，尽量少打扰后端、省 D1 读取：

- **实时主通道**：`GET /api/ws?subscribe=all`，通过频道内 `subscribe` 消息订阅全部节点。
- **轮询兜底**：WebSocket 掉线时自动退回 **5 秒**轮询 `/api/servers`；恢复正常后改回
  **60 秒**全量对齐（仅用于捕获节点增删与元数据变更）。
- **首页延迟柱**：只从 `/api/servers` 的 `servers[].ping` / `servers[].loss`（三网窗口）与
  实时 `ping_*` / `loss_*` 取值，**不逐节点自动查询历史接口**（避免 D1 读取膨胀约 60 倍）。
- **历史数据**：仅当打开单台实例详情页时才请求一次 `/api/history/all`，切换时间档位时重新请求。
  未登录访客只提供 ≤24 小时档位（后端会拒绝 >24h 的历史查询）；登录后可选到 7 天。
- **页面隐藏**：`document.visibilitychange` 自动关闭 WebSocket，恢复可见时重新连接并补一次 REST。

## 构建产物约定

`dist/` 只包含 `index.html` 与 `assets/`（以及一个自带 `favicon.ico`）。旗帜使用默认皮肤静态文件 `/flags/<code>.svg`，OS 图标使用 `/os-icons/<filename>`，不在主题内打包。

站点标题、背景图、自定义 `<head>` 与自定义脚本由 CF-Server-Monitor 后端外观设置注入，主题不写死。