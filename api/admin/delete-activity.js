// /api/admin/delete-activity.js
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

let db;
try {
  if (!getApps().length) {
    const svc = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    initializeApp({ credential: cert(svc) });
  }
  db = getFirestore();
} catch (e) {
  console.error('[delete-activity] Firebase init failed:', e);
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method Not Allowed' });

  try {
    if (!db) return res.status(200).json({ success: false, error: 'NO_DB' });

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    let { id, teacherId, rosterId, date } = body;
    teacherId = (teacherId || '').toString().trim();
    rosterId  = (rosterId  || '').toString().trim();
    date      = (date      || '').toString().slice(0, 10);

    if (!id) {
      if (!teacherId || !rosterId || !date) {
        return res.status(400).json({ success: false, error: 'id or (teacherId, rosterId, date) required' });
      }
      id = `${teacherId}__${rosterId}__${date}`;
    }

    await db.collection('activities').doc(id).delete();
    return res.status(200).json({ success: true });
  } catch (e) {
    console.error('[delete-activity] error:', e);
    return res.status(200).json({ success: false, error: 'DELETE_ACTIVITY_FAIL' });
  }
}
