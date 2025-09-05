// /api/admin/list-students.js
import { db } from '../_fb.js';
import { getUserFromReq } from '../_shared/initAdmin.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ success: false, error: 'Method Not Allowed' });
    }

    const me = getUserFromReq(req);
    // 로그인 강제하려면 주석 해제
    // if (!me || (me.role !== 'teacher' && me.role !== 'super')) {
    //   return res.status(401).json({ success:false, error:'로그인 필요' });
    // }

    const teacherId =
      (me && (me.role === 'super' && req.query.teacherId ? req.query.teacherId : (me.teacherId || me.uid))) ||
      req.query.teacherId ||
      'T_DEFAULT';

    const onlyActive = req.query.onlyActive === '1' || req.query.active === '1';

    // ── onlyActive=1 이면 boards.activeRosterIds 를 기준으로 필터링
    let rosterAllow = null; // null이면 전체
    if (onlyActive) {
      const boardDoc = await db().collection('boards').doc(teacherId).get();
      rosterAllow = boardDoc.exists ? (boardDoc.data().activeRosterIds || []) : [];
    }

    let students = [];

    if (Array.isArray(rosterAllow)) {
      // 활성 로스터만
      if (rosterAllow.length === 0) {
        return res.status(200).json({ success: true, students: [] });
      }

      // Firestore where-in 은 최대 10개 → 분할
      const chunks = [];
      for (let i = 0; i < rosterAllow.length; i += 10) {
        chunks.push(rosterAllow.slice(i, i + 10));
      }

      for (const ids of chunks) {
        const qs = await db()
          .collection('students')
          .where('teacherId', '==', teacherId)
          .where('rosterId', 'in', ids)
          .where('enabled', '==', true) // 노출 켠 학생만 보이게 하고 싶다면 유지
          .get();

        students.push(...qs.docs.map(d => ({ id: d.id, ...d.data() })));
      }
    } else {
      // 전체 조회(필요 시 enabled 조건을 빼거나, 넣거나 선택)
      const qs = await db()
        .collection('students')
        .where('teacherId', '==', teacherId)
        .get();

      students = qs.docs.map(d => ({ id: d.id, ...d.data() }));
    }

    // studentId 기준 중복 제거(같은 학생이 여러 로스터에 있을 수 있으므로)
    const dedup = new Map();
    for (const s of students) if (!dedup.has(s.studentId)) dedup.set(s.studentId, s);

    return res.status(200).json({ success: true, students: Array.from(dedup.values()) });
  } catch (e) {
    console.error('[list-students] error:', e);
    return res.status(500).json({ success: false, error: e?.message || 'server error' });
  }
}
