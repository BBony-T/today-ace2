// /api/admin/fix-students-once.js
import { db } from '../_fb.js';
import admin from 'firebase-admin';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ success:false, error:'Method Not Allowed' });
    const snap = await db().collection('students').get();
    const now = admin.firestore.FieldValue.serverTimestamp();

    const docs = snap.docs;
    let updated = 0;
    while (docs.length) {
      const chunk = docs.splice(0, 400);
      const batch = db().batch();
      chunk.forEach(d => {
        const s = d.data();
        const patch = { updatedAt: now };
        if (s.enabled === false || s.enabled === undefined) patch.enabled = true;
        if (!s.password && s.name) patch.password = s.name;
        if (!s.username && s.studentId) patch.username = s.studentId;
        batch.set(d.ref, patch, { merge: true });
      });
      await batch.commit();
      updated += chunk.length;
    }
    return res.status(200).json({ success:true, updated });
  } catch (e) {
    console.error('[fix-students-once] error', e);
    return res.status(500).json({ success:false, error: e?.message || 'server error' });
  }
}
