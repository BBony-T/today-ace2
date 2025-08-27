// api/get-evaluations.js - 평가 데이터 조회 API
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs, orderBy } from 'firebase/firestore';

// Firebase 설정 (환경변수 사용)
const firebaseConfig = {
  apiKey: process.env.FIREBASE_API_KEY,
  authDomain: process.env.FIREBASE_AUTH_DOMAIN,
  projectId: process.env.FIREBASE_PROJECT_ID,
  storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.FIREBASE_APP_ID
};

// Firebase 초기화
let app;
let db;

try {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
} catch (error) {
  console.error('Firebase 초기화 오류:', error);
}

export default async function handler(req, res) {
  // CORS 헤더 설정
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // OPTIONS 요청 처리 (CORS preflight)
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // GET과 POST 요청 허용
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    // 쿼리 파라미터 처리 (GET) 또는 body 처리 (POST)
    const { 
      targetUsername,
      startDate, 
      endDate,
      evaluationType = 'all' // 'peer', 'self', 'all'
    } = req.method === 'GET' ? req.query : req.body;

    if (!targetUsername) {
      return res.status(400).json({ 
        success: false, 
        error: '조회할 사용자명이 필요합니다.' 
      });
    }

    // Firebase에서 데이터 조회
    if (db) {
      try {
        let evaluationsQuery;
        
        // 기본 쿼리 - 특정 사용자가 받은 평가들 조회
        if (evaluationType === 'peer') {
          // 동료평가만 조회 (다른 사람들이 targetUsername을 평가한 것)
          evaluationsQuery = query(
            collection(db, 'evaluations'),
            orderBy('timestamp', 'desc')
          );
        } else if (evaluationType === 'self') {
          // 자기평가만 조회 (targetUsername이 자신을 평가한 것)
          evaluationsQuery = query(
            collection(db, 'evaluations'),
            where('evaluatorUsername', '==', targetUsername),
            orderBy('timestamp', 'desc')
          );
        } else {
          // 모든 평가 조회
          evaluationsQuery = query(
            collection(db, 'evaluations'),
            orderBy('timestamp', 'desc')
          );
        }

        const querySnapshot = await getDocs(evaluationsQuery);
        const evaluations = [];

        querySnapshot.forEach((doc) => {
          const data = doc.data();
          evaluations.push({
            id: doc.id,
            ...data,
            timestamp: data.timestamp?.toDate?.()?.toISOString() || data.timestamp
          });
        });

        // 클라이언트에서 필터링할 수 있도록 원본 데이터 전달
        // 실제로는 서버에서 필터링하는 것이 더 효율적
        const filteredEvaluations = filterEvaluations(evaluations, {
          targetUsername,
          startDate,
          endDate,
          evaluationType
        });

        return res.status(200).json({
          success: true,
          evaluations: filteredEvaluations,
          count: filteredEvaluations.length
        });

      } catch (firebaseError) {
        console.error('Firebase 조회 오류:', firebaseError);
        return res.status(500).json({
          success: false,
          error: 'Firebase 조회 중 오류가 발생했습니다.'
        });
      }
    } else {
      // Firebase가 초기화되지 않은 경우 (테스트용 더미 데이터)
      const dummyData = generateDummyData(targetUsername);
      return res.status(200).json({
        success: true,
        evaluations: dummyData,
        count: dummyData.length,
        message: '테스트 모드 - 더미 데이터'
      });
    }

  } catch (error) {
    console.error('평가 조회 API 오류:', error);
    return res.status(500).json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    });
  }
}

// 평가 데이터 필터링 함수
function filterEvaluations(evaluations, filters) {
  return evaluations.filter(evaluation => {
    // 날짜 필터링
    if (filters.startDate && evaluation.date < filters.startDate) return false;
    if (filters.endDate && evaluation.date > filters.endDate) return false;

    // 평가 타입별 필터링
    if (filters.evaluationType === 'peer') {
      // 동료평가: 다른 사람들이 targetUsername을 평가한 것
      return evaluation.peerEvaluations && 
             evaluation.peerEvaluations.some(peer => 
               peer.nominees && peer.nominees.includes(filters.targetUsername)
             );
    } else if (filters.evaluationType === 'self') {
      // 자기평가: targetUsername이 자신을 평가한 것
      return evaluation.evaluatorUsername === filters.targetUsername && 
             evaluation.selfEvaluation;
    }

    // 'all'인 경우 모든 관련 평가 반환
    return evaluation.evaluatorUsername === filters.targetUsername ||
           (evaluation.peerEvaluations && 
            evaluation.peerEvaluations.some(peer => 
              peer.nominees && peer.nominees.includes(filters.targetUsername)
            ));
  });
}

// 테스트용 더미 데이터 생성
function generateDummyData(username) {
  const competencies = ['자신감과 리더십', '분석', '아이디어 뱅크', '감정 이해', '의사소통', '협동심'];
  const dummyData = [];

  // 최근 30일간의 더미 데이터 생성
  for (let i = 0; i < 10; i++) {
    const date = new Date();
    date.setDate(date.getDate() - i * 3);
    
    dummyData.push({
      id: `dummy-${i}`,
      evaluatorUsername: `student${i + 1}`,
      date: date.toISOString().split('T')[0],
      timestamp: date.toISOString(),
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