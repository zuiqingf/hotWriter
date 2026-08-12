"use client";

/**
 * 富文本编辑器（Tiptap）
 *
 * 功能（参考豆包）：
 * - 基础格式：加粗、斜体、删除线、行内代码、链接
 * - 块级：H1/H2/H3、有序/无序列表、引用、代码块、分割线
 * - 斜杠菜单：输入 / 触发命令面板
 * - 浮动工具栏：空行时显示「+」插入按钮
 * - 气泡工具栏：选中文字时弹出格式化工具栏
 * - 图片插入：斜杠菜单 / 拖拽 / 粘贴 / 文件选择器
 *
 * 数据流：
 * - `value`: 受控值（HTML）
 * - `onChange(html)`: 编辑时回吐 HTML
 * - 外部更新 value 时，内部 editor 会自动 sync
 */

import { useEditor, EditorContent, BubbleMenu, FloatingMenu } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import Link from "@tiptap/extension-link";
import Placeholder from "@tiptap/extension-placeholder";
import { Extension } from "@tiptap/core";
import Suggestion from "@tiptap/suggestion";
import { ReactRenderer } from "@tiptap/react";
import { tippy } from "@/lib/editor/tippy";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import { apiUrl } from "@/lib/utils";

export interface RichEditorHandle {
  /** 在光标处插入一段 Markdown 文本（用于 AI 回复"插入"按钮） */
  insertAtCursor: (markdownOrHtml: string) => void;
  /** 把全篇替换为指定内容 */
  setContent: (html: string) => void;
  /** 获取当前 HTML */
  getHTML: () => string;
  /** 撤销 */
  undo: () => void;
  /** 重做 */
  redo: () => void;
  /** 获取当前选区 { from, to } */
  getRange: () => { from: number; to: number } | null;
  /** 从外部触发 AI 改写（用于顶部 AI 入口） */
  runAiEditFromOutside: (action: string, label: string) => Promise<void>;
  /**
   * 在文档中查找 original 首次出现的位置，替换为 fix。
   * 返回 true=成功替换；false=未找到匹配位置（调用方负责 Toast 提示）。
   * 用于合规校验面板的"一键应用 fix"。
   */
  applyFixByText: (original: string, fix: string) => boolean;
}

// AI 预览窗口的状态
export interface AiPreviewState {
  action: string;             // "polish" | "expand" | ...
  label: string;              // "润色" | "扩写" | ...
  original: string;           // 用户选中的原文
  generated: string;          // 流式累积的 AI 输出
  status: "streaming" | "done" | "error";
  errorMsg?: string;
  selectionRange: { from: number; to: number };   // 用于"应用"时定位替换
}

interface RichEditorProps {
  value?: string;
  onChange?: (html: string) => void;
  placeholder?: string;
  className?: string;
  /** 自动 focus（仅挂载后第一次） */
  autoFocus?: boolean;
  /** 文章 ID（启用 AI 改写功能必填） */
  articleId?: number;
  /** 给 AI 的上下文（标题 + 开头） */
  articleContext?: string;
}

// ============ 斜杠命令配置 ============
interface SlashItem {
  title: string;
  description: string;
  icon: string;
  keywords: string[];
  command: (props: { editor: any; range: any }) => void;
}

