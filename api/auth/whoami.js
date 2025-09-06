// /api/auth/whoami.js
import { getUserFromReq } from '../_shared/initAdmin.js';
import { db } from '../_fb.js';

export default async function handler(req, res) {
  try {
    const me = getUserFromReq?.(req);

    if (me?.role === 'student') {
      let out = {
        success: true,
        role: 'student',
        uid: me?.uid || null,
        name: me?.name || null,
        username: me?.username || null,
        teacherId: me?.teacherId || 'T_DEFAULT',
        rosterId: me?.rosterId || null,
        rosterIds: me?.rosterIds || null,   // ★ 추가 필드
      };

      // 누락 시 students/{uid}에서 보강
      if (!out.rosterIds || !Array.isArray(out.rosterIds)) {
        const doc = await db().collection('students').doc(String(me?.uid || me?.username || '')).get();
        if (doc.exists) {
          const s = doc.data();
          out.teacherId  = out.teacherId  || s.teacherId || 'T_DEFAULT';
          out.rosterId   = out.rosterId   || s.rosterId  || null;
          out.rosterIds  = s.rosterIds || (out.rosterId ? [out.rosterId] : []);
          out.name       = out.name       || s.name || null;
          out.username   = out.username   || s.username || doc.id;
        }
      }
      return res.status(200).json(out);
    }

    // 교사/관리자
    const teacherId =
      (me && me.role === 'super' && req.query.teacherId) ? String(req.query.teacherId)
      : (me?.teacherId || me?.uid || me?.email || 'T_DEFAULT');

    return res.status(200).json({
      success: true,
      role: me?.role || 'teacher',
      teacherId,
      uid: me?.uid || teacherId,
      name: me?.name || null,
      email: me?.email || null,
    });
  } catch {
    return res.status(200).json({ success: true, role: 'teacher', teacherId: 'T_DEFAULT', uid: 'dev' });
  }
}
