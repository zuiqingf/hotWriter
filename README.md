# HotWriter

> 个人使用的 PC Web 写作助手。输入主题，Agent 自动调研 → 多角度方向 → AI 写作 + 多轮对话。
> **2026-08 当前实际版本已远超 v0.1**：富文本编辑器、双栏写作台、AI 改写预览、一键合规校验（4 平台）、防幻觉 sourceUrl 透传、流式 SSE。

![version](https://img.shields.io/badge/version-0.1.0-blue)
![license](https://img.shields.io/badge/license-MIT-green)

## ✨ 完整功能列表

### 调研 + 写作
- 🔍 **关键词 Agent 调研**：自动调搜索工具（最多 8 轮），输出 3–5 个写作方向
  - **6 个搜索工具**：通用 Web（Tavily）/ 知乎 / 小红书 / 百度 / 今日头条 / 微信公众号
  - LLM 按场景自主路由（首发资讯→头条，权威源→百度，深度分析→微信，大众经验→知乎）
- ✍️ **AI 初稿生成**：基于选定的方向、提纲、素材生成 Markdown 初稿
- 💬 **多轮 AI 对话**：写作工坊左栏对话，对文章做修改、润色、扩写
- 📚 **作品库**：所有文章持久化到 MySQL（远端实例 `47.111.1.180:3306/db_hotwriter`）
- 📊 **统计 dashboard**（`/stats`）：KPI / 月度趋势 / 风格分布 / Token 用量 / 调研工具调用分布
- 🧠 **创作分析**（`/analysis`）：时段习惯 + 同赛道对比 + 4 维差距评分 + 可执行改稿建议
- 💰 **成本追踪**：每次 LLM 调用的费用都记录
- 🔄 **自动保存**：编辑过程防丢失，每 1.5 秒 debounce 保存

### 富文本编辑器
- 🎨 **Tiptap 富文本**：斜杠菜单、气泡工具栏、悬浮菜单
- 📷 **图片插入**：拖拽 / 粘贴 / 选文件（≤5 MB，自动按月份归档）
- 🔗 **链接 / 标题 / 列表 / 引用 / 代码块**：Markdown 快捷输入
- 📋 **多格式复制**：双 ClipboardItem（HTML + Markdown），公众号/小红书粘贴保留格式
- ⬇ **MD 下载**：HTML → turndown → `.md` 文件，保留所有格式

### AI 改写（10 个动作）
- ✨ 润色 / 📝 扩写 / ✂️ 缩写（高频，直接展示）
- 💼 更正式 / 💬 更口语 / 🎯 更有说服力 / 🌐 英译 / 💡 解释 / 📋 总结 / ✓ 校对（更多菜单）
- 👀 **预览模式**：先弹窗对比「原文 vs AI」再决定是否替换
- 🔄 **流式替换**：边生成边出现，所见即所得

### 合规校验
- ✅ **一键校验**：选平台（知乎/小红书/头条/公众号）→ LLM 严格对照内置规则库
- 🎯 **评分 0-100**：80+ 通过、50-79 警告、<50 违规
- 💡 **修复方案**：每条违规给出 `fix`（修复版）+ `suggestion`（怎么改）
- 🪟 **可拖动面板**：方便用户边看边改

### 双栏布局
- ◀▶ **左对话 / 右编辑器**（豆包式）
- 📌 **编辑器默认隐藏**，点击 AI 改写 / 选区应用时才展开
- ↶↷ **编辑器头部**：修改时间 + 实时字数 + 撤销重做 + 平台选择 + 一键校验 + 复制 + 下载 + 更多 + AI + 收起

### 热搜聚合
- 📰 4 平台热搜一屏看完：今日头条 / 百度热搜 / 澎湃新闻 / 抖音总榜
- 🚀 30 分钟 revalidate
- 🎯 **一键写**：hover 热榜条目直接启动调研

### 反幻觉
- 🔗 首页热榜 → 调研 → agent 的整条链路都透传 `sourceUrl`
- 🤖 Agent 必须先 fetch_url 原文，确认主题里的具体名词指什么（避免"股王=茅台"幻觉）

## 🚀 快速开始

### 1. 环境要求

- Node.js 20+（生产用 Docker，alpine 镜像）
- npm（包管理）
- 可达的 MySQL 8.0+ 实例（默认连 OnePlatform 的 `47.111.1.180:3306`）

### 2. 安装依赖

```bash
npm install
```

### 3. 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env`：

```env
DEEPSEEK_API_KEY=sk-your-key-here       # 必填
TAVILY_API_KEY=tvly-your-key-here       # 选填（无则降级到 LLM 自有知识）
DATABASE_URL=mysql://USER:PASSWORD@HOST:3306/db_hotwriter?charset=utf8mb4
```

> ⚠️ 密码中含 `#` 等特殊字符必须 URL-encode（`#` → `%23`），否则 URL fragment 会被截断。

### 4. 启动开发服务器

```bash
npm run dev
```

打开 http://localhost:3000/hotwriter

> 💡 数据库 schema 在应用首次启动时自动建库 + 建表（`CREATE DATABASE IF NOT EXISTS` + `CREATE TABLE IF NOT EXISTS`），无需手动 migrate。

## 🐳 生产部署（Docker）

一键部署到 180 服务器（`47.111.1.180`）：

```bash
# 1. 本地 export 两个必填变量（不入 git；可放进 ~/.bashrc 一次性配置）
export HOTWRITER_DEEPSEEK_KEY=sk-xxxxxxxxxx
export HOTWRITER_DB_PASSWORD='<your-mysql-password>'   # 明文，脚本会自动 URL-encode
# 可选：export HOTWRITER_TAVILY_KEY=tvly-xxxxx

# 2. 跑部署脚本
bash scripts/deploy.sh
```

脚本会：本地检查 env 变量 → URL-encode 密码 → 打包 src + 构造 .env → scp 到 `/root/hotwriter/` → 远程 `docker build` + `docker run` → 验证。

> 🔐 **密钥安全**：`HOTWRITER_DEEPSEEK_KEY` 和 `HOTWRITER_DB_PASSWORD` 只存在于你本地 shell 环境和服务器上的 `/root/hotwriter/.env`（600 权限），不会进 git。

外部访问：**https://www.gydblog.com/hotwriter**（原生 nginx 反代到容器 `127.0.0.1:3010`）。

详见 [TECHNICAL.md#8-部署与运行](TECHNICAL.md)。

## 📚 文档

| 文档 | 内容 |
|------|------|
| [TECHNICAL.md](TECHNICAL.md) | 架构、技术栈、目录、核心模块、数据流、数据库、部署、踩坑 |
| [PRODUCT.md](PRODUCT.md) | 定位、用户、核心功能、用户流程、详细功能、适用场景、设计理念、FAQ |

## 📂 项目结构

```
hotwriter/
├── src/
│   ├── app/                    # Next.js App Router
│   │   ├── page.tsx           # 首页（关键词入口 + 4 平台热搜）
│   │   ├── research/page.tsx  # 调研进度 + 方向选择
│   │   ├── write/[id]/page.tsx # 写作工坊（双栏）
│   │   ├── library/page.tsx   # 作品库
│   │   ├── stats/page.tsx     # 统计 dashboard
│   │   ├── analysis/page.tsx  # 创作分析 dashboard
│   │   └── api/               # 后端路由
│   │       ├── research/      # Agent 调研（SSE）
│   │       ├── hot/           # 热搜抓取
│   │       ├── upload/        # 图片上传
│   │       ├── articles/      # 文章列表 / 批量创建
│   │       └── articles/[id]/
│   │           ├── chat/      # 多轮对话（SSE）
│   │           ├── auto-write/ # 流式自动写（SSE）
│   │           ├── ai-edit/   # 选区改写（SSE）
│   │           ├── check-compliance/ # 合规校验
│   │           ├── analyze/   # 单篇同赛道对比分析（SSE）
│   │           └── analysis/  # 拉最近一次分析历史
│   ├── components/
│   │   ├── nav/Header.tsx
│   │   ├── home/HeroSearch.tsx + HotList.tsx
│   │   ├── RichEditor.tsx     # Tiptap 编辑器
│   │   ├── stats/             # /stats 用的 section 组件
│   │   ├── analysis/          # /analysis 用的 section 组件
│   │   ├── library/ write/    # 域专用组件
│   │   └── Toast / Markdown / RichEditor
│   └── lib/
│       ├── llm/               # DeepSeek client + Agent 循环 + tools + prompts
│       ├── search/            # tavily + 平台站内搜索（zhihu/xhs/baidu/toutiao/wechat）
│       ├── stats/             # /stats SQL + range 解析
│       ├── analysis/          # /analysis SQL + Tavily 对比 + LLM prompt
│       ├── hot/               # 热搜抓取 + 关键词提炼
│       ├── db/                # mysql2 连接池 + schema
│       ├── cost/tracker.ts    # 成本追踪
│       └── markdown.ts utils.ts
├── scripts/deploy.sh          # 一键 Docker 部署到 180
├── Dockerfile
├── tailwind.config.ts
└── package.json
```

## 🗄️ 数据库表

- `articles` - 文章主表
- `article_versions` - 版本历史
- `chat_messages` - 多轮对话历史 ⭐
- `research_sessions` - 调研会话（含 `research_log` JSON 记录每步工具调用）
- `article_analyses` - 单篇同赛道对比分析结果（`/analysis` 用）
- `hot_topics` - 热点缓存（v0.5 启用）
- `usage_logs` - 成本日志

详细字段见 [src/lib/db/schema.ts](src/lib/db/schema.ts)。

## 🛠️ 常用命令

```bash
# 开发
npm run dev

# 构建生产版本
npm run build
npm start

# 数据库
npm run db:migrate    # 触发建库 + 建表（应用启动时也会自动执行）
npm run db:reset      # 危险：DROP DATABASE + 重建（清空数据）

# 类型检查
npx tsc --noEmit

# 部署到 180
bash scripts/deploy.sh
```

## 📊 当前成本参考

按 DeepSeek-V3 公开定价：

| 任务 | 单次成本 |
|------|---------|
| 关键词调研（5 轮工具调用）| ¥0.05–0.10 |
| 初稿生成（1500 字）| ¥0.04–0.08 |
| 段落改写 | ¥0.01–0.02 |
| 对话一轮 | ¥0.01–0.03 |
| **典型日使用** | **¥0.20–0.50** |

**月度预算建议**：¥30（v0.5 加硬上限保护）

## 🛣️ 路线图

```
v0.1 (本次) ✅
├─ 项目骨架 + 数据库
├─ 关键词 Agent 调研
├─ 初稿生成 + 写作工坊
├─ 多轮 AI 对话
└─ 作品库 + 成本追踪

v0.5 (Beta)
├─ Tiptap 富文本编辑器
├─ 历史版本对比 (diff)
├─ 关键词缓存（节省成本）
├─ UI 打磨
└─ 设置 / 成本面板

v1.0 (稳定)
├─ 热点中心（微博/知乎/头条）
├─ 标题优化器
├─ 多种风格模板
└─ 完整导出（公众号格式等）

v2.0+ (可选)
├─ 多用户（如果想开放）
├─ 自托管部署
└─ 系列文章管理
```

## ❓ 常见问题

### Q1: 启动后看到"DEEPSEEK_API_KEY 未配置"？

A: 检查 `.env` 文件是否在项目根目录（不是 `src/` 内），并重启 dev server。

### Q2: 没有 Tavily key，能用吗？

A: 能。Agent 会降级使用 LLM 自有知识。出来的方向质量稍低但仍可用。

### Q3: 调研结果为空？

A: 可能原因：
- 网络问题（Tavily/DeepSeek 都需要外网）
- LLM 输出未通过 JSON 解析 → 看 server 日志
- 关键词太抽象 → 换个更具体的

### Q4: 数据存在哪里？

A: MySQL 数据库 `db_hotwriter`（部署在 OnePlatform 的 `47.111.1.180:3306` 实例）。备份用 `mysqldump`：

```bash
mysqldump -h 47.111.1.180 -uroot -p db_hotwriter > backup.sql
```

### Q5: 想迁移到其他 LLM？

A: 编辑 `src/lib/llm/client.ts`，把 baseURL 和 model 改一下即可（DeepSeek/Qwen/Moonshot 都支持 OpenAI 兼容）。

## 🔗 相关文档

- 📘 [TECHNICAL.md](TECHNICAL.md) — 完整技术文档（架构 / 模块 / 数据库 / 部署）
- 📗 [PRODUCT.md](PRODUCT.md) — 完整产品文档（定位 / 用户流程 / FAQ / 术语表）

## 📜 License

MIT（仅用于个人学习和非商用）
