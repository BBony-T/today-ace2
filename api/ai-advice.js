// /api/ai-advice.js
import { GoogleGenerativeAI } from '@google/generative-ai';

const MODEL = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
const API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';

function toStr(v) { return (v ?? '').toString(); }
function clampLen(s, max = 2000) {
  const t = toStr(s);
  return t.length > max ? t.slice(0, max) + '…(truncated)' : t;
}
function safeJson(v, max = 4000) {
  try {
    const s = JSON.stringify(v ?? {});
    return s.length > max ? s.slice(0, max) + '…(truncated)' : s;
  } catch {
    return '{}';
  }
}

async function callGemini({ career, statsSummary, stats, username, rosterId }) {
  if (!API_KEY) {
    return {
      ok: false,
      error: 'NO_API_KEY'
    };
  }

  const genAI = new GoogleGenerativeAI(API_KEY);
  const model = genAI.getGenerativeModel({ model: MODEL });

  // — 친절 / 응원 톤으로 프롬프트 구성 —
  const system = [
    '너는 학생의 강점을 먼저 칭찬하고, 따뜻하게 격려하는 멘토야.',
    '명령조 대신 제안/권유형 어조를 사용하고, 부담스럽지 않은 작은 실천을 제시해.',
    '먼저 최다 추천 역량에 대한 칭찬과 구체적 강점 설명을 2~3문장으로 써줘.',
    '그 다음 관심 진로나 활동과 연결해 키워나갈 방법을 3~5가지 정도 제안해줘.',
    '문단 사이에는 공백 줄 없이 자연스러운 문장 흐름으로 작성해.',
  ].join(' ');

  const userContext = [
    `학생 아이디: ${username || '-'}`,
    rosterId ? `선택된 명부 ID: ${rosterId}` : '선택된 명부 ID: 없음',
    `관심 진로/분야: ${career || '미입력'}`,
    '',
    '[통계 요약]',
    clampLen(statsSummary, 1800),
    '',
    '[원시 통계 JSON 일부]',
    safeJson(stats, 1800),
  ].join('\n');

  const prompt = `${system}\n\n${userContext}\n\n위 정보를 바탕으로 학생에게 맞춘 성장 조언을 작성해줘.`;

  const result = await model.generateContent(prompt);
  const text = result?.response?.text?.();
  if (!text) {
    return { ok: false, error: 'EMPTY_RESPONSE' };
  }
  return { ok: true, text };
}

export default async function handler(req, res) {
  try {
    // ---- 진단 모드 ----
    if (req.method === 'GET' && req.query?.diag === '1') {
      return res.status(200).json({
        success: true,
        route: '/api/ai-advice',
        hasKey: !!API_KEY,
        model: MODEL,
      });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method Not Allowed' });
    }

    // ---- 안전 파싱 ----
    let body = {};
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    } catch (e) {
      return res.status(200).json({ success: false, error: 'INVALID_JSON_BODY' });
    }

    const payload = {
      career: toStr(body.career).trim(),
      statsSummary: clampLen(body.statsSummary, 2000),
      stats: body.stats || {},
      username: toStr(body.username).trim(),
      rosterId: toStr(body.rosterId || '').trim() || null,
    };

    // ---- Gemini 호출 (모든 에러는 200으로 감싸서 반환) ----
    try {
      const out = await callGemini(payload);
      if (!out.ok) {
        return res.status(200).json({ success: false, error: out.error || 'GEN_AI_ERROR' });
      }
      return res.status(200).json({ success: true, advice: out.text });
    } catch (e) {
      console.error('[ai-advice] generate error:', e);
      return res.status(200).json({ success: false, error: 'GEN_AI_EXCEPTION' });
    }
  } catch (e) {
    // 절대 500 던지지 않도록 마지막 방어선
    console.error('[ai-advice] unhandled:', e);
    return res.status(200).json({ success: false, error: 'UNHANDLED' });
  }
}
