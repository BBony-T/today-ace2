// /api/admin/list-activities.js
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
  console.error('[list-activities] Firebase init failed:', e);
}

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method Not Allowed' });

  try {
    if (!db) return res.status(200).json({ success: true, activities: [] });

    const teacherId = (req.query.teacherId || '').toString().trim();
    const rosterId  = (req.query.rosterId  || '').toString().trim();
    const start     = (req.query.start     || '').toString().slice(0, 10); // YYYY-MM-DD
    const end       = (req.query.end       || '').toString().slice(0, 10);

    if (!teacherId) {
      return res.status(400).json({ success: false, error: 'teacherId is required' });
    }
    if (!rosterId) {
      // 명부가 선택되지 않은 상태면 빈 목록
      return res.status(200).json({ success: true, activities: [] });
    }

    // 컬렉션: activities  문서: { teacherId, rosterId, date:'YYYY-MM-DD', name:'활동명', createdAt }
    let q = db.collection('activities')
      .where('teacherId', '==', teacherId)
      .where('rosterId', '==', rosterId);

    // 날짜 범위는 인덱스 충돌을 피하려고 메모리 필터로 처리
    const snap = await q.orderBy('date', 'asc').get();

    let list = [];
    snap.forEach(doc => {
      const data = doc.data() || {};
      list.push({
        id: doc.id,
        date: (data.date || '').toString().slice(0, 10),
        name: data.name || data.title || '',
        teacherId: data.teacherId,
        rosterId: data.rosterId,
      });
    });

    if (start) list = list.filter(a => a.date >= start);
    if (end)   list = list.filter(a => a.date <= end);

    return res.status(200).json({ success: true, activities: list });
  } catch (e) {
    console.error('[list-activities] error:', e);
    return res.status(200).json({ success: false, activities: [], error: 'LIST_ACTIVITIES_FAIL' });
  }
}
