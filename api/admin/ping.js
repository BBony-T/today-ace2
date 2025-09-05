// /api/admin/ping.js
import { db } from '../_fb.js';

export default async function handler(req, res) {
  try {
    const env = {
      hasSA: !!process.env.FIREBASE_SERVICE_ACCOUNT || !!process.env.FIREBASE_SERVICE_ACCOUNT_JSON,
      hasProject: !!process.env.FIREBASE_PROJECT_ID,
      hasEmail: !!process.env.FIREBASE_CLIENT_EMAIL,
      hasKey: !!process.env.FIREBASE_PRIVATE_KEY,
      hasToken: !!process.env.ADMIN_CREATE_TOKEN,
    };

    // 🔎 Firestore 실제 연결 테스트
    let fb = { connected: false, collections: [] };
    try {
      const cols = await db().listCollections(); // 초기화/권한 문제면 여기서 에러
      fb.connected = true;
      fb.collections = cols.map(c => c.id);
    } catch (e) {
      fb.error = e?.message || String(e);
    }

    return res.status(200).json({ ok: true, env, fb });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e?.message || 'server error' });
  }
}
