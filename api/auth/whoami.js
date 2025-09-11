// /api/auth/whoami.js
import { getUserFromReq } from '../_shared/initAdmin.js';
import { getDB } from '../../lib/admin.js';

export default async function handler(req, res) {
  try {
    const me = getUserFromReq?.(req) || {};
    const db = getDB();

    // ───────────────── 학생 ─────────────────
    if (me?.role === 'student') {
      // 학생 기본 필드
      const out = {
        success: true,
        role: 'student',
        uid: me?.uid || null,
        name: me?.name || null,
        username: me?.username || null,
        teacherId: me?.teacherId || null,
        rosterId: me?.rosterId || null,
        rosterIds: me?.rosterIds || null,
        email: me?.email || null,
      };

      // 누락 보강: students/{uid or username}에서
      const sid = String(me?.uid || me?.username || '').trim();
      if (sid) {
        const doc = await db.collection('students').doc(sid).get();
        if (doc.exists) {
          const s = doc.data() || {};
          out.teacherId = out.teacherId || s.teacherId || null;
          out.rosterId  = out.rosterId  || s.rosterId  || null;
          out.rosterIds = Array.isArray(s.rosterIds) ? s.rosterIds : (out.rosterId ? [out.rosterId] : []);
          out.name      = out.name || s.name || null;
          out.username  = out.username || s.username || doc.id;
        }
      }
      return res.status(200).json(out);
    }

    // ───────────────── 교사/관리자 ─────────────────
    let teacherId = null;

    // super가 쿼리로 특정 teacherId를 명시한 경우 허용
    if (me?.role === 'super' && req.query.teacherId) {
      teacherId = String(req.query.teacherId).trim();
    }

    // 일반적으로는 me.teacherId 우선
    if (!teacherId) teacherId = me?.teacherId || null;

    // 그래도 없으면 email로 teachers 컬렉션에서 역조회
    if (!teacherId && me?.email) {
      const snap = await db.collection('teachers')
        .where('email', '==', String(me.email).toLowerCase())
        .limit(1)
        .get();
      if (!snap.empty) {
        const doc = snap.docs[0];
        const t = doc.data() || {};
        teacherId = t.teacherId || doc.id || null;
      }
    }

    // 최종 폴백 (개발 환경 등)
    if (!teacherId) teacherId = me?.uid || me?.email || 'T_DEFAULT';

    return res.status(200).json({
      success: true,
      role: me?.role || 'teacher',
      teacherId,
      uid: me?.uid || teacherId,
      name: me?.name || null,
      email: me?.email || null,
    });
  } catch (e) {
    // 서버 오류 시에도 형식은 동일하게
    return res.status(200).json({
      success: true,
      role: 'teacher',
      teacherId: 'T_DEFAULT',
      uid: 'dev',
      name: null,
      email: null,
    });
  }
}
