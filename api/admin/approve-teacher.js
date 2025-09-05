// /api/admin/approve-teacher.js
import { db } from '../_fb.js';
import admin from 'firebase-admin';

export default async function handler(req,res){
  try{
    if (req.method !== 'POST') return res.status(405).json({ success:false, error:'Method Not Allowed' });
    // 간단히 헤더 토큰으로 수퍼 인증 (이미 수퍼 세션이 있다면 그걸로 교체 가능)
    if (req.headers['x-admin-token'] !== process.env.ADMIN_CREATE_TOKEN) {
      return res.status(403).json({ success:false, error:'권한 없음' });
    }

    const { teacherId, approve } =
      typeof req.body === 'string' ? JSON.parse(req.body) : req.body;

    const status = approve ? 'active' : 'disabled';
    const now = admin.firestore.FieldValue.serverTimestamp();

    const uRef = db().collection('users').doc(teacherId);
    const tRef = db().collection('teachers').doc(teacherId);
    await db().runTransaction(async tx => {
      tx.set(uRef, { status, updatedAt: now }, { merge:true });
      tx.set(tRef, { status, updatedAt: now }, { merge:true });
    });

    return res.status(200).json({ success:true, status });
  }catch(e){
    console.error('[approve-teacher] error', e);
    return res.status(500).json({ success:false, error: e?.message || 'server error' });
  }
}
