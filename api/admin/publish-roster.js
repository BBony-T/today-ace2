// /api/admin/publish-roster.js
import { db } from '../_fb.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ success:false, error:'Method Not Allowed' });
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { rosterId, publish } = body || {};
    if (!rosterId || typeof publish !== 'boolean') {
      return res.status(400).json({ success:false, error:'rosterId/publish 필요' });
    }

    await db().collection('rosters').doc(rosterId).set({ active: publish }, { merge: true });
    // ✅ 더 이상 학생 enabled를 변경하지 않습니다.
    return res.status(200).json({ success:true });
  } catch (e) {
    console.error('[publish-roster] error', e);
    return res.status(500).json({ success:false, error: e?.message || 'server error' });
  }
}
