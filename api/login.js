// api/login.js - 로그인 API 함수
import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';

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
    const { username, password } = req.body;

    // 입력 검증
    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        error: '아이디와 비밀번호를 입력해주세요.' 
      });
    }

    // 관리자 계정 확인
    if (username === 'admin' && password === 'admin123') {
      return res.status(200).json({
        success: true,
        userType: 'admin',
        username: username,
        message: '관리자로 로그인되었습니다.'
      });
    }

    // 테스트용 학생 계정
    if (username === 'student1' && password === 'pass123') {
      return res.status(200).json({
        success: true,
        userType: 'student',
        username: username,
        studentInfo: {
          name: '김학생',
          class: '1반',
          grade: '3학년'
        },
        message: '학생으로 로그인되었습니다.'
      });
    }

    // Firebase에서 학생 계정 확인
    if (db) {
      try {
        const studentQuery = query(
          collection(db, 'students'),
          where('username', '==', username),
          where('password', '==', password)
        );

        const querySnapshot = await getDocs(studentQuery);

        if (!querySnapshot.empty) {
          const studentData = querySnapshot.docs[0].data();
          return res.status(200).json({
            success: true,
            userType: 'student',
            username: username,
            studentInfo: studentData,
            message: '학생으로 로그인되었습니다.'
          });
        }
      } catch (firebaseError) {
        console.error('Firebase 쿼리 오류:', firebaseError);
        // Firebase 오류가 있어도 계속 진행
      }
    }

    // 로그인 실패
    return res.status(401).json({
      success: false,
      error: '아이디 또는 비밀번호가 잘못되었습니다.'
    });

  } catch (error) {
    console.error('로그인 API 오류:', error);
    return res.status(500).json({
      success: false,
      error: '서버 오류가 발생했습니다.'
    });
  }

}