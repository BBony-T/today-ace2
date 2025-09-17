// /api/auth/teacher-signup.js
import { getDB } from '../../lib/admin.js';
import { FieldValue } from 'firebase-admin/firestore';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ success:false, error:'Method Not Allowed' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const name = String(body.name || '').trim();
    const email = String(body.email || '').trim();
    const password = String(body.password || '').trim();

    if (!name || !email || !password) {
      return res.status(400).json({ success:false, error:'필수값(name, email, password)' });
    }

    const db = getDB();

    // 1) 중복 이메일 방지 (users 컬렉션)
    const dup = await db
      .collection('users')
      .where('email', '==', email)
      .limit(1)
      .get();

    if (!dup.empty) {
      return res.status(409).json({ success:false, error:'이미 등록된 이메일입니다.' });
    }

    // 2) teacherId 발급 (teachers 문서 id)
    const teacherRef = db.collection('teachers').doc();
    const teacherId = teacherRef.id;

    const now = FieldValue.serverTimestamp();

    // 3) 자동 승인(요청사항 반영)
    const status = 'active';
    const approvedBy = 'system:auto';

    // 4) users / teachers 동시 생성 (users 문서 id = teacherId)
    const batch = db.batch();
    const userRef = db.collection('users').doc(teacherId);

    batch.set(userRef, {
      role: 'teacher',
      teacherId,
      email,
      name,
      password,
      status,                     // active
      createdAt: now,
      updatedAt: now,
      signupAt: now,              // 가입 시각
      approvedAt: now,            // 승인 시각
      approvedBy,                 // 누가 승인했는지 기록
    });

    batch.set(teacherRef, {
      teacherId,
      email,
      name,
      status,                     // active
      createdAt: now,
      updatedAt: now,
      signupAt: now,
      approvedAt: now,
      approvedBy,
    });

    await batch.commit();

    // 5) 감사 로그(선택)
    await db.collection('audit_logs').add({
      type: 'signup-teacher',
      userId: teacherId,
      email,
      name,
      status,   // 'active'
      by: approvedBy,
      at: FieldValue.serverTimestamp(),
    });

    return res.status(200).json({ success:true, teacherId, status });
  } catch (e) {
    console.error('[teacher-signup] error', e);
    return res.status(500).json({ success:false, error: e?.message || 'server error' });
  }
}
