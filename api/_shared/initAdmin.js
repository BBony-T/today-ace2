// /api/_shared/initAdmin.js
import admin from 'firebase-admin';

export default function initAdmin() {
  if (admin.apps.length) return admin.app();

  let creds;

  // A) FIREBASE_SERVICE_ACCOUNT에 통짜 JSON이 있는 경우
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (sa) {
    const parsed = JSON.parse(sa);
    if (parsed.private_key) parsed.private_key = parsed.private_key.replace(/\\n/g, '\n');
    creds = parsed;
  } else {
    // B) 분리형 3변수 (project_id / client_email / private_key)
    const project_id = process.env.FIREBASE_PROJECT_ID;
    const client_email = process.env.FIREBASE_CLIENT_EMAIL;
    let private_key = process.env.FIREBASE_PRIVATE_KEY;
    if (!project_id || !client_email || !private_key) {
      throw new Error('Firebase service account envs not set');
    }
    private_key = private_key.replace(/\\n/g, '\n');
    creds = { project_id, client_email, private_key };
  }

  admin.initializeApp({ credential: admin.credential.cert(creds) });
  return admin.app();
}

