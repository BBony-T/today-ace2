// /api/ai-advice.js
export const config = { runtime: 'nodejs' };

import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';

const MODEL  = process.env.GEMINI_MODEL || 'gemini-1.5-flash';
const API_KEY = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '';

function toStr(v){ return (v ?? '').toString(); }
function clampLen(s, max = 2000){
  const t = toStr(s);
  return t.length > max ? t.slice(0, max) + '…(truncated)' : t;
}
function safeJson(v, max = 4000){
  try{
    const s = JSON.stringify(v ?? {});
    return s.length > max ? s.slice(0, max) + '…(truncated)' : s;
  }catch{ return '{}'; }
}

const generationConfig = { temperature: 0.7, topP: 0.9, topK: 32, maxOutputTokens: 380 };
const safetySettings = [
  { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,       threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_HARASSMENT,         threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,  threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
  { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,  threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH },
];

/** 모델 자동 대체 포함 */
async function callGemini({ career, statsSummary, stats, username, rosterId, studentName }) {
  if (!API_KEY) return { ok:false, error:'NO_API_KEY' };

  const genAI = new GoogleGenerativeAI(API_KEY);

  // 우선순위: 환경변수/상수 → 안정 모델들
  const candidates = Array.from(new Set([
    MODEL,
    'gemini-1.5-flash',
    'gemini-1.5-flash-latest',
    'gemini-1.5-flash-8b',
  ]));

  // 호칭 규칙
  const displayName = toStr(studentName).trim() || '학생';
  const honorificRule =
    `호칭은 반드시 "${displayName} 학생"으로만 부르세요. 학번/아이디/숫자 표기는 절대 쓰지 마세요.`;

  // 시스템 컨텍스트
  const system = [
    '너는 학생의 강점을 먼저 칭찬하고 따뜻하게 격려하는 멘토야.',
    '명령조 대신 제안/권유형 어조를 사용하고, 부담스럽지 않은 작은 실천을 제시해.',
    '먼저 최다 추천 역량에 대한 칭찬과 구체적 강점 설명을 2~3문장으로 써줘.',
    '그 다음 관심 진로나 활동과 연결해 키워나갈 방법을 3~5가지 정도 제안해줘.',
    '문단 사이 공백 줄 없이 자연스러운 문장 흐름으로 작성해.',
  ].join(' ');

  // 사용자 컨텍스트
  const userContext = [
    `학생 아이디: ${username || '-'}`,
    `선택된 명부 ID: ${rosterId || '없음'}`,
    `관심 진로/분야: ${career || '미입력'}`,
    '',
    '[통계 요약]',
    clampLen(statsSummary, 1800),
    '',
    '[원시 통계 JSON 일부]',
    safeJson(stats, 1800),
  ].join('\n');

  const prompt = `${honorificRule}\n\n${system}\n\n${userContext}\n\n위 정보를 바탕으로 학생에게 맞춘 성장 조언을 작성해줘.`;

  let lastErr = null;
  for (const m of candidates) {
    try {
      const model = genAI.getGenerativeModel({ model: m, generationConfig, safetySettings });
      const result = await model.generateContent(prompt);
      const text = result?.response?.text?.();
      if (text) return { ok:true, text };
      lastErr = new Error('EMPTY_RESPONSE');
    } catch (e) {
      const msg = String(e?.message || e);
      // 모델 미존재/미지원이면 다음 후보로
      if (/not found|not supported|ListModels/i.test(msg)) { lastErr = e; continue; }
      lastErr = e; break; // 다른 오류는 중단
    }
  }
  return { ok:false, error: lastErr?.message || 'GEN_AI_ERROR' };
}

export default async function handler(req, res){
  try{
    // 진단: 키/기본모델
    if (req.method === 'GET' && req.query?.diag === '1') {
      return res.status(200).json({ success:true, route:'/api/ai-advice', hasKey: !!API_KEY, model: MODEL });
    }
    // 진단: 실제 한 번 실행
    if (req.method === 'GET' && req.query?.diag === 'run') {
      try{
        const out = await callGemini({
          career:'개발자',
          statsSummary:'가장 많은 추천 역량: 자신감과 리더십\n총 추천 수: 3, 참여 일수: 1',
          stats:{ competencyCounts:{ '자신감과 리더십':3 } },
          username:'test', rosterId:'R1', studentName:'홍길동',
        });
        return res.status(200).json({ success:out.ok, advice: out.text || null, error: out.error || null });
      }catch(e){
        return res.status(200).json({ success:false, error: e?.message || 'RUN_EXCEPTION' });
      }
    }

    if (req.method !== 'POST')
      return res.status(405).json({ success:false, error:'Method Not Allowed' });

    let body = {};
    try{
      body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    }catch{
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

    try{
      const out = await callGemini(payload);
      if (!out.ok) return res.status(200).json({ success:false, error: out.error || 'GEN_AI_ERROR' });
      return res.status(200).json({ success:true, advice: out.text });
    }catch(e){
      console.error('[ai-advice] generate error:', e);
      return res.status(200).json({ success:false, error: e?.message || 'GEN_AI_EXCEPTION' });
    }
  }catch(e){
    console.error('[ai-advice] unhandled:', e);
    return res.status(200).json({ success:false, error: e?.message || 'UNHANDLED' });
  }
}
