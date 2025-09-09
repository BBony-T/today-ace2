// api/get-evaluations.js - 평가 데이터 조회 API (관리자/학생 겸용)
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Firebase 설정 (환경변수 사용)
let db;
try {
  if (!getApps().length) {
    const svc = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    initializeApp({ credential: cert(svc) });
  }
  db = getFirestore();
} catch (error) {
  console.error('Firebase(Admin) 초기화 오류:', error);
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
    if (!db) {
      // Firebase가 초기화되지 않은 경우 (테스트용 더미 데이터)
      const dummyData = generateDummyData(targetUsername || 'student1');
      const filtered  = isAdminMode
        ? filterEvaluationsForAdmin(dummyData, { startDate, endDate, evaluationType, targetUsername })
        : filterEvaluationsForStudent(dummyData, { targetUsername, startDate, endDate, evaluationType });

      return res.status(200).json({
        success: true,
        evaluations: filtered,
        count: filtered.length,
        message: '테스트 모드 - 더미 데이터'
      });
    }

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

    // ── 필터링 ─────────────────────────────────────────────────
    const filtered = isAdminMode
      ? filterEvaluationsForAdmin(list, { startDate, endDate, evaluationType, targetUsername })
      : filterEvaluationsForStudent(list, { targetUsername, startDate, endDate, evaluationType });

    return res.status(200).json({
      success: true,
      evaluations: filtered,
      count: filtered.length
    });

  } catch (error) {
    console.error('평가 조회 API 오류:', error);
    // 클라이언트에서 에러 핸들링을 단순화하려면 200으로 감싸도 됩니다.
    return res.status(500).json({
      success: false,
      error: '서버 오류가 발생했습니다.'
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

/** 테스트용 더미 데이터 */
function generateDummyData(username) {
  const competencies = ['자신감과 리더십', '분석', '아이디어 뱅크', '감정 이해', '의사소통', '협동심'];
  const dummyData = [];

  for (let i = 0; i < 10; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i * 3);
    const iso = date.toISOString();

    dummyData.push({
      id: `dummy-${i}`,
      evaluatorUsername: `student${i + 1}`,
      date: iso.slice(0, 10),
      timestamp: iso,
      peerEvaluations: competencies.map(comp => ({
        competency: comp,
        nominees: Math.random() > 0.7 ? [username] : [],
        reasons: Math.random() > 0.7 ? [`${comp}에서 정말 뛰어났어요!`] : []
      })),
      selfEvaluation: {
        competency: competencies[Math.floor(Math.random() * competencies.length)],
        reason: '오늘 이 부분에서 성장했다고 느꼈습니다.'
      }
    });
  }
  return dummyData;
}
