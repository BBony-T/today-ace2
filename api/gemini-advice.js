// /api/gemini-advice.js
import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * @param {Object} args
 * @param {string} args.apiKey
 * @param {string} args.career
 * @param {string} args.statsSummary
 * @param {string[]} args.reasons
 * @param {string[]} args.activities
 * @returns {Promise<string>}
 */
export async function getAdviceFromGemini({ apiKey, career, statsSummary, reasons = [], activities = [] }) {
  if (!apiKey) throw new Error('NO_API_KEY');

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

  // 이유/활동은 너무 길어지지 않게 10개 정도만
  const reasonLines = (reasons || []).slice(0, 10).map((r, i) => `- ${r}`).join('\n');
  const activityLines = (activities || []).slice(0, 10).map((a, i) => `- ${a}`).join('\n');

  const prompt = `
너는 한국 중·고등학생 대상 진로/성장 코치야.
학생의 최근 동료평가/자기평가 통계 요약과 관심 진로를 바탕으로
학생이 바로 실천할 수 있는 "아주 구체적인" 조언을 5줄 이내로 작성해.

규칙:
- 길게 설명하지 말고, 각 줄은 명령형으로 간결하게.
- 반드시 5줄 이내.
- 실천 과제는 구체적이고 측정 가능하게(예: "이번 주 수·목 30분씩, OO을 2회 시도").
- 동료들이 남긴 이유/최근 활동명이 있다면 조언에 자연스럽게 반영.

[학생 관심 진로]
${career || '(미입력)'}

[통계 요약]
${statsSummary || '(데이터 적음)'}

[동료들이 남긴 이유(일부)]
${reasonLines || '-'}

[최근 활동명(일부)]
${activityLines || '-'}

출력 형식 예시(각 줄 맨 앞에 불릿 없이 문장만):
1) ~~~
2) ~~~
3) ~~~
4) ~~~
5) ~~~
`;

  const result = await model.generateContent(prompt);
  const text = result?.response?.text?.() || '';
  // 혹시 모델이 5줄 넘기면 잘라주기
  const lines = text.split('\n').map(s => s.trim()).filter(Boolean);
  return lines.slice(0, 5).join('\n');
}
