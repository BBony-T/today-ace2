// /lib/admin.js
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

export function getDB() {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT ||   // ← 현재 프로젝트 키 이름
                process.env.FIREBASE_SERVICE_ACCOUNT_JSON; // (호환)
    if (!raw) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT is missing');
    }
    let svc;
    try {
      svc = JSON.parse(raw);
    } catch (e) {
      throw new Error('FIREBASE_SERVICE_ACCOUNT parse error');
    }
    initializeApp({ credential: cert(svc) });
  }
  return getFirestore();
}
