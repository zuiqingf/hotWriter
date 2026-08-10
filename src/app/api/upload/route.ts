/**
 * POST /api/upload
 *
 * 富文本编辑器图片/文件上传
 * - 接收 multipart/form-data，field 名为 "file"
 * - 保存到 /public/uploads/YYYYMM/<timestamp>-<random>.<ext>
 * - 返回 { url, name, size, mime }
 *
 * 限制：
 * - 单文件 ≤ 5 MB
 * - 只接受图片 (image/png|jpeg|gif|webp) + 文本类文件 (text/plain, text/markdown)
 * - 文件名用时间戳 + 随机串，避免冲突
 */

import { NextRequest } from "next/server";
import path from "path";
import fs from "fs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_SIZE = 5 * 1024 * 1024; // 5 MB
const ALLOWED_MIME = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/gif",
  "image/webp",
  "image/svg+xml",
]);

function randomStr(len = 6): string {
  return Math.random().toString(36).slice(2, 2 + len);
}

function sanitizeName(name: string): string {
  // 只保留字母数字 + 中文 + 点，其他替换成 _
  return name.replace(/[^\w一-龥.\-]/g, "_").slice(0, 80);
}

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch (err: any) {
    return Response.json({ error: "解析上传失败：" + err.message }, { status: 400 });
  }

  const file = form.get("file");
  if (!file || !(file instanceof File)) {
    return Response.json({ error: "未收到文件" }, { status: 400 });
  }

  if (file.size > MAX_SIZE) {
    return Response.json(
      { error: `文件超过 ${MAX_SIZE / 1024 / 1024} MB 限制` },
      { status: 413 }
    );
  }

  if (!ALLOWED_MIME.has(file.type)) {
    return Response.json(
      { error: `不支持的文件类型：${file.type || "未知"}` },
      { status: 415 }
    );
  }

  // 按月份分目录，方便清理
  const now = new Date();
  const yyyymm = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}`;
  const dir = path.join(process.cwd(), "public", "uploads", yyyymm);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const ext = path.extname(file.name) || "";
  const baseName = sanitizeName(path.basename(file.name, ext));
  const filename = `${Date.now()}-${randomStr()}-${baseName}${ext}`;
  const fullPath = path.join(dir, filename);

  const buf = Buffer.from(await file.arrayBuffer());
  fs.writeFileSync(fullPath, buf);

  const url = `/uploads/${yyyymm}/${filename}`;
  return Response.json({
    url,
    name: file.name,
    size: file.size,
    mime: file.type,
  });
}