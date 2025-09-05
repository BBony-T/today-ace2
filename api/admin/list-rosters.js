// /api/admin/list-rosters.js
import { db } from '../_fb.js';
import { getUserFromReq } from '../_shared/initAdmin.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ success:false, error:'Method Not Allowed' });
    }

    const me = getUserFromReq(req);
    // 로그인 보호를 켜려면 아래 주석 해제
    // if (!me || (me.role !== 'teacher' && me.role !== 'super')) {
    //   return res.status(401).json({ success:false, error:'로그인 필요' });
    // }

    // ✅ teacherId 규칙을 업로드쪽과 동일하게 통일
    // - 수퍼는 ?teacherId= 우선, 없으면 자신의 teacherId/email/uid 순
    // - 교사는 자신의 teacherId/email/uid
    const teacherId = (() => {
      if (me?.role === 'super') {
        return req.query.teacherId
          || me?.teacherId || me?.email || me?.uid || 'T_DEFAULT';
      }
      return me?.teacherId || me?.email || me?.uid || 'T_DEFAULT';
    })();

    // 보드의 활성화된 roster id 목록(없을 수 있음)
    const boardDoc = await db().collection('boards').doc(teacherId).get();
    const active = boardDoc.exists ? (boardDoc.data().activeRosterIds || []) : [];

    // rosters 조회 (teacherId + createdAt desc) — 인덱스 필요
    const snap = await db()
      .collection('rosters')
      .where('teacherId','==', teacherId)
      .orderBy('createdAt','desc')
      .get();

    const toMs = t => t?.toMillis ? t.toMillis() : (t?.seconds ? t.seconds*1000 : null);
    const rosters = snap.docs.map(d => {
      const x = d.data();
      return {
        id: d.id,
        ...x,
        createdAtMs: toMs(x.createdAt),
        updatedAtMs: toMs(x.updatedAt),
        active: active.includes(d.id),
      };
    });

    return res.status(200).json({ success:true, rosters });
  } catch (e) {
    console.error('[list-rosters] error', e);
    return res.status(500).json({ success:false, error: e?.message || 'server error' });
  }
}
