// /api/auth/login.js
import { db } from '../_fb.js';
import { setSessionCookie } from '../_shared/initAdmin.js';

// 유틸
function toStr(v) { return (v ?? '').toString().trim(); }
function normId(v=''){ return String(v ?? '').trim(); }
function normName(v=''){ return String(v ?? '').trim().normalize('NFC'); }
function mask(s) { return s ? '*'.repeat(String(s).length) : ''; }

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ success:false, error:'Method Not Allowed' });
    }

    const raw = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const mode = toStr(raw.mode);            // 'student' | 'teacher' | ''
    const email = toStr(raw.email);
    const usernameIn = toStr(raw.username || raw.studentId || raw.id);
    const passIn = toStr(raw.password || raw.name || raw.fullname);

    // 진단 모드
    if (req.query?.diag === '1') {
      return res.status(200).json({
        success: true,
        received: { mode: mode || '(empty)', email, username: usernameIn, password: mask(passIn) },
        willRoute: (mode === 'student' || (!email && usernameIn)) ? 'student' : 'teacher'
      });
    }

    // ---------- 학생 로그인 ----------
    if (mode === 'student' || (!email && usernameIn)) {
      if (!usernameIn || !passIn) {
        return res.status(400).json({ success:false, error:'학생 로그인: 학번/이름 누락' });
      }

      const uNorm = normId(usernameIn);
      const pNorm = normName(passIn);

      // 1) docId(=학번) 직접 조회
      let snap = await db().collection('students').doc(uNorm).get();

      // 2) 보강 검색: usernameNorm, username, studentId 중 하나 일치
      if (!snap.exists) {
        const q1 = await db()
          .collection('students')
          .where('usernameNorm', '==', uNorm)
          .limit(1)
          .get();
        if (!q1.empty) snap = q1.docs[0];
      }
      if (!snap.exists) {
        const q2 = await db()
          .collection('students')
          .where('username', '==', uNorm)
          .limit(1)
          .get();
        if (!q2.empty) snap = q2.docs[0];
      }
      if (!snap.exists) {
        const q3 = await db()
          .collection('students')
          .where('studentId', '==', uNorm)
          .limit(1)
          .get();
        if (!q3.empty) snap = q3.docs[0];
      }

      // 3) 레거시 users보강
      let userDoc = null;
      if (!snap.exists) {
        const uq = await db()
          .collection('users')
          .where('username', '==', uNorm)
          .limit(1)
          .get();
        if (!uq.empty) userDoc = uq.docs[0];
      }

      if (!snap.exists && !userDoc) {
        return res.status(401).json({ success:false, error:'학생 계정을 찾을 수 없음' });
      }

      // 이름(비번) 정규화 비교
      if (snap.exists) {
        const u = snap.data();
        const ok = normName(u.password || u.name || '') === pNorm;
        if (!ok) return res.status(401).json({ success:false, error:'이름(비밀번호)이 일치하지 않습니다.' });

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
          name: u.name || null,
          username: u.username || snap.id
        });
      } else {
        const u = userDoc.data();
        const ok = normName(u.password || u.name || '') === pNorm;
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
          name: u.name || null,
          username: u.username || snap.id
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

