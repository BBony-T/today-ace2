// /api/admin/list-students.js
import { db } from '../_fb.js';
import { getUserFromReq } from '../_shared/initAdmin.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ success:false, error:'Method Not Allowed' });

    const me = getUserFromReq(req);
    const teacherId =
      (me && (me.teacherId || me.uid)) ||
      req.query.teacherId || 'T_DEFAULT';

    const onlyActive = req.query.onlyActive === '1';

    let q = db().collection('students').where('teacherId','==',teacherId);
    if (onlyActive) q = q.where('enabled','==',true);

    const snap = await q.get();
    const students = snap.docs.map(d => ({ id: d.id, ...d.data() }));

    // 같은 학번 중복 제거(있다면)
    const map = new Map();
    for (const s of students) if (!map.has(s.studentId)) map.set(s.studentId, s);

    return res.status(200).json({ success:true, students: Array.from(map.values()) });
  } catch (e) {
    console.error('[list-students] error:', e);
    return res.status(500).json({ success:false, error:e?.message || 'server error' });
  }
}
