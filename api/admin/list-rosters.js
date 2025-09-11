// /api/admin/list-rosters.js
import { getApps, initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// --- Admin init (공통)
function getDB() {
  if (!getApps().length) {
    const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
    if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_JSON missing');
    initializeApp({ credential: cert(JSON.parse(raw)) });
  }
  return getFirestore();
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET')
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });

  try {
    const teacherId = (req.query.teacherId || '').toString().trim();
    if (!teacherId) {
      return res.status(400).json({ success: false, error: 'teacherId required' });
    }

    const db = getDB();

    // 1) rosters 컬렉션 우선 조회
    const metaSnap = await db
      .collection('rosters')
      .where('teacherId', '==', teacherId)
      .orderBy('createdAt', 'desc')
      .get();

    let rosters = [];
    metaSnap.forEach(doc => {
      const d = doc.data() || {};
      rosters.push({
        id: doc.id,
        teacherId: d.teacherId,
        title: d.title || d.categoryName || '무제 명부',
        categoryType: d.categoryType || '',
        categoryName: d.categoryName || d.title || '',
        itemCount: d.itemCount ?? 0,
        active: !!d.active,
        createdAt: d.createdAt?.toDate?.()?.toISOString?.() || null,
      });
    });

    // 2) 메타 없으면 students에서 집계 (fallback)
    if (!rosters.length) {
      const stuSnap = await db
        .collection('students')
        .where('teacherId', '==', teacherId)
        .get();

      const byRoster = new Map(); // rosterId -> {count, name,type}
      stuSnap.forEach(doc => {
        const s = doc.data() || {};
        const rid = (s.rosterId || '').toString();
        if (!rid) return;
        const entry = byRoster.get(rid) || {
          count: 0,
          categoryName: s.subject || s.club || '',
          categoryType: s.subject ? 'subject' : (s.club ? 'club' : ''),
        };
        entry.count += 1;
        // 제목은 최대한 의미있게
        if (!entry.categoryName) {
          entry.categoryName = s.subject || s.club || '';
        }
        byRoster.set(rid, entry);
      });

      rosters = [...byRoster.entries()].map(([id, v]) => ({
        id,
        teacherId,
        title: v.categoryName || '무제 명부',
        categoryType: v.categoryType,
        categoryName: v.categoryName,
        itemCount: v.count,
        active: false,
        createdAt: null,
      }));
    }

    return res.status(200).json({ success: true, rosters });
  } catch (e) {
    console.error('[list-rosters] error:', e);
    return res.status(500).json({ success: false, error: 'server error' });
  }
}
