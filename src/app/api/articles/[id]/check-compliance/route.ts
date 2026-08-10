/**
 * POST /api/articles/[id]/check-compliance
 *
 * 文章合规校验（基于内置的平台规则库，让 LLM 对照检查）
 */

import { NextRequest } from "next/server";
import { getLLMClient, MODEL_NAME } from "@/lib/llm/client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

interface RouteContext {
  params: { id: string };
}

// ============ 平台名 + 规则摘要 ============
// 用数组 + join() 拼接，避免模板字符串内嵌特殊字符的解析问题
const PLATFORM_RULES: Record<string, { name: string; rules: string }> = {
  zhihu: {
    name: "知乎",
    rules: [
      "【知乎平台合规规则 2026】",
      "【通用合规底线】",
      "1. AI生成内容强制标注：正文醒目位置需标注 AI 辅助生成；谐音符号替换规避标注会被识别处罚",
      "2. 严格遵循广告法：禁用全部极限宣传词（最、最佳、最高、最优、最强、最便宜、史上最强、天花板、封神、绝绝子、绝版、绝无仅有、无敌、完美、巅峰、顶尖、NO.1、全网第一、销量第一、行业第一、销冠、TOP1、独家、唯一、首款、首发、国家级、世界级、顶级、极致、100%、绝对、万能、永久）",
      "3. 商业内容公开披露：标注「广告/合作推广」，走知乎官方商业渠道",
      "4. 禁止违规导流：不得留存微信/手机号/二维码等站外联系方式",
      "5. 抵制低质抄袭搬运",
      "",
      "【知乎专属】",
      "- 标题30字以内，核心关键词前置；禁止标题党",
      "- 问答标题上限60字符",
      "- 好物推荐正文≥200字，深度干货建议2000字以上",
      "- 医疗/法律/金融专业领域：无资质不得输出诊疗、法务、理财实操指导",
      "- 禁止造谣抹黑、恶意诋毁竞品",
      "- 引用第三方内容占比过高未标注来源无法认定原创",
      "- 账号等级<4级不得开通好物推荐",
      "- 品牌合作必须走知乎官方商业渠道，严禁私接未报备广告",
    ].join("\n"),
  },

  xiaohongshu: {
    name: "小红书",
    rules: [
      "【小红书平台合规规则 2026】",
      "【通用合规底线】",
      "1. AI生成内容强制标注",
      "2. 严格遵循广告法（极限词禁用）",
      "3. 商业内容公开披露：标注「广告」标签，走蒲公英平台报备",
      "4. 禁止违规导流：不得留存微信/手机号/二维码等站外联系方式",
      "5. 抵制低质抄袭搬运",
      "",
      "【小红书专属】",
      "- 标题硬性上限20字，控制在16字以内最优",
      "- 正文总字符上限1000（含标点、Emoji），600~800字最佳",
      "- 单篇最多18张图片，3:4竖图，分辨率≥720×960",
      "- 话题标签搭配5~15个",
      "",
      "【严查重点】",
      "1. 医美项目严禁宣传功效：热玛吉、水光针、瘦脸针、医美仪器、医用敷料",
      "2. 高危营销词：医用级、零甲醛、永久不变形、100%环保",
      "3. 全封禁导流：微信、V、手机号、QQ、二维码暗语引流",
      "4. 虚假对比图、无真实下单的虚假自用测评、固定模板批量发文",
      "5. 严查虚假自用测评、无资质医美医疗宣传",
      "6. 系统核验线上购买/线下到店记录，虚假体验笔记直接下架",
    ].join("\n"),
  },

  toutiao: {
    name: "今日头条",
    rules: [
      "【今日头条平台合规规则 2026】",
      "【通用合规底线】",
      "1. AI生成内容强制标注",
      "2. 严格遵循广告法",
      "3. 商业内容公开披露：标注「广告」，走巨量星图报备",
      "4. 禁止违规导流",
      "5. 抵制低质抄袭搬运",
      "",
      "【头条专属】",
      "- 标题20~30字最佳，禁用堆砌标点、全大写、标题党",
      "- 资讯快讯1000字内，深度观点1500~2500字",
      "- 严禁连续3个及以上感叹号/问号刷屏",
      "- 配图3~6张高清合规",
      "- 原创度要求≥90%，首发原创流量权重更高",
      "- 开通原创即可解锁平台广告分成",
      "- 品牌商单统一入驻巨量星图，禁止私下接单",
      "",
      "【严查重点】",
      "1. 恐吓式标题党：震惊、再不看后悔终身、99%人不知道、看完一身冷汗",
      "2. 酒类管控：禁止宣传喝酒解压、强身健体、事业助力",
      "3. 金融违规词：保本高息、零风险躺赚、必涨、稳赚不赔",
      "4. 价值观违规：性别对立、地域歧视、低俗暧昧、刻意炫富、未成年人危险引导",
      "5. 生硬硬广植入、虚假资讯、畸形价值观",
    ].join("\n"),
  },

  wechat: {
    name: "微信公众号",
    rules: [
      "【微信公众号合规规则 2026】",
      "【通用合规底线】",
      "1. AI生成内容强制标注：正文开头醒目标注「AI辅助创作」",
      "2. 严格遵循广告法",
      "3. 商业内容公开披露：标注「广告/合作推广」，走互选广告",
      "4. 禁止违规导流",
      "5. 抵制低质抄袭搬运",
      "",
      "【公众号专属】",
      "- 标题20~30字；信息流展示约25字，看一看公域推荐30字",
      "- 干货长文1500~3000字，短资讯800字以内",
      "- 头条封面优选2.35:1（900×383px），次条封面1:1正方形",
      "- 单张图片≤10MB，支持GIF动图",
      "- 摘要120字以内自定义",
      "- 引用他人内容超100字必须标注来源",
      "- 引用第三方内容超100字必须标注来源；摘抄整合、外文翻译无法声明原创",
      "- 粉丝≥100开通流量主",
      "- AI批量生成无价值水文严打",
      "",
      "【严查重点 - 微信生态零容忍】",
      "1. 诱导分享（最高危）：门槛式分享、利诱分享、道德绑架转发",
      "   例：分享才可查看全文/解锁答案；集赞、集卡、助力砍价、转发领红包；不转可惜、不转不是中国人、转发保平安",
      "2. 诱导关注违规：关注后查看完整版、关注回复关键词领资源",
      "3. 违规导流：阅读原文恶意跳转第三方；图片/评论暗藏微信/手机号/二维码",
      "4. 资质违规：无新闻资质发布突发事件/时政解读；无资质科普看病开药/理财保本/打包诉讼必胜",
      "5. 造谣不实信息、冒用官方机构名义发文",
      "6. AI辅助创作正文开头醒目标注「AI辅助创作」；禁止纯AI批量灌水发文",
    ].join("\n"),
  },
};

