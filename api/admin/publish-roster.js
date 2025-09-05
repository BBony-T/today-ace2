// /api/admin/publish-roster.js
import { db } from '../_fb.js';
import admin from 'firebase-admin';

export default async function handler(req,res){
  try{
    if (req.method !== 'POST') return res.status(405).json({ success:false, error:'Method Not Allowed' });

    const teacherId = req.user?.teacherId || req.query.teacherId || 'T_DEFAULT';
    let { rosterId, publish } = (typeof req.body === 'string') ? JSON.parse(req.body) : req.body;
    publish = !!publish;

    // 1) boards.activeRosterIds 업데이트
    const boardRef = db().collection('boards').doc(teacherId);
    await db().runTransaction(async (tx) => {
      const cur = await tx.get(boardRef);
      let arr = cur.exists ? (cur.data().activeRosterIds || []) : [];
      arr = new Set(arr);
      publish ? arr.add(rosterId) : arr.delete(rosterId);
      tx.set(boardRef, { activeRosterIds: Array.from(arr), updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge:true });
    });

    // 2) students/users enabled 토글
    const studentsCol = db().collection('students');
    const usersCol    = db().collection('users');
    const q = await studentsCol.where('teacherId','==',teacherId).where('rosterId','==',rosterId).get();

    let batch = db().batch(); let ops = 0; let count = 0;
    for (const doc of q.docs) {
      batch.update(doc.ref, { enabled: publish, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
      const stu = doc.data(); // { studentId }
      const key = `${teacherId}:${stu.studentId}`;
      batch.set(usersCol.doc(key), { enabled: publish, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge:true });
      if (++ops >= 450) { await batch.commit(); batch = db().batch(); ops=0; }
      count++;
    }
    if (ops > 0) await batch.commit();

    // 3) rosters.published 상태도 동기화(선택)
    await db().collection('rosters').doc(rosterId).set({ published: publish, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge:true });

    return res.status(200).json({ success:true, affected: count, publish });
  }catch(e){
    console.error('[publish-roster] error', e);
    return res.status(500).json({ success:false, error:e?.message || 'server error' });
  }
}
