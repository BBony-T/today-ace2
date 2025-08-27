// /api/login.js
import bcrypt from 'bcryptjs';
import initAdmin from './_shared/initAdmin.js';
import { getFirestore } from 'firebase-admin/firestore';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    initAdmin();
    const db = getFirestore();

    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ success: false, error: 'Missing fields' });
    }

    const snap = await db.collection('users')
      .where('username', '==', username)
      .where('isActive', '==', true)
      .limit(1)
      .get();

    if (snap.empty) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const doc = snap.docs[0];
    const user = doc.data();

    const ok = await bcrypt.compare(password, user.passwordHash || '');
    if (!ok) {
      return res.status(401).json({ success: false, error: 'Invalid credentials' });
    }

    const role = user.role || 'student';
    const isAdmin = role === 'admin' || role === 'superadmin';

    return res.status(200).json({
      success: true,
      userType: isAdmin ? 'admin' : 'student',
      role,
      username: user.username,
      studentInfo: isAdmin ? undefined : (user.studentInfo || null),
    });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ success: false, error: 'Server error' });
  }
}
