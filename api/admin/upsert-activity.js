// /api/admin/upsert-activity.js
import admin from 'firebase-admin';
import { getUserFromReq } from '../_shared/initAdmin.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ success:false, error:'Method Not Allowed' });
    }
    const me = getUserFromReq?.(req);
    const body = typeof req.body === 'string' ? JSON.parse(req.body||'{}') : (req.body||{});

    const teacherId = (req.query.teacherId || me?.teacherId || body.teacherId || '').trim();
    const rosterId  = (body.rosterId || '').trim();
    const date      = (body.date || '').slice(0,10);
    const name      = (body.name || '').trim();

    if (!teacherId || !rosterId || !date || !name) {
      return res.status(200).json({ success:false, error:'MISSING_FIELDS' });
    }

    // 고유키: teacherId_rosterId_date
    const docId = `${teacherId}__${rosterId}__${date}`;
    const ref = admin.firestore().collection('activities').doc(docId);
    const now = admin.firestore.FieldValue.serverTimestamp();

    await ref.set({
      teacherId, rosterId, date, name,
      createdAt: now, updatedAt: now
    }, { merge:true });

    return res.status(200).json({ success:true, id: docId });
  } catch (e) {
    return res.status(200).json({ success:false, error: e.message || 'UPSERT_FAIL' });
  }
}
