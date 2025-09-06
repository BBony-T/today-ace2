// /api/ai-advice.js
import { getAdviceFromGemini } from './gemini-advice.js'; // ← 실제 위치에 맞춰 경로 주의!

export default async function handler(req, res) {
  try {
    // 진단용: /api/ai-advice?diag=1
    if (req.method !== 'POST') {
      if (req.query?.diag === '1') {
        return res.status(200).json({
          success: true,
          route: '/api/ai-advice',
          hasKey: !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
          model: 'gemini-1.5-flash',
        });
      }
      return res.status(405).json({ success: false, error: 'Method Not Allowed' });
    }

    // body 파싱
    const raw = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const career = (raw.career || '').toString().trim();
    const statsSummary = (raw.statsSummary || '').toString();
    const reasons = Array.isArray(raw.reasons) ? raw.reasons : [];
    const activities = Array.isArray(raw.activities) ? raw.activities : [];

    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ success: false, error: 'Gemini API key missing' });
    }

    const advice = await getAdviceFromGemini({
      apiKey,
      career,
      statsSummary,
      reasons,
      activities,
    });

    return res.status(200).json({ success: true, advice });
  } catch (e) {
    console.error('[ai-advice] error:', e?.message || e);
    return res.status(500).json({ success: false, error: e?.message || 'server error' });
  }
}
