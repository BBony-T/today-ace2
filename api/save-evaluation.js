// api/save-evaluation.js - 평가 데이터 저장 API
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, addDoc, serverTimestamp } from 'firebase/firestore';

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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // OPTIONS 요청 처리 (CORS preflight)
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // POST 요청만 허용
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { 
      evaluatorUsername,
      peerEvaluations,
      selfEvaluation,
      date 
    } = req.body;

    // 입력 검증
    if (!evaluatorUsername) {
      return res.status(400).json({ 
        success: false, 
        error: '평가자 정보가 필요합니다.' 
      });
    }

    // 데이터 구조 정리
    const evaluationData = {
      evaluatorUsername,
      date: date || new Date().toISOString().split('T')[0],
      timestamp: serverTimestamp(),
      peerEvaluations: peerEvaluations || [],
      selfEvaluation: selfEvaluation || null
    };

    // Firebase에 저장
    if (db) {
      try {
        const docRef = await addDoc(collection(db, 'evaluations'), evaluationData);
        
        return res.status(200).json({
          success: true,
          message: '평가가 성공적으로 저장되었습니다.',
          id: docRef.id
        });
      } catch (firebaseError) {
        console.error('Firebase 저장 오류:', firebaseError);
        return res.status(500).json({
          success: false,
          error: 'Firebase 저장 중 오류가 발생했습니다.'
        });
      }
    } else {
      // Firebase가 초기화되지 않은 경우 (테스트용)
      console.log('테스트 저장:', evaluationData);
      return res.status(200).json({
        success: true,
        message: '평가가 저장되었습니다. (테스트 모드)',
        data: evaluationData
      });
    }

  } catch (error) {
    console.error('평가 저장 API 오류:', error);
    return res.status(500).json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    });
  }

}