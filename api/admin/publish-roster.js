// /api/admin/publish-roster.js
import { db } from '../_fb.js';
import { getUserFromReq } from '../_shared/initAdmin.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ success:false, error:'Method Not Allowed' });

    const me = getUserFromReq(req);
    const teacherId =
      (me && (me.teacherId || me.uid)) ||
      req.query.teacherId || req.body.teacherId || 'T_DEFAULT';

    const { rosterId, publish } = req.body || {};
    if (!rosterId) return res.status(400).json({ success:false, error:'rosterId required' });

    // 1) 보드 활성 목록 갱신
    const boardRef = db().collection('boards').doc(teacherId);
    const snap = await boardRef.get();
    let active = snap.exists ? (snap.data().activeRosterIds || []) : [];
    if (publish) active = Array.from(new Set([...active, rosterId]));
    else active = active.filter(id => id !== rosterId);
    await boardRef.set({ activeRosterIds: active }, { merge: true });

    // 2) 해당 roster 학생 enabled 일괄 업데이트
    const col = db().collection('students');
    const qs = await col.where('teacherId','==',teacherId).where('rosterId','==',rosterId).get();
    let batch = db().batch(), i = 0;
    qs.forEach(doc => {
      batch.update(doc.ref, { enabled: !!publish, updatedAt: Date.now() });
      i++;
      if (i % 400 === 0) { batch.commit(); batch = db().batch(); }
    });
    await batch.commit();

    return res.status(200).json({ success:true, activeRosterIds: active });
  } catch (e) {
    console.error('[publish-roster] error:', e);
    return res.status(500).json({ success:false, error:e?.message || 'server error' });
  }
}
