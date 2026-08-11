/**
 * 热榜抓取器
 *
 * 数据源：
 * - 今日头条：https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc
 *   ↳ HTML 内嵌 JSON，匹配 "Title":"..." 提取
 * - 百度热搜：https://top.baidu.com/board?tab=realtime
 *   ↳ HTML 内嵌 JSON，匹配 "word":"..." 提取
 * - 澎湃新闻：https://www.thepaper.cn/contentapi/contVisit/wwwRank
 *   ↳ 内部热榜 API（澎湃官网首页"热榜"模块用的同一个）
 *   ↳ 返回 data.contentRank.oneDay[]（按 24h 互动量排序）
 *   ↳ 每条带 contId（拼成 newsDetail_forward_XXX）+ 点赞数/互动数
 * - 抖音总榜：https://tophub.today/n/DpQvNABoNE
 *   ↳ tophub.today 是第三方聚合站（iPhone UA 访问才放行）
 *   ↳ 抖音原网站反爬太强（需 a_bogus 签名 + msToken），无法直接抓
 *
 * 注意：
 * - 礼貌抓取（带 User-Agent、Referer、超时 5s）
 * - 失败一律降级，不影响首页加载
 * - 抓取后写入 hot_topics 表，做历史追溯
 */

import { db } from "../db";

export interface HotItem {
  rank: number;
  title: string;
  url: string;
  hot?: number;       // 热度值（如果有）
}

export interface HotListResult {
  ok: boolean;
  items: HotItem[];
  source: "live" | "fallback";
  error?: string;
}

export interface HotTopicsData {
  thepaper: HotListResult;
  toutiao: HotListResult;
  baidu: HotListResult;
  douyin: HotListResult;
  fetchedAt: number;       // 抓取时间戳
}

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
  Accept: "text/html,application/xhtml+xml,application/json",
  "Accept-Language": "zh-CN,zh;q=0.9",
};

// tophub.today 用桌面 UA 会被拦截（连接超时），必须用 iPhone Safari 才放行
const TOPHUB_HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
  Accept: "text/html,application/xhtml+xml,application/json",
  "Accept-Language": "zh-CN,zh;q=0.9",
};

const TIMEOUT = 5000;
const TOPHUB_TIMEOUT = 25000;   // tophub.today 海外服务器，给足时间

// ==================== 头条 ====================
async function fetchToutiao(): Promise<HotListResult> {
  try {
    const res = await fetch(
      "https://www.toutiao.com/hot-event/hot-board/?origin=toutiao_pc",
      {
        headers: HEADERS,
        signal: AbortSignal.timeout(TIMEOUT),
      }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    // 匹配 "Title":"..." 同时拿到 URL 和热度
    // 头条 HTML 一般结构：...{"Title":"xx","Url":"yy","HotValue":12345}...
    const items: HotItem[] = [];
    // 用更宽松的正则抓所有 Title
    const matches = html.matchAll(
      /"Title":"([^"]{4,80})"(?:,"Url":"([^"]+)")?(?:,"HotValue":(\d+))?/g
    );
    let rank = 1;
    const seen = new Set<string>();
    for (const m of matches) {
      const title = m[1];
      if (seen.has(title)) continue;
      seen.add(title);
      items.push({
        rank: rank++,
        title,
        url: m[2] || `https://www.toutiao.com/search/?keyword=${encodeURIComponent(title)}`,
        hot: m[3] ? parseInt(m[3]) : undefined,
      });
      if (items.length >= 10) break;
    }
    if (items.length === 0) throw new Error("未匹配到头条热点");
    return { ok: true, items, source: "live" };
  } catch (err: any) {
    return {
      ok: false,
      items: FALLBACK.toutiao,
      source: "fallback",
      error: err.message,
    };
  }
}

