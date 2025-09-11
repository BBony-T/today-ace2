// /api/auth/whoami.js
import { getUserFromReq } from '../_shared/initAdmin.js';
import { db } from '../_fb.js';

/**
 * 반환 원칙
 * - student: students/{uid or username} 문서에서 teacherId/rosterId/rosterIds 보강
 * - teacher/super: teachers/{uid} 우선 → teachers.where(email==) → (마지막 폴백) uid
 * - super가 쿼리로 teacherId를 넘긴 경우엔 그 값을 그대로 사용(관리용 조회)
 */
export default async function handler(req, res) {
  try {
    const me = getUserFromReq?.(req) || null;
    const fdb = db();

    // ── 학생 모드 ─────────────────────────────────────────────
    if (me?.role === 'student') {
      const out = {
        success: true,
        role: 'student',
        uid: me?.uid || null,
        name: me?.name || null,
        username: me?.username || null,
        teacherId: me?.teacherId || null,   // 기본값은 null (후보강)
        rosterId: me?.rosterId || null,
        rosterIds: Array.isArray(me?.rosterIds) ? me.rosterIds : null,
      };

      // students/{uid or username}에서 보강
      const docId = String(me?.uid || me?.username || '');
      if (docId) {
        const sDoc = await fdb.collection('students').doc(docId).get();
        if (sDoc.exists) {
          const s = sDoc.data() || {};
          out.teacherId = out.teacherId || s.teacherId || null;
          out.rosterId  = out.rosterId  || s.rosterId  || null;
          out.rosterIds = out.rosterIds || (Array.isArray(s.rosterIds) ? s.rosterIds : (s.rosterId ? [s.rosterId] : []));
          out.name      = out.name      || s.name || null;
          out.username  = out.username  || s.username || sDoc.id;
        }
      }

      return res.status(200).json(out);
    }

    // ── 교사/관리자 ────────────────────────────────────────────
    const role = me?.role || 'teacher';
    let teacherId = '';

    // super가 특정 teacherId로 조회하려는 경우(관리용)
    if (role === 'super' && req.query.teacherId) {
      teacherId = String(req.query.teacherId);
    }

    if (!teacherId) {
      // (1) teachers/{uid} 우선
      if (me?.uid) {
        const tDoc = await fdb.collection('teachers').doc(me.uid).get();
        if (tDoc.exists) teacherId = tDoc.get('teacherId') || tDoc.id;
      }
      // (2) email 매핑
      if (!teacherId && me?.email) {
        const qs = await fdb
          .collection('teachers')
          .where('email', '==', String(me.email).toLowerCase())
          .limit(1)
          .get();
        if (!qs.empty) {
          const d = qs.docs[0];
          teacherId = d.get('teacherId') || d.id;
        }
      }
      // (3) 안전 폴백: uid (공용/고정값은 절대 금지)
      if (!teacherId) teacherId = me?.uid || null;
    }

    return res.status(200).json({
      success: true,
      role,
      teacherId,
      uid: me?.uid || null,
      name: me?.name || null,
      email: me?.email || null,
    });
  } catch (e) {
    console.error('[whoami] error:', e);
    return res.status(401).json({ success: false, error: 'AUTH_FAILED' });
  }
}