const SLASH_ITEMS: SlashItem[] = [
  {
    title: "一级标题",
    description: "大标题",
    icon: "H1",
    keywords: ["h1", "heading", "标题", "一级"],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 1 }).run(),
  },
  {
    title: "二级标题",
    description: "中标题",
    icon: "H2",
    keywords: ["h2", "heading", "标题", "二级"],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 2 }).run(),
  },
  {
    title: "三级标题",
    description: "小标题",
    icon: "H3",
    keywords: ["h3", "heading", "标题", "三级"],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setNode("heading", { level: 3 }).run(),
  },
  {
    title: "无序列表",
    description: "• 列表项",
    icon: "•",
    keywords: ["ul", "bullet", "无序", "列表"],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    title: "有序列表",
    description: "1. 列表项",
    icon: "1.",
    keywords: ["ol", "ordered", "有序", "列表"],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    title: "引用",
    description: "高亮一段引文",
    icon: "❝",
    keywords: ["quote", "blockquote", "引用"],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBlockquote().run(),
  },
  {
    title: "代码块",
    description: "多行代码",
    icon: "</>",
    keywords: ["code", "codeblock", "代码块"],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    title: "分割线",
    description: "—— 分隔 ——",
    icon: "—",
    keywords: ["hr", "divider", "分割线"],
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
  {
    title: "图片",
    description: "上传或粘贴图片",
    icon: "🖼",
    keywords: ["image", "img", "图片"],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      // 触发文件选择器
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/*";
      input.onchange = (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) uploadAndInsertImage(file, editor);
      };
      input.click();
    },
  },
  {
    title: "链接",
    description: "插入超链接",
    icon: "🔗",
    keywords: ["link", "url", "链接"],
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      const url = window.prompt("请输入链接 URL：", "https://");
      if (url) editor.chain().focus().setLink({ href: url }).run();
    },
  },
];

// ============ 图片上传 ============
async function uploadAndInsertImage(file: File, editor: any) {
  if (!file.type.startsWith("image/")) {
    alert("只能上传图片");
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    alert("图片不能超过 5 MB");
    return;
  }

  const fd = new FormData();
  fd.append("file", file);
  try {
    const res = await fetch(apiUrl("/api/upload"), { method: "POST", body: fd });
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      alert("上传失败：" + (data.error || res.statusText));
      return;
    }
    const data = await res.json();
    editor.chain().focus().setImage({ src: data.url, alt: data.name }).run();
  } catch (err: any) {
    alert("上传失败：" + err.message);
  }
}

// ============ 斜杠命令 Extension ============
const SlashCommand = Extension.create({
  name: "slashCommand",
  addOptions() {
    return {
      suggestion: {
        char: "/",
        startOfLine: false,
        command: () => {},
      } as any,
    };
  },
  addProseMirrorPlugins() {
    return [
      Suggestion({
        editor: this.editor,
        ...this.options.suggestion,
        items: ({ query }: { query: string }) => {
          const q = query.toLowerCase().trim();
          return SLASH_ITEMS.filter(
            (it) =>
              !q ||
              it.title.toLowerCase().includes(q) ||
              it.keywords.some((k) => k.toLowerCase().includes(q))
          ).slice(0, 8);
        },
        render: () => {
          let component: any;
          let popup: any;
          return {
            onStart: (props: any) => {
              component = new ReactRenderer(SlashList, {
                props: { items: props.items, command: props.command },
                editor: props.editor,
              });
              if (!props.clientRect) return;
              popup = tippy("body", {
                getReferenceClientRect: props.clientRect,
                appendTo: () => document.body,
                content: component.element,
                showOnCreate: true,
                interactive: true,
                trigger: "manual",
                placement: "bottom-start",
              });
            },
            onUpdate: (props: any) => {
              component.updateProps({ items: props.items, command: props.command });
              if (!props.clientRect) return;
              popup[0].setProps({ getReferenceClientRect: props.clientRect });
            },
            onKeyDown: (props: any) => {
              if (props.event.key === "Escape") {
                popup[0].hide();
                return true;
              }
              return component.ref?.onKeyDown?.(props);
            },
            onExit: () => {
              popup[0].destroy();
              component.destroy();
            },
          };
        },
      }),
    ];
  },
});

// ============ 斜杠列表 React 组件 ============
const SlashList = forwardRef<{ onKeyDown: (p: any) => boolean }, any>((props, ref) => {
  const [selected, setSelected] = useState(0);

  useEffect(() => {
    setSelected(0);
  }, [props.items]);

  const select = (idx: number) => {
    const item = props.items[idx];
    if (item) props.command(item);
  };

  useImperativeHandle(ref, () => ({
    onKeyDown: ({ event }: any) => {
      if (event.key === "ArrowUp") {
        setSelected((s) => (s + props.items.length - 1) % props.items.length);
        return true;
      }
      if (event.key === "ArrowDown") {
        setSelected((s) => (s + 1) % props.items.length);
        return true;
      }
      if (event.key === "Enter") {
        select(selected);
        return true;
      }
      return false;
    },
  }));

  if (!props.items.length) {
    return (
      <div className="bg-white rounded-lg shadow-lg border border-gray-200 px-3 py-2 text-sm text-gray-400">
        没有匹配的命令
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-lg border border-gray-200 py-1 w-64 max-h-72 overflow-y-auto">
      <div className="px-2 py-1 text-[11px] text-gray-400 uppercase tracking-wide">
        插入
      </div>
      {props.items.map((item: SlashItem, idx: number) => (
        <button
          key={item.title}
          onClick={() => select(idx)}
          onMouseEnter={() => setSelected(idx)}
          className={`w-full text-left px-2 py-1.5 flex items-center gap-2.5 text-sm transition ${
            idx === selected ? "bg-gray-100" : "hover:bg-gray-50"
          }`}
        >
          <span className="w-7 h-7 rounded-md bg-gray-100 flex items-center justify-center text-xs font-mono text-gray-600 shrink-0">
            {item.icon}
          </span>
          <span className="flex-1 min-w-0">
            <div className="font-medium text-gray-900 truncate">{item.title}</div>
            <div className="text-[11px] text-gray-400 truncate">{item.description}</div>
          </span>
        </button>
      ))}
    </div>
  );
});
SlashList.displayName = "SlashList";

// ============ 主组件 ============
export const RichEditor = forwardRef<RichEditorHandle, RichEditorProps>(function RichEditor(
  { value = "", onChange, placeholder = "从这里开始写…（输入 / 唤出命令面板）", className = "", autoFocus = false, articleId, articleContext },
  ref
) {
  const isInternalUpdate = useRef(false);
  // 保存当前 editor 引用，供 handlePaste / handleDrop 用
  const editorRef = useRef<any>(null);
  // AI 改写进行中的 action（null = 空闲）；用于按钮 loading 态
  const [aiLoading, setAiLoading] = useState<string | null>(null);
  // "更多 AI" 下拉显隐
  const [aiMoreOpen, setAiMoreOpen] = useState(false);
  // AI 预览窗口（流式累积，原文 vs 改写对比）
  const [aiPreview, setAiPreview] = useState<AiPreviewState | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: false,
        heading: { levels: [1, 2, 3] },
      }),
      Placeholder.configure({ placeholder }),
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { class: "text-blue-600 underline" },
      }),
      Image.configure({
        HTMLAttributes: { class: "rounded-lg max-w-full my-2" },
      }),
      SlashCommand,
    ],
    content: value,
    autofocus: autoFocus ? "end" : false,
    immediatelyRender: false,
    onUpdate: ({ editor }) => {
      isInternalUpdate.current = true;
      onChange?.(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class:
          "prose prose-sm max-w-none focus:outline-none min-h-[300px] px-1 py-2 " +
          "[&_h1]:text-2xl [&_h1]:font-semibold [&_h1]:mt-4 [&_h1]:mb-2 " +
          "[&_h2]:text-xl [&_h2]:font-semibold [&_h2]:mt-3 [&_h2]:mb-2 " +
          "[&_h3]:text-base [&_h3]:font-semibold [&_h3]:mt-3 [&_h3]:mb-1 " +
          "[&_p]:my-2 [&_p]:leading-relaxed " +
          "[&_ul]:list-disc [&_ul]:ml-5 [&_ol]:list-decimal [&_ol]:ml-5 " +
          "[&_blockquote]:border-l-4 [&_blockquote]:border-gray-300 [&_blockquote]:pl-3 [&_blockquote]:text-gray-600 " +
          "[&_code]:bg-gray-100 [&_code]:px-1 [&_code]:rounded [&_code]:text-[13px] " +
          "[&_pre]:bg-gray-50 [&_pre]:p-3 [&_pre]:rounded-lg [&_pre]:overflow-x-auto " +
          "[&_a]:text-blue-600 [&_a]:underline " +
          "[&_img]:rounded-lg [&_img]:max-w-full [&_img]:my-2 " +
          "[&_hr]:my-4 [&_hr]:border-gray-200 " +
          "[&_p.is-editor-empty:first-child::before]:content-[attr(data-placeholder)] " +
          "[&_p.is-editor-empty:first-child::before]:text-gray-300 " +
          "[&_p.is-editor-empty:first-child::before]:float-left " +
          "[&_p.is-editor-empty:first-child::before]:pointer-events-none " +
          "[&_p.is-editor-empty:first-child::before]:h-0",
      },
      handlePaste(_view, event) {
        const items = event.clipboardData?.items;
        if (!items || !editorRef.current) return false;
        for (const it of Array.from(items)) {
          if (it.type.startsWith("image/")) {
            const file = it.getAsFile();
            if (file) {
              event.preventDefault();
              uploadAndInsertImage(file, editorRef.current);
              return true;
            }
          }
        }
        return false;
      },
      handleDrop(_view, event) {
        const files = event.dataTransfer?.files;
        if (!files || files.length === 0 || !editorRef.current) return false;
        const file = files[0];
        if (!file.type.startsWith("image/")) return false;
        event.preventDefault();
        uploadAndInsertImage(file, editorRef.current);
        return true;
      },
    },
  });

  // 保存 editor 引用
  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  // 暴露方法给父组件
  useImperativeHandle(ref, () => ({
    insertAtCursor: (html: string) => {
      if (!editor) return;
      editor.chain().focus().insertContent(html).run();
    },
    setContent: (html: string) => {
      if (!editor) return;
      editor.commands.setContent(html);
    },
    getHTML: () => editor?.getHTML() ?? "",
    undo: () => {
      editor?.chain().focus().undo().run();
    },
    redo: () => {
      editor?.chain().focus().redo().run();
    },
    getRange: () => {
      if (!editor) return null;
      const { from, to } = editor.state.selection;
      return { from, to };
    },
    runAiEditFromOutside: async (action: string, label: string) => {
      await runAiEdit(action, label);
    },
    applyFixByText: (original: string, fix: string): boolean => {
      if (!editor || !original) return false;

      const { doc } = editor.state;
      // separator 用 "" 避免 textBetween 在节点边界插入换行破坏匹配
      const fullText = doc.textBetween(0, doc.content.size, "", "");

      // 三级 fallback 定位 original 在 fullText 中的索引
      // 返回值：找到的索引；null = 全部失败
      const findIdx = (raw: string, pat: string): number | null => {
        // 1) 精确匹配
        let i = raw.indexOf(pat);
        if (i !== -1) return i;
        // 2) 折叠空白后匹配（处理 \n、\t、连续空格）
        const collapse = (s: string) => s.replace(/\s+/g, " ");
        const normRaw = collapse(raw);
        const normPat = collapse(pat);
        const ni = normRaw.indexOf(normPat);
        if (ni !== -1) {
          // 在原始 raw 中找：从 ni 附近开始搜索
          const approx = raw.indexOf(pat.replace(/\s+/g, " "), Math.max(0, ni - 10));
          if (approx !== -1) return approx;
        }
        // 3) 去首尾装饰字符（书名号「」、引号、括号、空白）
        const strip = (s: string) =>
          s.replace(/^[\s　「」『』《》""''()（）\[\]【】]+|[\s　「」『』《》""''()（）\[\]【】]+$/g, "");
        const sRaw = strip(raw);
        const sPat = strip(pat);
        const si = sRaw.indexOf(sPat);
        if (si !== -1) {
          const approx = raw.indexOf(pat, Math.max(0, si - 10));
          if (approx !== -1) return approx;
        }
        return null;
      };

      const idx = findIdx(fullText, original);
      if (idx === null) {
        if (typeof console !== "undefined") {
          console.warn("[applyFixByText] 三级匹配均失败", {
            original: original.slice(0, 80),
            docLen: fullText.length,
            docPreview: fullText.slice(0, 200),
          });
        }
        return false;
      }

      // 把 textContent 偏移转回 ProseMirror pos
      let fromPos: number | null = null;
      let toPos: number | null = null;
      let acc = 0;
      const matchLen = original.length;
      doc.descendants((node, pos) => {
        if (fromPos !== null) return false;
        if (node.isText) {
          const text = node.text || "";
          const start = acc;
          const end = acc + text.length;
          if (start <= idx && idx < end) {
            fromPos = pos + (idx - start);
          }
          if (start < idx + matchLen && idx + matchLen <= end) {
            toPos = pos + (idx + matchLen - start);
            return false;
          }
          acc = end;
        }
        return true;
      });

      // 跨多 text node 时 toPos 可能为 null：用 toPos 退化为 fromPos + matchLen
      // （Tiptap 会自动按字符数扩展选择，覆盖跨节点情况）
      const finalTo = toPos ?? fromPos! + matchLen;
      if (fromPos === null) return false;

      editor
        .chain()
        .focus()
        .setTextSelection({ from: fromPos, to: finalTo })
        .deleteSelection()
        .insertContent(fix)
        .run();

      return true;
    },
  }));

  // 外部 value 变化时同步（避免循环：用 ref 标记）
  useEffect(() => {
    if (!editor) return;
    if (isInternalUpdate.current) {
      isInternalUpdate.current = false;
      return;
    }
    const current = editor.getHTML();
    if (current !== value) {
      editor.commands.setContent(value || "", false);
    }
  }, [value, editor]);

  // ============ AI 改写（预览窗口模式） ============
  // 选中文字 → 调 /api/articles/[id]/ai-edit → 流式累积到预览窗口
  // 用户点"应用到原文"才替换选区；点"取消"或"×"则原选区不变
  async function runAiEdit(action: string, label: string) {
    if (!editor || !articleId || aiLoading) return;

    const { from, to } = editor.state.selection;
    if (from === to) {
      alert("请先在编辑器中选中要改写的文字");
      return;
    }
    const selectedText = editor.state.doc.textBetween(from, to, "\n\n");
    if (!selectedText.trim()) return;

    // 标记动作进入 loading + 关闭其他下拉
    setAiLoading(action);
    setAiMoreOpen(false);
    editor.commands.setTextSelection({ from, to });   // 保留选区（不要让用户在预览时乱点丢选区）

    // 打开预览窗口（流式状态）
    const preview: AiPreviewState = {
      action,
      label,
      original: selectedText,
      generated: "",
      status: "streaming",
      selectionRange: { from, to },
    };
    setAiPreview(preview);

    try {
      const res = await fetch(apiUrl(`/api/articles/${articleId}/ai-edit`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, text: selectedText, context: articleContext }),
      });
      if (!res.ok || !res.body) {
        const errText = await res.text();
        setAiPreview((p) => p ? { ...p, status: "error", errorMsg: errText || res.statusText } : null);
        return;
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let accumulated = "";
      let errMsg = "";

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
              accumulated += data.text;
              setAiPreview((p) => p ? { ...p, generated: accumulated } : null);
            } else if (event === "error") {
              errMsg = data.message || "未知错误";
            }
          } catch {}
        }
      }

      if (errMsg) {
        setAiPreview((p) => p ? { ...p, status: "error", errorMsg: errMsg } : null);
      } else {
        setAiPreview((p) => p ? { ...p, status: "done" } : null);
      }
    } catch (err: any) {
      setAiPreview((p) => p ? { ...p, status: "error", errorMsg: err.message } : null);
    } finally {
      setAiLoading(null);
    }
  }

  // 把 AI 改写内容应用到选区（替换原文）
  function applyAiPreview() {
    if (!editor || !aiPreview || aiPreview.status !== "done") return;
    const { from, to } = aiPreview.selectionRange;
    editor
      .chain()
      .focus()
      .setTextSelection({ from, to })
      .deleteSelection()
      .insertContent(aiPreview.generated)
      .run();
    setAiPreview(null);
  }

  // 取消预览（选区不变）
  function cancelAiPreview() {
    setAiPreview(null);
  }

  // 重新生成（用同一 action 重跑）
  function regenerateAiPreview() {
    if (!aiPreview) return;
    const { action, label } = aiPreview;
    setAiPreview(null);
    // 重新触发 runAiEdit（保留选区，因为它本来就没动）
    setTimeout(() => runAiEdit(action, label), 60);
  }

  if (!editor) {
    return (
      <div className="text-sm text-gray-400 py-4 px-1">编辑器加载中…</div>
    );
  }

  return (
    <div className={`rich-editor ${className}`}>
      {/* 气泡工具栏：选中文字时弹出 */}
      <BubbleMenu
        editor={editor}
        tippyOptions={{ duration: 100, placement: "top" }}
        className="bg-white border border-gray-200 rounded-lg shadow-md flex items-center p-0.5 gap-0.5"
      >
        <BubbleBtn
          active={editor.isActive("bold")}
          onClick={() => editor.chain().focus().toggleBold().run()}
          label="加粗"
        >
          <span className="font-bold">B</span>
        </BubbleBtn>
        <BubbleBtn
          active={editor.isActive("italic")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          label="斜体"
        >
          <span className="italic font-serif">I</span>
        </BubbleBtn>
        <BubbleBtn
          active={editor.isActive("strike")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          label="删除线"
        >
          <span className="line-through">S</span>
        </BubbleBtn>
        <BubbleBtn
          active={editor.isActive("code")}
          onClick={() => editor.chain().focus().toggleCode().run()}
          label="行内代码"
        >
          <span className="font-mono text-[12px]">{`</>`}</span>
        </BubbleBtn>
        <div className="w-px h-4 bg-gray-200 mx-0.5" />
        <BubbleBtn
          active={editor.isActive("link")}
          onClick={() => {
            const url = window.prompt("请输入链接 URL：");
            if (url) editor.chain().focus().setLink({ href: url }).run();
            else editor.chain().focus().unsetLink().run();
          }}
          label="链接"
        >
          🔗
        </BubbleBtn>

        {/* AI 改写区域（需要 articleId 才显示） */}
        {articleId && (
          <>
            <div className="w-px h-4 bg-gray-200 mx-0.5" />

            {/* 润色 / 扩写 / 缩写：高频操作，直接展示 */}
            <AiBtn
              loading={aiLoading === "polish"}
              onClick={() => runAiEdit("polish", "润色")}
              label="AI 润色：让文字更流畅"
            >
              ✨ 润色
            </AiBtn>
            <AiBtn
              loading={aiLoading === "expand"}
              onClick={() => runAiEdit("expand", "扩写")}
              label="AI 扩写：补充细节"
            >
              📝 扩写
            </AiBtn>
            <AiBtn
              loading={aiLoading === "shorten"}
              onClick={() => runAiEdit("shorten", "缩写")}
              label="AI 缩写：更简洁"
            >
              ✂️ 缩写
            </AiBtn>

            {/* 更多：下拉菜单 */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setAiMoreOpen((v) => !v)}
                disabled={!!aiLoading}
                className="h-7 px-2 rounded-md text-xs text-gray-700 hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-0.5 whitespace-nowrap shrink-0"
                title="更多 AI 改写"
              >
                ⚡ 更多
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {aiMoreOpen && (
                <>
                  {/* 点外面关闭 */}
                  <div className="fixed inset-0 z-40" onClick={() => setAiMoreOpen(false)} />
                  <div className="absolute top-full right-0 mt-1 z-50 bg-white border border-gray-200 rounded-lg shadow-lg py-1 w-40">
                    <MoreAiItem icon="💼" label="更正式" onClick={() => runAiEdit("tone-formal", "更正式")} loading={aiLoading === "tone-formal"} />
                    <MoreAiItem icon="💬" label="更口语" onClick={() => runAiEdit("tone-casual", "更口语")} loading={aiLoading === "tone-casual"} />
                    <MoreAiItem icon="🎯" label="更有说服力" onClick={() => runAiEdit("tone-persuasive", "更有说服力")} loading={aiLoading === "tone-persuasive"} />
                    <div className="border-t border-gray-100 my-1" />
                    <MoreAiItem icon="🌐" label="英译" onClick={() => runAiEdit("translate-en", "英译")} loading={aiLoading === "translate-en"} />
                    <MoreAiItem icon="💡" label="解释" onClick={() => runAiEdit("explain", "解释")} loading={aiLoading === "explain"} />
                    <MoreAiItem icon="📋" label="总结" onClick={() => runAiEdit("summarize", "总结")} loading={aiLoading === "summarize"} />
                    <MoreAiItem icon="✓" label="校对" onClick={() => runAiEdit("fix-grammar", "校对")} loading={aiLoading === "fix-grammar"} />
                  </div>
                </>
              )}
            </div>
          </>
        )}
      </BubbleMenu>

      {/* 浮动工具栏：空行时显示「+」插入 */}
      <FloatingMenu
        editor={editor}
        tippyOptions={{ duration: 100, placement: "left" }}
        className="flex items-center gap-1"
      >
        <button
          type="button"
          onClick={() => {
            // 触发斜杠命令（焦点已在新行）
            editor.chain().focus().insertContent("/").run();
          }}
          className="w-7 h-7 rounded-md bg-white border border-gray-200 hover:border-gray-400 flex items-center justify-center text-gray-500 hover:text-gray-700 shadow-sm transition"
          title="插入（输入 / 也可）"
        >
          +
        </button>
      </FloatingMenu>

      <EditorContent editor={editor} />

      {/* AI 预览浮动窗口（用户决定是否替换） */}
      {aiPreview && (
        <div
          className="fixed inset-x-0 top-16 z-[9999] mx-auto max-w-3xl bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden"
          role="dialog"
          aria-label="AI 改写预览"
        >
          {/* 顶部条 */}
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-gray-100 bg-gradient-to-r from-blue-50/50 to-white">
            <div className="flex items-center gap-2">
              <span className="text-base">{getActionIcon(aiPreview.action)}</span>
              <span className="font-medium text-gray-900 text-sm">AI {aiPreview.label}</span>
              {aiPreview.status === "streaming" && (
                <span className="text-xs text-blue-600 inline-flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                  生成中
                </span>
              )}
              {aiPreview.status === "error" && (
                <span className="text-xs text-red-600">失败</span>
              )}
              {aiPreview.status === "done" && (
                <span className="text-xs text-emerald-600 inline-flex items-center gap-1">
                  <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M20 6 9 17l-5-5" />
                  </svg>
                  完成
                </span>
              )}
            </div>
            <button
              type="button"
              onClick={cancelAiPreview}
              className="w-7 h-7 rounded-md text-gray-400 hover:text-gray-900 hover:bg-gray-100 inline-flex items-center justify-center"
              title="关闭"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" x2="6" y1="6" y2="18" />
                <line x1="6" x2="18" y1="6" y2="18" />
              </svg>
            </button>
          </div>

          {/* 对照区：原文 vs AI 改写 */}
          <div className="grid grid-cols-2 gap-px bg-gray-100 max-h-[60vh] overflow-y-auto">
            {/* 左：原文 */}
            <div className="bg-white p-4">
              <div className="text-[11px] text-gray-500 uppercase tracking-wide mb-1.5">原文</div>
              <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                {aiPreview.original}
              </div>
            </div>
            {/* 右：AI 改写 */}
            <div className="bg-white p-4">
              <div className="text-[11px] text-blue-600 uppercase tracking-wide mb-1.5">AI 改写</div>
              <div className="text-sm text-gray-900 whitespace-pre-wrap leading-relaxed">
                {aiPreview.status === "error" ? (
                  <span className="text-red-500">
                    ❌ {aiPreview.errorMsg || "生成失败"}
                  </span>
                ) : aiPreview.generated ? (
                  <>
                    {aiPreview.generated}
                    {aiPreview.status === "streaming" && (
                      <span className="inline-block w-0.5 h-3.5 bg-blue-500 ml-0.5 animate-pulse align-middle" />
                    )}
                  </>
                ) : (
                  <span className="text-gray-400">正在生成...</span>
                )}
              </div>
            </div>
          </div>

          {/* 底部操作栏 */}
          <div className="flex items-center justify-between px-4 py-2.5 border-t border-gray-100 bg-gray-50/50">
            <button
              type="button"
              onClick={regenerateAiPreview}
              disabled={aiPreview.status === "streaming"}
              className="text-xs text-gray-600 hover:text-gray-900 inline-flex items-center gap-1 px-2 py-1 rounded hover:bg-gray-100 disabled:opacity-40 disabled:cursor-not-allowed"
              title="用同样的动作重新生成"
            >
              <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="23 4 23 10 17 10" />
                <polyline points="1 20 1 14 7 14" />
                <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
              </svg>
              重新生成
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={cancelAiPreview}
                className="text-xs px-3 py-1.5 rounded-md text-gray-700 hover:bg-gray-100 transition"
              >
                取消
              </button>
              <button
                type="button"
                onClick={applyAiPreview}
                disabled={aiPreview.status !== "done"}
                className="text-xs px-3 py-1.5 rounded-md bg-gray-900 text-white hover:bg-gray-700 disabled:opacity-40 disabled:cursor-not-allowed transition inline-flex items-center gap-1"
              >
                <svg className="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                应用到原文
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
});

// ============ 子组件：气泡按钮 ============
function BubbleBtn({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={`w-7 h-7 rounded-md flex items-center justify-center text-sm transition ${
        active ? "bg-gray-900 text-white" : "text-gray-700 hover:bg-gray-100"
      }`}
    >
      {children}
    </button>
  );
}

// ============ 子组件：AI 改写按钮（带 loading 态） ============
function AiBtn({
  loading,
  onClick,
  label,
  children,
}: {
  loading: boolean;
  onClick: () => void;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      title={label}
      className={`h-7 px-2 rounded-md text-xs whitespace-nowrap inline-flex items-center gap-1 transition shrink-0 ${
        loading
          ? "bg-blue-50 text-blue-400 cursor-wait"
          : "text-gray-700 hover:bg-blue-50 hover:text-blue-600"
      } disabled:cursor-not-allowed`}
    >
      {loading ? (
        <svg className="w-3 h-3 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
        </svg>
      ) : null}
      {children}
    </button>
  );
}

// ============ 子组件：更多 AI 下拉菜单项 ============
function MoreAiItem({
  icon,
  label,
  onClick,
  loading,
}: {
  icon: string;
  label: string;
  onClick: () => void;
  loading: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={loading}
      className="w-full text-left px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition whitespace-nowrap"
    >
      <span className="w-4 text-center">{loading ? "⏳" : icon}</span>
      <span className="flex-1">{label}</span>
      {loading && <span className="text-[10px] text-blue-500">…</span>}
    </button>
  );
}

// ============ 辅助：action → 图标 ============
function getActionIcon(action: string): string {
  const map: Record<string, string> = {
    polish: "✨",
    expand: "📝",
    shorten: "✂️",
    "tone-formal": "💼",
    "tone-casual": "💬",
    "tone-persuasive": "🎯",
    "translate-en": "🌐",
    explain: "💡",
    summarize: "📋",
    "fix-grammar": "✓",
  };
  return map[action] || "✨";
}