// /api/admin/create-user.js
import bcrypt from 'bcryptjs';
import initAdmin from '../_shared/initAdmin.js';
import { getFirestore } from 'firebase-admin/firestore';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // 간단 보안: 헤더 토큰 검사
  const token = req.headers['x-admin-create-token'];
  if (!token || token !== process.env.ADMIN_CREATE_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    initAdmin();
    const db = getFirestore();

    const {
      username,
      displayName,
      role = 'admin',       // 기본 admin 생성 가능
      tempPassword = 'ChangeMe123!',
      isActive = true,
      studentInfo,          // 학생이면 { name, class, grade } 등
    } = req.body || {};

    if (!username || !tempPassword) {
      return res.status(400).json({ error: 'Missing fields' });
    }

    // 중복 체크
    const dup = await db.collection('users').where('username', '==', username).limit(1).get();
    if (!dup.empty) {
      return res.status(409).json({ error: 'Username already exists' });
    }

    const passwordHash = await bcrypt.hash(tempPassword, 10);

    await db.collection('users').add({
      username,
      displayName: displayName || username,
      role,            // 'superadmin' | 'admin' | 'teacher' | 'student'
      isActive,
      passwordHash,
      // 선택: 학생이면 넣어주기
      ...(studentInfo ? { studentInfo } : {}),
      createdAt: new Date(),
    });

    return res.status(201).json({ success: true });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ error: 'Server error' });
  }
}
