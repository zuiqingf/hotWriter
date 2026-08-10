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
- **个人页**（`/profile`）：账号设置

### 1.2 核心能力

| 能力 | 实现 |
|------|------|
| 热点抓取 | 4 平台 HTML 解析 + 第三方聚合站 |
| 智能调研 | DeepSeek Agent + Tavily 搜索 + 多工具调用 |
| 富文本编辑 | Tiptap（ProseMirror）+ 斜杠菜单 / 气泡工具栏 |
| AI 写作 | 整篇自动写 + 选区润色/扩写/缩写/改语气/翻译 |
| 合规校验 | 内置 4 平台规则库 + LLM 严格审查 |
| 多平台适配 | 知乎 / 小红书 / 头条 / 公众号 风格重写 |

---

## 2. 技术栈

| 层 | 选型 | 理由 |
|----|------|------|
| **框架** | Next.js 14.2 App Router | RSC + 路由约定 + 内置 API Routes |
| **语言** | TypeScript 5.7 | 类型安全 |
| **UI** | React 18.3 + Tailwind 3.4 | 极简 className 体系 |
| **LLM** | DeepSeek API（OpenAI 兼容）| 国产、价格低、中文好 |
| **搜索** | Tavily API | AI 友好的网页搜索 |
| **数据库** | node:sqlite（Node 22 内置） | 零依赖、单文件、本地用 |
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
├── data/
│   └── hotwriter.db              # SQLite 数据库（自动创建）
├── public/
│   └── uploads/                  # 用户上传图片（按 YYYYMM 分目录）
├── src/
│   ├── app/
│   │   ├── api/                  # 后端 API Routes
│   │   │   ├── articles/         # 单文章 CRUD + chat + auto-write + ai-edit + check-compliance
│   │   │   ├── hot/              # 热搜抓取
│   │   │   ├── research/         # 关键词调研
│   │   │   └── upload/           # 图片上传
│   │   ├── research/             # 调研结果页
│   │   ├── write/[id]/           # 工作台（双栏）
│   │   ├── library/              # 文章库
│   │   ├── profile/              # 个人中心
│   │   ├── layout.tsx
│   │   ├── page.tsx              # 首页
│   │   └── globals.css
│   ├── components/
│   │   ├── RichEditor.tsx        # Tiptap 编辑器（440 行）
│   │   ├── Markdown.tsx          # 简单 Markdown 渲染（只读场景）
│   │   ├── Toast.tsx             # Toast 提示系统
│   │   └── home/                 # 首页相关
│   │       ├── HeroSearch.tsx
│   │       └── HotList.tsx
│   ├── lib/
│   │   ├── db/                   # 数据库封装
│   │   ├── llm/                  # LLM Agent + Prompt
│   │   ├── hot/                  # 热搜抓取 + 关键词提炼
│   │   ├── search/               # Tavily / 知乎 / 小红书 搜索封装
│   │   ├── cost/                 # 用量统计
│   │   ├── editor/tippy.ts       # 极简 tippy 实现
│   │   ├── markdown.ts           # MD ↔ HTML 转换
│   │   └── utils.ts              # 时间格式化、字数统计等
│   └── middleware.ts             # （空，预留）
├── package.json
├── tailwind.config.ts
├── next.config.js
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
  
  // 执行工具调用（web_search / fetch_url / search_zhihu / search_xiaohongshu）
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

`node:sqlite` 极简封装：

```ts
const db = {
  all<T>(sql, params): T[],          // SELECT 多行
  get<T>(sql, params): T | undefined, // SELECT 单行
  run(sql, params): { changes, lastInsertRowid }, // INSERT/UPDATE/DELETE
};
```

**Singleton**：用 `globalThis._db` 防止 Next.js dev 热重载多连接。

**迁移策略**：`CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ... ADD COLUMN`（用 try/catch 兼容旧库）。

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

`articles` / `article_versions` / `chat_messages` / `research_sessions` / `hot_topics` / `usage_logs` 共 6 张表。

### articles

