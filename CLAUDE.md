# HotWriter — 项目开发规约

> 个人 AI 写作助手（hotwriter / hotWriter）。
> Next.js 14 App Router + MySQL + Tiptap 富文本 + SSE 流式。

## 1. 工程概览

| 维度 | 选型 |
|---|---|
| 框架 | Next.js 14 App Router（RSC + Client Component 边界） |
| 数据库 | MySQL 8.0（`mysql2/promise`，无 ORM，原生 SQL） |
| 富文本 | Tiptap（`@tiptap/react` + starter-kit + bubble-menu 等扩展） |
| LLM | OpenAI 兼容协议（`openai` SDK，`src/lib/llm/`） |
| 样式 | Tailwind CSS + `globals.css` 工具类 |
| 图表 | recharts（仅 stats 页用） |
| 部署 | Docker（`/hotwriter` 子路径） |

**目录结构**：

```
src/
├── app/                      # Next.js App Router
│   ├── api/                  # API routes
│   ├── library/              # 文章库
│   ├── research/             # 调研（关键词 → 方向）
│   ├── stats/                # 统计 dashboard
│   ├── analysis/             # 创作分析 dashboard
│   └── write/[id]/           # 写作编辑器
├── components/               # React 组件（按域分目录）
│   ├── library/ stats/ analysis/ write/  # 域专用组件
│   └── nav/ home/ Toast/ Markdown/ RichEditor  # 通用
├── lib/                      # 业务逻辑层
│   ├── cost/                 # token / 成本统计
│   ├── db/                   # MySQL 连接
│   ├── editor/               # Tiptap 配置
│   ├── hot/                  # 热点抓取
│   ├── llm/                  # LLM agent（auto-write / chat / ai-edit）
│   ├── search/               # 调研用搜索（Tavily）
│   ├── stats/                # stats 页 SQL
│   ├── analysis/             # analysis 页 SQL + Tavily + LLM 对比
│   └── markdown.ts utils.ts  # 工具
```

## 2. 开发约定

### 2.1 路径与 basePath

- **本地 dev**：basePath 留空，访问 `http://localhost:3000/<route>`
- **Docker 部署**：`BASE_PATH=/hotwriter` + `NEXT_PUBLIC_BASE_PATH=/hotwriter`
- **所有 API/页面跳转** 走 `apiUrl()` / `<Link>` 等已封装工具，**不要**硬编码 `/api/...`
- ⚠️ `BASE_PATH`（server）和 `NEXT_PUBLIC_BASE_PATH`（client）必须**保持一致**

### 2.2 API 设计

| 端点 | 职责 |
|---|---|
| `/api/articles` | 文章列表 / 批量创建 |
| `/api/articles/[id]` | 单篇 CRUD（GET 含 messages） |
| `/api/articles/[id]/auto-write` | **流式自动写**（SSE：start / delta / complete） |
| `/api/articles/[id]/chat` | 对话流式（SSE delta） |
| `/api/articles/[id]/ai-edit` | 选区改写（polish / expand / shorten） |
| `/api/articles/[id]/check-compliance` | 合规校验 |
| `/api/articles/[id]/generate` | 一次性全文（老接口） |
| `/api/articles/[id]/analyze` | **单篇 SSE 对比分析**（start / delta / sections / suggestions / complete） |
| `/api/articles/[id]/analysis` | 拉最近一次分析历史（"查看分析" 用） |
| `/api/research` | 调研（搜资料 + 出方向） |
| `/api/hot` | 热点抓取 |
| `/api/upload` | 文件上传 |

**SSE 协议**（用于 auto-write / chat）：

```
event: start    data: { direction, style, wordCount }
event: delta    data: { text }              # 增量文本
event: complete data: { ... }
event: error    data: { message }
```

前端解析见 `src/app/write/[id]/page.tsx` 的 SSE reader 模板。

### 2.3 数据库

- **无 ORM** — 用 `db.get<T>(sql, params)` / `db.all<T>(sql, params)` / `db.run(sql, params)`
- `cost_cny` 是 VARCHAR → **所有 SUM 必须** `CAST(... AS DECIMAL(12,6))` + `COALESCE(..., 0)`
- `created_at` 是秒级 BIGINT（`UNIX_TIMESTAMP()`）
- 时间窗过滤：`WHERE created_at >= ?`（传秒数）
- 字段命名：DB 是 snake_case，API 返回 camelCase（见 `/api/articles/[id]/route.ts` 的驼峰化）

