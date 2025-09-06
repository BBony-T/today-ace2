// /api/gemini-advice.js
import { GoogleGenerativeAI } from "@google/generative-ai";

function postProcess(t = "") {
  // 코드블록, 과한 공백 정리
  return String(t)
    .replace(/```[\s\S]*?```/g, (m) => m.replace(/```/g, "").trim())
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// (키가 없을 때) 아주 간단한 로컬 백업 문구
function localFallback({ career = "", statsSummary = "" }) {
  const intro = "요약을 보니 강점이 잘 드러나고 있어요. 멋져요! 😊";
  const bridge = career
    ? `관심 진로( ${career} )와 연결해서 한 걸음씩 확장해보면 좋아요.`
    : "관심 진로를 입력하면 더 딱 맞는 조언을 드릴 수 있어요.";
  return [
    intro,
    bridge,
    "1) 이번 주에 강점이 드러나는 활동 1가지를 정해 가볍게 실천해보세요.",
    "2) 하루 끝에 1문장 회고를 적어보며 나의 변화를 기록해보세요.",
    "3) 작은 실천을 꾸준히 쌓는 것이 가장 큰 힘이 됩니다."
  ].join("\n");
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    // 진단용
    if (req.query?.diag === "1") {
      return res
        .status(200)
        .json({
          success: true,
          route: "/api/ai-advice",
          hasKey: !!process.env.GEMINI_API_KEY,
          model: process.env.GEMINI_MODEL || "gemini-1.5-flash",
        });
    }
    return res.status(405).json({ success: false, error: "Method Not Allowed" });
  }

  try {
    const body =
      typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {};
    const {
      career = "",         // 관심 진로/분야 (학생 입력)
      statsSummary = "",   // 통계 요약 문자열
      reasons = "",        // (선택) 추천 이유 텍스트 모음
      activities = ""      // (선택) 최근 활동/수업명 (관리자 측 입력)
    } = body;

    // 키 없으면 친화적인 로컬 조언 제공
    if (!process.env.GEMINI_API_KEY) {
      return res
        .status(200)
        .json({ success: true, advice: localFallback({ career, statsSummary }) });
    }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
      model: process.env.GEMINI_MODEL || "gemini-1.5-flash",
    });

    // === 톤/구성 지침 (한국어, 해요체, 칭찬 먼저, 명령조 금지) ===
    const SYSTEM_STYLE = `
당신은 학습 코치입니다. 한국어 "해요체"로 따뜻하고 응원하는 말투로 답합니다.
절대 명령조("하세요", "하라") 느낌만 되지 않게 제안/권유 형태를 사용합니다.
출력 순서:
1) [칭찬과 격려] 최상위 강점(가장 많이 받은 역량)을 구체 예시로 칭찬 (1~2문장)
2) [강점 설명] 그 강점이 어떤 상황에서 가치가 있는지, 무엇에 도움이 되는지 (1~2문장)
3) [성장 제안] 관심 진로/분야와 연결된 다음 단계를 3~6개, 작은 실천 단위로 제안
   - 번호 목록(1., 2., 3. …)을 사용
   - "하면 좋겠어요", "시도해보면 어때요?"처럼 부드럽게
4) [마무리 응원] 짧은 응원 한 문장

가능하면 통계 요약, 추천 이유, 최근 활동명이 있으면 연결해서 맞춤형으로 작성하세요.
줄 수 제한은 없어요. 하지만 너무 장황하지 않게, 읽기 편한 길이로 작성하세요.
`;

    const USER_CONTEXT = `
[학생 관심/진로]
${career || "(입력 없음)"}

[통계 요약]
${statsSummary || "(정보 없음)"}

[추천 이유(있다면 요약/발췌)]
${reasons || "(정보 없음)"}

[최근 활동/수업(있다면)]
${activities || "(정보 없음)"}
`;

    // 단일 프롬프트로 전달(해당 SDK는 단순 문자열도 허용)
    const prompt = `${SYSTEM_STYLE}\n\n아래 정보를 바탕으로 학생에게 맞춤형 조언을 작성하세요.\n${USER_CONTEXT}`;

    const resp = await model.generateContent(prompt);
    const text = postProcess(resp.response.text());

    return res.status(200).json({ success: true, advice: text || localFallback({ career, statsSummary }) });
  } catch (e) {
    console.error("[gemini-advice] error", e);
    return res.status(200).json({
      success: true,
      // 에러여도 UX는 매끄럽게 — 부드러운 로컬 문구 제공
      advice: localFallback({ career: "", statsSummary: "" }),
      _error: e?.message || String(e),
    });
  }
}
