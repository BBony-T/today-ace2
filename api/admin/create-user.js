// /api/admin/create-user.js

import bcrypt from 'bcryptjs';
import initAdmin from '../_shared/initAdmin.js';
import { getFirestore } from 'firebase-admin/firestore';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  // 보안 토큰 확인 (Vercel 환경변수: ADMIN_CREATE_TOKEN)
  const token = req.headers['x-admin-create-token'];
  if (!token || token !== process.env.ADMIN_CREATE_TOKEN) {
    return res.status(401).json({ success: false, error: 'Unauthorized' });
  }

  try {
    initAdmin(); // _shared/initAdmin.js 가 firebase-admin 초기화
    const db = getFirestore();

    const {
      username,
      displayName,
      role = 'admin',                 // 'admin' 기본
      tempPassword = 'ChangeMe123!',
      isActive = true,
      studentInfo,                    // 선택: { name, class, grade } 등
    } = req.body || {};

    if (!username || !tempPassword) {
      return res.status(400).json({ success: false, error: 'username and tempPassword required' });
    }

    // username을 문서 ID로 사용 → 중복을 구조적으로 방지
    const docRef = db.collection('users').doc(username);
    const exists = (await docRef.get()).exists;
    if (exists) {
      return res.status(409).json({ success: false, error: 'Username already exists' });
    }

    const passwordHash = await bcrypt.hash(tempPassword, 10);

    await docRef.set({
      username,
      displayName: displayName || username,
      role,                       // 'superadmin' | 'admin' | 'teacher' | 'student'
      isActive: !!isActive,
      passwordHash,
      ...(studentInfo ? { studentInfo } : {}),
      createdAt: new Date(),       // 필요한 경우 서버타임스탬프로 교체 가능
      updatedAt: new Date(),
    });

    return res.status(201).json({ success: true, username });
  } catch (e) {
    console.error('create-user error:', e);
    return res.status(500).json({ success: false, error: String(e?.message || e) });
  }
}
