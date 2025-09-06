// /api/student/list-my-rosters.js
import { db } from '../_fb.js';
import { getUserFromReq } from '../_shared/initAdmin.js';

const toStr = v => (v ?? '').toString().trim();

export default async function handler(req, res) {
  try {
    const me = getUserFromReq?.(req);
    if (!me || me.role !== 'student') {
      return res.status(401).json({ success:false, error:'STUDENT_SESSION_REQUIRED' });
    }

    // whoami 확장으로 세션/문서에서 rosterIds 확보
    const uid = toStr(me.uid || me.username || '');
    let rosterIds = Array.isArray(me.rosterIds) ? me.rosterIds : [];
    let teacherId = toStr(me.teacherId || '');

    if (!rosterIds.length || !teacherId) {
      const doc = await db().collection('students').doc(uid).get();
      if (doc.exists) {
        const s = doc.data();
        rosterIds = s.rosterIds || (s.rosterId ? [s.rosterId] : []);
        teacherId = teacherId || toStr(s.teacherId || '');
      }
    }

    // rosterIds 각각 가져오기
    const unique = [...new Set(rosterIds)].slice(0, 30); // 안전상 한도
    const snaps = await Promise.all(unique.map(id => db().collection('rosters').doc(id).get()));
    const rosters = snaps
      .filter(s => s.exists)
      .map(s => s.data())
      .filter(r => !teacherId || r.teacherId === teacherId);

    return res.status(200).json({ success:true, rosters });
  } catch (e) {
    console.error('[list-my-rosters] error', e);
    return res.status(500).json({ success:false, error:e?.message || 'server error' });
  }
}