```sql
CREATE TABLE articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  uuid TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  content TEXT DEFAULT '',         -- HTML（Markdown 旧数据加载时 on-the-fly 转）
  source_type TEXT,                -- 'hot' | 'keyword'
  source_ref TEXT,                 -- 关键词 或 热点 URL
  direction_index INTEGER,
  style TEXT,                       -- '深度观点' | '科普' | '故事' | '短评'
  series_id INTEGER,                -- 预留：系列文
  word_count INTEGER DEFAULT 0,
  status TEXT DEFAULT 'draft',      -- 'draft' | 'archived' | 'deleted'
  tags TEXT,                        -- JSON array
  metadata TEXT,                    -- JSON {sourceUrl, ...}
  user_id INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (unixepoch()),
  updated_at INTEGER NOT NULL DEFAULT (unixepoch())
);
```

### research_sessions

```sql
CREATE TABLE research_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  keyword TEXT NOT NULL,
  user_input TEXT,
  research_log TEXT,                -- JSON: AgentStep[] (用于事后调试)
  directions TEXT,                 -- JSON: Direction[]
  article_id INTEGER REFERENCES articles(id) ON DELETE SET NULL,
  chosen_direction INTEGER,
  total_cost_cny TEXT,
  tool_call_count INTEGER DEFAULT 0,
  model TEXT,
  source_url TEXT,                  -- 原文 URL（防幻觉用）
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
```

### chat_messages

```sql
CREATE TABLE chat_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_id INTEGER NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  role TEXT NOT NULL,                -- 'user' | 'assistant' | 'event' | 'system'
  content TEXT NOT NULL,
  tokens_used INTEGER,
  cost_cny TEXT,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
```

### hot_topics

```sql
CREATE TABLE hot_topics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  source TEXT NOT NULL,              -- 'thepaper' | 'toutiao' | 'baidu' | 'douyin'
  url TEXT,
  external_id TEXT,
  hot_score INTEGER,
  category TEXT,
  summary TEXT,
  event_group_id TEXT,
  fetched_at INTEGER NOT NULL DEFAULT (unixepoch()),
  expired_at INTEGER
);
```

### usage_logs

```sql
CREATE TABLE usage_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,              -- 'research' | 'write' | 'ai_edit' | 'check_compliance'
  model TEXT,
  tokens_input INTEGER,
  tokens_output INTEGER,
  cost_cny TEXT,
  duration_ms INTEGER,
  article_id INTEGER,
  session_id INTEGER,
  created_at INTEGER NOT NULL DEFAULT (unixepoch())
);
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

- Node.js 22+（`node:sqlite` 需要）
- Tavily API Key（可选，无 key 降级到 LLM 自有知识）
- DeepSeek API Key（**必填**）

### 8.2 环境变量

```bash
# .env
DEEPSEEK_API_KEY=sk-xxxxxxxxxx
TAVILY_API_KEY=tvly-xxxxxxxxxx
# DATABASE_URL=file:./data/hotwriter.db   # 可选，默认在 ./data/
```

### 8.3 命令

```bash
# 安装依赖
npm install

# 数据库初始化（首次）
npm run db:migrate

# 开发
npm run dev          # http://localhost:3000

# 构建 + 启动
npm run build
npm start
```

### 8.4 端口冲突

如果 3000-3004 都被占用，dev 会自动跳到 3005+。建议：

```bash
PORT=4000 npm run dev
```

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

---

## 10. 性能与限制

| 维度 | 当前 | 备注 |
|------|------|------|
| 文章字数 | 无硬限制 | 但 prompt 上限 8000 字 |
| AI 单次改写 | 选区 ≤ 5000 字 | 后端硬限制 |
| 调研会话 | 8 轮工具调用 | MAX_ROUNDS |
| 历史热点 | 200 条 / 平台 | 24h 去重 |
| 数据库 | SQLite 单文件 | 适合个人，不适合多人 |
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
# 看数据库
sqlite3 data/hotwriter.db "SELECT id, title, word_count FROM articles ORDER BY updated_at DESC LIMIT 5;"

# 看用量统计
sqlite3 data/hotwriter.db "SELECT action, COUNT(*), SUM(cost_cny) FROM usage_logs GROUP BY action;"

# 看最近调研
sqlite3 data/hotwriter.db "SELECT id, keyword, total_cost_cny, tool_call_count FROM research_sessions ORDER BY created_at DESC LIMIT 5;"
```