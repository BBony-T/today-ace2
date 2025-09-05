// /api/admin/list-rosters.js
import { db } from '../_fb.js';
import { getUserFromReq } from '../_shared/initAdmin.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ success:false, error:'Method Not Allowed' });
    }

    const me = getUserFromReq(req) || {};
    // 1) 조회 후보 식별자 세트 구성
    const candidates = [
      req.query.teacherId,      // 수퍼가 쿼리로 지정한 경우
      me.teacherId,             // 우리가 지정한 커스텀 teacherId
      me.email,                 // 수퍼/교사 이메일
      me.uid,                   // uid
      'T_DEFAULT',              // 개발/임시 업로드에 쓰였을 가능성
    ].filter(Boolean);

    // 중복 제거
    const uniq = [...new Set(candidates)];

    // 2) 각 후보로 개별 쿼리 → 합치기
    const queries = uniq.map(id =>
      db()
        .collection('rosters')
        .where('teacherId', '==', id)
        .orderBy('createdAt', 'desc')
        .limit(50)
        .get()
        .then(snap => snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );

    const results = (await Promise.all(queries)).flat();

    // 3) createdAt 내림차순 정렬 + 중복 문서 제거
    const toMs = t => t?.toMillis ? t.toMillis() : (t?.seconds ? t.seconds * 1000 : 0);
    const byId = new Map();
    for (const r of results) if (!byId.has(r.id)) byId.set(r.id, r);
    const rosters = [...byId.values()].sort((a,b) => (toMs(b.createdAt) - toMs(a.createdAt)));

    // 4) boards/{teacherId}의 활성화 목록(있으면) 반영
    let active = [];
    // 우선순위: 명시 teacherId → me.teacherId → me.email → me.uid → 'T_DEFAULT'
    const preferredId = uniq[0];
    const boardDoc = await db().collection('boards').doc(preferredId).get();
    if (boardDoc.exists) active = boardDoc.data().activeRosterIds || [];
    const rostersWithActive = rosters.map(r => ({ ...r, active: active.includes(r.id) }));

    return res.status(200).json({ success:true, rosters: rostersWithActive });
  } catch (e) {
    console.error('[list-rosters] error', e);
    return res.status(500).json({ success:false, error: e?.message || 'server error' });
  }
}
