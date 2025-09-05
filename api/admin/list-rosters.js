// /api/admin/list-rosters.js
import { db } from '../_fb.js';
import { getUserFromReq } from '../_shared/initAdmin.js';
import admin from 'firebase-admin';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ success:false, error:'Method Not Allowed' });
    }

    const me = getUserFromReq(req);
    // 로그인 미연결 개발 단계면 아래 2줄 주석 해제 금지
    // if (!me || (me.role !== 'teacher' && me.role !== 'super')) {
    //   return res.status(401).json({ success:false, error:'로그인 필요' });
    // }

    const teacherId =
      (me && (me.role === 'super' && req.query.teacherId ? req.query.teacherId : (me.teacherId || me.uid)))
      || req.query.teacherId
      || 'T_DEFAULT';

    // 현황판에 노출 중인 rosterIds
    const boardDoc = await db().collection('boards').doc(teacherId).get();
    const activeIds = boardDoc.exists ? (boardDoc.data().activeRosterIds || []) : [];

    const snap = await db()
      .collection('rosters')
      .where('teacherId', '==', teacherId)
      .orderBy('createdAt', 'desc')
      .get();

    const rosters = [];
    for (const d of snap.docs) {
      const r = d.data();

      // 학생 수 집계(aggregate count). SDK v12 이상에서 동작
      const agg = await db()
        .collection('students')
        .where('teacherId', '==', teacherId)
        .where('rosterId', '==', d.id)
        .count()
        .get();

      const itemCount = agg.data().count || 0;

      rosters.push({
        id: d.id,
        teacherId,
        type: r.type || 'roster',
        title: r.title || r.name || '무제 명부',
        itemCount,
        createdAt: r.createdAt || admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: r.updatedAt || r.createdAt || admin.firestore.FieldValue.serverTimestamp(),
        active: activeIds.includes(d.id),
        published: !!r.published,
      });
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ success:true, rosters });
  } catch (e) {
    console.error('[list-rosters] error', e);
    return res.status(500).json({ success:false, error: e?.message || 'server error' });
  }
}
