// /api/student/get-statistics.js
import { getDB } from '../../lib/admin.js';
import { getUserFromReq } from '../_shared/initAdmin.js';

const S = v => (v ?? '').toString().trim();
const inRange = (d, s, e) => {
  const x = S(d).slice(0, 10);
  if (s && x < s) return false;
  if (e && x > e) return false;
  return true;
};

export default async function handler(req, res) {
  try {
    if (req.method !== 'GET') {
      return res.status(405).json({ success: false, error: 'Method Not Allowed' });
    }

    const me = getUserFromReq?.(req);
    if (!me || me.role !== 'student') {
      return res.status(401).json({ success: false, error: 'STUDENT_SESSION_REQUIRED' });
    }

    const db = getDB();

    const rosterId  = S(req.query.rosterId || '');
    const startDate = S(req.query.startDate || '').slice(0, 10);
    const endDate   = S(req.query.endDate   || '').slice(0, 10);

    // 세션 기본값
    let username  = S(me.username || '');
    let teacherId = S(me.teacherId || '');
    let rosterIds = Array.isArray(me.rosterIds) ? me.rosterIds : [];

    // 보강: students/{uid}에서 부족한 필드 채우기
    if (!username || !teacherId || !rosterIds.length) {
      const sid  = S(me.uid || username);
      const sdoc = sid ? await db.collection('students').doc(sid).get() : null;
      if (sdoc && sdoc.exists) {
        const s = sdoc.data() || {};
        username  = username  || S(s.username || sdoc.id);
        teacherId = teacherId || S(s.teacherId || '');
        rosterIds = rosterIds.length ? rosterIds : (s.rosterIds || (s.rosterId ? [s.rosterId] : []));
      }
    }

    // 선택한 rosterId가 내 소속인지 확인
    if (!rosterId || !rosterIds.includes(rosterId)) {
      return res.status(400).json({ success: false, error: 'INVALID_ROSTER' });
    }

    // 평가 조회(teacherId + rosterId로 범위 제한)
    let q = db.collection('evaluations')
      .where('teacherId', '==', teacherId)
      .where('rosterId',  '==', rosterId);

    // 날짜는 문자열 YYYY-MM-DD 이므로 메모리에서 필터(인덱스 요구 회피)
    const snap = await q.get();

    // 집계 컨테이너
    const received = {}; // 남에게서 '내가 받은' 추천 (역량별 카운트)
    const given    = {}; // '내가 남에게 준' 추천
    const self     = {}; // 자기평가
    const recent   = []; // 최근 기록 20개

    const inc = (obj, key) => (obj[key] = (obj[key] || 0) + 1);

    snap.forEach(doc => {
      const ev = doc.data() || {};
      if (!inRange(ev.date, startDate, endDate)) return;

      // ---- 받은 추천: nominees(배열)에 내 username 포함 OR 레거시 targetUsername 매칭 ----
      const peers = Array.isArray(ev.peerEvaluations) ? ev.peerEvaluations : [];
      peers.forEach(p => {
        const competency = S(p?.competency || '기타');

        // 새 스키마: nominees 배열에 내가 포함되어 있으면 '받은' 카운트 증가
        const hitNew = Array.isArray(p?.nominees) && p.nominees.includes(username);

        // 레거시 스키마 보강: targetUsername 이 나인 경우
        const hitLegacy = S(p?.targetUsername) === username;

        if (hitNew || hitLegacy) inc(received, competency);
      });

      // ---- 내가 남에게 준 추천 / 자기평가 ----
      const mine = S(ev?.evaluator?.username) === username;
      if (mine) {
        peers.forEach(p => inc(given, S(p?.competency || '기타')));
        if (ev.selfEvaluation) inc(self, S(ev.selfEvaluation?.competency || '기타'));
      }

      // ---- 최근 20개 요약 ----
      if (recent.length < 20) {
        const receivedComps = peers
          .filter(p =>
            (Array.isArray(p?.nominees) && p.nominees.includes(username)) ||
            S(p?.targetUsername) === username
          )
          .map(p => S(p?.competency || '기타'));

        recent.push({
          date: S(ev.date),
          mine,
          self: mine && ev.selfEvaluation ? S(ev.selfEvaluation?.competency || null) : null,
          received: receivedComps,
          given: mine ? peers.map(p => S(p?.competency || '기타')) : []
        });
      }
    });

    return res.status(200).json({
      success: true,
      rosterId,
      received,
      given,
      self,
      recent
    });

  } catch (e) {
    console.error('[student/get-statistics] error', e);
    return res.status(500).json({ success: false, error: e?.message || 'server error' });
  }
}
