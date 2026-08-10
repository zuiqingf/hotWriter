/**
 * 简易 Markdown 渲染组件（不引入第三方库）
 *
 * 覆盖：
 *   # / ## / ###          → h1 / h2 / h3
 *   **bold** *italic*     → strong / em
 *   `code`                → <code>
 *   ```code block```      → <pre><code>
 *   > quote               → <blockquote>
 *   - item / 1. item      → <ul> / <ol>
 *   [text](url)           → <a>
 *   空行                  → 分段
 *
 * 不支持：表格、引用块嵌套、HTML 标签（防 XSS）
 */

import React from "react";

interface Props {
  text: string;
}

/* 行级 inline：处理 bold / italic / code / link */
function renderInline(line: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let i = 0;
  let key = 0;
  while (i < line.length) {
    const rest = line.slice(i);

    // [text](url)
    const link = rest.match(/^\[([^\]]+)\]\(([^)]+)\)/);
    if (link) {
      out.push(
        <a
          key={key++}
          href={link[2]}
          target="_blank"
          rel="noopener noreferrer"
          className="text-brand-600 underline hover:text-brand-700"
        >
          {link[1]}
        </a>
      );
      i += link[0].length;
      continue;
    }

    // **bold**
    const bold = rest.match(/^\*\*([^*]+)\*\*/);
    if (bold) {
      out.push(
        <strong key={key++} className="font-semibold">
          {bold[1]}
        </strong>
      );
      i += bold[0].length;
      continue;
    }

    // *italic*
    const italic = rest.match(/^\*([^*\n]+)\*/);
    if (italic) {
      out.push(
        <em key={key++} className="italic">
          {italic[1]}
        </em>
      );
      i += italic[0].length;
      continue;
    }

    // `code`
    const code = rest.match(/^`([^`]+)`/);
    if (code) {
      out.push(
        <code
          key={key++}
          className="px-1.5 py-0.5 mx-0.5 rounded bg-gray-100 text-pink-600 font-mono text-[0.9em]"
        >
          {code[1]}
        </code>
      );
      i += code[0].length;
      continue;
    }

    // 普通字符：吃掉下一个字符直到下一个特殊标记
    const next = line.slice(i).search(/[\*[`]/);
    if (next < 0 || next === line.length - 1) {
      out.push(line.slice(i));
      break;
    }
    if (next < 0) {
      out.push(line.slice(i));
      break;
    }
    out.push(line.slice(i, i + next + 1));
    i += next + 1;
  }
  return out;
}

/* 整段：处理 multi-line block（headings/lists/codeblock/quote/paragraph） */
export function Markdown({ text }: Props) {
  if (!text || !text.trim()) {
    return (
      <div className="text-gray-400 italic py-12 text-center">
        （文章内容为空，点击右侧「Agent 写全文」或与 AI 对话生成内容）
      </div>
    );
  }

  const lines = text.split("\n");
  const blocks: React.ReactNode[] = [];
  let i = 0;
  let key = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 空行 → 分段
    if (!line.trim()) {
      i++;
      continue;
    }

    // # / ## / ###
    const h = line.match(/^(#{1,3})\s+(.*)$/);
    if (h) {
      const level = h[1].length;
      const text = h[2];
      const Tag = (`h${level}` as unknown) as keyof JSX.IntrinsicElements;
      const cls =
        level === 1
          ? "text-3xl font-bold mt-8 mb-4 text-gray-900"
          : level === 2
          ? "text-2xl font-bold mt-7 mb-3 text-gray-900 border-b border-gray-100 pb-2"
          : "text-xl font-semibold mt-5 mb-2 text-gray-900";
      blocks.push(
        <Tag key={key++} className={cls}>
          {renderInline(text)}
        </Tag>
      );
      i++;
      continue;
    }

    // code block（``` ... ```）
    if (line.startsWith("```")) {
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // 跳过结束 ```
      blocks.push(
        <pre
          key={key++}
          className="my-4 p-4 bg-gray-50 rounded-lg overflow-x-auto border border-gray-200"
        >
          <code className="font-mono text-sm text-gray-800">
            {codeLines.join("\n")}
          </code>
        </pre>
      );
      continue;
    }

    // > quote（可连续多行直到空行）
    if (line.startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < lines.length && (lines[i].startsWith(">") || (!lines[i].trim() && quoteLines.length > 0))) {
        if (lines[i].startsWith(">")) {
          quoteLines.push(lines[i].replace(/^>\s?/, ""));
        } else if (!lines[i].trim()) {
          break;
        }
        i++;
      }
      blocks.push(
        <blockquote
          key={key++}
          className="my-4 pl-4 border-l-4 border-violet-300 text-gray-700 italic"
        >
          {quoteLines.map((ql, idx) => (
            <p key={idx} className="leading-relaxed">
              {renderInline(ql)}
            </p>
          ))}
        </blockquote>
      );
      continue;
    }

    // - unordered list（连续直到空行或非 - 开头）
    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^[-*]\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^[-*]\s+/, ""));
        i++;
      }
      blocks.push(
        <ul key={key++} className="my-4 ml-6 list-disc space-y-1">
          {items.map((it, idx) => (
            <li key={idx} className="leading-relaxed">
              {renderInline(it)}
            </li>
          ))}
        </ul>
      );
      continue;
    }

    // 1. ordered list
    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\.\s+/.test(lines[i])) {
        items.push(lines[i].replace(/^\d+\.\s+/, ""));
        i++;
      }
      blocks.push(
        <ol key={key++} className="my-4 ml-6 list-decimal space-y-1">
          {items.map((it, idx) => (
            <li key={idx} className="leading-relaxed">
              {renderInline(it)}
            </li>
          ))}
        </ol>
      );
      continue;
    }

    // 段落：合并连续非空非特殊行
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() &&
      !/^(#{1,3}\s|```|>\s?|[-*]\s+|\d+\.\s+)/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push(
        <p key={key++} className="my-3 leading-[1.85]">
          {renderInline(paraLines.join(" "))}
        </p>
      );
    }
  }

  return (
    <article className="prose-textarea" style={{ lineHeight: 1.85 }}>
      {blocks}
    </article>
  );
}
