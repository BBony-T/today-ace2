// /api/admin/list-rosters.js
import { db } from '../_fb.js';
import { getUserFromReq } from '../_shared/initAdmin.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ success:false, error:'Method Not Allowed' });
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
