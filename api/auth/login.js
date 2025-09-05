// /api/auth/login.js
import { db } from '../_fb.js';
import { setSessionCookie, clearSessionCookie } from '../_shared/initAdmin.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ success:false, error:'Method Not Allowed' });
    const { email, username, password } =
      typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    let q = null;
    if (email) {
      // teacher/super
      q = await db().collection('users').where('email','==',email).limit(1).get();
    } else if (username) {
      // student
      q = await db().collection('users').where('username','==',username).limit(1).get();
    } else {
      return res.status(400).json({ success:false, error:'email 또는 username 필요' });
    }

    if (q.empty) return res.status(401).json({ success:false, error:'계정을 찾을 수 없음' });
    const doc = q.docs[0]; const u = doc.data();

    if (u.password !== password) return res.status(401).json({ success:false, error:'비밀번호 불일치' });
    if (u.status && u.status !== 'active') return res.status(403).json({ success:false, error:`계정 상태: ${u.status}` });

    // 세션 발급
    setSessionCookie(res, {
      uid: doc.id,
      role: u.role,
      teacherId: u.teacherId || (u.role==='teacher' ? doc.id : undefined),
      email: u.email || null,
      name: u.name || null,
      username: u.username || null
    });

    return res.status(200).json({ success:true, role: u.role, teacherId: u.teacherId || doc.id });
  } catch (e) {
    console.error('[login] error', e);
    return res.status(500).json({ success:false, error: e?.message || 'server error' });
  }
}
