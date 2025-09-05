// /api/admin/list-students.js
import { db } from '../_fb.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ success:false, error:'Method Not Allowed' });

    const teacherId = req.user?.teacherId || req.query.teacherId || 'T_DEFAULT';

    // 보드에서 활성화된 rosterIds
    const board = await db().collection('boards').doc(teacherId).get();
    const active = board.exists ? (board.data().activeRosterIds || []) : [];

    if (active.length === 0) return res.status(200).json({ success:true, students: [] });

    // enabled + 활성 명부만
    const col = db().collection('students');
    // where in 10개 제한 → 여러 번 나눠서
    const chunks = [];
    for (let i=0;i<active.length;i+=10) chunks.push(active.slice(i,i+10));

    let students = [];
    for (const ids of chunks) {
      const qs = await col
        .where('teacherId','==',teacherId)
        .where('enabled','==',true)
        .where('rosterId','in',ids)
        .get();
      students.push(...qs.docs.map(d => ({ id:d.id, ...d.data() })));
    }

    // 같은 학생이 여러 명부에 중복될 수 있으니 studentId 기준 dedupe
    const map = new Map();
    for (const s of students) if (!map.has(s.studentId)) map.set(s.studentId, s);

    return res.status(200).json({ success:true, students: Array.from(map.values()) });
  } catch (e) {
    console.error('[list-students] error:', e);
    return res.status(500).json({ success:false, error: e?.message || 'server error' });
  }
}
