// /api/admin/list-students.js
import { db } from '../_fb.js';

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') {
      return res.status(405).json({ success: false, error: 'Method Not Allowed' });
    }

    const col = db().collection('students');

    // 전부 가져오되, 필요하면 나중에 쿼리 조건 추가 가능
    const snap = await col.get();
    const students = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    return res.status(200).json({ success: true, students });
  } catch (e) {
    console.error('list-students 오류:', e);
    return res.status(500).json({ success: false, error: e?.message || '서버 오류' });
  }
}
