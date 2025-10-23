// /api/admin/list-activities.js
import { getDB } from '../../lib/admin.js';

const s = v => (v ?? '').toString().trim();

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    const db = getDB();

    const teacherId = s(req.query.teacherId);
    const rosterId  = s(req.query.rosterId);           // ← 선택값(없어도 조회)
    const start     = s(req.query.start).slice(0, 10); // YYYY-MM-DD
    const end       = s(req.query.end).slice(0, 10);

    if (!teacherId) {
      return res.status(400).json({ success: false, error: 'teacherId is required' });
    }

    // base query: teacher 기준
    let q = db.collection('activities').where('teacherId', '==', teacherId);
    if (rosterId) q = q.where('rosterId', '==', rosterId);

    // date 정렬 우선 시도 → 실패 시 정렬 없이 get
    let snap;
    try {
      snap = await q.orderBy('date', 'asc').get();
    } catch {
      snap = await q.get();
    }

    let list = [];
    snap.forEach(doc => {
      const d = doc.data() || {};
      const date =
        s(d.date).slice(0, 10) ||
        // 혹시 createdAt만 있는 문서 보강
        (d.createdAt?.toDate?.()?.toISOString?.()?.slice(0, 10) || '');

      list.push({
        id: doc.id,
        date,
        // name/title 둘 다 대응
        title: s(d.title || d.name || ''),
        name:  s(d.name  || d.title || ''), // 과거 프론트 호환
        teacherId: d.teacherId,
        rosterId: d.rosterId || null,
      });
    });

    // 메모리 날짜 필터
    if (start) list = list.filter(a => a.date >= start);
    if (end)   list = list.filter(a => a.date <= end);

    // 정렬 보강(정렬 없이 가져온 경우 대비)
    list.sort((a, b) => (a.date || '').localeCompare(b.date || ''));

    return res.status(200).json({ success: true, activities: list, count: list.length });
  } catch (e) {
    console.error('[list-activities] error:', e);
    return res.status(200).json({ success: false, activities: [], error: 'LIST_ACTIVITIES_FAIL' });
  }
}