// ==================== 百度 ====================
async function fetchBaidu(): Promise<HotListResult> {
  try {
    const res = await fetch("https://top.baidu.com/board?tab=realtime", {
      headers: HEADERS,
      signal: AbortSignal.timeout(TIMEOUT),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    // 百度 HTML 含 "word":"..."、"desc":"..."、"url":"..."、"hot":"..."
    // 先匹配一个完整条目块：{"word":"XX",..., "hot":NNN}
    const items: HotItem[] = [];
    const wordMatches = html.matchAll(
      /\{[^}]*"word":"([^"]{4,80})"[^}]*\}/g
    );

    const seen = new Set<string>();
    let rank = 1;
    for (const m of wordMatches) {
      const block = m[0];
      const title = m[1];
      if (seen.has(title)) continue;

      // 从同一 block 里抽 url 和 hot
      const urlMatch = block.match(/"url":"([^"]+)"/);
      const hotMatch = block.match(/"hot":(\d+(?:\.\d+)?)/);
      const hotScore = block.match(/"hotScore":(\d+)/);

      seen.add(title);
      items.push({
        rank: rank++,
        title,
        url: urlMatch
          ? urlMatch[1]
          : `https://www.baidu.com/s?wd=${encodeURIComponent(title)}`,
        hot: hotMatch
          ? Math.round(parseFloat(hotMatch[1]) * 10000)
          : hotScore
          ? parseInt(hotScore[1])
          : undefined,
      });
      if (items.length >= 10) break;
    }
    if (items.length === 0) throw new Error("未匹配到百度热点");
    return { ok: true, items, source: "live" };
  } catch (err: any) {
    return {
      ok: false,
      items: FALLBACK.baidu,
      source: "fallback",
      error: err.message,
    };
  }
}

