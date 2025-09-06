// /api/_shared/gemini-advice.js
const API_KEY = process.env.GEMINI_API_KEY;

// REST로 Gemini 호출(1.5-flash 계열)
export async function generateAdvice(prompt, context = {}) {
  if (!API_KEY) {
    throw new Error('GEMINI_API_KEY not set');
  }

  // 안전하게 5줄 이내 가이드 다시 주입
  const sys = [
    'You are a concise growth coach for students.',
    'Reply in Korean only, at most 5 lines.',
    'Each line should be a single actionable sentence.',
    'Use numbers/timeboxes when possible.',
  ].join(' ');

  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=' + API_KEY;

  const body = {
    contents: [{
      role: 'user',
      parts: [{ text: `${sys}\n\n${prompt}` }]
    }],
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 400,
    }
  };

  const r = await fetch(url, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify(body)
  });

  const j = await r.json();
  if (!r.ok) {
    throw new Error(j?.error?.message || 'Gemini call failed');
  }

  // 안전 파싱
  const text = j?.candidates?.[0]?.content?.parts?.map(p=>p.text).join('') || '';
  return text.trim();
}
