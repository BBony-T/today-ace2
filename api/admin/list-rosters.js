// /api/admin/list-rosters.js
import { db } from '../_fb.js';
import { getUserFromReq } from '../_shared/initAdmin.js';

const toMs = t => t?.toMillis ? t.toMillis() : (t?.seconds ? t.seconds*1000 : null);

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') return res.status(405).json({ success:false, error:'Method Not Allowed' });

    const me = getUserFromReq(req) || {};
    // 후보 식별자(과거/현재 데이터 모두 포괄)
    const candidates = [
      req.query.teacherId,
      me.teacherId,
      me.email,
      me.uid,
      'T_DEFAULT',
    ].filter(Boolean);
    const uniq = [...new Set(candidates)];

    const queries = uniq.map(id =>
      db().collection('rosters')
        .where('teacherId','==', id)
        .orderBy('createdAt','desc')
        .limit(50)
        .get()
        .then(snap => snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );
    const raw = (await Promise.all(queries)).flat();

    const byId = new Map();
    for (const r of raw) if (!byId.has(r.id)) byId.set(r.id, r);

    const rosters = [...byId.values()].map(x => ({
      id: x.id,
      teacherId: x.teacherId,
      type: x.type || 'roster',
      name: x.name || '',
      title: x.title || x.name || `${x.type || '명부'}`,
      count: (x.count ?? x.studentCount ?? 0),
      studentCount: (x.studentCount ?? x.count ?? 0),
      published: !!x.published,
      createdAt: x.createdAt || null,
      updatedAt: x.updatedAt || null,
      createdAtMs: toMs(x.createdAt),
      updatedAtMs: toMs(x.updatedAt),
    })).sort((a,b) => (b.createdAtMs||0) - (a.createdAtMs||0));

    // boards/{teacherId}의 활성화 목록(있으면) 반영
    const preferredId = uniq[0];
    let active = [];
    const boardDoc = await db().collection('boards').doc(preferredId).get();
    if (boardDoc.exists) active = boardDoc.data().activeRosterIds || [];
    const rostersWithActive = rosters.map(r => ({ ...r, active: active.includes(r.id) }));

    return res.status(200).json({ success:true, rosters: rostersWithActive });
  } catch (e) {
    console.error('[list-rosters] error', e);
    return res.status(500).json({ success:false, error: e?.message || 'server error' });
  }
}
