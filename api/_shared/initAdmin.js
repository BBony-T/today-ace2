// /api/_shared/initAdmin.js
import jwt from 'jsonwebtoken';
import cookie from 'cookie';

const SESSION_COOKIE = 'sess';

export function setSessionCookie(res, payload, maxDays = 7) {
  const token = jwt.sign(payload, process.env.SESSION_SECRET, { expiresIn: `${maxDays}d` });
  res.setHeader('Set-Cookie', cookie.serialize(SESSION_COOKIE, token, {
    httpOnly: true, sameSite: 'lax', path: '/', maxAge: 60*60*24*maxDays,
    // secure: true  // 배포시에 켜는 걸 추천
  }));
}

export function clearSessionCookie(res) {
  res.setHeader('Set-Cookie', cookie.serialize(SESSION_COOKIE, '', {
    httpOnly: true, sameSite: 'lax', path: '/', maxAge: 0
  }));
}

export function getUserFromReq(req) {
  try {
    const hdr = req.headers.cookie || '';
    const cookies = cookie.parse(hdr || '');
    const token = cookies[SESSION_COOKIE];
    if (!token) return null;
    return jwt.verify(token, process.env.SESSION_SECRET);
  } catch (_) { return null; }
}

// 라우트에서 사용: const me = getUserFromReq(req);
// me = { uid, role, teacherId, email, name }
