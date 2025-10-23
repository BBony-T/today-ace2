// /api/admin/add-activity.js
import { getDB } from '../../lib/admin.js';
import { FieldValue } from 'firebase-admin/firestore';

// 문자열 유틸
const s = v => (v ?? '').toString().trim();

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method Not Allowed' });
    }

    // teacherId: 쿼리 → body → 필수
    let teacherId = s(req.query.teacherId);
    let body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    if (!teacherId) teacherId = s(body.teacherId);

    const date = s(body.date);   // 'YYYY-MM-DD'
    const title = s(body.title); // 활동명

    if (!teacherId) return res.status(400).json({ success:false, error:'teacherId required' });
    if (!date)      return res.status(400).json({ success:false, error:'date required(YYYY-MM-DD)' });
    if (!title)     return res.status(400).json({ success:false, error:'title required' });

    const db = getDB();
    const now = FieldValue.serverTimestamp();

    // activities 컬렉션(평면)
    const ref = db.collection('activities').doc();
    await ref.set({
      id: ref.id,
      teacherId,
      date,       // 'YYYY-MM-DD'
      title,      // 활동명
      createdAt: now,
      updatedAt: now,
    });

    return res.status(200).json({ success:true, id: ref.id });
  } catch (e) {
    console.error('[add-activity] error:', e);
    return res.status(500).json({ success:false, error: e?.message || 'server error' });
  }
}
