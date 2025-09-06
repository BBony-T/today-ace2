// /api/admin/delete-activity.js
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
    const id        = (body.id || '').trim();

    if (!teacherId) return res.status(200).json({ success:false, error:'NO_TEACHER' });

    let ref;
    if (id) {
      ref = admin.firestore().collection('activities').doc(id);
    } else {
      if (!rosterId || !date) return res.status(200).json({ success:false, error:'MISSING_KEYS' });
      const docId = `${teacherId}__${rosterId}__${date}`;
      ref = admin.firestore().collection('activities').doc(docId);
    }
    await ref.delete();
    return res.status(200).json({ success:true });
  } catch (e) {
    return res.status(200).json({ success:false, error: e.message || 'DELETE_FAIL' });
  }
}
