// api/get-evaluations.js - 평가 데이터 조회 API (관리자/학생 겸용)
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

/** Firebase Admin 공통 초기화 */
function getDB() {
  if (!getApps().length) {
    // ✅ 둘 다 지원
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!raw) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT is missing');
    }
    let svc;
    try {
      svc = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (svc.private_key) svc.private_key = svc.private_key.replace(/\\n/g, '\n');
    } catch {
      throw new Error('FIREBASE_SERVICE_ACCOUNT parse error');
    }
    initializeApp({ credential: cert(svc) });
  }
  return getFirestore();
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    // ── 파라미터 파싱 ───────────────────────────────────────────
    const p = req.method === 'GET' ? req.query : req.body;

    const targetUsername = (p.targetUsername || p.username || '').toString().trim(); // 학생 모드
    const teacherId      = (p.teacherId || '').toString().trim();                    // 관리자 모드
    const rosterId       = (p.rosterId || '').toString().trim();                    // (옵션) 같은 선생님 내 특정 명부
    const allFlag        = p.all === '1' || p.all === 1 || p.all === true;          // 관리자 모드 대체 플래그

    const startDate      = (p.startDate || '').toString().slice(0, 10);
    const endDate        = (p.endDate   || '').toString().slice(0, 10);
    const evaluationType = (p.evaluationType || 'all').toString(); // 'peer' | 'self' | 'all'

    const isAdminMode = !!teacherId || allFlag;

    // 학생 모드에서는 targetUsername이 필수
    if (!isAdminMode && !targetUsername) {
      return res.status(400).json({
        success: false,
        error: '조회할 사용자명이 필요합니다.'
      });
    }

    // ── Firestore 조회 ─────────────────────────────────────────
    const db = getDB();

    let q = db.collection('evaluations');

    // 관리자: teacherId / (옵션) rosterId로 범위 축소
    if (teacherId) q = q.where('teacherId', '==', teacherId);
    if (rosterId)  q = q.where('rosterId', '==', rosterId);

    // 정렬 (where == 와 함께 쓰는 건 괜찮습니다)
    q = q.orderBy('timestamp', 'desc');

    const snap = await q.get();
    const list = [];
    snap.forEach(doc => {
      const data = doc.data() || {};
      const tsIso = toISO(data.timestamp);
      list.push({
        id: doc.id,
        ...data,
        timestamp: tsIso,
        date: data.date || (tsIso ? tsIso.slice(0, 10) : '') // date 보강
      });
    });

    // 🔧 1) 스키마 노말라이징 (프론트가 기대하는 형태로 통일)
    const normalized = normalizeEvaluations(list);

    // 🔎 2) 기존 필터 로직 재사용
    const filtered = isAdminMode
      ? filterEvaluationsForAdmin(normalized, { startDate, endDate, evaluationType, targetUsername })
      : filterEvaluationsForStudent(normalized, { targetUsername, startDate, endDate, evaluationType });

    return res.status(200).json({
      success: true,
      evaluations: filtered,
      count: filtered.length
    });

  } catch (error) {
    console.error('get-evaluations error:', error?.message || error);
    return res.status(500).json({
      success: false,
      error: 'DB 초기화/조회 실패'
    });
  }
}

/* ───────────────────────── 헬퍼들 ───────────────────────── */

function toISO(ts) {
  try { return ts?.toDate?.()?.toISOString?.() || ts || ''; } catch { return ''; }
}

function inDateRange(recDate, startDate, endDate) {
  if (startDate && recDate < startDate) return false;
  if (endDate   && recDate > endDate)   return false;
  return true;
}

/** 문자열 안전 변환 */
function asStr(v) {
  return (v ?? '').toString().trim();
}