export async function POST(req: NextRequest, ctx: RouteContext) {
  if (!process.env.DEEPSEEK_API_KEY) {
    return new Response(
      JSON.stringify({ error: "DEEPSEEK_API_KEY 未配置" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }

  const body = await req.json().catch(() => ({}));
  const { content, platform } = body as { content?: string; platform?: string };

  if (!content || typeof content !== "string") {
    return new Response(
      JSON.stringify({ error: "缺少 content" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  if (!platform || !(platform in PLATFORM_RULES)) {
    return new Response(
      JSON.stringify({ error: "不支持的平台：" + platform }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  const platformInfo = PLATFORM_RULES[platform];
  // 把 HTML 转成纯文本，节省 token
  const plainText = content
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, "\n")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!plainText) {
    return new Response(
      JSON.stringify({ error: "内容为空" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  if (plainText.length > 8000) {
    return new Response(
      JSON.stringify({ error: "内容超过 8000 字上限" }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }

  // 用数组 + join，避免模板字符串嵌套 + 内嵌反引号解析问题
  const systemPrompt = [
    "你是「" + platformInfo.name + "」平台的内容合规审核员。",
    "对照下方【" + platformInfo.name + "平台合规规则】，严格检查用户提供的文章，找出所有违规和潜在风险。",
    "",
    platformInfo.rules,
    "",
    "【输出要求】",
    "1. 严格按 JSON 格式输出，不要解释、不要客套话",
    "2. 找出所有 violations（必须修改的违规）和 warnings（潜在风险/建议优化）",
    "3. violations 必须给出具体触发的文本片段（从原文中复制）、对应规则条款、严重等级",
    "4. violations 必须给出修复方案：fix（替换后的合规版本，整段原文被违规部分改写后的样子；只输出修复部分，不要其他内容）+ suggestion（怎么改的简短说明）",
    "5. warnings 给出改进建议（suggestion 字段）",
    "6. 如果没有违规，violations 为空数组；warnings 可以包含建议优化的项",
    "7. score 0-100，100=完美合规，0=完全违规",
    "8. overall: pass（无违规，可发布）/ warning（有警告，建议修改）/ violation（有违规，禁止发布）",
    "",
    "【输出格式】（请输出一个 JSON 对象，用代码块包裹）",
    "JSON 结构示意：",
    "{",
    '  "overall": "pass" | "warning" | "violation",',
    '  "score": 0-100,',
    '  "summary": "一句话总结",',
    '  "violations": [',
    '    { "type": "类别", "text": "原文片段", "rule": "规则引用", "severity": "high|medium", "fix": "修复后的版本（只改违规部分）", "suggestion": "怎么改的简短说明" }',
    "  ],",
    '  "warnings": [',
    '    { "type": "类别", "text": "原文片段（可选）", "rule": "规则引用", "suggestion": "怎么改" }',
    "  ],",
    '  "suggestions": ["通用建议1", "通用建议2"]',
    "}",
  ].join("\n");

  const userPrompt = [
    "请检查以下文章是否符合【" + platformInfo.name + "】平台规范：",
    "",
    "【文章正文】",
    plainText,
    "",
    "请输出 JSON 结果。",
  ].join("\n");

  try {
    const client = getLLMClient();
    const completion = await client.chat.completions.create({
      model: MODEL_NAME,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const resultText = completion.choices[0]?.message?.content || "{}";
    let result: any;
    try {
      result = JSON.parse(resultText);
    } catch {
      const m = resultText.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (m) result = JSON.parse(m[1].trim());
      else {
        const m2 = resultText.match(/\{[\s\S]*\}/);
        if (m2) result = JSON.parse(m2[0]);
        else throw new Error("LLM 输出非 JSON");
      }
    }

    return new Response(
      JSON.stringify({
        platform,
        platformName: platformInfo.name,
        overall: result.overall || "warning",
        score: typeof result.score === "number" ? result.score : 0,
        summary: result.summary || "",
        violations: Array.isArray(result.violations) ? result.violations : [],
        warnings: Array.isArray(result.warnings) ? result.warnings : [],
        suggestions: Array.isArray(result.suggestions) ? result.suggestions : [],
        usage: completion.usage,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    return new Response(
      JSON.stringify({ error: "校验失败：" + err.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
}