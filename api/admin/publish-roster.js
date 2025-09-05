// /api/admin/publish-roster.js
import { db } from '../_fb.js';
import admin from 'firebase-admin';
import { getUserFromReq } from '../_shared/initAdmin.js';

export default async function handler(req,res){
  try{
    if (req.method !== 'POST') return res.status(405).json({ success:false, error:'Method Not Allowed' });

    const me = getUserFromReq(req);
    if (!me || (me.role !== 'teacher' && me.role !== 'super')) {
      // 로그인 붙이기 전까지 임시 허용하려면, 아래 한 줄만 남겨도 됩니다.
      // return res.status(401).json({ success:false, error:'로그인 필요' });
    }

    // 최종 teacherId 계산 (수퍼는 ?teacherId= 로 임의 전환 가능)
    const teacherId =
      (me && (me.role === 'super' && req.query.teacherId ? req.query.teacherId : (me.teacherId || me.uid)))
      || req.query.teacherId      // ← 로그인 붙이기 전 임시 fallback
      || 'T_DEFAULT';             // ← 마지막 안전값(개발용)

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
