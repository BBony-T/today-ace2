// /api/ai-advice.js
export const config = { runtime: 'nodejs' };

import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';

const API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';
const MODEL_ENV = (process.env.GEMINI_MODEL || '').trim();

// 우리가 확인한 가용 모델 목록(당신 계정 ListModels 결과 기반)
const MODEL_CANDIDATES = [
  MODEL_ENV,                    // 환경변수 우선
  'gemini-flash-latest',
  'gemini-2.5-flash',
  'gemini-2.0-flash-001',
  'gemini-2.0-flash',           // (있을 수도 있음)
  'gemini-2.5-pro'              // 무거우나 백업
].filter(Boolean);

const generationConfig = {
  temperature: 0.6,
  topP: 0.9,
  topK: 40,
  maxOutputTokens: 1024, // 충분히 길지만 과하지 않게
};

const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,       threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT,         threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,  threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,  threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
];

const toStr = v => (v ?? '').toString();
const clampLen = (s, max=2000) => {
  const t = toStr(s);
  return t.length > max ? t.slice(0, max) + '…(truncated)' : t;
};
const safeJson = (v, max=1800) => {
  try {
    const s = JSON.stringify(v ?? {});
    return s.length > max ? s.slice(0, max) + '…(truncated)' : s;
  } catch { return '{}'; }
};

function buildPrompt({ career, statsSummary, stats, username, rosterId, studentName, short=false }) {
  const displayName = toStr(studentName).trim() || '학생';
  const honorificRule = `호칭은 반드시 "${displayName} 학생"으로만 부르세요. 학번/아이디/숫자 표기는 금지.`;

  const system = [
    '너는 중학생,고등학생을 구체적이고 따뜻한 피드백을 제공하여 성장하도록 돕는 멘토야. 한국어 "해요체"로 따뜻하고 응원하는 말투이고 제안/권유형태를 사용해.',
    '전문 용어/어려운 플랫폼을 피하고 학교·수업·동아리·학급 활동  맥락의 예시를 들어, 부담스럽지 않은 작은 실천을 제안해.',
    '먼저 최다 추천 역량에 대한 칭찬과 강점과 보완해야 할 점을 1~2문장, 그것들이이 어떤 상황에서 가치가 있고 무엇에 도움되는 지 1~2문장,',
    '강점은 더 성장시키고 부족한 점은 보완하여 진로나 활동과 연결해 성장할 수 있는 구체적방법을 3~5가지 제시해.',
    '가능하면 통계 요약, 추천 이유, 최근 활동명이 있으면 연결해서 맞춤형으로 작성해.',
    '불필요한 공백 줄 없이 자연스럽게 작성하고 너무 장황하지 않게 작성해.',
    '마지막 문장은 응원의 한 문장으로 부드럽게 마무리해줘.'
  ].join(' ');

  const userContextLong = [
    `학생 아이디: ${username || '-'}`,
    `선택된 명부 ID: ${rosterId || '없음'}`,
    `관심 진로/분야: ${career || '미입력'}`,
    '',
    '[통계 요약]',
    clampLen(statsSummary, 1800),
    '',
    '[원시 통계 JSON 일부]',
    safeJson(stats, 1600),
  ].join('\n');

  // 짧은 프롬프트(재시도용): 안전필터/길이 이슈 회피
  const userContextShort = [
    `학생 아이디: ${username || '-'}`,
    `관심 진로/분야: ${career || '미입력'}`,
    '[핵심 요약]',
    clampLen(statsSummary, 800),
  ].join('\n');

  return `${honorificRule}\n\n${system}\n\n${short ? userContextShort : userContextLong}\n\n위 정보를 바탕으로 학생에게 맞춘 성장 조언을 작성해줘.`;
}

function extractText(response) {
  try {
    const txt = response?.text?.();
    if (txt && txt.trim()) return txt;
    // 안전성 차단 등으로 비어있을 때, candidate에서 사유 확인
    const cand = response?.candidates?.[0];
    const reason = cand?.finishReason || cand?.safetyRatings?.map(r=>r.category+':'+r.probability).join(',') || '';
    return { empty: true, reason };
  } catch {
    return { empty: true, reason: 'unknown' };
  }
}

