// api/save-evaluation.js — 서버리스 함수 (Admin SDK 사용)
import { db } from './_fb.js';

export default async function handler(req, res) {
  // (다른 도메인에서 호출한다면 아래 두 줄을 켜세요)
  // res.setHeader('Access-Control-Allow-Origin', '*');
  // if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { evaluatorUsername, peerEvaluations, selfEvaluation, date } = body;

    if (!evaluatorUsername) {
      return res.status(400).json({ success: false, error: '평가자 정보가 필요합니다.' });
    }

    const doc = {
      evaluatorUsername,
      date: date || new Date().toISOString().split('T')[0],
      timestamp: new Date(),          // Admin SDK에서는 서버 시간 객체 사용
      peerEvaluations: peerEvaluations || [],
      selfEvaluation: selfEvaluation || null,
    };

    const ref = await db().collection('evaluations').add(doc);

    return res.status(200).json({
      success: true,
      message: '평가가 성공적으로 저장되었습니다.',
      id: ref.id,
    });
  } catch (e) {
    console.error('평가 저장 API 오류:', e);
    return res.status(500).json({ success: false, error: '서버 오류가 발생했습니다.' });
  }
}
