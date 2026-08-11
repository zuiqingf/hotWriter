"use client";

export default function Error({ error }: { error: Error }) {
  return (
    <div style={{ padding: "40px", textAlign: "center", fontFamily: "system-ui" }}>
      <h1>500 - 出错了</h1>
      <p style={{ color: "#666" }}>{error?.message || "服务器内部错误"}</p>
    </div>
  );
}
