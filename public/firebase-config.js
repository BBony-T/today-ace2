// firebase-config.js - CDN 버전

// Firebase 설정 정보
const firebaseConfig = {
  apiKey: "AIzaSyA50L0NZ3EFHCblNGJLZlpJnt60UyyNS2I",
  authDomain: "today-ace.firebaseapp.com",
  projectId: "today-ace",
  storageBucket: "today-ace.firebasestorage.app",
  messagingSenderId: "454166755043",
  appId: "1:454166755043:web:935f7b3c94f9f0b59eb7d6"
};

// Firebase 초기화 (CDN 방식)
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// 다른 파일에서 사용할 수 있도록 전역 변수로 설정
window.firebaseDb = db;

console.log('Firebase 연결 완료!');