/** peerEvaluation 1건을 통일 스키마로 변환 */
function normalizePeer(pe) {
  if (!pe || typeof pe !== 'object') return null;

  const competency = asStr(pe.competency);

  // nominees 통일: 가장 신뢰도 높은 식별자 순으로 선택
  // 1) targetStudentId / targetUsername(=username) / targetName
  // 2) target 객체 형태 {studentId|username|name}
  // 3) 기존 nominees(string|array) 그대로
  let nominee = '';

  const cand = [
    asStr(pe.targetStudentId),
    asStr(pe.targetUsername),
    asStr(pe.targetName)
  ];

  if (!cand[0] && !cand[1] && !cand[2]) {
    const tgt = pe.target || pe.nominee || null; // 혹시 다른 키로 들어온 경우
    if (tgt && typeof tgt === 'object') {
      cand.push(asStr(tgt.studentId), asStr(tgt.username), asStr(tgt.name));
    }
  }

  nominee = cand.find(s => !!s) || '';

  // 기존 nominees가 배열/문자열로 온 경우도 처리
  let nominees = [];
  if (Array.isArray(pe.nominees)) {
    nominees = pe.nominees.map(asStr).filter(Boolean);
  } else if (asStr(pe.nominees)) {
    nominees = [asStr(pe.nominees)];
  }

  if (!nominees.length && nominee) nominees = [nominee];

  // reasons 통일 (단일/배열 모두 허용)
  let reasons = [];
  if (Array.isArray(pe.reasons)) {
    reasons = pe.reasons.map(asStr).filter(Boolean);
  } else if (asStr(pe.reason)) {
    reasons = [asStr(pe.reason)];
  }

  // competency가 비어 있거나 nominees가 비면 무시
  if (!competency || !nominees.length) return null;

  return { competency, nominees, reasons };
}

/** 문서 단위 통일: peerEvaluations를 [{competency, nominees:[...], reasons:[...]}]로 보장 */
function normalizeEvaluations(list) {
  return (list || []).map(e => {
    const out = { ...e };

    const rawPeers =
      Array.isArray(e.peerEvaluations) ? e.peerEvaluations :
      Array.isArray(e.peers) ? e.peers : // 혹시 다른 키로 저장된 경우 대비
      [];

    const normPeers = rawPeers
      .map(normalizePeer)
      .filter(Boolean);

    out.peerEvaluations = normPeers;

    // selfEvaluation은 현재 통계 로직에 영향 없음(필요 시 확장)
    return out;
  });
}

/** 관리자 모드 필터링 */
function filterEvaluationsForAdmin(evaluations, { startDate, endDate, evaluationType, targetUsername }) {
  return evaluations.filter(e => {
    if (!inDateRange((e.date || '').toString().slice(0, 10), startDate, endDate)) return false;

    // 관리자에서 특정 학생만 보고 싶을 때(optional)
    if (targetUsername) {
      const hitsPeer = Array.isArray(e.peerEvaluations) && e.peerEvaluations.some(pe =>
        Array.isArray(pe.nominees) && pe.nominees.includes(targetUsername)
      );
      const hitSelf  = e.evaluatorUsername === targetUsername && !!e.selfEvaluation;

      if (evaluationType === 'peer') return hitsPeer;
      if (evaluationType === 'self') return hitSelf;
      return hitsPeer || hitSelf;
    }

    // 특정 학생 필터가 없으면 타입만 반영
    if (evaluationType === 'peer') {
      return Array.isArray(e.peerEvaluations) && e.peerEvaluations.length > 0;
    }
    if (evaluationType === 'self') {
      return !!e.selfEvaluation;
    }
    return true; // all
  });
}

/** 학생 모드 필터링(기존 동작 유지) */
function filterEvaluationsForStudent(evaluations, { targetUsername, startDate, endDate, evaluationType }) {
  return evaluations.filter(evaluation => {
    const d = (evaluation.date || '').toString().slice(0, 10);
    if (!inDateRange(d, startDate, endDate)) return false;

    if (evaluationType === 'peer') {
      // 동료평가: 다른 사람이 나를 추천한 경우
      return evaluation.peerEvaluations &&
             evaluation.peerEvaluations.some(peer =>
               Array.isArray(peer.nominees) && peer.nominees.includes(targetUsername)
             );
    } else if (evaluationType === 'self') {
      // 자기평가: 내가 스스로 입력
      return evaluation.evaluatorUsername === targetUsername &&
             !!evaluation.selfEvaluation;
    }

    // all
    const peerHit = evaluation.peerEvaluations &&
      evaluation.peerEvaluations.some(peer =>
        Array.isArray(peer.nominees) && peer.nominees.includes(targetUsername)
      );
    const selfHit = evaluation.evaluatorUsername === targetUsername &&
      !!evaluation.selfEvaluation;

    return peerHit || selfHit;
  });
}

