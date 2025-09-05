// /api/admin/delete-roster.js
import { db } from '../_fb.js';
import { getUserFromReq } from '../_shared/initAdmin.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ success:false, error:'Method Not Allowed' });

    const me = getUserFromReq(req);
    const teacherId =
      (me && (me.teacherId || me.uid)) ||
      req.query.teacherId || req.body.teacherId || 'T_DEFAULT';

    const { rosterId } = req.body || {};
    if (!rosterId) return res.status(400).json({ success:false, error:'rosterId required' });

    // 1) roster 삭제
    await db().collection('rosters').doc(rosterId).delete();

    // 2) 보드 active 목록에서 제거
    const boardRef = db().collection('boards').doc(teacherId);
    const snap = await boardRef.get();
    if (snap.exists) {
      const active = (snap.data().activeRosterIds || []).filter(id => id !== rosterId);
      await boardRef.set({ activeRosterIds: active }, { merge: true });
    }

    // 3) 해당 roster 학생들 비활성(또는 실제 삭제 원하면 delete)
    const col = db().collection('students');
    const qs = await col.where('teacherId','==',teacherId).where('rosterId','==',rosterId).get();

    let batch = db().batch(), i = 0;
    qs.forEach(doc => {
      batch.update(doc.ref, { enabled: false });
      i++;
      if (i % 400 === 0) { batch.commit(); batch = db().batch(); }
    });
    await batch.commit();

    return res.status(200).json({ success:true });
  } catch (e) {
    console.error('[delete-roster] error:', e);
    return res.status(500).json({ success:false, error:e?.message || 'server error' });
  }
}
