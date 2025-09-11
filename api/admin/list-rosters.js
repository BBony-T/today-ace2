// /api/admin/list-rosters.js
import { getDB } from '../../lib/admin.js';

export default async function handler(req, res) {
  // CORS (필요시)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    const teacherId = (req.query.teacherId || '').toString().trim();
    if (!teacherId) {
      return res.status(400).json({ success: false, error: 'teacherId required' });
    }

    const db = getDB();

    // ⚠️ 인덱스 이슈 피하려고 orderBy는 쓰지 않고, 가져온 뒤 JS에서 정렬
    const snap = await db.collection('rosters')
      .where('teacherId', '==', teacherId)
      .get();

    const rosters = [];
    snap.forEach(doc => {
      const d = doc.data() || {};
      rosters.push({
        id: d.id || doc.id,
        teacherId: d.teacherId || '',
        title: d.title || d.categoryName || '무제 명부',
        categoryType: d.categoryType || '',
        categoryName: d.categoryName || d.title || '',
        itemCount: d.itemCount ?? d.count ?? 0,
        active: !!(d.active || d.published),
        createdAt: d.createdAt?.toDate?.()?.toISOString?.() || '',
        updatedAt: d.updatedAt?.toDate?.()?.toISOString?.() || '',
      });
    });

    // 최신순 정렬(업데이트 없으면 생성일 기준)
    rosters.sort((a, b) => (b.updatedAt || b.createdAt || '').localeCompare(a.updatedAt || a.createdAt || ''));

    return res.status(200).json({ success: true, rosters });
  } catch (e) {
    console.error('[list-rosters] error:', e);
    return res.status(500).json({ success: false, error: e?.message || 'server error' });
  }
}
