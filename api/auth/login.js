// /api/auth/login.js
import { db } from '../_fb.js';
import { setSessionCookie } from '../_shared/initAdmin.js';

// ── utils
const toStr = (v) => (v ?? '').toString().trim();
const normId = (v='') => String(v ?? '').trim();                          // 학번/아이디 비교용
const normName = (v='') => toStr(v).normalize('NFC').toLowerCase().replace(/\s+/g,''); // 이름(비번) 비교용
const mask = (s) => (s ? '*'.repeat(String(s).length) : '');

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ success:false, error:'Method Not Allowed' });
    }

    const raw = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const mode       = toStr(raw.mode); // 'student' | 'teacher' | ''
    const email      = toStr(raw.email);
    const usernameIn = toStr(raw.username || raw.studentId || raw.id);
    const passIn     = toStr(raw.password || raw.name || raw.fullname);

    // 진단용(네트워크 탭에서 /api/auth/login?diag=1 로 보내면 라우팅만 확인 가능)
    if (req.query?.diag === '1') {
      return res.status(200).json({
        success: true,
        received: { mode: mode || '(empty)', email, username: usernameIn, password: mask(passIn) },
        willRoute: (mode === 'student' || (!email && usernameIn)) ? 'student' : 'teacher'
      });
    }

    // ─────────────────────────────────────────────────────────────
    // 학생 로그인
    // 조건: mode==='student'  OR  (email 없이 username만 있을 때)
    // ─────────────────────────────────────────────────────────────
    if (mode === 'student' || (!email && usernameIn)) {
      if (!usernameIn || !passIn) {
        return res.status(400).json({ success:false, error:'학생 로그인: 학번/이름 누락' });
      }

      const uNorm = normId(usernameIn);
      const pNorm = normName(passIn);

      // 1) students 문서ID(=학번)로 직조회
      let snap = await db().collection('students').doc(uNorm).get();

      // 2) 보강: usernameNorm / username / studentId
      if (!snap.exists) {
        const q1 = await db().collection('students').where('usernameNorm','==', uNorm).limit(1).get();
        if (!q1.empty) snap = q1.docs[0];
      }
      if (!snap.exists) {
        const q2 = await db().collection('students').where('username','==', uNorm).limit(1).get();
        if (!q2.empty) snap = q2.docs[0];
      }
      if (!snap.exists) {
        const q3 = await db().collection('students').where('studentId','==', uNorm).limit(1).get();
        if (!q3.empty) snap = q3.docs[0];
      }

      // 3) 레거시 보루: users.username
      let userDoc = null;
      if (!snap.exists) {
        const uq = await db().collection('users').where('username','==', uNorm).limit(1).get();
        if (!uq.empty) userDoc = uq.docs[0];
      }

      if (!snap.exists && !userDoc) {
        return res.status(401).json({ success:false, error:'학생 계정을 찾을 수 없음' });
      }

      // 이름(비밀번호) 확인
      if (snap.exists) {
        const s = snap.data();
        const okByName     = normName(s.name || '')     === pNorm;
        const okByPassword = normName(s.password || '') === pNorm;
        if (!okByName && !okByPassword) {
          return res.status(401).json({ success:false, error:'이름(비밀번호)이 일치하지 않습니다.' });
        }
        if (s.enabled === false) {
          return res.status(403).json({ success:false, error:'비활성 학생입니다.' });
        }

        // 세션 발급
        setSessionCookie(res, {
          uid: snap.id,
          role: 'student',
          teacherId: s.teacherId || null,
          rosterId:  s.rosterId  || null,
          name:      s.name      || null,
          username:  s.username  || snap.id,
          studentId: s.studentId || snap.id,
        });

        return res.status(200).json({
          success: true,
          role: 'student',
          uid: snap.id,
          teacherId: s.teacherId || null,
          rosterId:  s.rosterId  || null,
          name:      s.name      || null,
          username:  s.username  || snap.id,
          studentId: s.studentId || snap.id,
        });
      } else {
        // 레거시 users 경로
        const u = userDoc.data();
        const ok = normName(u.password || u.name || '') === pNorm;
        if (!ok) {
          return res.status(401).json({ success:false, error:'이름(비밀번호)이 일치하지 않습니다.' });
        }
        if (u.status && u.status !== 'active') {
          return res.status(403).json({ success:false, error:`계정 상태: ${u.status}` });
        }

        setSessionCookie(res, {
          uid: userDoc.id,
          role: 'student',
          teacherId: u.teacherId || null,
          rosterId:  u.rosterId  || null,
          name:      u.name      || null,
          username:  u.username  || userDoc.id,
          studentId: u.username  || userDoc.id, // 가능한 필드가 없으면 username을 studentId처럼 보관
        });

        return res.status(200).json({
          success: true,
          role: 'student',
          uid: userDoc.id,
          teacherId: u.teacherId || null,
          rosterId:  u.rosterId  || null,
          name:      u.name      || null,
          username:  u.username  || userDoc.id,
          studentId: u.username  || userDoc.id,
        });
      }
    }

    // ─────────────────────────────────────────────────────────────
    // 교사/수퍼 로그인
    // ─────────────────────────────────────────────────────────────
    if (!email || !passIn) {
      return res.status(400).json({ success:false, error:'교사 로그인: email/password 누락' });
    }

    const tq = await db().collection('users').where('email','==', email).limit(1).get();
    if (tq.empty) {
      return res.status(401).json({ success:false, error:'계정을 찾을 수 없음' });
    }
    const tdoc = tq.docs[0];
    const t = tdoc.data();

    if (toStr(t.password) !== toStr(passIn)) {
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
      name:  t.name  || null,
    });

    return res.status(200).json({
      success: true,
      role: t.role || 'teacher',
      teacherId: t.teacherId || tdoc.id,
    });

  } catch (e) {
    console.error('[auth/login] error', e);
    return res.status(500).json({ success:false, error: e?.message || 'server error' });
  }
}
