// /api/_shared/initAdmin.js
import admin from 'firebase-admin';

export default function initAdmin() {
  if (admin.apps.length) return admin.app();

  let creds = null;

  // 방식 A: FIREBASE_SERVICE_ACCOUNT 에 JSON 전체가 들어있는 경우
  const saJson = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (saJson) {
    try {
      const parsed = JSON.parse(saJson);
      // 일부 호스팅은 백슬래시가 이스케이프되어 \n 이 실제 개행으로 안 바뀌는 경우가 있어 보정
      if (parsed.private_key && typeof parsed.private_key === 'string') {
        parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
      }
      creds = parsed;
    } catch (e) {
      console.error('FIREBASE_SERVICE_ACCOUNT JSON parse error:', e);
      throw new Error('Invalid FIREBASE_SERVICE_ACCOUNT');
    }
  } else {
    // 방식 B: 3개 변수로 분리해둔 경우
    const projectId = process.env.FIREBASE_PROJECT_ID;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;
    if (!projectId || !clientEmail || !privateKey) {
      throw new Error('Firebase service account envs not set');
    }
    creds = {
      project_id: projectId,
      client_email: clientEmail,
      private_key: privateKey.replace(/\\n/g, '\n'),
    };
  }

  admin.initializeApp({
    credential: admin.credential.cert(creds),
  });
  return admin.app();
}
