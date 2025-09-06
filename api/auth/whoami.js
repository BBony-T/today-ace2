// /api/auth/whoami.js
import { getUserFromReq } from '../_shared/initAdmin.js';

export default async function handler(req, res) {
  try {
    // 세션(쿠키)에서 유저 정보 복원
    const me = getUserFromReq?.(req);

    // ───────── 학생 로그인 응답 ─────────
    if (me?.role === 'student') {
      // 이름/아이디는 로그인 시 쿠키에 넣어둔 값을 그대로 전달
      return res.status(200).json({
        success: true,
        role: 'student',
        uid: me?.uid || null,
        name: me?.name || null,
        username: me?.username || null,
        teacherId: me?.teacherId || 'T_DEFAULT',
        rosterId: me?.rosterId || null,
      });
    }

    // ───────── 교사/관리자 응답 ─────────
    // super는 ?teacherId= 로 임의 전환 가능
    const teacherId =
      (me && me.role === 'super' && req.query.teacherId)
        ? String(req.query.teacherId)
        : (me?.teacherId || me?.uid || me?.email || 'T_DEFAULT');

    return res.status(200).json({
      success: true,
      role: me?.role || 'teacher',
      teacherId,
      uid: me?.uid || teacherId,
      name: me?.name || null,
      email: me?.email || null,
    });
  } catch (e) {
    // 어떤 상황에서도 200 보장(기본값 반환)
    return res.status(200).json({
      success: true,
      role: 'teacher',
      teacherId: 'T_DEFAULT',
      uid: 'dev',
    });
  }
}
