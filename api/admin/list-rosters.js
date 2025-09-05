// /api/admin/list-rosters.js
import { db } from '../_fb.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ success:false, error:'Method Not Allowed' });
    const teacherId = req.user?.teacherId || req.query.teacherId || 'T_DEFAULT';

    const boardDoc = await db().collection('boards').doc(teacherId).get();
    const active = boardDoc.exists ? (boardDoc.data().activeRosterIds || []) : [];

    const snap = await db().collection('rosters').where('teacherId','==',teacherId).orderBy('createdAt','desc').get();
    const rosters = snap.docs.map(d => ({ id:d.id, ...d.data(), active: active.includes(d.id) }));

    return res.status(200).json({ success:true, rosters });
  } catch (e) {
    console.error('[list-rosters] error', e);
    return res.status(500).json({ success:false, error: e?.message || 'server error' });
  }
}
