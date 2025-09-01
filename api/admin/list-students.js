// /api/admin/list-students.js
import { db } from '../_fb.js';

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') {
      return res.status(405).json({ success: false, error: 'Method Not Allowed' });
    }

    console.log('[list-students] start, typeof db =', typeof db);
    const col = db().collection('students'); // ← 여기서 에러가 나면 _fb.js 초기화 이슈
    const snap = await col.get();

    const students = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return res.status(200).json({ success: true, students });
  } catch (e) {
    console.error('[list-students] error:', e);
    return res.status(500).json({ success: false, error: e?.message || 'server error' });
  }
}
