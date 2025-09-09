// /api/admin/upsert-activity.js
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

let db;
try {
  if (!getApps().length) {
    const svc = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_JSON);
    initializeApp({ credential: cert(svc) });
  }
  db = getFirestore();
} catch (e) {
  console.error('[upsert-activity] Firebase init failed:', e);
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
    const teacherId = (body.teacherId || '').toString().trim();
    const rosterId  = (body.rosterId  || '').toString().trim();
    const date      = (body.date      || '').toString().slice(0, 10);
    const name      = (body.name      || body.title || '').toString().trim();

    if (!teacherId || !rosterId || !date || !name) {
      return res.status(400).json({ success: false, error: 'teacherId, rosterId, date, name are required' });
    }

    // 같은 (teacherId, rosterId, date) 한 건만 유지하도록 doc id 고정
    const docId = `${teacherId}__${rosterId}__${date}`;
    await db.collection('activities').doc(docId).set({
      teacherId, rosterId, date, name, updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp()
    }, { merge: true });

    return res.status(200).json({ success: true, id: docId });
  } catch (e) {
    console.error('[upsert-activity] error:', e);
    return res.status(200).json({ success: false, error: 'UPSERT_ACTIVITY_FAIL' });
  }
}
