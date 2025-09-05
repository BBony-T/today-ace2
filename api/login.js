// /api/auth/login.js
import { db } from '../_fb.js';
import { setSessionCookie } from '../_shared/initAdmin.js';

const t = s => (s ?? '').toString().trim();

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ success:false, error:'Method Not Allowed' });
    const b = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { email, username, password, mode } = b || {};

    // 학생 로그인
    if ((mode === 'student') || (!email && username)) {
      const id = t(username);
      const pw = t(password);
      if (!id || !pw) return res.status(400).json({ success:false, error:'학번/이름 필요' });

      // studentId 또는 username 어느 쪽이든 매치
      const [q1, q2] = await Promise.all([
        db().collection('students').where('studentId','==', id).limit(1).get(),
        db().collection('students').where('username','==', id).limit(1).get(),
      ]);
      const doc = !q1.empty ? q1.docs[0] : (!q2.empty ? q2.docs[0] : null);
      if (!doc) return res.status(401).json({ success:false, error:'계정을 찾을 수 없음' });

      const u = doc.data();
      if (t(u.password) !== pw) return res.status(401).json({ success:false, error:'비밀번호 불일치' });
      // ✅ enabled가 false일 때만 차단, 없으면 허용
      if (u.enabled === false) return res.status(403).json({ success:false, error:'계정 비활성화' });

      await setSessionCookie(res, {
        uid: doc.id,
        role: 'student',
        studentId: u.studentId || doc.id,
        teacherId: u.teacherId || null,
        rosterId: u.rosterId || null,
        name: u.name,
        username: u.username,
      });

      return res.status(200).json({ success:true, role:'student', studentId: u.studentId || doc.id });
    }

    // 교사/수퍼 로그인
    if (!email) return res.status(400).json({ success:false, error:'email 필요' });

    const q = await db().collection('users').where('email','==', t(email)).limit(1).get();
    if (q.empty) return res.status(401).json({ success:false, error:'계정을 찾을 수 없음' });
    const doc = q.docs[0];
    const u = doc.data();

    if (t(u.password) !== t(password)) return res.status(401).json({ success:false, error:'비밀번호 불일치' });
    if (u.status && u.status !== 'active') return res.status(403).json({ success:false, error:`계정 상태: ${u.status}` });

    await setSessionCookie(res, {
      uid: doc.id,
      role: u.role || 'teacher',
      teacherId: u.teacherId || doc.id,
      email: u.email,
      name: u.name,
    });

    return res.status(200).json({ success:true, role: u.role || 'teacher', teacherId: u.teacherId || doc.id });
  } catch (e) {
    console.error('[login] error', e);
    return res.status(500).json({ success:false, error: e?.message || 'server error' });
  }
}
