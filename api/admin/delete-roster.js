// /api/admin/delete-roster.js
import { db } from '../_fb.js';
import admin from 'firebase-admin';
import { getUserFromReq } from '../_shared/initAdmin.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ success:false, error:'Method Not Allowed' });

    const me = getUserFromReq(req);
    const teacherId =
      (me && (me.role === 'super' && req.query.teacherId ? req.query.teacherId : (me.teacherId || me.uid))) ||
      req.query.teacherId ||
      'T_DEFAULT';

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const rosterId = body.rosterId || body.id;
    if (!rosterId) return res.status(400).json({ success:false, error:'rosterId 가 필요합니다.' });

    // boards.activeRosterIds에서 제거
    const boardRef = db().collection('boards').doc(teacherId);
    await db().runTransaction(async tx => {
      const b = await tx.get(boardRef);
      const cur = b.exists ? (b.data().activeRosterIds || []) : [];
      const next = cur.filter(x => x !== rosterId);
      tx.set(boardRef, {
        activeRosterIds: next,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge:true });
    });

    // 해당 roster 학생들 삭제
    const col = db().collection('students');
    let deleted = 0;
    const qs = await col.where('teacherId','==',teacherId).where('rosterId','==',rosterId).get();
    let batch = db().batch(); let ops = 0;
    for (const doc of qs.docs) {
      batch.delete(doc.ref);
      ops++; deleted++;
      if (ops >= 450) { await batch.commit(); batch = db().batch(); ops = 0; }
    }
    if (ops > 0) await batch.commit();

    // roster 문서 삭제
    await db().collection('rosters').doc(rosterId).delete();

    return res.status(200).json({ success:true, deletedStudents: deleted, rosterId });
  } catch (e) {
    console.error('[delete-roster] error', e);
    return res.status(500).json({ success:false, error: e?.message || 'server error' });
  }
}
