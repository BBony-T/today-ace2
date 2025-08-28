// /api/ai-advice.js
import { GoogleGenerativeAI } from "@google/generative-ai";

export const config = { runtime: "nodejs" }; // Vercel Node 런타임

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const apiKey = process.env.GOOGLE_API_KEY;
  if (!apiKey) return res.status(500).json({ error: "GOOGLE_API_KEY not set" });

  const { career = "", statsSummary = "" } = req.body || {};
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
너는 한국어로 간결한 진로 코치다.
아래 학생의 통계 요약과 관심 진로를 바탕으로, 행동지향 조언을 5줄 이내로 bullet 없이 써라.
과장·공격적 표현 금지, 구체적 다음 행동을 2~3개 포함.

[관심 진로] ${career || "미지정"}
[통계 요약]
${statsSummary}
`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    return res.status(200).json({ success: true, advice: text.slice(0, 800) });
  } catch (e) {
    console.error("ai-advice error:", e);
    return res.status(500).json({ error: "AI advice generation failed" });
  }
}
