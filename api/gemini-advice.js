// /api/gemini-advice.js
import { GoogleGenerativeAI } from "@google/generative-ai";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  try {
    const { stats } = req.body; // [{ name, competencies... }, ...] 형태

    if (!stats || !Array.isArray(stats)) {
      return res.status(400).json({ error: "Invalid stats data" });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
    너는 고등학생들의 동료평가 데이터를 보고 간단한 진로 조언을 해주는 선생님 역할이야.
    입력된 통계: ${JSON.stringify(stats).slice(0, 500)}
    학생의 강점과 관심사에 따라 진로/관심분야 조언을 5줄 이내로 한국어로 작성해줘.
    너무 길지 않고 간단하게.    
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
    `;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    return res.status(200).json({ success: true, advice: text });
  } catch (err) {
    console.error("Gemini API Error:", err);
    return res.status(500).json({ error: "AI 조언 생성 실패" });
  }
}