// ==================== 澎湃新闻热榜 ====================
// 内部 API：https://www.thepaper.cn/contentapi/contVisit/wwwRank
//   ↳ 返回 data.contentRank.oneDay[]，按 24h 互动量排序的真实热榜
//   ↳ 每条带 contId（拼成 https://www.thepaper.cn/newsDetail_forward_NNN）+ praiseTimes + interactionNum
//   ↳ 这是澎湃官网首页"热榜"模块用的同一个接口（在 rebangtop / hotNews 容器里调用）
async function fetchThepaper(): Promise<HotListResult> {
  try {
    const res = await fetch(
      "https://www.thepaper.cn/contentapi/contVisit/wwwRank",
      {
        headers: {
          ...HEADERS,
          Accept: "application/json",
          Referer: "https://www.thepaper.cn/",
        },
        signal: AbortSignal.timeout(TIMEOUT),
      }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json: any = await res.json();
    if (json.code !== 200) throw new Error(`API code ${json.code}`);

    const list: any[] = json?.data?.contentRank?.oneDay ?? [];
    if (list.length === 0) throw new Error("澎湃热榜为空");

    const items: HotItem[] = [];
    const seen = new Set<string>();
    let rank = 1;
    for (const item of list) {
      const title: string = item.name ?? "";
      const contId: string = item.contId ?? "";
      if (!title || title.length < 4) continue;
      if (!contId) continue;
      if (seen.has(title)) continue;
      seen.add(title);

      // praiseTimes 是点赞数，interactionNum 是总互动量（含评论/分享），用后者作为热度
      const interaction = parseInt(item.interactionNum) || 0;
      items.push({
        rank: rank++,
        title,
        url: `https://www.thepaper.cn/newsDetail_forward_${contId}`,
        hot: interaction || undefined,
      });
      if (items.length >= 10) break;
    }
    if (items.length === 0) throw new Error("未匹配到澎湃热榜条目");
    return { ok: true, items, source: "live" };
  } catch (err: any) {
    return {
      ok: false,
      items: FALLBACK.thepaper,
      source: "fallback",
      error: err.message,
    };
  }
}

// ==================== 抖音总榜（tophub.today 聚合）====================
// 抖音原站反爬太强（需 a_bogus + msToken 签名算法，每月变几次）
// tophub.today 是稳定运营的第三方聚合站，节点 ID DpQvNABoNE = 抖音总榜
// 关键：用 iPhone Safari UA 才不会被 tophub 拦截（桌面 UA 连接超时）
async function fetchDouyin(): Promise<HotListResult> {
  try {
    const res = await fetch("https://tophub.today/n/DpQvNABoNE", {
      headers: TOPHUB_HEADERS,
      signal: AbortSignal.timeout(TOPHUB_TIMEOUT),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const html = await res.text();

    // 抖音节点页结构：每条热搜是一个 <a href="douyin.com/video/XXX"> 包住
    // 内部有 <div class="number">N</div>（排名）+ <div class="s-title">标题</div>
    // 注：首页用的是 hot-title，节点页用的是 s-title —— 两个正则都要支持
    const nodePattern =
      /href=["']?(https:\/\/www\.douyin\.com\/video\/\d+)["'\s][^<]*<div class="number[^"]*">(\d+)<\/div>[\s\S]*?<div class="s-title">([^<]{4,200})<\/div>/g;

    const homePattern =
      /<span class="hot-title">([^<]{4,200})<\/span>/g;

    const items: HotItem[] = [];
    const seen = new Set<string>();
    let rank = 1;

    // 先尝试节点页正则
    for (const m of html.matchAll(nodePattern)) {
      const url = m[1];
      const num = parseInt(m[2]);
      const title = m[3].trim();
      if (seen.has(title)) continue;
      seen.add(title);
      items.push({
        rank: num || rank++,
        title,
        url,
      });
      if (items.length >= 10) break;
    }

    // 节点页没抓到时退而求其次用首页 hot-title（不附带 URL，但仍有标题）
    if (items.length === 0) {
      for (const m of html.matchAll(homePattern)) {
        const title = m[1].trim();
        if (seen.has(title)) continue;
        seen.add(title);
        items.push({
          rank: rank++,
          title,
          url: `https://www.douyin.com/search/${encodeURIComponent(title)}`,
        });
        if (items.length >= 10) break;
      }
    }

    if (items.length === 0) throw new Error("未匹配到抖音热点");
    return { ok: true, items, source: "live" };
  } catch (err: any) {
    return {
      ok: false,
      items: FALLBACK.douyin,
      source: "fallback",
      error: err.message,
    };
  }
}

// ==================== 主入口 ====================
export async function fetchAllHotTopics(): Promise<HotTopicsData> {
  const [thepaper, toutiao, baidu, douyin] = await Promise.all([
    fetchThepaper(),
    fetchToutiao(),
    fetchBaidu(),
    fetchDouyin(),
  ]);

  // 持久化成功的实时数据（失败的 fallback 不入库，避免脏数据）
  if (thepaper.ok) await persistHotTopics(thepaper.items, "thepaper");
  if (toutiao.ok) await persistHotTopics(toutiao.items, "toutiao");
  if (baidu.ok) await persistHotTopics(baidu.items, "baidu");
  if (douyin.ok) await persistHotTopics(douyin.items, "douyin");

  return {
    thepaper,
    toutiao,
    baidu,
    douyin,
    fetchedAt: Date.now(),
  };
}

// ==================== 历史追溯：持久化到 hot_topics 表 ====================
/**
 * 写入策略（upsert）：
 * - 同一 (source, title) 在 24 小时内已有记录 → 更新 hot_score / rank / fetched_at
 * - 否则 → INSERT 新行
 * - 这样历史自然保留（一个月 ≈ 900 行），可按 fetched_at 查询趋势
 */
const DEDUP_WINDOW_SEC = 24 * 3600;

async function persistHotTopics(items: HotItem[], source: string): Promise<void> {
  try {
    const now = Math.floor(Date.now() / 1000);
    const threshold = now - DEDUP_WINDOW_SEC;

    for (const item of items) {
      if (!item.title || item.title.length < 4) continue;

      const existing = await db.get<{ id: number }>(
        `SELECT id FROM hot_topics
         WHERE source = ? AND title = ?
           AND fetched_at >= ?
         ORDER BY fetched_at DESC
         LIMIT 1`,
        [source, item.title, threshold]
      );

      if (existing) {
        await db.run(
          `UPDATE hot_topics
           SET hot_score = ?, fetched_at = ?, url = ?
           WHERE id = ?`,
          [item.hot ?? null, now, item.url, existing.id]
        );
      } else {
        await db.run(
          `INSERT INTO hot_topics (title, source, url, hot_score, fetched_at)
           VALUES (?, ?, ?, ?, ?)`,
          [item.title, source, item.url, item.hot ?? null, now]
        );
      }
    }
  } catch (err) {
    console.warn("[hot] 持久化失败（不影响页面）:", err);
  }
}

/**
 * 查询最近的 N 条历史热点（按时间倒序）
 * 用于 v2.0 做"今天 vs 昨天"对比等
 */
export interface HotTopicRow {
  title: string;
  source: string;
  hot_score: number | null;
  fetched_at: number;
}

export async function queryRecentHotTopics(days: number = 7): Promise<HotTopicRow[]> {
  try {
    const threshold = Math.floor(Date.now() / 1000) - days * 86400;
    return await db.all<HotTopicRow>(
      `SELECT title, source, hot_score, fetched_at
       FROM hot_topics
       WHERE fetched_at >= ?
       ORDER BY fetched_at DESC
       LIMIT 200`,
      [threshold]
    );
  } catch {
    return [];
  }
}

// ==================== 兜底数据 ====================
// 当抓取失败时使用。手动更新频率：每月一次或热点大事件时
const FALLBACK = {
  douyin: [
    { rank: 1, title: "示例：抖音热门视频话题 1", url: "https://www.douyin.com/" },
    { rank: 2, title: "示例：抖音热门视频话题 2", url: "https://www.douyin.com/" },
    { rank: 3, title: "示例：抖音热门视频话题 3", url: "https://www.douyin.com/" },
    { rank: 4, title: "示例：抖音热门视频话题 4", url: "https://www.douyin.com/" },
    { rank: 5, title: "示例：抖音热门视频话题 5", url: "https://www.douyin.com/" },
    { rank: 6, title: "示例：抖音热门视频话题 6", url: "https://www.douyin.com/" },
    { rank: 7, title: "示例：抖音热门视频话题 7", url: "https://www.douyin.com/" },
    { rank: 8, title: "示例：抖音热门视频话题 8", url: "https://www.douyin.com/" },
    { rank: 9, title: "示例：抖音热门视频话题 9", url: "https://www.douyin.com/" },
    { rank: 10, title: "示例：抖音热门视频话题 10", url: "https://www.douyin.com/" },
  ] as HotItem[],
  thepaper: [
    { rank: 1, title: "示例：澎湃新闻要闻 1", url: "https://www.thepaper.cn/" },
    { rank: 2, title: "示例：澎湃新闻要闻 2", url: "https://www.thepaper.cn/" },
    { rank: 3, title: "示例：澎湃新闻要闻 3", url: "https://www.thepaper.cn/" },
    { rank: 4, title: "示例：澎湃新闻要闻 4", url: "https://www.thepaper.cn/" },
    { rank: 5, title: "示例：澎湃新闻要闻 5", url: "https://www.thepaper.cn/" },
    { rank: 6, title: "示例：澎湃新闻要闻 6", url: "https://www.thepaper.cn/" },
    { rank: 7, title: "示例：澎湃新闻要闻 7", url: "https://www.thepaper.cn/" },
    { rank: 8, title: "示例：澎湃新闻要闻 8", url: "https://www.thepaper.cn/" },
    { rank: 9, title: "示例：澎湃新闻要闻 9", url: "https://www.thepaper.cn/" },
    { rank: 10, title: "示例：澎湃新闻要闻 10", url: "https://www.thepaper.cn/" },
  ] as HotItem[],
  toutiao: [
    { rank: 1, title: "伊媒发布伊朗最高领袖视频", url: "https://www.toutiao.com/" },
    { rank: 2, title: "上半年国内手机销量TOP30出炉", url: "https://www.toutiao.com/" },
    { rank: 3, title: "一周靓数", url: "https://www.toutiao.com/" },
    { rank: 4, title: "伊总统：伊朗要学中国做好自己的事", url: "https://www.toutiao.com/" },
    { rank: 5, title: "白海豚将正面袭击贯穿浙江", url: "https://www.toutiao.com/" },
    { rank: 6, title: "示例热点 6", url: "https://www.toutiao.com/" },
    { rank: 7, title: "示例热点 7", url: "https://www.toutiao.com/" },
    { rank: 8, title: "示例热点 8", url: "https://www.toutiao.com/" },
    { rank: 9, title: "示例热点 9", url: "https://www.toutiao.com/" },
    { rank: 10, title: "示例热点 10", url: "https://www.toutiao.com/" },
  ] as HotItem[],
  baidu: [
    { rank: 1, title: "全民健身事业高质量发展", url: "https://top.baidu.com/board?tab=realtime" },
    { rank: 2, title: "杭州全市有序停课", url: "https://top.baidu.com/board?tab=realtime" },
    { rank: 3, title: "台风白海豚到哪了", url: "https://top.baidu.com/board?tab=realtime" },
    { rank: 4, title: "生产也能拼单了", url: "https://top.baidu.com/board?tab=realtime" },
    { rank: 5, title: "雪佛兰退出中国市场 售后怎么办", url: "https://top.baidu.com/board?tab=realtime" },
    { rank: 6, title: "示例热点 6", url: "https://top.baidu.com/board?tab=realtime" },
    { rank: 7, title: "示例热点 7", url: "https://top.baidu.com/board?tab=realtime" },
    { rank: 8, title: "示例热点 8", url: "https://top.baidu.com/board?tab=realtime" },
    { rank: 9, title: "示例热点 9", url: "https://top.baidu.com/board?tab=realtime" },
    { rank: 10, title: "示例热点 10", url: "https://top.baidu.com/board?tab=realtime" },
  ] as HotItem[],
};
