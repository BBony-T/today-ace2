// /api/_shared/initAdmin.js
import admin from 'firebase-admin';

export default function initAdmin() {
  if (admin.apps.length) return admin.app();

  // 환경변수에 서비스계정 JSON 문자열이 있어야 함
  const saJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!saJson) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT env not set');
  }
  const serviceAccount = JSON.parse(saJson);

  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });

  return admin.app();
}
