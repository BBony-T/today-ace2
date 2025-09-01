// /api/_fb.js
import admin from 'firebase-admin';

function init() {
  if (admin.apps.length) return admin.app();

  // 1) 먼저 FIREBASE_SERVICE_ACCOUNT를 시도 (JSON 통째로)
  const rawSA =
    process.env.FIREBASE_SERVICE_ACCOUNT ||
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON; // 둘 다 대응

  if (rawSA) {
    let sa = rawSA;
    if (typeof sa === 'string') {
      try { sa = JSON.parse(sa); }
      catch (e) { throw new Error(`[fb] SERVICE_ACCOUNT JSON.parse 실패: ${e.message}`); }
    }
    if (sa.private_key) sa.private_key = sa.private_key.replace(/\\n/g, '\n');
    admin.initializeApp({ credential: admin.credential.cert(sa) });
    console.log('[fb] init via FIREBASE_SERVICE_ACCOUNT');
    return admin.app();
  }

  // 2) 3종 변수로 초기화
  const projectId   = process.env.FIREBASE_PROJECT_ID;
  const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;
  let   privateKey  = process.env.FIREBASE_PRIVATE_KEY;

  if (projectId && clientEmail && privateKey) {
    privateKey = privateKey.replace(/\\n/g, '\n');
    admin.initializeApp({
      credential: admin.credential.cert({ projectId, clientEmail, privateKey }),
    });
    console.log('[fb] init via FIREBASE_* triplet');
    return admin.app();
  }

  // 3) 둘 다 없을 때: 어떤 게 비었는지 알려주기
  const missing = {
    FIREBASE_SERVICE_ACCOUNT: !!rawSA,
    FIREBASE_PROJECT_ID: !!projectId,
    FIREBASE_CLIENT_EMAIL: !!clientEmail,
    FIREBASE_PRIVATE_KEY: !!privateKey,
  };
  throw new Error('[fb] missing credentials: ' + JSON.stringify(missing));
}

export function db() {
  return init().firestore();
}
export default admin;
