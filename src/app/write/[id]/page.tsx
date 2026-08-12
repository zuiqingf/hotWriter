"use client";

import { useEffect, useState, useRef } from "react";
import { flushSync } from "react-dom";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Markdown } from "@/components/Markdown";
import { RichEditor, RichEditorHandle } from "@/components/RichEditor";
import { ResearchPanel, Direction } from "@/components/write/ResearchPanel";
import { normalizeToHtml, mdToHtml } from "@/lib/markdown";
import { formatTimeAgo, countWords, apiUrl } from "@/lib/utils";
import { useToasts, ToastViewport } from "@/components/Toast";
import TurndownService from "turndown";

interface Article {
  id: number;
  title: string;
  content: string;
  style: string | null;
  wordCount: number | null;
  status: string;
  sourceType: string | null;
  sourceRef: string | null;
  directionIndex: number | null;
  updatedAt: number;
}

interface ChatMsg {
  id?: number;
  role: "user" | "assistant" | "system" | "event";
  content: string;
  /** event 类型专用：表示 Agent 内部状态事件 */
  eventType?: "write_start" | "write_done" | "write_error" | "info";
}

export default function WritePage() {
  const params = useParams();
  const id = parseInt(params.id as string);
  const router = useRouter();

  const [article, setArticle] = useState<Article | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  // 调研详情（用于对话区顶部可折叠面板）
  const [researchKeyword, setResearchKeyword] = useState<string>("");
  const [researchDirection, setResearchDirection] = useState<Direction | null>(null);
  const [researchDirectionIndex, setResearchDirectionIndex] = useState<number | null>(null);
  const [researchTotalDirections, setResearchTotalDirections] = useState<number>(0);
  const [saving, setSaving] = useState(false);
  const [aiInput, setAiInput] = useState("");
  const [aiStreaming, setAiStreaming] = useState(false);
  // 给 AI 改写用的上下文（标题 + 文章开头）
  const articleContext = title
    ? `标题：${title}\n\n文章开头（前 300 字）：${content.replace(/<[^>]+>/g, "").slice(0, 300)}`
    : "";
  // ========= Agent 自动写（仅 loadArticle 首次初始化用） =========
  const [autoWriting, setAutoWriting] = useState(false);
  const autoStartedRef = useRef(false);
  // ========= 右侧编辑器显隐（默认隐藏，用户点击编辑或自动写完成后才显示） =========
  const [editorVisible, setEditorVisible] = useState(false);

  // 复制状态（用于按钮反馈）
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const copiedTimerRef = useRef<NodeJS.Timeout | null>(null);
  // 编辑应用状态（用于按钮反馈）
  const [editedKey, setEditedKey] = useState<string | null>(null);
  const editedTimerRef = useRef<NodeJS.Timeout | null>(null);
  // 编辑器顶部"更多"和"AI 快捷"下拉
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [aiShortcutOpen, setAiShortcutOpen] = useState(false);
  // Toast 提示
  const { toasts, showToast } = useToasts();
  // 当前校验/发布的平台（影响一键校验的目标平台）
  const [currentPlatform, setCurrentPlatform] = useState<"zhihu" | "xiaohongshu" | "toutiao" | "wechat">("wechat");
  const [platformMenuOpen, setPlatformMenuOpen] = useState(false);
  // 校验结果 + 校验中 loading
  const [checking, setChecking] = useState(false);
  const [complianceResult, setComplianceResult] = useState<null | {
    platform: string;
    platformName: string;
    overall: "pass" | "warning" | "violation";
    score: number;
    summary: string;
    violations: Array<{
      type: string;
      text?: string;
      rule: string;
      severity?: string;
      fix?: string;            // 修复后的版本
      suggestion?: string;     // 怎么改
    }>;
    warnings: Array<{ type: string; text?: string; rule: string; suggestion?: string }>;
    suggestions: string[];
  }>(null);
  // 校验面板拖动位置（null = 居中）
  const [panelPos, setPanelPos] = useState<{ x: number; y: number } | null>(null);
  const dragRef = useRef<{ startX: number; startY: number; baseX: number; baseY: number } | null>(null);
  // 已应用的 fix 标记（key = v.text）
  const [appliedFixes, setAppliedFixes] = useState<Set<string>>(new Set());

  const debounceRef = useRef<NodeJS.Timeout>();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  // 富文本编辑器 ref（用于 AI 流式写入时主动 setContent）
  const editorRef = useRef<RichEditorHandle>(null);
  // 自动写完成后跳过下一次 debounce save（避免与 server 端 auto_write 版本重复）
  const skipNextSaveRef = useRef(false);
  // 注：assistant 流式气泡定位在 runAutoWrite / sendChatMessage 内
  // 直接用 findLastIndex(m => m.role === "assistant") 自包含找——不要存 ref
  // （React 18 batching 下 ref.current = N 不保证同步，下一个 delta 事件可能读到旧值）

  // 初始加载
  useEffect(() => {
    if (!id) return;
    loadArticle();
    // eslint-disable-next-line
  }, [id]);

  // AI 消息自动滚到底
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function loadArticle() {
    try {
      const res = await fetch(apiUrl(`/api/articles/${id}`));
      if (!res.ok) throw new Error("文章不存在");
      const data = await res.json();
      const a = data.article;
      setArticle(a);
      setTitle(a.title);

      // 提取调研 session（用于"调研详情"面板）
      const session = data.researchSession;
      if (session) {
        setResearchKeyword(session.keyword || "");
        setResearchDirection(session.selectedDirection || null);
        setResearchDirectionIndex(a.directionIndex ?? null);
        setResearchTotalDirections((session.directions || []).length);
      } else {
        setResearchKeyword("");
        setResearchDirection(null);
        setResearchDirectionIndex(null);
        setResearchTotalDirections(0);
      }
      // 老文章 DB 里可能存的是 markdown，统一转 HTML 给 Tiptap
      setContent(normalizeToHtml(a.content || ""));
      // 归一化：DB 里持久化的 event 消息没有 eventType 字段，按 content 前缀推断
      // （保证历史对话气泡重新进入页面时仍能正确显示）
      setMessages(
        (data.messages || []).map((m: any) => {
          if (m.role !== "event") return m;
          if (m.eventType) return m;   // 内存态已经有 eventType（当次会话）
          if (typeof m.content === "string") {
            if (m.content.startsWith("✅")) return { ...m, eventType: "write_done" };
            if (m.content.startsWith("❌")) return { ...m, eventType: "write_error" };
            if (m.content.startsWith("✨")) return { ...m, eventType: "write_start" };
          }
          return m;
        })
      );

      // 进入页面后，若有方向 + 内容空 → 自动让 Agent 写
      const hasDirection =
        a.directionIndex !== null && a.directionIndex !== undefined;
      const isEmpty = !a.content || a.content.trim() === "";
      if (hasDirection && isEmpty && !autoStartedRef.current) {
        autoStartedRef.current = true;
        setTimeout(() => runAutoWrite(), 100);
      } else if (!isEmpty) {
        // 已有内容的文章：默认展开右侧编辑器（不然用户看不到自己/Agent 写的正文）
        setEditorVisible(true);
      }
    } catch (err: any) {
      alert(err.message);
      router.push("/library");
    }
  }

  /** 复制 AI 消息（markdown 文本）到剪贴板
   *  - text/plain = markdown 原文本（给 Notion/Typora 看）
   *  - text/html   = markdown 转 HTML（给公众号/小红书编辑器看）
   *  按钮反馈 1.5 秒
   */
  async function copyText(text: string, key: string) {
    if (!text) return;
    let html = "";
    try {
      html = mdToHtml(text);
    } catch {
      html = "";
    }

    // 优先 ClipboardItem 双格式
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write && html) {
      try {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([html], { type: "text/html" }),
            "text/plain": new Blob([text], { type: "text/plain" }),
          }),
        ]);
        setCopiedKey(key);
        if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
        copiedTimerRef.current = setTimeout(() => setCopiedKey(null), 1500);
        return;
      } catch {
        // 降级
      }
    }

    try {
      await navigator.clipboard.writeText(text);
    } catch (err) {
      // 兜底：document.execCommand 路径
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
      } catch (err2: any) {
        alert("复制失败：" + (err2.message || err.message));
        return;
      }
    }
    setCopiedKey(key);
    if (copiedTimerRef.current) clearTimeout(copiedTimerRef.current);
    copiedTimerRef.current = setTimeout(() => setCopiedKey(null), 1500);
  }

  /** Agent 自动写：仅 loadArticle 首次进入页面时调用（新建文章 + 内容空时）。
   *  内容直接 stream 到对话流的 assistant 气泡（像 chat 那样），不折叠预览。
   *  后续"换个风格"按钮走对话模式，不直接覆盖正文。
   */
  async function runAutoWrite() {
    if (autoWriting) return;
    setAutoWriting(true);
    const actionLabel = "✨ Agent 写作";

    // 占位：先插一条 write_start event + 一个空 assistant 气泡
    // 不需要 ref 记位置——delta 分支会用 findLastIndex 自包含定位
    // flushSync 强制同步落 state，避免 React 18 batching 让 fetch 后第一个 delta 看不到占位
    flushSync(() => {
      setMessages((prev) => [
        ...prev,
        {
          role: "event",
          eventType: "write_start",
          content: `${actionLabel}\n按调研方向生成全文...`,
        },
        { role: "assistant", content: "" },
      ]);
      setContent(""); // 清空正文区
    });

    try {
      const res = await fetch(apiUrl(`/api/articles/${id}/auto-write`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (!res.ok || !res.body) throw new Error("Agent 启动失败");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        for (const ev of events) {
          const m = ev.match(/^event: (.+)\ndata: (.+)$/s);
          if (!m) continue;
          const [, event, dataJson] = m;
          try {
            const data = JSON.parse(dataJson);
            if (event === "start") {
              setMessages((prev) => {
                const copy = [...prev];
                // 更新 write_start 详情
                const startIdx = copy.findIndex(
                  (msg) => msg.role === "event" && msg.eventType === "write_start"
                );
                if (startIdx >= 0) {
                  copy[startIdx] = {
                    role: "event",
                    eventType: "write_start",
                    content: `${actionLabel}\n📐 方向：${data.direction ?? "推荐"}\n🎨 风格：${data.style ?? "默认"}\n📊 字数目标：约 ${data.wordCount ?? 1500} 字`,
                  };
                }
                return copy;
              });
            } else if (event === "delta") {
              accumulated += data.text;
              // AI 输出的是 Markdown，转 HTML 给 Tiptap 编辑器
              setContent(mdToHtml(accumulated));
              // 直接 stream 到 assistant 气泡（用户能看到 AI 实时在写）
              // 自包含定位：手动倒序找最近的 assistant 气泡（避免 React 18 batching 下 ref 不同步；
              // 也不用 findLastIndex，老 Safari/部分移动浏览器可能没 polyfill）
              setMessages((prev) => {
                const copy = [...prev];
                let idx = -1;
                for (let i = copy.length - 1; i >= 0; i--) {
                  if (copy[i].role === "assistant") { idx = i; break; }
                }
                if (idx >= 0) {
                  copy[idx] = {
                    role: "assistant",
                    content: accumulated,
                  };
                }
                return copy;
              });
            } else if (event === "complete") {
              // 把 write_start 改成 write_done 提示，不插新消息（assistant 气泡已经显示全文）
              setMessages((prev) => {
                const copy = [...prev];
                const startIdx = copy.findIndex(
                  (msg) => msg.role === "event" && msg.eventType === "write_start"
                );
                if (startIdx >= 0) {
                  copy[startIdx] = {
                    role: "event",
                    eventType: "write_done",
                    content: `✅ 已生成 ${accumulated.length} 字 · 已保存到数据库`,
                  };
                }
                return copy;
              });
              // 自动写完成后展开右侧编辑器（与点击编辑按钮行为一致）
              setEditorVisible(true);
              // 跳过下一次 debounce save：server 端 logAutoWriteVersion 已经把这次结果存为版本了
              skipNextSaveRef.current = true;
            } else if (event === "error") {
              throw new Error(data.message);
            }
          } catch {}
        }
      }
    } catch (err: any) {
      console.error("Agent 自动写失败:", err);
      setMessages((prev) => [
        ...prev,
        {
          role: "event",
          eventType: "write_error",
          content: `❌ ${actionLabel}失败：${err.message}\n试试在下方输入框给 AI 说指令。`,
        },
      ]);
    } finally {
      setAutoWriting(false);
    }
  }

  // 自动保存（debounce 1.5s）
  useEffect(() => {
    if (!article) return;
    // 自动写完成后的第一次 content 变化已由 server 端 logAutoWriteVersion 存为版本，跳过
    if (skipNextSaveRef.current) {
      skipNextSaveRef.current = false;
      return;
    }
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      saveArticle();
    }, 1500);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, content]);

  async function saveArticle() {
    if (!article) return;
    setSaving(true);
    try {
      await fetch(apiUrl(`/api/articles/${id}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content }),
      });
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  }

  /** 通用：向 chat API 发一条消息并流式追加到对话流 */
  async function sendChatMessage(userInput: string) {
    if (!userInput.trim() || aiStreaming) return;

    const userMsg: ChatMsg = { role: "user", content: userInput };
    setMessages((prev) => [...prev, userMsg]);
    setAiStreaming(true);

    const aiPlaceholder: ChatMsg = { role: "assistant", content: "" };
    setMessages((prev) => [...prev, aiPlaceholder]);

    try {
      const response = await fetch(apiUrl(`/api/articles/${id}/chat`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userInput }),
      });
      if (!response.body) throw new Error("无响应");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullReply = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";

        for (const ev of events) {
          const m = ev.match(/^event: (.+)\ndata: (.+)$/s);
          if (!m) continue;
          const [, event, dataJson] = m;
          try {
            const data = JSON.parse(dataJson);
            if (event === "delta") {
              fullReply += data.text;
              setMessages((prev) => {
                const copy = [...prev];
                // 自包含定位：findLastIndex 找最近的 assistant 气泡（与 runAutoWrite 一致）
                const idx = copy.findLastIndex((m) => m.role === "assistant");
                if (idx >= 0) {
                  copy[idx] = { role: "assistant", content: fullReply };
                }
                return copy;
              });
            } else if (event === "error") {
              throw new Error(data.message);
            }
          } catch {}
        }
      }
    } catch (err: any) {
      setMessages((prev) => {
        const copy = [...prev];
        const idx = copy.findLastIndex((m) => m.role === "assistant");
        if (idx >= 0) {
          copy[idx] = { role: "assistant", content: `❌ 错误：${err.message}` };
        }
        return copy;
      });
    } finally {
      setAiStreaming(false);
    }
  }

  /** 输入框发送：包一层处理 e */
  async function handleAISend(e: React.FormEvent) {
    e.preventDefault();
    const text = aiInput.trim();
    if (!text) return;
    setAiInput("");
    await sendChatMessage(text);
  }

  /** "换个风格"按钮：走对话模式，不直接覆盖正文。
   *  用户在对话流里看到 AI 的版本后，可以用对话气泡上的「📌 应用到正文」按钮覆盖。
   */
  const REWRITE_PROMPTS: Record<string, string> = {
    zhihu: "请基于当前文章内容，按**知乎风格**重写一版。要求：专业深度、有理有据、1500-2500 字；标题用知乎公式（'2026 年的 X：这 N 个 Y'）；开篇点明结论；文末加'本文由 AI 辅助生成'。直接输出完整 markdown，不要解释。",
    xiaohongshu: "请基于当前文章内容，按**小红书风格**重写一版。要求：口语化 + emoji 排版、800-1500 字；标题用小红书公式（数字/痛点/惊喜词：'X 个 Y / 看完我悟了'）；段落短（每段 ≤3 行）；结尾互动钩子（'你觉得呢' / '收藏备用'）；加'AI 生成'标注。直接输出完整 markdown。",
    toutiao: "请基于当前文章内容，按**今日头条风格**重写一版。要求：开头抓眼（前 3 句必有数据/事件/冲突）、1200-1800 字；标题 18-25 字有信息增量；正文结构'现象 → 数据 → 原因 → 影响 → 启示'；严禁标题党/极限词/连续感叹号；末尾'本文由 AI 辅助生成'。直接输出完整 markdown。",
    wechat: "请基于当前文章内容，按**微信公众号风格**重写一版。要求：长文 1500-3000 字；**开头第一段必须含'AI 辅助创作'标识**；完读率优先，段落 ≤300 字；可用加粗/引用/分割线；严禁诱导分享/关注/集赞；结尾自然提问（'你怎么看'）而非诱导。直接输出完整 markdown。",
  };

  // ========= 编辑器头部动作 =========
  // 复制正文（同时写 text/plain=markdown 和 text/html=富文本）
  // 这样粘贴到：Notion/Typora 看 markdown，公众号/小红书编辑器看 HTML 渲染
  async function handleCopyContent() {
    if (!content || !content.trim()) {
      showToast("内容为空", "error");
      return;
    }

    // 转 markdown（给 markdown-aware 平台）
    let md = "";
    try {
      md = getTurndown().turndown(content);
    } catch {
      md = content.replace(/<[^>]+>/g, "").trim();
    }

    // 优先用 ClipboardItem 同时写两种格式（部分浏览器可能不支持，降级到纯文本）
    if (typeof ClipboardItem !== "undefined" && navigator.clipboard?.write) {
      try {
        await navigator.clipboard.write([
          new ClipboardItem({
            "text/html": new Blob([content], { type: "text/html" }),
            "text/plain": new Blob([md], { type: "text/plain" }),
          }),
        ]);
        showToast("已复制（保留格式，可粘贴到任意编辑器）", "success");
        return;
      } catch {
        // 降级到纯文本
      }
    }

    try {
      await navigator.clipboard.writeText(md);
      showToast("已复制到剪贴板", "success");
    } catch (err: any) {
      showToast("复制失败：" + err.message, "error");
    }
  }

  // 下载正文（markdown，保留 h1/h2/列表/粗体/代码块 等所有格式）
  // 用 turndown（业界标准 HTML→MD 转换器）把富文本 HTML 还原成 markdown
  const turndownRef = useRef<TurndownService | null>(null);
  function getTurndown() {
    if (!turndownRef.current) {
      const td = new TurndownService({
        headingStyle: "atx",        // # h1, ## h2
        codeBlockStyle: "fenced",   // ```code```
        bulletListMarker: "-",      // - item
        emDelimiter: "*",           // *italic*
        strongDelimiter: "**",      // **bold**
        linkStyle: "inlined",       // [text](url)
      });
      // 自定义：图片保留 alt
      td.addRule("imageAlt", {
        filter: "img",
        replacement: (_content, node) => {
          const src = (node as any).getAttribute?.("src") ?? "";
          const alt = (node as any).getAttribute?.("alt") ?? "";
          return src ? `![${alt}](${src})` : "";
        },
      });
      turndownRef.current = td;
    }
    return turndownRef.current;
  }

  function handleDownload() {
    if (!content || !content.trim()) {
      showToast("内容为空", "error");
      return;
    }
    let md = "";
    try {
      md = getTurndown().turndown(content);
    } catch (err: any) {
      // 兜底：万一 turndown 挂了，至少剥 HTML 输出纯文本
      md = content.replace(/<[^>]+>/g, "").replace(/\n{3,}/g, "\n\n").trim();
      showToast(`转换降级：${err.message}`, "info");
    }
    if (!md.trim()) {
      showToast("内容为空", "error");
      return;
    }

    const safeTitle = (title || "未命名").replace(/[\\/:*?"<>|]/g, "_").slice(0, 50);
    const fullDoc = `# ${title || "未命名"}\n\n${md}\n`;
    const blob = new Blob([fullDoc], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeTitle}.md`;
    a.click();
    URL.revokeObjectURL(url);
    showToast("已下载 .md 文件（含完整格式）", "success");
  }

  // 分享（把当前文章 URL 复制到剪贴板）
  async function handleShare() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      await navigator.clipboard.writeText(url);
      showToast("链接已复制到剪贴板", "success");
    } catch (err: any) {
      showToast("复制链接失败：" + err.message, "error");
    }
  }

  // 清空编辑器
  function handleClear() {
    if (!confirm("确认清空编辑器内容？")) return;
    editorRef.current?.setContent("");
    showToast("编辑器已清空", "info");
  }

  // ========= 一键合规校验 =========
  async function handleCheckCompliance() {
    if (!content || !content.trim()) {
      showToast("内容为空，无法校验", "error");
      return;
    }
    if (checking) return;
    setChecking(true);
    setComplianceResult(null);
    setPanelPos(null);   // 每次重新校验都重置位置
    try {
      const res = await fetch(apiUrl(`/api/articles/${article?.id}/check-compliance`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content, platform: currentPlatform }),
      });
      const data = await res.json();
      if (!res.ok) {
        showToast(data.error || "校验失败", "error");
        return;
      }
      setComplianceResult(data);
    } catch (err: any) {
      showToast("校验失败：" + err.message, "error");
    } finally {
      setChecking(false);
    }
  }

  // ========= 校验面板拖动 =========
  function handlePanelDragStart(e: React.PointerEvent) {
    // 只允许鼠标左键拖动（避免触屏/右键误触）
    if (e.button !== 0) return;
    e.preventDefault();
    dragRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      baseX: panelPos?.x ?? 0,
      baseY: panelPos?.y ?? 0,
    };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  }

  function handlePanelDragMove(e: React.PointerEvent) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    // 边界限制：留 40px 边距，防止拖出视口
    const MAX_X = Math.max(40, (typeof window !== "undefined" ? window.innerWidth : 1200) - 40);
    const MAX_Y = Math.max(40, (typeof window !== "undefined" ? window.innerHeight : 800) - 40);
    const newX = Math.max(-MAX_X, Math.min(MAX_X, dragRef.current.baseX + dx));
    const newY = Math.max(40, Math.min(MAX_Y - 100, dragRef.current.baseY + dy));
    setPanelPos({ x: newX, y: newY });
  }

  function handlePanelDragEnd(e: React.PointerEvent) {
    if (!dragRef.current) return;
    dragRef.current = null;
    (e.target as HTMLElement).releasePointerCapture?.(e.pointerId);
  }

  function closeCompliance() {
    setComplianceResult(null);
    setPanelPos(null);   // 重置位置
    setAppliedFixes(new Set());   // 重置已应用标记
  }

  // 记录已应用的 fix（用 v.text 作为 key）

  function handleApplyFix(v: { text?: string; fix?: string }) {
    if (!v.text || !v.fix) return;
    const ok = editorRef.current?.applyFixByText(v.text, v.fix) ?? false;
    if (ok) {
      setAppliedFixes((prev) => {
        const next = new Set(prev);
        next.add(v.text!);
        return next;
      });
      showToast("已应用到原文", "success");
    } else {
      showToast("未找到匹配位置，请手动复制后修改", "error");
    }
  }

  async function handleRewrite(platform: "zhihu" | "xiaohongshu" | "toutiao" | "wechat", label: string) {
    const prompt = REWRITE_PROMPTS[platform];
    if (!prompt) return;
    // 先插一条 user 消息（标签），再让 chat API 处理具体 prompt
    // 直接调 sendChatMessage 会再插一条 user 消息（带 prompt），形成两条 user
    // 简化：只用一条 user 消息，标签作为前缀
    await sendChatMessage(`【${label}】\n\n${prompt}`);
  }

  if (!article) {
    return (
      <div className="h-screen flex items-center justify-center bg-white">
        <div className="flex flex-col items-center gap-3 text-gray-400">
          <div className="w-6 h-6 border-2 border-gray-200 border-t-gray-500 rounded-full animate-spin" />
          <span className="text-sm">加载中…</span>
        </div>
      </div>
    );
  }

  const hasContent = (content ?? "").trim().length > 0;

  return (
    <div
      className="flex flex-col bg-white"
      style={{ height: "calc(100vh - 56px)" }}
    >
      {/* ===== 顶部进度条（自动写时显示） ===== */}
      {autoWriting && (
        <div className="absolute top-0 left-0 right-0 h-0.5 z-50 top-progress" />
      )}

      {/* ===== 双栏：左对话 / 右编辑器（默认编辑器隐藏，点击编辑或自动写完成后展开） ===== */}
      <main className="flex-1 flex flex-col md:flex-row-reverse bg-white text-gray-900 overflow-hidden scrollbar-hide">
        {/* ==== 右（DOM 上在前）：富文本编辑器（带过渡动画） ==== */}
        <section
          className={`flex flex-col overflow-hidden transition-all duration-300 ease-in-out
            border-l border-gray-200
            ${editorVisible
              ? "md:w-3/5 opacity-100 max-h-[60vh] md:max-h-none"
              : "md:w-0 opacity-0 max-h-0 md:max-h-0 border-l-0"
            }
          `}
          aria-hidden={!editorVisible}
        >
          {/* 顶部条（豆包式）：修改时间 + 工具按钮 + 收起 */}
          <div className="flex items-center justify-between px-4 h-9 border-b border-gray-100 shrink-0 bg-white">
            {/* 左：修改时间 + 实时字数 */}
            <div className="text-[12px] text-gray-400 flex items-center gap-2">
              <span>
                修改于 {article?.updatedAt ? formatTimeAgo(article.updatedAt * 1000) : ""}
              </span>
              <span className="text-gray-300">·</span>
              <span className="tabular-nums">
                {countWords(content.replace(/<[^>]+>/g, ""))} 字
              </span>
            </div>

            {/* 右：工具按钮组 */}
            <div className="flex items-center gap-0.5">
              {/* Undo */}
              <HeaderIconBtn
                title="撤销 (⌘Z)"
                onClick={() => editorRef.current?.undo?.()}
              >
                <UndoIcon />
              </HeaderIconBtn>
              {/* Redo */}
              <HeaderIconBtn
                title="重做 (⌘⇧Z)"
                onClick={() => editorRef.current?.redo?.()}
              >
                <RedoIcon />
              </HeaderIconBtn>

              <HeaderSep />

              {/* 平台选择器 */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setPlatformMenuOpen((v) => !v)}
                  className="h-7 px-2 rounded text-[12px] text-gray-600 hover:text-gray-900 hover:bg-gray-100 inline-flex items-center gap-1 transition whitespace-nowrap"
                  title="选择校验/发布的目标平台"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                  {PLATFORM_LABELS[currentPlatform]}
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>
                {platformMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setPlatformMenuOpen(false)} />
                    <div className="absolute top-full right-0 mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-36">
                      {(["zhihu", "xiaohongshu", "toutiao", "wechat"] as const).map((p) => (
                        <button
                          key={p}
                          onClick={() => {
                            setCurrentPlatform(p);
                            setPlatformMenuOpen(false);
                          }}
                          className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 transition ${
                            currentPlatform === p
                              ? "bg-blue-50 text-blue-700 font-medium"
                              : "text-gray-700 hover:bg-gray-50"
                          }`}
                        >
                          {currentPlatform === p && (
                            <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M20 6 9 17l-5-5" />
                            </svg>
                          )}
                          {currentPlatform !== p && <span className="w-3 h-3" />}
                          {PLATFORM_LABELS[p]}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* 一键校验 */}
              <HeaderLabelBtn
                title={`检查是否符合${PLATFORM_LABELS[currentPlatform]}平台规范`}
                onClick={handleCheckCompliance}
              >
                {checking ? (
                  <>
                    <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                    </svg>
                    校验中
                  </>
                ) : (
                  <>
                    <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 12l2 2 4-4" />
                      <path d="M21 12c0 4.97-4.03 9-9 9s-9-4.03-9-9 4.03-9 9-9c2.49 0 4.74 1.01 6.36 2.64" />
                    </svg>
                    一键校验
                  </>
                )}
              </HeaderLabelBtn>

              {/* 复制 */}
              <HeaderLabelBtn title="复制正文" onClick={handleCopyContent}>
                <CopyIcon /> 复制
              </HeaderLabelBtn>
              {/* 下载 */}
              <HeaderLabelBtn title="下载 Markdown" onClick={handleDownload}>
                <DownloadIcon /> 下载
              </HeaderLabelBtn>

              {/* 更多：下拉 */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMoreMenuOpen((v) => !v)}
                  className="h-7 px-1.5 rounded text-gray-500 hover:text-gray-900 hover:bg-gray-100 inline-flex items-center"
                  title="更多"
                >
                  <MoreIcon />
                </button>
                {moreMenuOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setMoreMenuOpen(false)} />
                    <div className="absolute top-full right-0 mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-44">
                      <button
                        onClick={() => { setMoreMenuOpen(false); handleClear(); }}
                        className="w-full text-left px-3 py-1.5 text-xs text-red-600 hover:bg-red-50 flex items-center gap-2"
                      >
                        🗑 清空编辑器
                      </button>
                      <div className="border-t border-gray-100 my-1" />
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(content);
                          setMoreMenuOpen(false);
                          alert("已复制 HTML（粘贴到 Notion / 公众号编辑器）");
                        }}
                        className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                      >
                        📋 复制为 HTML
                      </button>
                      <button
                        onClick={() => {
                          const plain = content.replace(/<[^>]+>/g, "").trim();
                          navigator.clipboard.writeText(plain);
                          setMoreMenuOpen(false);
                          alert("已复制纯文本");
                        }}
                        className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                      >
                        📄 复制为纯文本
                      </button>
                    </div>
                  </>
                )}
              </div>

              <HeaderSep />

              {/* AI 助手入口（无选区时弹 AI 改写菜单，有选区时弹 bubble menu） */}
              <div className="relative">
                <button
                  type="button"
                  onClick={() => setAiShortcutOpen((v) => !v)}
                  className="h-7 w-7 rounded text-gray-500 hover:text-gray-900 hover:bg-gray-100 inline-flex items-center justify-center"
                  title="AI 改写（先选文字再点更精确）"
                >
                  <AiOrbIcon />
                </button>
                {aiShortcutOpen && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setAiShortcutOpen(false)} />
                    <div className="absolute top-full right-0 mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-44">
                      <button
                        onClick={() => {
                          setAiShortcutOpen(false);
                          // 直接对整篇润色
                          const { from, to } = editorRef.current?.getRange?.() ?? { from: 0, to: 0 };
                          if (from === to) {
                            alert("请先在编辑器中选中要改写的文字");
                            return;
                          }
                          editorRef.current?.runAiEditFromOutside?.("polish", "润色");
                        }}
                        className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                      >
                        ✨ 对选区润色
                      </button>
                      <button
                        onClick={() => {
                          setAiShortcutOpen(false);
                          const { from, to } = editorRef.current?.getRange?.() ?? { from: 0, to: 0 };
                          if (from === to) {
                            alert("请先在编辑器中选中要改写的文字");
                            return;
                          }
                          editorRef.current?.runAiEditFromOutside?.("expand", "扩写");
                        }}
                        className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                      >
                        📝 对选区扩写
                      </button>
                      <button
                        onClick={() => {
                          setAiShortcutOpen(false);
                          const { from, to } = editorRef.current?.getRange?.() ?? { from: 0, to: 0 };
                          if (from === to) {
                            alert("请先在编辑器中选中要改写的文字");
                            return;
                          }
                          editorRef.current?.runAiEditFromOutside?.("shorten", "缩写");
                      }}
                        className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                      >
                        ✂️ 对选区缩写
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* 收起 */}
              <button
                type="button"
                onClick={() => setEditorVisible(false)}
                title="收起右侧编辑器"
                className="h-7 w-7 rounded text-gray-500 hover:text-gray-900 hover:bg-gray-100 inline-flex items-center justify-center"
              >
                <CloseIcon />
              </button>
            </div>
          </div>

          {/* 编辑器内容 */}
          <div className="flex-1 overflow-y-auto scrollbar-hide">
            <div className="max-w-2xl mx-auto px-6 py-6">
              {content.trim() ? (
                <RichEditor
                  ref={editorRef}
                  value={content}
                  onChange={setContent}
                  articleId={article.id}
                  articleContext={articleContext}
                />
              ) : (
                <RichEditor
                  ref={editorRef}
                  value=""
                  onChange={setContent}
                  autoFocus
                  articleId={article.id}
                  articleContext={articleContext}
                  placeholder="正文会出现在这里…（按 / 唤出命令面板）"
                />
              )}
            </div>
          </div>
        </section>

        {/* ==== 左：对话区 ==== */}
        <aside
          className={`flex bg-gray-50/40 overflow-hidden transition-all duration-300 ease-in-out
            ${editorVisible
              ? "md:w-2/5 md:items-stretch"
              : "md:w-full md:items-stretch md:justify-center"
            }
          `}
        >
          {/* 内层：编辑器展开时全宽；编辑器隐藏时 max-w-3xl 居中（变成"对话框"形态） */}
          <div
            className={`flex flex-col w-full bg-white transition-all duration-300 ease-in-out
              ${editorVisible
                ? ""
                : "md:max-w-3xl md:border-x md:border-gray-200"
              }
            `}
          >
            {/* 顶部：返回 + 标题 + 字数（豆包式：与聊天气泡同字号） */}
            <div className="px-3 py-2.5 border-b border-gray-200/50 flex items-center gap-2">
              {/* 返回 */}
              <Link
                href="/library"
                className="text-gray-400 hover:text-gray-700 shrink-0 p-1 -ml-1 rounded transition"
                title="返回作品库"
              >
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m15 18-6-6 6-6"/>
                </svg>
              </Link>

              {/* 标题 */}
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="无题文章"
                className="flex-1 min-w-0 text-[14px] font-medium border-none outline-none bg-transparent placeholder:text-gray-300 text-gray-900"
              />

              {/* 字数 + 保存状态 */}
              <div className="flex items-center gap-1.5 shrink-0 text-[11px] text-gray-400">
                {saving && <span>保存中…</span>}
                <span className="tabular-nums">
                  {countWords(content.replace(/<[^>]+>/g, ""))} 字
                </span>
              </div>
            </div>

            {/* 调研详情（可折叠） */}
            <ResearchPanel
              keyword={researchKeyword}
              direction={researchDirection}
              directionIndex={researchDirectionIndex}
              totalDirections={researchTotalDirections}
            />

            {/* 消息流 */}
            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3 scrollbar-hide">
              {messages.length === 0 && (
                <div className="text-center text-sm text-gray-400 py-8 px-2">
                  <div className="text-2xl mb-2">💬</div>
                  <div className="font-medium text-gray-600 mb-3">说点什么吧</div>
                  <div className="space-y-1 text-left inline-block max-w-xs text-[13px]">
                    <div className="px-2 py-1.5 hover:bg-white rounded cursor-pointer text-gray-600">
                      把开头改得更有冲击力
                    </div>
                    <div className="px-2 py-1.5 hover:bg-white rounded cursor-pointer text-gray-600">
                      补充一个具体的数据例证
                    </div>
                    <div className="px-2 py-1.5 hover:bg-white rounded cursor-pointer text-gray-600">
                      重写第三段，更口语化
                    </div>
                    <div className="px-2 py-1.5 hover:bg-white rounded cursor-pointer text-gray-600">
                      基于这篇写一段朋友圈文案
                    </div>
                  </div>
                </div>
              )}

              {messages.map((m, i) => {
                // event role：极简提示（豆包式：浅灰文字，不喧宾夺主）
                if (m.role === "event") {
                  return (
                    <div key={i} className="flex justify-center">
                      <div
                        className={`text-[11px] leading-relaxed ${
                          m.eventType === "write_error"
                            ? "text-red-500"
                            : m.eventType === "write_done"
                            ? "text-emerald-600"
                            : "text-gray-400"
                        }`}
                      >
                        {m.content}
                      </div>
                    </div>
                  );
                }

                // user / assistant：普通对话气泡
                if (m.role === "assistant") {
                  return (
                    <AssistantBubble
                      key={i}
                      msg={m}
                      index={i}
                      aiStreaming={aiStreaming}
                      autoWriting={autoWriting}
                      copiedKey={copiedKey}
                      copyText={copyText}
                      editedKey={editedKey}
                      onEdit={(md) => {
                        editorRef.current?.setContent(mdToHtml(md));
                        setEditorVisible(true);   // 显示编辑器
                        setEditedKey(`msg-${i}`);
                        if (editedTimerRef.current) clearTimeout(editedTimerRef.current);
                        editedTimerRef.current = setTimeout(() => setEditedKey(null), 1500);
                      }}
                    />
                  );
                }

                // user 消息（简短，不需要折叠）
                return (
                  <div key={i} className="flex justify-end">
                    <div
                      className={`relative max-w-[92%] rounded-2xl px-3 py-1.5 text-[13.5px] whitespace-pre-wrap leading-relaxed bg-gray-100 text-gray-900 rounded-tr-md ai-msg-user`}
                    >
                      {m.content}
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* 底部输入区 */}
            <div className="px-3 pb-3 border-t border-gray-200/50 pt-2">
              {/* 快捷技能：换个风格 */}
              <div className="flex items-center flex-wrap gap-1 mb-1.5 px-0.5">
                <span className="text-[11px] text-gray-400 mr-1">换个风格</span>
                {[
                  { id: "zhihu" as const, label: "知乎版" },
                  { id: "xiaohongshu" as const, label: "小红书版" },
                  { id: "toutiao" as const, label: "头条版" },
                  { id: "wechat" as const, label: "公众号版" },
                ].map((b) => (
                  <button
                    key={b.id}
                    onClick={() => handleRewrite(b.id, b.label)}
                    disabled={aiStreaming || !hasContent}
                    title={!hasContent ? "暂无内容可转换" : `在对话里按${b.label}风格生成一版`}
                    className="text-[11px] px-2 py-0.5 rounded-md bg-white hover:bg-gray-100 text-gray-600 disabled:opacity-40 disabled:cursor-not-allowed transition border border-transparent hover:border-gray-200"
                  >
                    {b.label}
                  </button>
                ))}
              </div>

              {/* 输入框 */}
              <form onSubmit={handleAISend}>
                <div className="relative rounded-2xl border border-gray-200 bg-white focus-within:border-gray-300 transition">
                  <textarea
                    value={aiInput}
                    onChange={(e) => setAiInput(e.target.value)}
                    placeholder="说点什么…"
                    rows={1}
                    className="w-full bg-transparent px-3 py-2 text-sm outline-none placeholder:text-gray-400 resize-none"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        handleAISend(e as any);
                      }
                    }}
                  />
                  <div className="flex items-center justify-end px-2 pb-1.5">
                    <button
                      type="submit"
                      disabled={aiStreaming || !aiInput.trim()}
                      className={`text-[11px] px-2.5 py-1 rounded-md transition ${
                        aiInput.trim() && !aiStreaming
                          ? "bg-gray-900 text-white hover:bg-gray-700"
                          : "bg-gray-200 text-gray-400 cursor-not-allowed"
                      }`}
                    >
                      发送
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        </aside>
      </main>

      {/* Toast 提示（页面右上角淡入） */}
      <ToastViewport toasts={toasts} />

      {/* 合规校验结果面板（可拖动） */}
      {complianceResult && (
        <div
          className="fixed z-[9999] bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden"
          style={{
            // 没拖动时居中；拖动用 transform 平移
            left: panelPos ? `calc(50% + ${panelPos.x}px)` : "50%",
            top: panelPos ? `${panelPos.y}px` : "64px",
            transform: panelPos ? "translateX(-50%)" : "translateX(-50%)",
            width: "min(768px, calc(100vw - 32px))",
            maxHeight: "calc(100vh - 96px)",
          }}
          role="dialog"
          aria-label="合规校验结果"
        >
          {/* 顶部条（可拖动 + 显示拖动光标） */}
          <div
            onPointerDown={handlePanelDragStart}
            onPointerMove={handlePanelDragMove}
            onPointerUp={handlePanelDragEnd}
            className={`flex items-center justify-between px-4 py-3 border-b cursor-move select-none ${
              complianceResult.overall === "pass"
                ? "bg-gradient-to-r from-emerald-50/60 to-white"
                : complianceResult.overall === "warning"
                ? "bg-gradient-to-r from-amber-50/60 to-white"
                : "bg-gradient-to-r from-red-50/60 to-white"
            } ${dragRef.current ? "cursor-grabbing" : "cursor-move"}`}
            title="按住拖动面板"
          >
            <div className="flex items-center gap-3">
              {/* 评分环 */}
              <div className={`w-12 h-12 rounded-full flex items-center justify-center text-base font-bold ${
                complianceResult.score >= 80
                  ? "bg-emerald-100 text-emerald-700"
                  : complianceResult.score >= 50
                  ? "bg-amber-100 text-amber-700"
                  : "bg-red-100 text-red-700"
              }`}>
                {complianceResult.score}
              </div>
              <div>
                <div className="text-sm font-medium text-gray-900 flex items-center gap-2">
                  {complianceResult.platformName} 合规校验
                  {complianceResult.overall === "pass" && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">✓ 通过</span>
                  )}
                  {complianceResult.overall === "warning" && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">⚠ 警告</span>
                  )}
                  {complianceResult.overall === "violation" && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700">✗ 违规</span>
                  )}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {complianceResult.summary}
                </div>
              </div>
              {/* 拖动提示（小图标，鼠标 hover 才显示） */}
              <span className="text-[10px] text-gray-400 inline-flex items-center gap-0.5 ml-1">
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="9 7 4 12 9 17" />
                  <polyline points="15 7 20 12 15 17" />
                </svg>
                可拖动
              </span>
            </div>
            <button
              type="button"
              onClick={closeCompliance}
              onPointerDown={(e) => e.stopPropagation()}   // 防止点 × 触发拖动
              className="w-7 h-7 rounded-md text-gray-400 hover:text-gray-900 hover:bg-gray-100 inline-flex items-center justify-center"
              title="关闭"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" x2="6" y1="6" y2="18" />
                <line x1="6" x2="18" y1="6" y2="18" />
              </svg>
            </button>
          </div>

          {/* 内容区 */}
          <div className="max-h-[60vh] overflow-y-auto scrollbar-hide">
            {/* 违规项 */}
            {complianceResult.violations.length > 0 && (
              <div className="px-4 py-3 border-b border-gray-100">
                <div className="text-xs font-semibold text-red-700 mb-2 flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="12" cy="12" r="10" />
                    <line x1="12" y1="8" x2="12" y2="12" />
                    <line x1="12" y1="16" x2="12.01" y2="16" />
                  </svg>
                  必须修改的违规 ({complianceResult.violations.length})
                </div>
                <div className="space-y-2">
                  {complianceResult.violations.map((v, i) => (
                    <div
                      key={i}
                      className={`rounded-lg p-3 border ${
                        appliedFixes.has(v.text || "")
                          ? "bg-emerald-50/50 border-emerald-300"
                          : "bg-red-50 border-red-200"
                      }`}
                    >
                      {/* 头部：类别 + 严重等级 */}
                      <div className="flex items-start gap-2">
                        <span className="text-xs px-1.5 py-0.5 rounded bg-red-200 text-red-800 font-medium shrink-0">
                          {v.severity === "high" ? "高危" : "中危"}
                        </span>
                        <span className="text-xs font-medium text-red-900">{v.type}</span>
                      </div>
                      {/* 触发文本 */}
                      {v.text && (
                        <div className="mt-1.5 text-xs text-gray-700">
                          触发：<code className="bg-white px-1.5 py-0.5 rounded text-red-700 border border-red-200 line-through">{v.text}</code>
                        </div>
                      )}
                      {/* 规则引用 */}
                      <div className="mt-1 text-xs text-gray-600">📋 {v.rule}</div>

                      {/* 修复方案 */}
                      {(v.fix || v.suggestion) && (
                        <div className="mt-2.5 pt-2.5 border-t border-red-200/60 space-y-2">
                          {v.suggestion && (
                            <div className="text-xs text-gray-700">
                              <span className="font-medium text-red-900">💡 怎么改：</span> {v.suggestion}
                            </div>
                          )}
                          {v.fix && (
                            <div className="text-xs">
                              <div className="flex items-center justify-between mb-1 gap-2">
                                <span className="font-medium text-emerald-700">✓ 建议改为：</span>
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      navigator.clipboard.writeText(v.fix || "");
                                      showToast("已复制修复版", "success");
                                    }}
                                    className="text-[10px] text-gray-500 hover:text-gray-900 inline-flex items-center gap-1 px-1.5 py-0.5 rounded hover:bg-white transition"
                                    title="复制修复版到剪贴板"
                                  >
                                    <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                      <rect width="13" height="13" x="9" y="9" rx="2" ry="2" />
                                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                    </svg>
                                    复制
                                  </button>
                                  {appliedFixes.has(v.text || "") ? (
                                    <span className="text-[10px] text-emerald-700 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded font-medium">
                                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                                        <polyline points="20 6 9 17 4 12" />
                                      </svg>
                                      已应用
                                    </span>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleApplyFix(v)}
                                      disabled={!v.text}
                                      className="text-[10px] text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded transition"
                                      title="自动定位原文并替换"
                                    >
                                      <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                                      </svg>
                                      应用到原文
                                    </button>
                                  )}
                                </div>
                              </div>
                              <div className="bg-emerald-50 border border-emerald-200 rounded px-2 py-1.5 text-emerald-900 whitespace-pre-wrap break-words">
                                {v.fix}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 警告项 */}
            {complianceResult.warnings.length > 0 && (
              <div className="px-4 py-3 border-b border-gray-100">
                <div className="text-xs font-semibold text-amber-700 mb-2 flex items-center gap-1">
                  <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                  建议优化 ({complianceResult.warnings.length})
                </div>
                <div className="space-y-2">
                  {complianceResult.warnings.map((w, i) => (
                    <div key={i} className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                      <div className="text-xs font-medium text-amber-900">{w.type}</div>
                      {w.text && (
                        <div className="mt-1 text-xs text-gray-700">
                          相关：<code className="bg-white px-1.5 py-0.5 rounded border border-amber-200">{w.text}</code>
                        </div>
                      )}
                      <div className="mt-1 text-xs text-gray-600">📋 {w.rule}</div>
                      {w.suggestion && (
                        <div className="mt-1.5 text-xs text-amber-900">
                          💡 建议：{w.suggestion}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 通用建议 */}
            {complianceResult.suggestions.length > 0 && (
              <div className="px-4 py-3">
                <div className="text-xs font-semibold text-gray-700 mb-2">
                  通用建议
                </div>
                <ul className="space-y-1 text-xs text-gray-600">
                  {complianceResult.suggestions.map((s, i) => (
                    <li key={i} className="flex items-start gap-1.5">
                      <span className="text-blue-500 mt-0.5">•</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {/* 通过且无内容 */}
            {complianceResult.overall === "pass" &&
              complianceResult.violations.length === 0 &&
              complianceResult.warnings.length === 0 && (
                <div className="px-4 py-8 text-center text-sm text-gray-500">
                  🎉 内容符合 {complianceResult.platformName} 平台规范，可以发布！
                </div>
              )}
          </div>

          {/* 底部操作栏 */}
          <div className="flex items-center justify-end px-4 py-2.5 border-t border-gray-100 bg-gray-50/50">
            <button
              type="button"
              onClick={closeCompliance}
              className="text-xs px-3 py-1.5 rounded-md text-gray-700 hover:bg-gray-100 transition"
            >
              关闭
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ===========================================================================
 * Assistant 气泡：长消息直接渲染 Markdown + hover 复制按钮
 * =========================================================================== */
function AssistantBubble({
  msg,
  index,
  aiStreaming,
  autoWriting,
  copiedKey,
  copyText,
  editedKey,
  onEdit,
}: {
  msg: ChatMsg;
  index: number;
  aiStreaming: boolean;
  autoWriting: boolean;
  copiedKey: string | null;
  copyText: (text: string, key: string) => void;
  editedKey: string | null;
  onEdit: (markdown: string) => void;
}) {
  const msgKey = `msg-${index}`;
  const isCopied = copiedKey === msgKey;
  const isEdited = editedKey === msgKey;

  return (
    <div className="group flex justify-start">
      <div
        className={`relative max-w-[92%] px-1 py-2 text-[15px] leading-relaxed text-gray-900 ai-msg-assistant`}
      >
        {msg.content ? (
          // 渲染 Markdown：标题、列表、加粗、引用、代码块等都正常显示
          <Markdown text={msg.content} />
        ) : (
          // 流式输出中的 loading dots
          aiStreaming || autoWriting ? (
            <span className="inline-flex gap-1">
              <span
                className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce"
                style={{ animationDelay: "0ms" }}
              />
              <span
                className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce"
                style={{ animationDelay: "150ms" }}
              />
              <span
                className="w-1.5 h-1.5 rounded-full bg-gray-300 animate-bounce"
                style={{ animationDelay: "300ms" }}
              />
            </span>
          ) : null
        )}

        {/* 按钮组：编辑 + 复制（始终在气泡右上角，hover 才显示） */}
        {msg.content && (
          <div className="absolute -top-2 -right-2 flex items-center gap-1">
            {/* 编辑按钮：把这段 Markdown 应用到右侧编辑器 */}
            <button
              onClick={() => onEdit(msg.content)}
              title="把这段内容替换到右侧编辑器"
              aria-label="应用到编辑器"
              className={`w-7 h-7 rounded-md flex items-center justify-center border shadow-sm transition ${
                isEdited
                  ? "opacity-100 bg-emerald-100 border-emerald-200 text-emerald-700"
                  : "opacity-0 group-hover:opacity-100 bg-white border-gray-200 text-gray-500 hover:text-blue-600 hover:border-blue-300"
              }`}
            >
              {isEdited ? (
                <svg
                  className="w-3.5 h-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              ) : (
                <svg
                  className="w-3.5 h-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                </svg>
              )}
            </button>

            {/* 复制按钮 */}
            <button
              onClick={() => copyText(msg.content, msgKey)}
              title="复制这条消息"
              aria-label="复制消息"
              className={`w-7 h-7 rounded-md flex items-center justify-center border shadow-sm transition ${
                isCopied
                  ? "opacity-100 bg-emerald-100 border-emerald-200 text-emerald-700"
                  : "opacity-0 group-hover:opacity-100 bg-white border-gray-200 text-gray-500 hover:text-violet-600 hover:border-violet-300"
              }`}
            >
              {isCopied ? (
                <svg
                  className="w-3.5 h-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20 6 9 17l-5-5" />
                </svg>
              ) : (
                <svg
                  className="w-3.5 h-3.5"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <rect width="13" height="13" x="9" y="9" rx="2" ry="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ===========================================================================
 * 平台名映射
 * =========================================================================== */
const PLATFORM_LABELS: Record<"zhihu" | "xiaohongshu" | "toutiao" | "wechat", string> = {
  zhihu: "知乎",
  xiaohongshu: "小红书",
  toutiao: "今日头条",
  wechat: "公众号",
};
function HeaderIconBtn({
  title,
  onClick,
  disabled,
  children,
}: {
  title: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="h-7 w-7 rounded text-gray-500 hover:text-gray-900 hover:bg-gray-100 inline-flex items-center justify-center disabled:opacity-40 disabled:cursor-not-allowed transition"
    >
      {children}
    </button>
  );
}

function HeaderLabelBtn({
  title,
  onClick,
  children,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      className="h-7 px-2 rounded text-[12px] text-gray-600 hover:text-gray-900 hover:bg-gray-100 inline-flex items-center gap-1 transition whitespace-nowrap"
    >
      {children}
    </button>
  );
}

function HeaderSep() {
  return <div className="w-px h-4 bg-gray-200 mx-1" />;
}

/* ===========================================================================
 * 图标（SVG，豆包式细线 1.5px）
 * =========================================================================== */
const ICON_PROPS = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.6,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className: "w-3.5 h-3.5",
};

function UndoIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M3 7v6h6" />
      <path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" />
    </svg>
  );
}

function RedoIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M21 7v6h-6" />
      <path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3l3 2.7" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg {...ICON_PROPS}>
      <rect width="13" height="13" x="9" y="9" rx="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function DownloadIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" x2="12" y1="15" y2="3" />
    </svg>
  );
}

function ShareIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
      <polyline points="16 6 12 2 8 6" />
      <line x1="12" x2="12" y1="2" y2="15" />
    </svg>
  );
}

function CommentIcon() {
  return (
    <svg {...ICON_PROPS}>
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function MoreIcon() {
  return (
    <svg {...ICON_PROPS}>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </svg>
  );
}

function AiOrbIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" className="w-4 h-4">
      <defs>
        <linearGradient id="aiOrbGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#60a5fa" />
          <stop offset="100%" stopColor="#a855f7" />
        </linearGradient>
      </defs>
      <circle cx="12" cy="12" r="9" fill="url(#aiOrbGrad)" opacity="0.9" />
      <path
        d="M9.5 9.5a2.5 2.5 0 0 1 5 0c0 1.5-2.5 2-2.5 3.5M12 17h.01"
        stroke="white"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg {...ICON_PROPS}>
      <line x1="18" x2="6" y1="6" y2="18" />
      <line x1="6" x2="18" y1="6" y2="18" />
    </svg>
  );
}
