// /api/admin/list-rosters.js
import { getDB } from '../../lib/admin.js';

function toISO(ts) {
  try { return ts?.toDate?.()?.toISOString?.() || ts || ''; } catch { return ''; }
}

export default async function handler(req, res) {
  // CORS (필요 시 유지)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    const teacherId = (req.query.teacherId || '').toString().trim();
    if (!teacherId) {
      return res.status(400).json({ success: false, error: 'teacherId required' });
    }

    const db = getDB();

    // 🔒 현재 로그인한 선생님 소속 명부만
    let q = db
      .collection('rosters')
      .where('teacherId', '==', teacherId)
      .orderBy('createdAt', 'desc'); // createdAt이 없으면 updatedAt로 바꿔도 됩니다.

    const snap = await q.get();
    const rosters = [];
    snap.forEach((doc) => {
      const d = doc.data() || {};
      rosters.push({
        id: doc.id,
        title: d.title || d.categoryName || '',
        categoryType: d.categoryType || 'subject', // 'subject' | 'club'
        categoryName: d.categoryName || '',
        itemCount: d.itemCount || 0,
        active: !!d.active,
        createdAt: toISO(d.createdAt),
        updatedAt: toISO(d.updatedAt),
      });
    });

    return res.status(200).json({
      success: true,
      rosters,
      count: rosters.length,
    });
  } catch (e) {
    console.error('[list-rosters] error:', e);
    return res.status(500).json({
      success: false,
      error: e?.message || 'server error',
    });
  }
}
