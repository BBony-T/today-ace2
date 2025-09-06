// /api/student/get-statistics.js
import { db } from '../_fb.js';
import { getUserFromReq } from '../_shared/initAdmin.js';

const toStr = v => (v ?? '').toString().trim();

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET')
      return res.status(405).json({ success:false, error:'Method Not Allowed' });

    const me = getUserFromReq?.(req);
    if (!me || me.role !== 'student')
      return res.status(401).json({ success:false, error:'STUDENT_SESSION_REQUIRED' });

    const rosterId = toStr(req.query.rosterId || '');
    const startDate = toStr(req.query.startDate || '');
    const endDate   = toStr(req.query.endDate   || '');
    let username = toStr(me.username || '');
    let teacherId = toStr(me.teacherId || '');
    let rosterIds = Array.isArray(me.rosterIds) ? me.rosterIds : [];

    // 보강
    if (!username || !teacherId || !rosterIds.length) {
      const sdoc = await db().collection('students').doc(toStr(me.uid || username)).get();
      if (sdoc.exists) {
        const s = sdoc.data();
        username = username || toStr(s.username || sdoc.id);
        teacherId = teacherId || toStr(s.teacherId || '');
        rosterIds = rosterIds.length ? rosterIds : (s.rosterIds || (s.rosterId ? [s.rosterId] : []));
      }
    }

    // 선택한 rosterId 유효성(내 소속인지)
    if (!rosterId || !rosterIds.includes(rosterId)) {
      return res.status(400).json({ success:false, error:'INVALID_ROSTER' });
    }

    // 해당 명부의 평가들만 가져와 집계
    let q = db().collection('evaluations')
      .where('teacherId', '==', teacherId)
      .where('rosterId', '==', rosterId);

    if (startDate) q = q.where('date','>=',startDate);
    if (endDate)   q = q.where('date','<=',endDate);

    const snap = await q.get();

    // 집계
    const received = {};  // 동료에게 받은 추천 (역량별)
    const given    = {};  // 내가 남에게 준 추천 (역량별)
    const self     = {};  // 자기평가 (역량별)
    const recent   = [];  // 최근 기록 20개

    const inc = (obj, key) => obj[key] = (obj[key]||0)+1;

    snap.forEach(d => {
      const ev = d.data();

      // 받은 추천
      (ev.peerEvaluations || []).forEach(p => {
        if (p?.targetUsername === username) inc(received, p.competency || '기타');
      });

      // 내가 준 추천 / 자기평가
      if (ev.evaluator?.username === username) {
        (ev.peerEvaluations || []).forEach(p => inc(given, p.competency || '기타'));
        if (ev.selfEvaluation) inc(self, ev.selfEvaluation.competency || '기타');
      }

      // 최근 목록(간단 요약)
      if (recent.length < 20) {
        recent.push({
          date: ev.date,
          mine: ev.evaluator?.username === username,
          self: ev.evaluator?.username === username ? (ev.selfEvaluation?.competency || null) : null,
          received: (ev.peerEvaluations || [])
              .filter(p => p?.targetUsername === username)
              .map(p => p.competency),
          given: (ev.evaluator?.username === username)
              ? (ev.peerEvaluations || []).map(p => p.competency)
              : []
        });
      }
    });

    return res.status(200).json({ success:true, rosterId, received, given, self, recent });
  } catch (e) {
    console.error('[student/get-statistics] error', e);
    return res.status(500).json({ success:false, error:e?.message || 'server error' });
  }
}
