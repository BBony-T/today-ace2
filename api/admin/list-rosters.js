// /api/admin/list-rosters.js
import { db } from '../_fb.js';
import { getUserFromReq } from '../_shared/initAdmin.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ success:false, error:'Method Not Allowed' });

    const me = getUserFromReq(req);
    const teacherId =
      (me && (me.role === 'super' && req.query.teacherId ? req.query.teacherId : (me.teacherId || me.uid))) ||
      req.query.teacherId ||
      'T_DEFAULT';

    // boards.activeRosterIds
    const boardDoc = await db().collection('boards').doc(teacherId).get();
    const activeIds = boardDoc.exists ? (boardDoc.data().activeRosterIds || []) : [];

    // rosters
    const snap = await db().collection('rosters')
      .where('teacherId','==',teacherId)
      .orderBy('createdAt','desc')
      .get();

    const rosters = [];
    for (const d of snap.docs) {
      const r = { id: d.id, ...d.data() };
      // 학생 수 집계 (간단하게 size 사용)
      const cntSnap = await db().collection('students')
        .where('teacherId','==',teacherId)
        .where('rosterId','==',d.id)
        .get();

      rosters.push({
        id: d.id,
        title: r.title || '명부',
        itemCount: r.itemCount ?? cntSnap.size,
        categoryType: r.categoryType || '',
        categoryName: r.categoryName || '',
        createdAt: r.createdAt || null,
        updatedAt: r.updatedAt || null,
        active: activeIds.includes(d.id),
        type: 'roster',
      });
    }

    return res.status(200).json({ success:true, rosters });
  } catch (e) {
    console.error('[list-rosters] error', e);
    return res.status(500).json({ success:false, error: e?.message || 'server error' });
  }
}
