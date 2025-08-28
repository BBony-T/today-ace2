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
    당신은 중·고등학생의 성장을 돕는 학습 코치입니다.
    아래 데이터를 바탕으로 학생에게 **정확히 5줄**의 실천 코칭을 제시하세요.
    각 줄은 한 문장으로 간결하지만 구체적으로 쓰고, 앞에 번호와 이모지를 붙이세요.

    형식 예시:
    1) ✅ 강점: ...
    2) 🧩 약점 보완: ...
    3) 🎯 미션: ...
    4) 🤝 협업: ...
    5) 📝 회고: ...

    조건:
    - 반드시 5줄만 출력 (줄바꿈 4개 포함).
    - 각 줄은 실행 가능한 행동을 제안하고, 숫자(횟수/시간 등)를 포함할 것.
    - 관심분야가 있으면 그 맥락으로 연결.
    - 모호한 표현 피하고 즉시 실천 가능한 행동 중심으로.

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
