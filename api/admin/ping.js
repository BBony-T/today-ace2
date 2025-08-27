// /api/admin/ping.js
import initAdmin from '../_shared/initAdmin.js';

export const config = { runtime: 'nodejs' };

export default async function handler(req, res) {
  try {
    // 환경변수 존재 여부만 Boolean으로 리턴 (값은 안보여줌)
    const hasSA = !!process.env.FIREBASE_SERVICE_ACCOUNT;
    const hasProject = !!process.env.FIREBASE_PROJECT_ID;
    const hasEmail = !!process.env.FIREBASE_CLIENT_EMAIL;
    const hasKey = !!process.env.FIREBASE_PRIVATE_KEY;
    const hasToken = !!process.env.ADMIN_CREATE_TOKEN;

    // 실제 admin 초기화 시도 (여기서 터지면 500 → 로그 확인)
    initAdmin();

    res.status(200).json({
      ok: true,
      env: { hasSA, hasProject, hasEmail, hasKey, hasToken }
    });
  } catch (e) {
    console.error('PING ERROR:', e);
    res.status(500).json({ ok: false, error: String(e && e.message) });
  }
}
