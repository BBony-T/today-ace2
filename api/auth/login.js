// /api/auth/login.js
import { db } from '../_fb.js';
import { setSessionCookie } from '../_shared/initAdmin.js';

function norm(s = '') {
  return String(s).trim().toLowerCase().replace(/\s+/g, '');
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method Not Allowed' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { email, username, password, mode } = body;

    // -------- 학생 로그인 분기 --------
    // - mode가 'student' 이거나
    // - email이 없고 username(=학번)이 있는 경우
    if (mode === 'student' || (!email && username)) {
      const studentId = (username || body.studentId || body.id || '').trim();
      const pwdInput  = (password || body.name || body.fullname || '').trim();

      if (!studentId || !pwdInput) {
        return res.status(400).json({ success:false, error:'학번/이름이 비었습니다.' });
      }

      // 1) students 컬렉션에서 학번으로 조회
      const sSnap = await db()
        .collection('students')
        .where('studentId', '==', studentId)
        .limit(1)
        .get();

      if (!sSnap.empty) {
        const doc = sSnap.docs[0];
        const s = doc.data();

        // 이름을 비번처럼 사용 (공백/대소문자 무시 비교)
        const okByName = norm(s.name) === norm(pwdInput);

        // 혹시 password 필드를 쓰는 경우도 허용
        const okByPasswordField = s.password && norm(s.password) === norm(pwdInput);

        if (!okByName && !okByPasswordField) {
          return res.status(401).json({ success:false, error:'이름(비밀번호)이 일치하지 않습니다.' });
        }
        if (s.enabled === false) {
          return res.status(403).json({ success:false, error:'비활성 학생입니다.' });
        }

        // 세션 발급
        setSessionCookie(res, {
          uid: doc.id,
          role: 'student',
          studentId: s.studentId,
          name: s.name,
          teacherId: s.teacherId || null,
          rosterId: s.rosterId || null
        });

        return res.status(200).json({
          success: true,
          role: 'student',
          studentId: s.studentId,
          teacherId: s.teacherId || null
        });
      }

      // 2) (레거시 보루) users.username 에 학생이 들어가 있는 경우
      const uSnap = await db()
        .collection('users')
        .where('username', '==', studentId)
        .limit(1)
        .get();

      if (!uSnap.empty) {
        const doc = uSnap.docs[0]; const u = doc.data();
        if ((u.password || '').trim() !== pwdInput) {
          return res.status(401).json({ success:false, error:'비밀번호 불일치' });
        }
        if (u.status && u.status !== 'active') {
          return res.status(403).json({ success:false, error:`계정 상태: ${u.status}` });
        }

        setSessionCookie(res, {
          uid: doc.id,
          role: u.role || 'student',
          teacherId: u.teacherId || null,
          email: u.email || null,
          name: u.name || null,
          username: u.username || studentId
        });

        return res.status(200).json({
          success: true,
          role: u.role || 'student',
          teacherId: u.teacherId || null
        });
      }

      // students도 users.username도 없음
      return res.status(401).json({ success:false, error:'학생 계정을 찾을 수 없음' });
    }

    // -------- 교사/수퍼 로그인 분기 (기존) --------
    if (!email) {
      return res.status(400).json({ success:false, error:'email 또는 username 필요' });
    }

    const q = await db()
      .collection('users')
      .where('email', '==', email)
      .limit(1)
      .get();

    if (q.empty) {
      return res.status(401).json({ success:false, error:'계정을 찾을 수 없음' });
    }

    const doc = q.docs[0];
    const u = doc.data();

    if ((u.password || '') !== (password || '')) {
      return res.status(401).json({ success:false, error:'비밀번호 불일치' });
    }
    if (u.status && u.status !== 'active') {
      return res.status(403).json({ success:false, error:`계정 상태: ${u.status}` });
    }

    setSessionCookie(res, {
      uid: doc.id,
      role: u.role,
      teacherId: u.teacherId || (u.role === 'teacher' ? doc.id : undefined),
      email: u.email || null,
      name: u.name || null,
      username: u.username || null
    });

    return res.status(200).json({
      success: true,
      role: u.role,
      teacherId: u.teacherId || doc.id
    });

  } catch (e) {
    console.error('[login] error', e);
    return res.status(500).json({ success:false, error: e?.message || 'server error' });
  }
}
