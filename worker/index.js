const ASSETS = {}; // injected by scripts/build-worker.mjs

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...JSON_HEADERS, ...extraHeaders },
  });
}

function text(value, limit = 4000) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

const requestsByUser = new Map();
function withinRateLimit(userId) {
  const now = Date.now();
  const windowMs = 5 * 60 * 1000;
  const current = requestsByUser.get(userId);
  if (!current || now - current.startedAt >= windowMs) {
    requestsByUser.set(userId, { startedAt: now, count: 1 });
    return true;
  }
  if (current.count >= 40) return false;
  current.count += 1;
  return true;
}

async function upstreamFailure(route, response) {
  let details = {};
  try {
    const payload = await response.clone().json();
    details = {
      type: text(payload?.error?.type, 120),
      code: text(payload?.error?.code, 120),
    };
  } catch {}
  console.error("OpenAI Responses request failed", { route, status: response.status, ...details });
  if (details.code === "expired_secret_key") {
    return json({ code: "AI_KEY_EXPIRED", message: "AI 服务密钥已过期，需由站点管理员更新后才能生成。", retryable: false }, 503);
  }
  if (response.status === 401) {
    return json({ code: "AI_KEY_INVALID", message: "AI 服务密钥无效，需由站点管理员更新后才能生成。", retryable: false }, 503);
  }
  if (["insufficient_quota", "billing_hard_limit_reached", "billing_not_active"].includes(details.code)) {
    return json({ code: "AI_QUOTA_EXHAUSTED", message: "AI 服务额度不足，需由站点管理员检查 API 账单或用量限制后再试。", retryable: false }, 503);
  }
  if (response.status === 429 && details.code === "rate_limit_exceeded" && details.type === "tokens") {
    const retryAfterSeconds = readRetryAfterSeconds(response);
    const waitText = retryAfterSeconds ? `请等待约 ${retryAfterSeconds} 秒后再试。` : "请稍后再试。";
    return json({
      code: "AI_TOKEN_RATE_LIMITED",
      message: `AI 服务的每分钟 Token 限额暂时已满。${waitText}若持续发生，请检查 OpenAI 项目的模型速率限制。`,
      retryable: true,
      retryAfterSeconds,
    }, 429, retryAfterSeconds ? { "retry-after": String(retryAfterSeconds) } : {});
  }
  if (response.status === 403 || details.code === "model_not_found") {
    return json({ code: "AI_ACCESS_DENIED", message: "AI 服务没有当前模型的访问权限，需由站点管理员检查服务配置。", retryable: false }, 503);
  }
  if (response.status === 429) {
    return json({ code: "AI_RATE_LIMITED", message: "AI 服务请求过于频繁，请稍后重试。", retryable: true }, 429);
  }
  if (response.status >= 400 && response.status < 500) {
    return json({ code: "AI_REQUEST_REJECTED", message: "AI 服务未接受本次请求，请联系站点管理员检查请求配置。", retryable: false }, 503);
  }
  return json({ code: "AI_UPSTREAM_UNAVAILABLE", message: "AI 服务暂时不可用，请稍后重试。", retryable: true }, 502);
}

function readRetryAfterSeconds(response) {
  const retryAfter = text(response.headers.get("retry-after"), 40);
  const seconds = Number(retryAfter);
  if (Number.isFinite(seconds) && seconds > 0) return Math.min(3600, Math.ceil(seconds));
  const retryDate = Date.parse(retryAfter);
  if (Number.isFinite(retryDate)) {
    const remaining = Math.ceil((retryDate - Date.now()) / 1000);
    if (remaining > 0) return Math.min(3600, remaining);
  }
  const reset = text(response.headers.get("x-ratelimit-reset-tokens"), 40);
  const match = reset.match(/^(?:(\d+(?:\.\d+)?)m)?(?:(\d+(?:\.\d+)?)s)?$/);
  if (!match || (!match[1] && !match[2])) return null;
  const duration = Number(match[1] || 0) * 60 + Number(match[2] || 0);
  return duration > 0 ? Math.min(3600, Math.ceil(duration)) : null;
}

function alignMinutes(modules, target) {
  const result = modules.map((module) => {
    const value = Number(module.minutes);
    return Math.max(5, Math.round((Number.isFinite(value) ? value : 45) / 5) * 5);
  });
  let delta = target - result.reduce((sum, value) => sum + value, 0);
  let cursor = 0;
  while (delta !== 0 && cursor < 1200) {
    const index = cursor % result.length;
    if (delta > 0) {
      result[index] += 5;
      delta -= 5;
    } else if (result[index] > 5) {
      result[index] -= 5;
      delta += 5;
    }
    cursor += 1;
  }
  return result;
}

async function generateOutline(request, env) {
  const userId = request.headers.get("oai-authenticated-user-id") || request.headers.get("cf-access-authenticated-user-email");
  if (!userId) return json({ message: "请先通过站点访问验证后再生成课程大纲。" }, 401);
  if (!withinRateLimit(userId)) {
    return json({ message: "生成次数较多，请稍后再试。" }, 429);
  }
  if (!env.OPENAI_API_KEY) {
    return json({ code: "AI_NOT_CONFIGURED", message: "AI 服务尚未配置，请联系工作台管理员。", retryable: false }, 503);
  }

  const rawBody = await request.text();
  if (rawBody.length > 60000) {
    return json({ message: "需求内容过长，请缩小本次大纲生成范围。" }, 413);
  }

  let body;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return json({ message: "无法读取课程需求，请重新提交。" }, 400);
  }

  const requirements = body?.requirements || {};
  const diagnosis = body?.diagnosis || {};
  const brief = {
    topic: text(requirements.topic, 500),
    audience: text(requirements.audience, 1000),
    learningGoals: text(requirements.goals, 2000),
    businessPain: text(requirements.pains, 2000),
    coreContent: text(requirements.content, 2500),
    duration: text(requirements.duration, 100),
    courseRecommendation: text(diagnosis.course, 500),
    abcdGoal: {
      audience: text(diagnosis.A, 800),
      behavior: text(diagnosis.B, 1200),
      conditions: text(diagnosis.C, 800),
      standard: text(diagnosis.D, 800),
    },
    trainingFit: text(diagnosis.fit, 1600),
    contentBoundary: text(diagnosis.contentScope, 2000),
    totalMinutes: Number(body?.totalMinutes),
  };

  if (!brief.topic || !brief.audience) {
    return json({ message: "请先补充课程主题和目标受众。" }, 400);
  }
  if (!brief.learningGoals && !brief.businessPain && !brief.coreContent) {
    return json({ message: "请至少补充学习目标、业务痛点或核心内容之一。" }, 400);
  }

  const targetMinutes = Math.min(
    2400,
    Math.max(30, Math.round((Number.isFinite(brief.totalMinutes) ? brief.totalMinutes : 360) / 5) * 5),
  );

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      modules: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            title: { type: "string" },
            minutes: { type: "integer" },
            subtasks: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  task: { type: "string" },
                  action: { type: "string" },
                },
                required: ["task", "action"],
              },
            },
          },
          required: ["title", "minutes", "subtasks"],
        },
      },
    },
    required: ["modules"],
  };

  let upstream;
  try {
    upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        authorization: `Bearer ${env.OPENAI_API_KEY}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-6-luna",
        max_output_tokens: 2400,
        store: false,
        input: [
          {
            role: "system",
            content:
              "你是企业培训课程设计顾问。只根据已确认的培训需求报告，搭建可