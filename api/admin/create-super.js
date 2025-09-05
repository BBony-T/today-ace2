// /api/admin/create-super.js
import { db } from '../_fb.js';
import admin from 'firebase-admin';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ success:false, error:'Method Not Allowed' });
    if (req.headers['x-admin-token'] !== process.env.ADMIN_CREATE_TOKEN) {
      return res.status(403).json({ success:false, error:'권한 없음' });
    }
    const { email='nightmoon@korea.kr', password='sandy13231!' } =
      typeof req.body === 'string' ? JSON.parse(req.body) : (req.body||{});

    // 이미 있으면 덮어쓰기
    const snap = await db().collection('users').where('email','==',email).limit(1).get();
    const id = snap.empty ? db().collection('users').doc().id : snap.docs[0].id;

    const now = admin.firestore.FieldValue.serverTimestamp();
    await db().collection('users').doc(id).set({
      role:'super', email, password, status:'active',
      createdAt: now, updatedAt: now
    }, { merge:true });

    return res.status(200).json({ success:true, email });
  } catch (e) {
    return res.status(500).json({ success:false, error:e.message });
  }
}
