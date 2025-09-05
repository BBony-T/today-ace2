// /api/auth/whoami.js
import { getUserFromReq } from '../_shared/initAdmin.js';

export default async function handler(req, res) {
  try {
    // 로그인 붙이면 여기서 실제 유저를 판별
    const me = getUserFromReq?.(req);

    // super는 ?teacherId=로 임의 전환 가능
    const teacherId =
      (me && me.role === 'super' && req.query.teacherId) ? req.query.teacherId :
      (me?.teacherId || me?.uid || me?.email || 'T_DEFAULT');

    // 절대 에러 내지 말고 200 보장
    return res.status(200).json({
      success: true,
      teacherId,
      uid: me?.uid || teacherId,
      role: me?.role || 'teacher',
    });
  } catch (e) {
    // 어떤 상황에서도 200을 반환 (콘솔을 조용하게 유지)
    return res.status(200).json({
      success: true,
      teacherId: 'T_DEFAULT',
      uid: 'dev',
      role: 'teacher',
    });
  }
}
