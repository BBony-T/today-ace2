// /api/auth/login.js
import { getDB } from '../../lib/admin.js';            // ← 통일
import { setSessionCookie } from '../_shared/initAdmin.js';

// 유틸
const toStr = (v) => (v ?? '').toString().trim();
const normId = (v = '') => String(v ?? '').trim();              // 학번/ID (선행 0 보존)
const normName = (v = '') => String(v ?? '').trim().normalize('NFC'); // 이름은 NFC 정규화
const normLoose = (s = '') => String(s).trim().toLowerCase().replace(/\s+/g, ''); // 보조 비교

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method Not Allowed' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const mode = toStr(body.mode); // 'student' | 'teacher' | ''
    const email = toStr(body.email);
    const usernameIn = toStr(body.username || body.studentId || body.id);
    const passIn = toStr(body.password || body.name || body.fullname);

    const db = getDB();

    // ───────────────── 학생 로그인 ─────────────────
    if (mode === 'student' || (!email && usernameIn)) {
      if (!usernameIn || !passIn) {
        return res.status(400).json({ success: false, error: '학번/이름이 비었습니다.' });
      }

      const uNorm = normId(usernameIn);
      const pNorm = normName(passIn);

      // 1) 문서ID(=학번) 우선
      let snap = await db.collection('students').doc(uNorm).get();

      // 2) 보강 조회 (usernameNorm / username / studentId)
      if (!snap.exists) {
        const q1 = await db.collection('students').where('usernameNorm', '==', uNorm).limit(1).get();
        if (!q1.empty) snap = q1.docs[0];
      }
      if (!snap.exists) {
        const q2 = await db.collection('students').where('username', '==', uNorm).limit(1).get();
        if (!q2.empty) snap = q2.docs[0];
      }
      if (!snap.exists) {
        const q3 = await db.collection('students').where('studentId', '==', uNorm).limit(1).get();
        if (!q3.empty) snap = q3.docs[0];
      }

      // 3) 레거시 users 보강 (username)
      let userDoc = null;
      if (!snap.exists) {
        const uq = await db.collection('users').where('username', '==', uNorm).limit(1).get();
        if (!uq.empty) userDoc = uq.docs[0];
      }

      // 학생 레코드 없음
      if (!snap.exists && !userDoc) {
        return res.status(401).json({ success: false, error: '학생 계정을 찾을 수 없음' });
      }

      // A) students 컬렉션 매칭
      if (snap.exists) {
        const s = snap.data() || {};
        // 비번 비교: password(있으면) 또는 name 기반 (NFC 기준)
        const ok =
          normName(s.password || '') === pNorm ||
          (s.name ? normName(s.name) === pNorm : false) ||
          // 보조: 느슨 비교(공백/대소문자 무시)도 허용
          normLoose(s.password || s.name || '') === normLoose(passIn);

        if (!ok) return res.status(401).json({ success: false, error: '이름(비밀번호)이 일치하지 않습니다.' });
        if (s.enabled === false) return res.status(403).json({ success: false, error: '비활성 학생입니다.' });

        setSessionCookie(res, {
          uid: snap.id,
          role: 'student',
          teacherId: s.teacherId || null,
          rosterId: s.rosterId || null,
          name: s.name || null,
          username: s.username || snap.id,
        });

        return res.status(200).json({
          success: true,
          role: 'student',
          uid: snap.id,
          teacherId: s.teacherId || null,
          rosterId: s.rosterId || null,
          name: s.name || null,
          username: s.username || snap.id,
        });
      }

      // B) 레거시 users 기반 로그인
      const u = userDoc.data() || {};
      const okLegacy =
        normName(u.password || u.name || '') === pNorm ||
        normLoose(u.password || u.name || '') === normLoose(passIn);
      if (!okLegacy) return res.status(401).json({ success: false, error: '이름(비밀번호)이 일치하지 않습니다.' });
      if (u.status && u.status !== 'active') {
        return res.status(403).json({ success: false, error: `계정 상태: ${u.status}` });
      }

      setSessionCookie(res, {
        uid: userDoc.id,
        role: u.role || 'student',
        teacherId: u.teacherId || null,
        rosterId: u.rosterId || null,
        name: u.name || null,
        username: u.username || userDoc.id,
      });

      return res.status(200).json({
        success: true,
        role: u.role || 'student',
        uid: userDoc.id,
        teacherId: u.teacherId || null,
        rosterId: u.rosterId || null,
        name: u.name || null,
        username: u.username || userDoc.id,
      });
    }

    // ──────────────── 교사/수퍼 로그인 ────────────────
    if (!email || !passIn) {
      return res.status(400).json({ success: false, error: '교사 로그인: email/password 누락' });
    }

    const tq = await db.collection('users').where('email', '==', email).limit(1).get();
    if (tq.empty) return res.status(401).json({ success: false, error: '계정을 찾을 수 없음' });

    const tdoc = tq.docs[0];
    const t = tdoc.data() || {};

    if (toStr(t.password) !== toStr(passIn)) {
      return res.status(401).json({ success: false, error: '비밀번호 불일치' });
    }
    if (t.status && t.status !== 'active') {
      return res.status(403).json({ success: false, error: `계정 상태: ${t.status}` });
    }

    setSessionCookie(res, {
      uid: tdoc.id,
      role: t.role || 'teacher',
      teacherId: t.teacherId || tdoc.id,
      email: t.email || null,
      name: t.name || null,
    });

    return res.status(200).json({
      success: true,
      role: t.role || 'teacher',
      teacherId: t.teacherId || tdoc.id,
    });
  } catch (e) {
    console.error('[auth/login] error', e);
    return res.status(500).json({ success: false, error: e?.message || 'server error' });
  }
}
