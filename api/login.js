// /api/auth/login.js
import { db } from '../_fb.js';
import { setSessionCookie } from '../_shared/initAdmin.js';

// 작은 유틸
function toStr(v) { return (v ?? '').toString().trim(); }
function mask(s) { return s ? '*'.repeat(String(s).length) : ''; }

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ success:false, error:'Method Not Allowed' });
    }

    // body 파싱 (Vercel 환경 가드)
    const raw = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const mode = toStr(raw.mode);                // 'student' | 'teacher' | ''
    const email = toStr(raw.email);
    const usernameIn = toStr(raw.username || raw.studentId || raw.id);
    const passIn = toStr(raw.password || raw.name || raw.fullname);

    // ---- 진단 모드: /api/auth/login?diag=1 로 요청하면 파라미터/분기를 그대로 응답
    if (req.query?.diag === '1') {
      return res.status(200).json({
        success: true,
        received: {
          mode: mode || '(empty)',
          email,
          username: usernameIn,
          password: mask(passIn)
        },
        willRoute: (mode === 'student' || (!email && usernameIn)) ? 'student' : 'teacher'
      });
    }

    // ---------- 학생 로그인 ----------
    if (mode === 'student' || (!email && usernameIn)) {
      if (!usernameIn || !passIn) {
        return res.status(400).json({ success:false, error:'학생 로그인: 학번/이름 누락' });
      }

      // 1) doc(학번) 직조회 – 우리는 students 컬렉션 docId가 학번인 구조
      let snap = await db().collection('students').doc(usernameIn).get();

      // 2) 혹시 docId가 아닌 컬럼일 수도 있으니, 못 찾으면 보루(where) 한 번 더
      if (!snap.exists) {
        const q = await db()
          .collection('students')
          .where('studentId', '==', usernameIn)
          .limit(1)
          .get();
        if (!q.empty) snap = q.docs[0];
      }

      // 3) 아주 레거시: users에 학생이 들어간 경우
      let userDoc = null;
      if (!snap.exists) {
        const uq = await db()
          .collection('users')
          .where('username', '==', usernameIn)
          .limit(1)
          .get();
        if (!uq.empty) userDoc = uq.docs[0];
      }

      // 못 찾음
      if (!snap.exists && !userDoc) {
        return res.status(401).json({ success:false, error:'학생 계정을 찾을 수 없음' });
      }

      if (snap.exists) {
        const u = snap.data();
        // **enabled 여부 무시** – 로그인은 허용, enabled는 “현황판 노출/비노출” 용도로만
        const ok = toStr(u.password || u.name) === passIn;
        if (!ok) return res.status(401).json({ success:false, error:'이름(비밀번호)이 일치하지 않습니다.' });

        // 세션 발급
        setSessionCookie(res, {
          uid: snap.id,
          role: 'student',
          teacherId: u.teacherId || null,
          rosterId: u.rosterId || null,
          name: u.name || null,
          username: u.username || snap.id
        });
        return res.status(200).json({
          success: true,
          role: 'student',
          uid: snap.id,
          teacherId: u.teacherId || null,
          rosterId: u.rosterId || null
        });
      } else {
        // 레거시 users 학생
        const u = userDoc.data();
        const ok = toStr(u.password || u.name) === passIn;
        if (!ok) return res.status(401).json({ success:false, error:'이름(비밀번호)이 일치하지 않습니다.' });

        setSessionCookie(res, {
          uid: userDoc.id,
          role: 'student',
          teacherId: u.teacherId || null,
          rosterId: u.rosterId || null,
          name: u.name || null,
          username: u.username || userDoc.id
        });
        return res.status(200).json({
          success: true,
          role: 'student',
          uid: userDoc.id,
          teacherId: u.teacherId || null,
          rosterId: u.rosterId || null
        });
      }
    }

    // ---------- 교사/수퍼 로그인 ----------
    if (!email || !passIn) {
      return res.status(400).json({ success:false, error:'교사 로그인: email/password 누락' });
    }

    const tq = await db().collection('users').where('email','==',email).limit(1).get();
    if (tq.empty) return res.status(401).json({ success:false, error:'계정을 찾을 수 없음' });
    const tdoc = tq.docs[0];
    const t = tdoc.data();

    if (toStr(t.password) !== passIn) {
      return res.status(401).json({ success:false, error:'비밀번호 불일치' });
    }
    if (t.status && t.status !== 'active') {
      return res.status(403).json({ success:false, error:`계정 상태: ${t.status}` });
    }

    setSessionCookie(res, {
      uid: tdoc.id,
      role: t.role || 'teacher',
      teacherId: t.teacherId || tdoc.id,
      email: t.email || null,
      name: t.name || null
    });

    return res.status(200).json({
      success: true,
      role: t.role || 'teacher',
      teacherId: t.teacherId || tdoc.id
    });

  } catch (e) {
    console.error('[auth/login] error', e);
    return res.status(500).json({ success:false, error: e?.message || 'server error' });
  }
}
