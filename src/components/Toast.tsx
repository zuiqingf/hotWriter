"use client";

/**
 * Toast 提示系统（轻量，无依赖）
 *
 * 用法：
 *   import { useToasts, ToastViewport } from "@/components/Toast";
 *   const { toasts, showToast } = useToasts();
 *   showToast("已复制", "success");
 *   ...
 *   <ToastViewport toasts={toasts} />
 */

import { useCallback, useState } from "react";

export type ToastType = "success" | "error" | "info";

export interface Toast {
  id: string;
  message: string;
  type: ToastType;
}

const DEFAULT_DURATION = 2200;

/** 简单 hook：管理 toast 列表 + 暴露 showToast */
export function useToasts() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, type: ToastType = "info", durationMs: number = DEFAULT_DURATION) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev, { id, message, type }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, durationMs);
    },
    []
  );

  return { toasts, showToast, dismiss };
}

/** 视图组件：右上角堆叠，自动淡入淡出 */
export function ToastViewport({ toasts }: { toasts: Toast[] }) {
  if (toasts.length === 0) return null;
  return (
    <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[9999] flex flex-col items-center gap-2 pointer-events-none">
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} />
      ))}
    </div>
  );
}

function ToastItem({ toast }: { toast: Toast }) {
  // 不同 type 不同配色（豆包式：默认黑底白字）
  const bg =
    toast.type === "success"
      ? "bg-gray-900/95 text-white"
      : toast.type === "error"
      ? "bg-red-600 text-white"
      : "bg-gray-800 text-white";

  return (
    <div
      className={`toast-in pointer-events-auto inline-flex items-center gap-2 px-4 py-2 rounded-lg shadow-lg ${bg} text-sm font-medium backdrop-blur-sm`}
      role="status"
    >
      {toast.type === "success" && (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6 9 17l-5-5" />
        </svg>
      )}
      {toast.type === "error" && (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      )}
      {toast.type === "info" && (
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
      )}
      <span>{toast.message}</span>
    </div>
  );
}