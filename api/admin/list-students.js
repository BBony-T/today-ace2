// /api/admin/list-students.js
import { db } from '../_fb.js';
import { getUserFromReq } from '../_shared/initAdmin.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ success:false, error:'Method Not Allowed' });

    const me = getUserFromReq(req);
    const teacherId =
      (me && (me.role === 'super' && req.query.teacherId ? req.query.teacherId : (me.teacherId || me.uid))) ||
      req.query.teacherId ||
      'T_DEFAULT';

    const onlyActive = req.query.onlyActive === '1' || req.query.active === '1';

    // 활성 rosterIds
    let rosterAllow = null; // null: 전체, []: 없음, [ids]: 활성만
    if (onlyActive) {
      const board = await db().collection('boards').doc(teacherId).get();
      rosterAllow = board.exists ? (board.data().activeRosterIds || []) : [];
      if (rosterAllow.length === 0) {
        return res.status(200).json({ success:true, students: [] });
      }
    }

    // 쿼리 구성
    let students = [];
    const col = db().collection('students');

    if (Array.isArray(rosterAllow)) {
      // 활성만
      for (let i = 0; i < rosterAllow.length; i += 10) {
        const ids = rosterAllow.slice(i, i + 10);
        const qs = await col
          .where('teacherId','==',teacherId)
          .where('enabled','==',true)
          .where('rosterId','in',ids)
          .get();
        students.push(...qs.docs.map(d => ({ id:d.id, ...d.data() })));
      }
    } else {
      // 전체 조회(관리 화면의 요약 등에서 필요하면 사용)
      const qs = await col.where('teacherId','==',teacherId).get();
      students = qs.docs.map(d => ({ id:d.id, ...d.data() }));
    }

    // studentId 기준 dedupe
    const map = new Map();
    for (const s of students) if (!map.has(s.studentId)) map.set(s.studentId, s);

    return res.status(200).json({ success:true, students: Array.from(map.values()) });
  } catch (e) {
    console.error('[list-students] error:', e);
    return res.status(500).json({ success:false, error: e?.message || 'server error' });
  }
}
