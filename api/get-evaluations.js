// /api/get-evaluations.js  — 평가 데이터 조회 API (관리자/학생 겸용)
import { getDB } from '../lib/admin.js'; // ← 공통 Admin SDK 초기화 사용

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    const p = req.method === 'GET' ? req.query : req.body;

    const targetUsername = (p.targetUsername || p.username || '').toString().trim(); // 학생 모드
    const teacherId      = (p.teacherId || '').toString().trim();                    // 관리자 모드
    const rosterId       = (p.rosterId || '').toString().trim();                    // (옵션)
    const allFlag        = p.all === '1' || p.all === 1 || p.all === true;          // 관리자 대체 플래그

    const startDate      = (p.startDate || '').toString().slice(0, 10);
    const endDate        = (p.endDate   || '').toString().slice(0, 10);
    const evaluationType = (p.evaluationType || 'all').toString(); // 'peer' | 'self' | 'all'

    const isAdminMode = !!teacherId || allFlag;
    
    // 학생 모드 파라미터가 없으면 "빈 결과"로 응답 (대시보드 초기 로드용)
    if (!isAdminMode && !targetUsername) {
      return res.status(200).json({ success: true, evaluations: [], count: 0 });
    }

    // ── Firestore 조회 ─────────────────────────────────────────
    const db = getDB();

    let q = db.collection('evaluations');
    if (teacherId) q = q.where('teacherId', '==', teacherId);
    if (rosterId)  q = q.where('rosterId', '==', rosterId);

    // 집계 용도이므로 정렬은 빼고 전부 가져온 뒤 메모리에서 정렬
    const snap = await q.get();

    const list = [];
    snap.forEach(doc => {
      const data = doc.data() || {};
      // createdAt 우선, 없으면 timestamp, 둘 다 없으면 ''
      const tsIso = toISO(data.createdAt) || toISO(data.timestamp) || '';
      list.push({
        id: doc.id,
        ...data,
        timestamp: tsIso,
        date: data.date || (tsIso ? tsIso.slice(0, 10) : ''),
      });
    });

    // 필요하면 보기 좋게 최신순으로만 정렬 (집계에는 영향 없음)
    list.sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''));

    // 스키마 노말라이즈(프론트 기대형식: nominees 배열 등)
    const normalized = normalizeEvaluations(list);

    const filtered = isAdminMode
      ? filterEvaluationsForAdmin(normalized, { startDate, endDate, evaluationType, targetUsername })
      : filterEvaluationsForStudent(normalized, { targetUsername, startDate, endDate, evaluationType });

    return res.status(200).json({ success: true, evaluations: filtered, count: filtered.length });
  } catch (error) {
    console.error('[get-evaluations] error:', error?.message || error);
    return res.status(500).json({ success:false, error:'DB 초기화/조회 실패' });
  }
}

/* ───────── 헬퍼들 ───────── */

function toISO(ts) {
  try {
    if (!ts) return '';
    // Firestore Timestamp 객체 or Date or string 모두 대응
    if (typeof ts?.toDate === 'function') return ts.toDate().toISOString();
    if (ts instanceof Date) return ts.toISOString();
    if (typeof ts === 'string') return ts;
    return '';
  } catch { return ''; }
}

function inDateRange(recDate, startDate, endDate) {
  if (startDate && recDate < startDate) return false;
  if (endDate   && recDate > endDate)   return false;
  return true;
}

function asStr(v) { return (v ?? '').toString().trim(); }

function normalizePeer(pe) {
  if (!pe || typeof pe !== 'object') return null;
  const competency = asStr(pe.competency);

  const nomineeCand = [
    asStr(pe.targetStudentId),
    asStr(pe.targetUsername),
    asStr(pe.targetName)
  ];

  if (!nomineeCand.some(Boolean)) {
    const tgt = pe.target || pe.nominee || null;
    if (tgt && typeof tgt === 'object') {
      nomineeCand.push(asStr(tgt.studentId), asStr(tgt.username), asStr(tgt.name));
    }
  }
  let nominees = [];
  const first = nomineeCand.find(Boolean);
  if (Array.isArray(pe.nominees)) nominees = pe.nominees.map(asStr).filter(Boolean);
  else if (asStr(pe.nominees)) nominees = [asStr(pe.nominees)];
  if (!nominees.length && first) nominees = [first];

  let reasons = [];
  if (Array.isArray(pe.reasons)) reasons = pe.reasons.map(asStr).filter(Boolean);
  else if (asStr(pe.reason)) reasons = [asStr(pe.reason)];

  if (!competency || !nominees.length) return null;
  return { competency, nominees, reasons };
}

function normalizeEvaluations(list) {
  return (list || []).map(e => {
    const raw = Array.isArray(e.peerEvaluations) ? e.peerEvaluations :
                Array.isArray(e.peers) ? e.peers : [];
    return { ...e, peerEvaluations: raw.map(normalizePeer).filter(Boolean) };
  });
}

function filterEvaluationsForAdmin(evaluations, { startDate, endDate, evaluationType, targetUsername }) {
  return evaluations.filter(e => {
    if (!inDateRange((e.date || '').toString().slice(0, 10), startDate, endDate)) return false;

    if (targetUsername) {
      const hitsPeer = Array.isArray(e.peerEvaluations) &&
        e.peerEvaluations.some(pe => Array.isArray(pe.nominees) && pe.nominees.includes(targetUsername));
      const hitSelf  = e.evaluatorUsername === targetUsername && !!e.selfEvaluation;

      if (evaluationType === 'peer') return hitsPeer;
      if (evaluationType === 'self') return hitSelf;
      return hitsPeer || hitSelf;
    }

    if (evaluationType === 'peer') return Array.isArray(e.peerEvaluations) && e.peerEvaluations.length > 0;
    if (evaluationType === 'self') return !!e.selfEvaluation;
    return true;
  });
}

function filterEvaluationsForStudent(evaluations, { targetUsername, startDate, endDate, evaluationType }) {
  return evaluations.filter(e => {
    const d = (e.date || '').toString().slice(0, 10);
    if (!inDateRange(d, startDate, endDate)) return false;

    if (evaluationType === 'peer') {
      return e.peerEvaluations && e.peerEvaluations.some(pe =>
        Array.isArray(pe.nominees) && pe.nominees.includes(targetUsername));
    } else if (evaluationType === 'self') {
      return e.evaluatorUsername === targetUsername && !!e.selfEvaluation;
    }

    const peerHit = e.peerEvaluations &&
      e.peerEvaluations.some(pe => Array.isArray(pe.nominees) && pe.nominees.includes(targetUsername));
    const selfHit = e.evaluatorUsername === targetUsername && !!e.selfEvaluation;
    return peerHit || selfHit;
  });
}


