// api/login.js — 로그인 API (Admin SDK, 키 노출 없음)
import { db } from './_fb.js'; // 공통 Admin 초기화 유틸: api/_fb.js

export default async function handler(req, res) {
  // 같은 도메인에서만 호출하면 CORS 불필요
  // 다른 도메인에서 호출한다면 아래 3줄을 주석 해제하세요.
  // res.setHeader('Access-Control-Allow-Origin', '*');
  // res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  // res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end(); // (CORS 프리플라이트 대응)
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { username, password } = body;

    // 입력 검증
    if (!username || !password) {
      return res.status(400).json({
        success: false,
        error: '아이디와 비밀번호를 입력해주세요.'
      });
    }

    // 관리자(교사) 계정 — 필요하면 Firestore에 옮겨도 됨
    if (username === 'admin' && password === 'admin123') {
      return res.status(200).json({
        success: true,
        userType: 'admin',
        username,
        message: '관리자로 로그인되었습니다.'
      });
    }

    // ─────────────────────────────────────────────
    // 학생 계정 확인 (Firestore, Admin SDK)
    // 컬렉션: students
    // 문서 예시: { username: "student1", password: "pass123", name: "김학생", class: "1반", grade: "3학년" }
    // 현재는 where로 조회(당장 동작). 추후 비밀번호 해시/문서ID 설계로 변경 권장(아래 참고).
    // ─────────────────────────────────────────────
    let snap = await db()
      .collection('students')
      .where('username', '==', username)
      .where('password', '==', password)
      .limit(1)
      .get();

    if (!snap.empty) {
      const data = snap.docs[0].data();

      return res.status(200).json({
        success: true,
        userType: 'student',
        username,
        studentInfo: {
          name: data.name || username,
          class: data.class || '',
          grade: data.grade || '',
          // 필요하면 기타 필드 추가
        },
        message: '학생으로 로그인되었습니다.'
      });
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
