// /api/admin/list-students.js
import { db } from '../_fb.js';
import { getUserFromReq } from '../_shared/initAdmin.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ success:false, error:'Method Not Allowed' });

    const me = getUserFromReq(req);
    if (!me || (me.role !== 'teacher' && me.role !== 'super')) {
      // 로그인 붙이기 전까지 임시 허용하려면, 아래 한 줄만 남겨도 됩니다.
      // return res.status(401).json({ success:false, error:'로그인 필요' });
    }

    // 최종 teacherId 계산 (수퍼는 ?teacherId= 로 임의 전환 가능)
    const teacherId =
      (me && (me.role === 'super' && req.query.teacherId ? req.query.teacherId : (me.teacherId || me.uid)))
      || req.query.teacherId      // ← 로그인 붙이기 전 임시 fallback
      || 'T_DEFAULT';             // ← 마지막 안전값(개발용)

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