### 2.4 LLM 调用

- 统一走 `src/lib/llm/` 下的 agent（不直接 `openai` SDK）
- **auto-write / chat 必须流式** — 不要把整篇生成完再返回
- prompt 模板写在 `src/lib/llm/prompts.ts`（如有）
- ⚠️ **不要把 `role: "event"` 的消息喂给 LLM** — 会触发 OpenAI/Anthropic API 400
  - chat_messages 查询统一加 `WHERE role IN ('user', 'assistant', 'system')`
  - 见 memory: `chat-messages-event-role`

### 2.5 React 状态

- `content` 状态存 **HTML 字符串**（给 Tiptap），不是 markdown
- `setContent(mdToHtml(...))` 用于流式写入
- markdown ↔ HTML 转换走 `src/lib/markdown.ts` 的 `normalizeToHtml` / `mdToHtml`
- HTML → markdown 反向用 `turndown`（下载 / 复制纯文本时）
- ⚠️ 流式渲染气泡时**不要依赖 ref 存位置** — React 18 batching 下 ref 不保证同步
  - 用 `setMessages(prev => findIndex(...))` 自包含定位

### 2.6 自动保存

- 富文本编辑 → debounce 1.5s → `PUT /api/articles/[id]`
- `skipNextSaveRef` 用于跳过"自动写完成后第一次保存"（server 端 logAutoWriteVersion 已存版本）
- 每次 `PUT` 都会先 `INSERT INTO article_versions`（`trigger='manual_save'`）

### 2.7 类型

- `tsconfig.json` 开启 strict，但 `next.config.js` 配 `ignoreBuildErrors: true`（项目历史包袱）
- 新写代码尽量严格，遇到 `any` 注释说明原因
- SSE 解析用 `try/catch {}` 吞 JSON 错误是**允许的**（断流 / 不完整事件）

### 2.8 编码规范

**Imports**
- 路径别名：统一用 `@/...`（指向 `src/`）。项目里 58 处 `@/`，4 处相对路径，**新代码不要用 `../../`**
- 例：`import { db } from "@/lib/db"` 而不是 `import { db } from "../../lib/db"`

**Client / Server 边界**
- 有交互的组件**顶部必须** `"use client";`（RSC 默认 server）
- 数据获取放 server component（`src/app/library/page.tsx`、`src/app/stats/page.tsx` 是范本）
- Client 组件里调 API 走 `fetch(apiUrl(...))`

**State**
- 大量 state 集中在顶层 page（`src/app/write/[id]/page.tsx` ~25 个 `useState` 是常态）
- 不引入 Redux / Zustand，复杂交互靠多个 `useState` + `useRef` 协作
- 复杂闭包变量（如 `aiBubbleIdx`）**优先用 `useRef`** 而不是局部变量
- 但**流式渲染气泡时反过来**——用 `setMessages(prev => findIndex(...))` 自包含定位，不要存 ref（React 18 batching 下 ref 不保证同步）

**Logging**
- 用 `console.warn` / `console.error` 即可，**不要**引入 `winston` / `pino`
- 用户面向的错误走 `Toast` 组件（`src/components/Toast.tsx`）
- 服务端异常可以 `console.error(err)` 但不要 `throw err` 中断整个 stream

**Types**
- 接口命名 `PascalCase`，常量 `UPPER_SNAKE`（如 `MONTHLY_BUDGET`、`PLATFORM_LABELS`）
- `any` 出现时必须 `// eslint-disable-next-line` 或注释说明（项目 `eslint.ignoreDuringBuilds: true`，但不等于无 eslint）
- 不要 `enum`，用 `Record<string, "...">` + `as const` 替代

**Naming**
- React 组件函数命名 `PascalCase`（即使不是组件文件）
- 内部工具函数 `camelCase`，常量 `UPPER_SNAKE`
- 事件 handler `handleXxx`（如 `handleApplyFix`、`handleCheckCompliance`）

**文件**
- 域专用组件放 `src/components/<domain>/`（已有 `library/` `stats/` `write/`）
- 通用组件放 `src/components/` 根目录（`Markdown`、`RichEditor`、`Toast`）
- 业务逻辑（SQL / LLM agent）放 `src/lib/`，**不要**塞进 component
- 域内 SQL 集中在 `src/lib/<domain>/queries.ts`（如 `src/lib/stats/queries.ts`）

