// /api/auth/teacher-signup.js
import { db } from '../_fb.js';
import admin from 'firebase-admin';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ success:false, error:'Method Not Allowed' });
    const { name = '', email = '', password = '', inviteCode = '' } =
      typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ success:false, error:'필수값(name, email, password)' });
    }

    // teacherId 발급
    const teacherRef = db().collection('teachers').doc();
    const teacherId = teacherRef.id;

    const now = admin.firestore.FieldValue.serverTimestamp();

    // 초대코드가 맞거나, 수퍼관리자 토큰으로 호출되면 즉시 활성화
    const autoActive =
      (!!process.env.TEACHER_INVITE_CODE && inviteCode === process.env.TEACHER_INVITE_CODE) ||
      (req.headers['x-admin-token'] && req.headers['x-admin-token'] === process.env.ADMIN_CREATE_TOKEN);

    const status = autoActive ? 'active' : 'pending';

    // users / teachers 동시 생성
    const batch = db().batch();
    const userRef = db().collection('users').doc(teacherId);
    batch.set(userRef, {
      role: 'teacher', teacherId, email, name, password, status,
      createdAt: now, updatedAt: now
    });
    batch.set(teacherRef, { name, email, status, createdAt: now, updatedAt: now });
    await batch.commit();

    return res.status(200).json({ success:true, teacherId, status });
  } catch (e) {
    console.error('[teacher-signup] error', e);
    return res.status(500).json({ success:false, error: e?.message || 'server error' });
  }
}
