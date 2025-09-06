// /api/admin/list-activities.js
import admin from 'firebase-admin';
import { getUserFromReq } from '../_shared/initAdmin.js'; // 프로젝트 스타일에 맞춰 import

// admin 초기화는 initAdmin.js 에서 되어 있다고 가정

export default async function handler(req, res) {
  try {
    const me = getUserFromReq?.(req);
    const teacherId = (req.query.teacherId || me?.teacherId || me?.uid || '').trim();
    const rosterId  = (req.query.rosterId || '').trim();
    const start     = (req.query.start || '').trim(); // YYYY-MM-DD
    const end       = (req.query.end   || '').trim(); // YYYY-MM-DD

    if (!teacherId) return res.status(200).json({ success:false, error:'NO_TEACHER' });

    let q = admin.firestore().collection('activities')
      .where('teacherId', '==', teacherId);

    if (rosterId) q = q.where('rosterId', '==', rosterId);
    if (start)    q = q.where('date', '>=', start);
    if (end)      q = q.where('date', '<=', end);

    const snap = await q.orderBy('date', 'asc').get();
    const activities = snap.docs.map(d => ({ id:d.id, ...d.data() }));

    return res.status(200).json({ success:true, activities });
  } catch (e) {
    return res.status(200).json({ success:false, error: e.message || 'LIST_FAIL' });
  }
}