async function callGeminiOnce(modelName, payload, { short=false } = {}) {
  const genAI = new GoogleGenerativeAI(API_KEY);
  const model = genAI.getGenerativeModel({
    model: modelName,
    generationConfig,
    safetySettings
  });

  const prompt = buildPrompt({ ...payload, short });
  const result = await model.generateContent(prompt);
  const out = extractText(result?.response);
  if (typeof out === 'string') return { ok: true, text: out };
  return { ok: false, error: 'EMPTY_RESPONSE', reason: out.reason || '' };
}

async function callGemini(payload) {
  if (!API_KEY) return { ok:false, error:'NO_API_KEY' };

  // 1차: 긴 프롬프트로, 모델 후보 순회
  for (const m of MODEL_CANDIDATES) {
    try {
      const r = await callGeminiOnce(m, payload, { short:false });
      if (r.ok) return r;
    } catch (e) {
      // 다음 후보로
    }
  }

  // 2차: 짧은 프롬프트로 재시도(안전필터/길이 회피)
  for (const m of MODEL_CANDIDATES) {
    try {
      const r = await callGeminiOnce(m, payload, { short:true });
      if (r.ok) return r;
    } catch (e) {}
  }

  return { ok:false, error:'EMPTY_RESPONSE' };
}

export default async function handler(req, res) {
  try {
    // 진단1: 키/모델 확인
    if (req.method === 'GET' && req.query?.diag === '1') {
      return res.status(200).json({
        success:true,
        route:'/api/ai-advice',
        hasKey: !!API_KEY,
        modelEnv: MODEL_ENV || '(unset)',
        candidates: MODEL_CANDIDATES
      });
    }

    // 진단2: 실제 실행(짧은 페이로드)
    if (req.method === 'GET' && req.query?.diag === 'run') {
      const out = await callGemini({
        career:'개발자',
        statsSummary:'가장 많은 추천 역량: 자신감과 리더십\n총 추천 수: 3, 참여 일수: 1',
        stats:{ competencyCounts:{ '자신감과 리더십':3 }, monthlyData:{ '2025-09':3 } },
        username:'test',
        rosterId:'R1',
        studentName:'홍길동'
      });
      return res.status(200).json({ success: out.ok, advice: out.text || null, error: out.error || null });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ success:false, error:'Method Not Allowed' });
    }

    let body = {};
    try {
      body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    } catch {
      return res.status(200).json({ success:false, error:'INVALID_JSON_BODY' });
    }

    const payload = {
      career: toStr(body.career).trim(),
      statsSummary: clampLen(body.statsSummary, 2000),
      stats: body.stats || {},
      username: toStr(body.username).trim(),
      rosterId: toStr(body.rosterId || '').trim() || null,
      studentName: toStr(body.studentName).trim(),
    };

    const out = await callGemini(payload);

    // 서버단에서도 최종 폴백(성공 true로 내려 사용자 경험 개선)
    if (!out.ok) {
      const top = (() => {
        try {
          const cc = payload.stats?.competencyCounts || {};
          return Object.keys(cc).sort((a,b)=>cc[b]-cc[a])[0] || '-';
        } catch { return '-'; }
      })();
      const advice = [
        `요약을 보니 "${top}" 강점이 특히 잘 드러나고 있어요. 멋져요!`,
        payload.career ? `관심 분야인 ${payload.career}와 연결해 강점을 조금씩 확장해 보면 좋겠어요.` :
          '관심 진로를 입력해 주면 더 딱 맞는 제안을 드릴 수 있어요.',
        '이번 주에는 강점이 드러나는 활동을 하나 정해 가볍게 시도해보면 어떨까요?',
        '그리고 활동 후에는 1문장으로 짧게 회고를 남겨 보세요. 작은 기록이 큰 변화를 만듭니다.',
      ].join('\n');
      return res.status(200).json({ success:true, advice });
    }

    return res.status(200).json({ success:true, advice: out.text });
  } catch (e) {
    console.error('[ai-advice] unhandled:', e);
    return res.status(200).json({ success:false, error: e?.message || 'UNHANDLED' });
  }
}
