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

    if (!isAdminMode && !targetUsername) {
      return res.status(400).json({ success:false, error:'조회할 사용자명이 필요합니다.' });
    }

    // ── Firestore 조회 ─────────────────────────────────────────
    const db = getDB();
    let base = db.collection('evaluations');

    if (teacherId) base = base.where('teacherId', '==', teacherId);
    if (rosterId)  base = base.where('rosterId', '==', rosterId);

    // ① createdAt 정렬 → ② timestamp 정렬 → ③ 정렬 없이
    async function tryFetch() {
      // 1) createdAt desc
      try {
        const snap = await base.orderBy('createdAt', 'desc').get();
        return { snap, used: 'createdAt' };
      } catch (e1) {
        // 2) timestamp desc
        try {
          const snap = await base.orderBy('timestamp', 'desc').get();
          return { snap, used: 'timestamp' };
        } catch (e2) {
          // 3) 정렬 없이
          const snap = await base.get();
          return { snap, used: 'none' };
        }
      }
    }

    const { snap } = await tryFetch();

    const list = [];
    snap.forEach(doc => {
      const data = doc.data() || {};
      const tsIso = toISO(data.createdAt) || toISO(data.timestamp);
      list.push({
        id: doc.id,
        ...data,
        timestamp: tsIso,
        date: data.date || (tsIso ? tsIso.slice(0, 10) : '')
      });
    });
    
    // orderBy를 못 쓴 경우(둘 다 없는 문서 섞여 있을 때) 메모리 정렬
    if (!useCreated && !snap.query._fieldOrders?.length) {
      list.sort((a,b) => (b.timestamp||'').localeCompare(a.timestamp||''));
    }

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