**样式**
- 优先 Tailwind utility，复杂重复块抽到 `globals.css` 用 `@layer components`
- 不要新加 styled-components / emotion / CSS-in-JS

## 3. UI / UX 约定

- **聊天区"豆包式"**：浅色气泡、emoji 提示、hover 显按钮
- **写作编辑器**双栏：左侧 chat + 右侧 Tiptap，**默认编辑器隐藏**（chat-first），点编辑或自动写完才展开
- **"调研详情"面板**：在 write 页 chat 顶部可折叠（默认折叠，单行摘要）
- **字数显示**：`content.length` 给 chat 顶部（HTML 字符数）；`countWords(content.replace(/<[^>]+>/g, ''))` 给编辑器顶部（中文字数）
- **CSS 工具类**：优先用 `globals.css` 里定义的（`.btn-primary` `.card` `.stat-tile` 等），新加类前先看一遍

## 4. 数据持久化要点

- **文章内容**：`articles.content`（HTML / markdown 都可存，`normalizeToHtml` 兼容）
- **版本**：`article_versions` 表（每次手动保存 / 自动写完成 都加一条）
- **对话**：`chat_messages`（`role`: user / assistant / system / event）
- **调研**：`research_sessions`（JSON 存 directions）
- **成本**：`usage_logs`（`tokens_input` + `tokens_output` + `cost_cny` VARCHAR）

## 5. 部署

```bash
# 本地 dev
npm run dev          # 默认 3000；3000/3001/3002 都可能被占，逐个 fallback

# 构建
npm run build        # 注意 ignoreBuildErrors:true，新代码尽量保持类型严格

# Docker
docker build -t hotwriter .
docker run -d --name hotwriter -p 8080:3000 \
  -e BASE_PATH=/hotwriter -e NEXT_PUBLIC_BASE_PATH=/hotwriter \
  -e MYSQL_HOST=... -e MYSQL_USER=... -e MYSQL_PASSWORD=... -e MYSQL_DATABASE=... \
  hotwriter
```

`.env` 不提交，参考 `.env.example`。

## 6. 提交 / Git

- 一个 PR 一个特性，commit message 格式 `<type>(<scope>): <desc>`
  - `feat(stats)` `feat(write)` `fix(api)` `refactor(library)` 等
- 写代码前先看 `git status` 确认没有遗留未提交改动
- 不可逆动作（push / 删文件 / 改数据库）必须确认
- 写完后跑 `npm run build` 验证

## 7. 调试陷阱（已踩）

| 现象 | 原因 | 修法 |
|---|---|---|
| `articles/[id]/auto-write` 接口返回数据，左侧气泡不实时显示（右编辑器正常，刷新后左侧才显示） | React 18 automatic batching 跨 `await` 不保证同步提交——占位 setMessages 还没 commit 时第一个 delta 已到达，updater 里找不到 assistant 气泡 | 占位插入用 `flushSync(() => setXxx(...))` 强制同步提交；delta 分支定位用手动倒序查找代替 findLastIndex |
| `/api/articles/[id]/chat` 调 OpenAI 时报 400 unknown variant | 把 `role: "event"` 当 chat history 喂给 LLM | chat_messages 查询 `WHERE role IN ('user','assistant','system')` |
| 编辑器默认看不到，刷新后才显示 | `editorVisible` 默认 false 且无内容时不展开 | `else if (!isEmpty) setEditorVisible(true)` |
| 暗色内页（/library /research /stats）仍能看到滚动条 | 浏览器窗体滚动条在 `<html>`，`.scrollbar-hide::-webkit-scrollbar` 只匹配元素自身；横向 tab（StyleTabs）等 `overflow-x-auto` 容器也不会自动隐藏 | globals.css 用 `html:has(.scrollbar-hide)` 兜底窗体；任何 `overflow-auto` 容器直接加 `scrollbar-hide` class |
| 首页编辑器里字体颜色和背景同色（看不见字） | globals.css 给 `body` 设了全局 `text-white`，但 /write 页背景是浅色 | 在 write 页 `<main>` 上加 `text-gray-900` 覆盖继承 |

详见各 memory 文件。

## 8. 进一步参考

- `README.md` — 部署 / 启动指引
- `TECHNICAL.md` — 技术细节
- `PRODUCT.md` — 产品定位
- memory 目录 — 项目特定记忆（`chat-messages-event-role`、`write-page-auto-write-stream-bug` 等）