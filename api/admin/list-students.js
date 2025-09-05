// /api/admin/list-students.js
import { db } from '../_fb.js';
import { getUserFromReq } from '../_shared/initAdmin.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ success:false, error:'Method Not Allowed' });
    }

    const me = getUserFromReq(req);
    const teacherId =
      (me && (me.role === 'super' && req.query.teacherId ? req.query.teacherId : (me.teacherId || me.uid)))
      || req.query.teacherId
      || 'T_DEFAULT';

    const onlyActive = req.query.onlyActive === '1' || req.query.active === '1';

    let active = null;
    if (onlyActive) {
      const board = await db().collection('boards').doc(teacherId).get();
      active = board.exists ? (board.data().activeRosterIds || []) : [];
      if (active.length === 0) {
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).json({ success:true, students: [] });
      }
    }

    const col = db().collection('students');
    const chunks = [];
    const ids = active || [null]; // active 지정 없으면 한 번만

    // Firestore in 제한(10개) 대응
    if (active) {
      for (let i=0;i<active.length;i+=10) chunks.push(active.slice(i,i+10));
    } else {
      chunks.push(null);
    }

    let students = [];
    for (const part of chunks) {
      let q = col.where('teacherId','==',teacherId);
      if (onlyActive) q = q.where('enabled','==',true);
      if (part) q = q.where('rosterId','in',part);
      const qs = await q.get();
      students.push(...qs.docs.map(d => ({ id: d.id, ...d.data() })));
    }

    // studentId 중복 제거
    const map = new Map();
    for (const s of students) if (!map.has(s.studentId)) map.set(s.studentId, s);
    const list = Array.from(map.values());

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ success:true, students: list });
  } catch (e) {
    console.error('[list-students] error:', e);
    return res.status(500).json({ success:false, error: e?.message || 'server error' });
  }
}
