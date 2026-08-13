# HotWriter · 技术文档

> 个人热点写作助手 · 内部参考 · 2026-08

---

## 目录

- [1. 项目概览](#1-项目概览)
- [2. 技术栈](#2-技术栈)
- [3. 目录结构](#3-目录结构)
- [4. 核心模块](#4-核心模块)
- [5. 数据流](#5-数据流)
- [6. 数据库 schema](#6-数据库-schema)
- [7. 关键设计决策](#7-关键设计决策)
- [8. 部署与运行](#8-部署与运行)
- [9. 已知坑与修复模式](#9-已知坑与修复模式)

---

## 1. 项目概览

HotWriter 是一个**非商业、个人用**的 PC Web 应用，帮用户基于"热点话题"快速产出适合多平台发布的文章。

### 1.1 产品形态

- **首页**（`/`）：展示 4 平台热搜（今日头条 / 百度热搜 / 澎湃新闻 / 抖音总榜），支持「一键写」直接进入调研
- **调研页**（`/research`）：LLM Agent 自动多轮调研，产出 3-5 个差异化写作方向
- **工作台**（`/write/[id]`）：双栏布局——左侧对话（与 AI 讨论）、右侧富文本编辑器（AI 写作 + 人工润色）
- **素材库**（`/library`）：历史文章列表
- **统计页**（`/stats`）：KPI / 月度趋势 / 风格分布 / Token 用量 / 调研工具调用分布
- **分析页**（`/analysis`）：创作习惯 + 同赛道爆款对比 + 4 维差距评分 + 可执行改稿建议
- **个人页**（`/profile`）：账号设置

### 1.2 核心能力

| 能力 | 实现 |
|------|------|
| 热点抓取 | 4 平台 HTML 解析 + 第三方聚合站 |
| 智能调研 | DeepSeek Agent + 7 个工具（通用 Web / 知乎 / 小红书 / 百度 / 头条 / 微信 / fetch_url） |
| 富文本编辑 | Tiptap（ProseMirror）+ 斜杠菜单 / 气泡工具栏 |
| AI 写作 | 整篇自动写 + 选区润色/扩写/缩写/改语气/翻译 |
| 合规校验 | 内置 4 平台规则库 + LLM 严格审查 |
| 多平台适配 | 知乎 / 小红书 / 头条 / 公众号 风格重写 |
| 统计 / 成本 | `/stats` 6 张 SQL 并发 + recharts 暗色玻璃 |
| 创作分析 | `/analysis` Tavily 同赛道搜索 + LLM 4 维差距 + 可执行建议 |

---

## 2. 技术栈

| 层 | 选型 | 理由 |
|----|------|------|
| **框架** | Next.js 14.2 App Router | RSC + 路由约定 + 内置 API Routes |
| **语言** | TypeScript 5.7 | 类型安全 |
| **UI** | React 18.3 + Tailwind 3.4 | 极简 className 体系 |
| **LLM** | DeepSeek API（OpenAI 兼容）| 国产、价格低、中文好 |
| **搜索** | Tavily API | AI 友好的网页搜索；通用搜索 + 6 个平台站内限定（知乎 / 小红书 / 百度 / 头条 / 微信） |
| **数据库** | MySQL 8.0（mysql2/promise 连接池） | 与 OnePlatform 共用实例 `47.111.1.180:3306`、阿里云 RDS 同款、个人项目无需再起 SQLite 进程 |
| **编辑器** | Tiptap 2.10（基于 ProseMirror）| 框架成熟、扩展丰富 |
| **MD ↔ HTML** | marked 14 + turndown 7 | marked 转 HTML（写入）、turndown 转 MD（导出）|
| **拖动** | 浏览器原生 Pointer Events | 0 依赖 |
| **测试** | （未集成，建议后续加 vitest） | — |

### 2.1 关键依赖

```json
{
  "next": "14.2.18",
  "react": "18.3.1",
  "@tiptap/react": "^2.10.0",
  "@tiptap/starter-kit": "^2.10.0",
  "@tiptap/extension-link": "^2.10.0",
  "@tiptap/extension-image": "^2.10.0",
  "@tiptap/extension-placeholder": "^2.10.0",
  "@tiptap/extension-bubble-menu": "^2.10.0",
  "@tiptap/extension-floating-menu": "^2.10.0",
  "@tiptap/suggestion": "^2.10.0",
  "marked": "^14.0.0",
  "turndown": "^7.2.0",
  "openai": "^4.73.0",
  "tailwindcss": "^3.4.16"
}
```

---

## 3. 目录结构

```
hotwriter/
├── public/
│   └── uploads/                  # 用户上传图片（按 YYYYMM 分目录）
├── scripts/
│   └── deploy.sh                 # 一键 Docker 部署到 180（本地 tar → scp → 远程 build+run）
├── Dockerfile                    # next start 模式（node:20-alpine 两阶段）
├── .dockerignore
├── src/
│   ├── app/
│   │   ├── api/                  # 后端 API Routes
│   │   │   ├── articles/         # CRUD + chat + auto-write + ai-edit + check-compliance + analyze
│   │   │   ├── hot/              # 热搜抓取
│   │   │   ├── research/         # 关键词调研
│   │   │   └── upload/           # 图片上传
│   │   ├── research/             # 调研结果页
│   │   ├── write/[id]/           # 工作台（双栏）
│   │   ├── library/              # 文章库
│   │   ├── stats/                # 统计 dashboard（KPI / 趋势 / 风格 / Token / 调研工具）
│   │   ├── analysis/             # 创作分析 dashboard（习惯 + 同赛道对比 + 改稿建议）
│   │   ├── profile/              # 个人中心
│   │   ├── layout.tsx
│   │   ├── page.tsx              # 首页
│   │   └── globals.css
│   ├── components/
│   │   ├── RichEditor.tsx        # Tiptap 编辑器（440 行）
│   │   ├── Markdown.tsx          # 简单 Markdown 渲染（只读场景）
│   │   ├── Toast.tsx             # Toast 提示系统
│   │   ├── nav/                  # Header
│   │   ├── home/                 # 首页相关
│   │   ├── library/ stats/ analysis/ write/  # 域专用组件
│   │   └── RichEditor + Markdown + Toast      # 通用
│   ├── lib/
│   │   ├── db/                   # 数据库封装 + schema
│   │   ├── llm/                  # LLM Agent + Prompt + tools
│   │   ├── hot/                  # 热搜抓取 + 关键词提炼
│   │   ├── search/               # tavily + 平台站内搜索（zhihu/xhs/baidu/toutiao/wechat）
│   │   ├── stats/                # /stats SQL + range 解析
│   │   ├── analysis/             # /analysis SQL + Tavily 对比 + LLM prompt
│   │   ├── cost/                 # 用量统计
│   │   ├── editor/               # Tiptap 配置 + 极简 tippy
│   │   ├── markdown.ts           # MD ↔ HTML 转换 + stripHtml
│   │   └── utils.ts              # 时间格式化、字数统计等
│   └── middleware.ts             # （空，预留）
├── Dockerfile                    # 多阶段构建：builder 跑 next build，runner 跑 next start
├── .dockerignore
├── scripts/
│   └── deploy.sh                 # 一键部署到 47.111.1.180
├── package.json
├── tailwind.config.ts
├── next.config.js                # basePath: "/hotwriter"
└── tsconfig.json
```

---

## 4. 核心模块

### 4.1 LLM Agent 调研（[src/lib/llm/agent.ts](src/lib/llm/agent.ts)）

**职责**：接收关键词 → 多轮工具调用 → 输出 3-5 个写作方向

**核心循环**：

```ts
const MAX_ROUNDS = 8;
for (let round = 0; round < MAX_ROUNDS; round++) {
  const response = await client.chat.completions.create({
    model: MODEL_NAME,
    messages,
    tools: AGENT_TOOLS,
    tool_choice: "auto",
    temperature: 0.5,
  });
  
  // LLM 没调工具 → 输出最终 JSON
  if (!msg.tool_calls) break;
  
  // 执行工具调用（web_search / fetch_url / search_zhihu / search_xiaohongshu /
  //                  search_baidu / search_toutiao / search_wechat）
  for (const toolCall of msg.tool_calls) {
    const result = await executeTool(toolCall);
    messages.push({ role: "tool", tool_call_id, content: result });
  }
}

// 兜底：MAX_ROUNDS 用完还没输出 → 强制收敛
if (!finalContent) {
  messages.push({ role: "user", content: "不要再调工具，立即输出 JSON" });
  const finalResponse = await client.chat.completions.create({
    messages, tool_choice: "none", temperature: 0.5,
  });
  finalContent = finalResponse.choices[0]?.message?.content;
}
```

**三件套防坑**（[memory: llm-agent-force-converge](~/.claude/projects/-Users-zhaoyuanguang-articleWriting/memory/llm-agent-force-converge.md)）：
1. 主循环后强制收敛（`tool_choice: "none"`）
2. JSON 解析先代码块、失败后正则提取
3. Prompt 里允许"工具不可用时基于通用知识给方向"

### 4.2 防幻觉：sourceUrl 透传（[src/lib/hot/keyphrases.ts](src/lib/hot/keyphrases.ts) + 多处）

**问题**：短关键词触发 LLM 幻觉（如"A股股王"→ 默认茅台）

**方案**：

```
首页热榜 (有 title + url)
   ↓ HotList.tsx: href="/research?...&url=..."
   ↓ keyphrases.ts: 返回 ExtractedKeyword[] (含 url)
   ↓ research/page.tsx: 读 url，传给 fetch body
   ↓ api/research: 透传给 runKeywordAgent({sourceUrl})
   ↓ agent.ts: user 消息含"原文 URL：${sourceUrl}，先 fetch_url"
```

[memory: llm-hallucination-source-url-fix](~/.claude/projects/-Users-zhaoyuanguang-articleWriting/memory/llm-hallucination-source-url-fix.md) 有完整记录。

### 4.3 富文本编辑器（[src/components/RichEditor.tsx](src/components/RichEditor.tsx)）

**Tiptap 扩展**：

| 扩展 | 用途 |
|------|------|
| `StarterKit` | 段落、Bold、Italic、Strike、Code、H1-3、列表、引用、代码块、分割线 |
| `Link` | 链接 |
| `Image` | 图片 |
| `Placeholder` | 占位符 |
| `BubbleMenu` | 选中文字时弹气泡工具栏（格式化 + AI） |
| `FloatingMenu` | 空行时浮 "+" 按钮 |
| `SlashCommand`（自写） | `/` 唤出命令面板 |
| `FileHandler`（自写 `handlePaste/handleDrop`）| 图片拖拽 / 粘贴 |

**AI 改写流程**（**预览模式**）：

```
选中文字 → 点 ✨润色
   ↓
runAiEdit: 删除选区 → 调 /api/articles/[id]/ai-edit → 流式累积到 aiPreview.generated
   ↓
弹出预览窗口（原文 vs AI 改写 流式显示）
   ↓
用户决定：
├─ 点 "✓ 应用到原文" → 替换选区
├─ 点 "取消" → 关闭窗口，原选区不动
└─ 点 "🔄 重新生成" → 同一 action 重跑
```

**核心**：避免不可逆替换，用户先看对比再决定。

### 4.4 合规校验（[src/app/api/articles/[id]/check-compliance/route.ts](src/app/api/articles/[id]/check-compliance/route.ts)）

**架构**：内置 4 平台规则库 → 拼成 system prompt → LLM 严格对照检查 → 结构化 JSON

**规则库**：

```ts
const PLATFORM_RULES = {
  zhihu: { name, rules: [...].join("\n") },       // 知乎规则清单
  xiaohongshu: {...},                              // 小红书规则
  toutiao: {...},                                  // 头条规则
  wechat: {...},                                   // 公众号规则
};
```

**踩坑**：原本用模板字符串 + 内嵌 `\`\`\`` 转义反引号，webpack/SWC 解析报错。**改用数组 + `join('\n')` 拼接绕过**。

**输出 JSON 结构**：

```json
{
  "overall": "pass" | "warning" | "violation",
  "score": 0-100,
  "summary": "一句话总结",
  "violations": [
    { "type", "text", "rule", "severity", "fix", "suggestion" }
  ],
  "warnings": [...],
  "suggestions": [...]
}
```

### 4.5 热搜抓取（[src/lib/hot/fetcher.ts](src/lib/hot/fetcher.ts)）

| 平台 | 抓取方式 | 反爬难点 |
|------|---------|---------|
| 今日头条 | 官方 hot-board API | 无 |
| 百度热搜 | top.baidu.com HTML 解析 | 无 |
| 澎湃新闻 | 官方 contVisit API | 无 |
| 抖音总榜 | tophub.today 第三方聚合站 | 需 iPhone Safari UA |

**并发抓取**：

```ts
const [thepaper, toutiao, baidu, douyin] = await Promise.all([
  fetchThepaper(),
  fetchToutiao(),
  fetchBaidu(),
  fetchDouyin(),
]);
```

任一失败 → 降级到 fallback 列表（写死在文件末尾的示例数据），不影响首页加载。

**持久化**：成功的实时数据 upsert 到 `hot_topics` 表（24h 去重窗口），保留历史趋势。

### 4.6 数据库封装（[src/lib/db/index.ts](src/lib/db/index.ts)）

基于 `mysql2/promise` 的极简异步封装，对外提供与原 SQLite 版本同名的 `all/get/run/close` 接口（业务层无须感知方言差异）：

```ts
const db = {
  all<T>(sql, params): Promise<T[]>,            // SELECT 多行
  get<T>(sql, params): Promise<T | undefined>,  // SELECT 单行
  run(sql, params): Promise<{ changes, lastInsertRowid }>, // INSERT/UPDATE/DELETE
  close(): Promise<void>,
};
```

**连接池**：用 `mysql2.createPool` 单例（`globalThis._mysqlPool` 防止 Next.js dev 热重载多池）。每次 `all/get/run` 从池里 `getConnection()` → 执行 → `release()`，避免长连接断开。

**返回值映射**：`mysql2` 的 INSERT/UPDATE/DELETE 返回 `ResultSetHeader`，这里把 `affectedRows` 映射成 `changes`、`insertId` 映射成 `lastInsertRowid`，让 30+ 处旧调用站点继续工作（无需 diff 改造）。

**自动建库建表**：`ensureDatabaseAndSchema()` 在每次 `dbReady()` 时执行（应用启动第一次访问数据库时触发），包含：
- `CREATE DATABASE IF NOT EXISTS db_hotwriter`
- `CREATE TABLE IF NOT EXISTS` × 6
- `CREATE INDEX` —— 注意 180 上的 MySQL 是阿里云分支，不支持 `CREATE INDEX IF NOT EXISTS`，因此用 try/catch + `ER_DUP_KEYNAME (1061)` 错误码忽略重复创建。

**密码特殊字符**：`DATABASE_URL` 中如果密码含 `#` 等保留字，必须 URL-encode（`#` → `%23`），否则会被解析为 fragment 截断。

### 4.7 统计页（`/stats`）

RSC（`force-dynamic`）并发 7 条 SQL → 装配 `StatsSnapshot` → 5 个 section 渲染：

| Section | 数据 | 渲染 |
|---|---|---|
| SectionKpi | 总数 / 草稿 / 归档 / 平均字数 / 最近 | 3 张 stat-tile |
| SectionTrend | 月度趋势（`%Y-%m` 分组） | recharts BarChart |
| SectionStyle | 风格分布 | recharts PieChart |
| SectionTokens | Token 用量 + 按 action 拆分 | 列表 + BarChart |
| SectionTavily | 调研工具调用分布 | KPI 3 件套 + 4~7 类工具饼图 + 最近 Tavily 关键词 |

**Tavily 统计的特殊处理**：不存新表，从 `research_sessions.research_log`（JSON 数组）后处理聚合。Step 形如 `{type:"search", tool:"web_search"|"search_zhihu"|..., args:{query}}`，按 tool 计数 + 按时间倒序取最近 8 条 `query`。

### 4.8 创作分析页（`/analysis`）

两段式：

1. **静态画像**（纯 SQL，无需 LLM）：24h 时段柱图 + 周分布 + 频率统计
2. **单篇同赛道对比**（按需触发）：点文章列表的「重新分析」→ SSE 流式 → Tavily 搜同关键词 → LLM 4 维差距评分 → 写 `article_analyses` 落库

4 维差距：`title` / `hook` / `structure` / `materials`，每维 0-100 分 + issue + suggestion。LLM 输出的 `hotRefs` 用 Tavily 真实 URL 集做交集过滤，避免瞎编 URL。

SSE 协议：

```
event: start       data: { articleId, title }
event: delta       data: { text }              # 进度文本
event: sections    data: { summary, gaps }
event: suggestions data: { items: [...] }
event: complete    data: { analysisId, payload, hotRefs, usage }
event: error       data: { message }
```

### 4.9 平台站内搜索（[src/lib/search/zhihu.ts](src/lib/search/zhihu.ts)）

7 个搜索工具全部走 Tavily + `site:<domain>` 限定符，避免对知乎 / 小红书 / 百度 / 头条 / 微信公众号的官方 API 门槛：

| 工具 | site 限定 | 适用 |
|---|---|---|
| `web_search` | （无） | 通用 |
| `search_zhihu` | `site:zhihu.com` | 大众经验、深度讨论 |
| `search_xiaohongshu` | `site:xiaohongshu.com` | 生活方式、消费趋势 |
| `search_baidu` | `site:baidu.com` | 权威百科、政策解读、时效新闻（含百度知道 / 百家号） |
| `search_toutiao` | `site:toutiao.com` | 资讯首发、热点时效 |
| `search_wechat` | `site:mp.weixin.qq.com` | 深度观点、行业分析 |
| `fetch_url` | （直接抓） | 读已搜到的 URL 正文 |

LLM 按场景路由：工信部 / 广告法 → 百度；热点首发 → 头条；深度分析 → 微信；大众讨论 → 知乎。烟囱测试（"小米 SU7 车祸事件"）验证 LLM 正确按场景触发不同工具。

---

## 5. 数据流

### 5.1 调研流（SSE 流式）

```
用户输入关键词 + 点击"一键写"
   ↓
GET /research?keyword=X&url=Y&source=Z&auto=1
   ↓ research/page.tsx useEffect → 调 fetch /api/research
   ↓ POST /api/research (body: { keyword, sourceUrl })
   ↓ api/research: runKeywordAgent({keyword, sourceUrl, onStep})
   ↓ agent.ts: 主循环
      ↓
      LLM 调工具 → 执行 → 累积到 messages
      ↓  EventSource 推 step 事件给前端
   ↓
   完成后 SSE 推 complete 事件（含 sessionId + directions）
   ↓
前端用 directions 渲染 3-5 张方向卡
   ↓ 用户选方向 → POST /api/articles（创建 article）
   ↓ POST /api/articles/[id]/generate（触发自动写）
   ↓
   router.push(/write/[id])
```

### 5.2 写作流（SSE 流式）

```
write page loadArticle() → fetch /api/articles/[id]
   ↓ article + messages 设置到 state
   ↓
   若有方向 + 内容空 → 触发 runAutoWrite
   ↓
   POST /api/articles/[id]/auto-write
   ↓
   流式推送 delta → setContent(mdToHtml(accumulated)) + setMessages
   ↓
   complete 事件 → setEditorVisible(true) + 写入数据库
   ↓
   1.5s debounce auto-save → PUT /api/articles/[id]
```

### 5.3 编辑器操作流

| 操作 | 数据流 |
|------|--------|
| 输入文字 | Tiptap onUpdate → setContent(html) → debounce → PUT /api/articles/[id] |
| 选区 AI 改写 | 点 AI 按钮 → 调 /api/articles/[id]/ai-edit → 流式累积到 preview → 用户点"应用"才替换选区 |
| 复制 | turndown(content) → 双格式 ClipboardItem（text/html + text/plain）→ 剪贴板 |
| 下载 | turndown(content) → Blob → <a download> |
| 合规校验 | 点 ✓ → 调 /api/articles/[id]/check-compliance → 弹出结果面板 |

---

## 6. 数据库 schema

数据库：MySQL 8.0（实例 `47.111.1.180:3306`，库名 `db_hotwriter`，与 OnePlatform 共用实例）。
完整 DDL 在 [src/lib/db/schema.ts](src/lib/db/schema.ts)。共 7 张表：`articles` / `article_versions` / `chat_messages` / `research_sessions` / `article_analyses` / `hot_topics` / `usage_logs`。

### articles

```sql
CREATE TABLE articles (
  id INT PRIMARY KEY AUTO_INCREMENT,
  uuid VARCHAR(64) NOT NULL UNIQUE,
  title VARCHAR(500) NOT NULL,
  content LONGTEXT DEFAULT '',       -- HTML（Markdown 旧数据加载时 on-the-fly 转）
  source_type VARCHAR(32),           -- 'hot' | 'keyword'
  source_ref VARCHAR(500),           -- 关键词 或 热点 URL
  direction_index INT,
  style VARCHAR(32),                 -- '深度观点' | '科普' | '故事' | '短评'
  series_id INT,                     -- 预留：系列文
  word_count INT DEFAULT 0,
  status VARCHAR(16) DEFAULT 'draft',-- 'draft' | 'archived' | 'deleted'
  tags TEXT,                         -- JSON array
  metadata TEXT,                     -- JSON {sourceUrl, ...}
  user_id INT DEFAULT 1,
  source_url VARCHAR(500),           -- 文章级 sourceUrl（防幻觉透传）
  created_at INT NOT NULL DEFAULT (UNIX_TIMESTAMP()),
  updated_at INT NOT NULL DEFAULT (UNIX_TIMESTAMP()),
  INDEX idx_articles_status_created (status, created_at),
  INDEX idx_articles_user (user_id),
  INDEX idx_articles_source (source_type, source_ref)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### article_versions

```sql
CREATE TABLE article_versions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  article_id INT NOT NULL,
  content LONGTEXT NOT NULL,
  word_count INT DEFAULT 0,
  note VARCHAR(200),
  created_at INT NOT NULL DEFAULT (UNIX_TIMESTAMP()),
  INDEX idx_versions_article (article_id, created_at),
  CONSTRAINT fk_versions_article FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### research_sessions

```sql
CREATE TABLE research_sessions (
  id INT PRIMARY KEY AUTO_INCREMENT,
  keyword VARCHAR(200) NOT NULL,
  user_input TEXT,
  research_log LONGTEXT,             -- JSON: AgentStep[] (用于事后调试)
  directions LONGTEXT,               -- JSON: Direction[]
  article_id INT,
  chosen_direction INT,
  total_cost_cny VARCHAR(32),
  tool_call_count INT DEFAULT 0,
  model VARCHAR(64),
  source_url VARCHAR(500),           -- 原文 URL（防幻觉用）
  created_at INT NOT NULL DEFAULT (UNIX_TIMESTAMP()),
  INDEX idx_sessions_created (created_at),
  CONSTRAINT fk_sessions_article FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### article_analyses

```sql
CREATE TABLE article_analyses (
  id INT PRIMARY KEY AUTO_INCREMENT,
  article_id INT NOT NULL,
  payload LONGTEXT NOT NULL,          -- JSON: { summary, gaps:{title,hook,structure,materials}, suggestions, hotRefs }
  model VARCHAR(64),
  tokens_input INT DEFAULT 0,
  tokens_output INT DEFAULT 0,
  cost_cny VARCHAR(32),
  duration_ms INT,
  hot_refs LONGTEXT,                 -- JSON: Tavily 搜索结果快照（防止 URL 过期后无法复现）
  created_at BIGINT NOT NULL DEFAULT (UNIX_TIMESTAMP()),
  INDEX idx_article_analyses_article_created (article_id, created_at DESC),
  CONSTRAINT fk_analyses_article FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

> `/analysis` 页点「重新分析」每次都 INSERT 新行；通过 `MAX(created_at)` 拿每篇 latest。

### chat_messages

```sql
CREATE TABLE chat_messages (
  id INT PRIMARY KEY AUTO_INCREMENT,
  article_id INT NOT NULL,
  role VARCHAR(16) NOT NULL,         -- 'user' | 'assistant' | 'event' | 'system'
  content LONGTEXT NOT NULL,
  tokens_used INT,
  cost_cny VARCHAR(32),
  created_at INT NOT NULL DEFAULT (UNIX_TIMESTAMP()),
  INDEX idx_messages_article (article_id, created_at),
  CONSTRAINT fk_messages_article FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### hot_topics

```sql
CREATE TABLE hot_topics (
  id INT PRIMARY KEY AUTO_INCREMENT,
  title VARCHAR(200) NOT NULL,
  source VARCHAR(32) NOT NULL,       -- 'thepaper' | 'toutiao' | 'baidu' | 'douyin'
  url VARCHAR(500),
  external_id VARCHAR(128),
  hot_score INT,
  category VARCHAR(64),
  summary TEXT,
  event_group_id VARCHAR(64),
  fetched_at INT NOT NULL DEFAULT (UNIX_TIMESTAMP()),
  expired_at INT,
  UNIQUE KEY uk_hot_external (source, external_id),
  INDEX idx_hot_fetched (fetched_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

### usage_logs

```sql
CREATE TABLE usage_logs (
  id INT PRIMARY KEY AUTO_INCREMENT,
  action VARCHAR(32) NOT NULL,       -- 'research' | 'write' | 'ai_edit' | 'check_compliance'
  model VARCHAR(64),
  tokens_input INT,
  tokens_output INT,
  cost_cny VARCHAR(32),
  duration_ms INT,
  article_id INT,
  session_id INT,
  created_at INT NOT NULL DEFAULT (UNIX_TIMESTAMP()),
  INDEX idx_usage_action_created (action, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
```

---

## 7. 关键设计决策

### 7.1 双栏布局：左对话 / 右编辑器

**为什么不是左编辑器 / 右对话**？

- **对话**是"短消息流"，自然适合窄列
- **编辑器**是"主工作区"，需要更宽的空间（阅读 + 排版）
- 用户工作流：编辑器是核心，对话是辅助 → 对话让位给编辑器

### 7.2 编辑器默认隐藏

**为什么默认隐藏**？

- 进入工作台时，多数用户已经有方向 / 标题，**不需要先看到空编辑器**
- 先用对话把文章聊出来 → AI 写完 / 用户用户点"应用到正文" → 编辑器展开
- 类比 Notion AI：先把对话跑通，再展示文档

### 7.3 AI 改写用预览窗口（而不是直接替换）

**为什么不直接替换**？

- AI 输出不可控（可能改坏）
- 用户需要对比"原文 vs AI 改写"才能判断
- 预览 + 用户主动确认 = 更安全、更好 UX
- 代价：多一步点击，但值得

### 7.4 平台规则内置而非检索

**为什么不用 RAG 检索《平台规范.md》**？

- 4 平台规则总量可控（约 200 行）
- 全文塞 prompt 完全够用（每平台 ~800 tokens）
- 不依赖外部向量库、简化部署
- 代价：规则更新需要改代码（可接受，本项目单人维护）

### 7.5 content 存 HTML 而非 MD

**为什么不存 Markdown**？

- 编辑器（Tiptap）原生输出 HTML，存 HTML 无损
- 显示时已无需转换（直接 dangerouslySetInnerHTML）
- 下载 / 复制时临时 turndown 转 MD
- 旧 MD 数据按 `looksLikeHtml` 启发式判断，自动转换

### 7.6 极简 tippy 自写

**为什么不用官方 tippy.js**？

- 官方包 ~30kb
- 我们只需要 floating positioning + 生命周期管理
- 自写 90 行 = 节省 ~28kb

---

## 8. 部署与运行

### 8.1 环境要求

**本地开发**：
- Node.js 20+（生产用 Docker alpine 镜像；本地 22 也可）
- 可达的 MySQL 8.0+ 实例（默认连 OnePlatform 的 `47.111.1.180:3306`）
- DeepSeek API Key（**必填**）
- Tavily API Key（可选，无则降级到 LLM 自有知识）

**生产部署**：
- 180 服务器（`47.111.1.180`）已具备：Docker 25+、原生 nginx 1.22、MySQL 8.0（阿里云分支）
- 端口 3010 空闲（3000 被 `miaoxiang` 容器占用）
- `/root/hotwriter/` 作为部署目录（uploads 持久化挂载）

### 8.2 环境变量

```bash
# .env
DEEPSEEK_API_KEY=sk-xxxxxxxxxx       # 必填
TAVILY_API_KEY=tvly-xxxxxxxxxx       # 可选
DATABASE_URL=mysql://USER:PASSWORD@HOST:3306/db_hotwriter?charset=utf8mb4
NEXT_PUBLIC_BASE_PATH=/hotwriter     # build 时注入（NEXT_PUBLIC_* 会内联到客户端 bundle）
NODE_ENV=production                  # 生产环境必加
```

> ⚠️ **密码特殊字符**：含 `#`、`@`、`/` 等保留字必须 URL-encode，否则 URL fragment 会被截断。例如密码 `p@ss#word/` → `p%40ss%23word%2F`。`scripts/deploy.sh` 会自动处理（`HOTWRITER_DB_PASSWORD` 给明文即可）。

> ⚠️ **NEXT_PUBLIC_* 必须在 build 时注入**：`NEXT_PUBLIC_BASE_PATH` 会被内联到客户端 bundle，运行时改无效。Dockerfile 在 `npm run build` 之前 `ENV NEXT_PUBLIC_BASE_PATH=/hotwriter` 保证注入。

> ⚠️ **容器视角的 DATABASE_URL**：容器用 `--network host` 模式时，host 写 `127.0.0.1`（容器看到的 localhost = 宿主）；不用 `--network host` 时改写 `host.docker.internal` 或宿主内网 IP。

### 8.3 本地开发命令

```bash
# 安装依赖
npm install

# 开发
npm run dev          # http://localhost:3000/hotwriter

# 类型检查
npx tsc --noEmit
```

数据库 schema 在应用首次启动时自动建库 + 建表（`ensureDatabaseAndSchema()` 触发），**无需手动 migrate**。

### 8.4 生产部署（Docker 一键脚本）

```bash
# 必填：本地 export 两个密钥（不入 git；可放进 ~/.bashrc）
export HOTWRITER_DEEPSEEK_KEY=sk-xxxxxxxxxx
export HOTWRITER_DB_PASSWORD='<your-mysql-password>'   # 明文，脚本会自动 URL-encode
# 可选：export HOTWRITER_TAVILY_KEY=tvly-xxxxx

bash scripts/deploy.sh
```

脚本流程（详见 [scripts/deploy.sh](scripts/deploy.sh)）：

1. 检查 `HOTWRITER_DEEPSEEK_KEY` / `HOTWRITER_DB_PASSWORD` 是否已 export（缺失则 fail-fast）
2. URL-encode 数据库密码（处理 `# @ / : ? & + =` 等保留字符）
3. 本地 tar 打包源码（排除 `node_modules`、`.next`、`.git`、本地 `.env`、临时调试脚本）
4. 本地构造运行时 `.env`（含已 encode 的密码）→ scp 到 `180:/root/hotwriter/.env`
5. scp 源码包 → SSH 远程执行：
   - 清理 `/root/hotwriter/`（保留 uploads/、备份旧 SQLite 文件以防回滚）
   - 解压新源码
   - 停旧容器 + 把旧 image 重 tag 为 `hotwriter:rollback`（保留一份回滚镜像）
   - `docker build -t hotwriter:latest .` → `docker run -d --name hotwriter --restart unless-stopped --network host -e PORT=3010 --env-file .env -v /root/hotwriter/uploads:/app/public/uploads hotwriter:latest`
6. 等 8 秒 → 看启动日志
7. `curl` 验证容器内 API

> 🔐 密钥只在两个地方存在：你本地 shell 环境 + 服务器上的 `/root/hotwriter/.env`（建议 `chmod 600`）。**永远不入 git**。

### 8.5 nginx 反代（180 原生 nginx）

在 `/usr/local/nginx/conf/nginx.conf` 的 `www.gydblog.com`（443 ssl）server 块内：

```nginx
# hotWriter：Next.js SSR + SSE。注意 location 末尾无斜杠——
# 带斜杠会触发 nginx 的"目录自动 301"，与 Next.js trailingSlash=false 的 308 形成重定向死循环。
location /hotwriter {
    proxy_pass http://127.0.0.1:3010;   # 末尾无斜杠，保留 /hotwriter 前缀传给 Next.js basePath
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;

    # SSE 友好（research / chat / auto-write 流式输出必需）
    proxy_http_version 1.1;
    proxy_set_header Connection "";
    proxy_buffering off;
    proxy_cache off;
    proxy_read_timeout 600s;
    proxy_send_timeout 600s;

    # 图片上传（编辑器拖拽/粘贴，上限 5MB）
    client_max_body_size 20m;
}
```

外部访问：**https://www.gydblog.com/hotwriter**

修改后 `/usr/local/nginx/sbin/nginx -t && /usr/local/nginx/sbin/nginx -s reload`。

### 8.6 关键路径踩坑（不再犯）

| 陷阱 | 表现 | 解法 |
|------|------|------|
| **nginx location 带尾斜杠** | `/hotwriter` ↔ `/hotwriter/` 301 ↔ 308 死循环 | `location /hotwriter` 末尾**不加斜杠**，前缀匹配同时覆盖 `/hotwriter` 与 `/hotwriter/*` |
| **proxy_pass 末尾加斜杠** | Next.js 收到剥掉前缀的 `/`，全站 404 | `proxy_pass http://127.0.0.1:3010;` 末尾**无斜杠**（保留 `/hotwriter/` 前缀给 basePath）|
| **漏 proxy_buffering off** | SSE 卡顿/断流，前端 EventSource 等到 timeout | 必须显式 `proxy_buffering off; proxy_http_version 1.1; proxy_set_header Connection "";` |
| **NEXT_PUBLIC_BASE_PATH 运行时改** | 客户端 `<Link>` 指向错误路径 | 必须在 `docker build` 阶段 `ENV NEXT_PUBLIC_BASE_PATH=/hotwriter`，build 时内联 |
| **容器 DATABASE_URL host 写错** | 容器内连不上 MySQL | `--network host` 模式下 host 写 `127.0.0.1`（不是 `47.111.1.180`）|
| **密码 `#` 没 URL-encode** | URL fragment 截断，连接串断成 `mysql://root:` | `#` → `%23`，所有 URL 保留字符同理 |

---

## 9. 已知坑与修复模式

详见 `~/.claude/projects/-Users-zhaoyuanguang-articleWriting/memory/`：

| 问题 | 根因 | 修复 |
|------|------|------|
| 调研提示提前显示 | React Strict Mode 双 useEffect | `startedRef` 锁 + AbortController + finished flag |
| LLM MAX_ROUNDS 跑完仍不输出 JSON | LLM 陷入死循环 | 主循环后 `tool_choice:"none"` 强制收敛 |
| LLM 幻觉（"股王"→ 默认茅台） | 短关键词触发先验 | 透传 sourceUrl + force fetch_url |
| SSE 双调用 | （历史问题，已修）| — |
| 模板字符串嵌套转义反引号解析失败 | webpack/SWC bug | 改用数组 + join 拼接 |
| dev server 因 `.next/cache` 损坏卡住 | 编译错误时缓存污染 | 修完代码 + 清缓存 + 重启 |
| 标题"修改于 时间"撑满 | header 横跨整个屏幕 | 标题 + 字数移到左列顶部 |
| AI 改写直接替换丢失原内容 | 设计缺陷 | 改为预览窗口模式 |
| 复制按钮丢失格式 | `replace(/<[^>]+>/g, "")` 剥光 HTML | 双格式 ClipboardItem（HTML + text）|
| 下载按钮丢失格式 | 同上 | turndown 转换 |
| 气泡菜单按钮文字断行 | 容器宽度限制 + `flex-wrap` | `whitespace-nowrap shrink-0` |
| 阿里云 MySQL 分支不支持 `CREATE INDEX IF NOT EXISTS` | 部署后 `ensureSchema` 报语法错 | 改用裸 `CREATE INDEX` + try/catch 忽略 `ER_DUP_KEYNAME (1061)` |
| 热门"一键写" 404 | `<a href="/research">` 不走 Next.js basePath | 改用 `<Link>` 组件，自动拼 `/hotwriter/research` |
| 生产 `/hotwriter` 重定向多次（ERR_TOO_MANY_REDIRECTS）| nginx `location /hotwriter/`（带斜杠）触发自动目录 301 + Next.js trailingSlash=false 308 → 死循环 | `location /hotwriter`（**无尾斜杠**），同时覆盖 `/hotwriter` 与 `/hotwriter/*` |
| `mysql2` 连接池长连接断开 | 阿里云 wait_timeout 默认 8h，但偶发 idle disconnect | 池配置 `enableKeepAlive: true`，每次 `getConnection()` 后立即用完 `release()` |

---

## 10. 性能与限制

| 维度 | 当前 | 备注 |
|------|------|------|
| 文章字数 | 无硬限制 | 但 prompt 上限 8000 字 |
| AI 单次改写 | 选区 ≤ 5000 字 | 后端硬限制 |
| 调研会话 | 8 轮工具调用 | MAX_ROUNDS |
| 历史热点 | 200 条 / 平台 | 24h 去重 |
| 数据库 | MySQL 8.0 远端实例 | 与 OnePlatform 共用 `47.111.1.180:3306` |
| 并发 | 单进程 Next.js | 适合个人用 |

---

## 11. 未来可优化

- [ ] 测试覆盖（vitest + playwright）
- [ ] 多文章系列（`series_id` 已预留）
- [ ] 模板系统（爆款模板复用）
- [ ] 数据导出（ZIP 打包文章 + 图片）
- [ ] 移动端优化（当前主要 PC）
- [ ] 多用户系统（加 auth）
- [ ] 实时协作（OT / CRDT）

---

## 附录：常用脚本

```bash
# 进入 180 MySQL
mysql -h 47.111.1.180 -uroot -p db_hotwriter

# 看最近文章
mysql -h 47.111.1.180 -uroot -p db_hotwriter \
  -e "SELECT id, title, word_count, status, FROM_UNIXTIME(updated_at) FROM articles ORDER BY updated_at DESC LIMIT 5;"

# 看用量统计
mysql -h 47.111.1.180 -uroot -p db_hotwriter \
  -e "SELECT action, COUNT(*) AS cnt, SUM(cost_cny) AS cost FROM usage_logs GROUP BY action;"

# 看最近调研
mysql -h 47.111.1.180 -uroot -p db_hotwriter \
  -e "SELECT id, keyword, total_cost_cny, tool_call_count, FROM_UNIXTIME(created_at) FROM research_sessions ORDER BY created_at DESC LIMIT 5;"

# 备份全库
mysqldump -h 47.111.1.180 -uroot -p db_hotwriter > backup.sql

# 服务器上查容器日志
ssh -i ~/.ssh/id_gyd root@47.111.1.180 "docker logs hotwriter --tail 100 -f"

# 重启容器
ssh -i ~/.ssh/id_gyd root@47.111.1.180 "docker restart hotwriter"

# 回滚到上一版 image（deploy.sh 已保留 hotwriter:rollback）
ssh -i ~/.ssh/id_gyd root@47.111.1.180 \
  "docker rm -f hotwriter && docker tag hotwriter:rollback hotwriter:latest && docker run -d --name hotwriter --restart unless-stopped --network host -e PORT=3010 --env-file /root/hotwriter/.env -v /root/hotwriter/uploads:/app/public/uploads hotwriter:latest"
```