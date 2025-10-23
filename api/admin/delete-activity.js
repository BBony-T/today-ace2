// /api/admin/delete-activity.js
import { getDB } from '../../lib/admin.js';

const s = v => (v ?? '').toString().trim();

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success:false, error:'Method Not Allowed' });
  }

  try {
    const db = getDB();

    const teacherId = s(req.query.teacherId);
    if (!teacherId) return res.status(400).json({ success:false, error:'teacherId required' });

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const id = s(body.id);
    if (!id) return res.status(400).json({ success:false, error:'id required' });

    // (선생님 소유 검증을 하려면 문서 확인 후 teacherId 비교)
    const doc = await db.collection('activities').doc(id).get();
    if (!doc.exists) return res.status(200).json({ success:true, deleted:false });

    // teacherId 소유 확인(선택)
    const d = doc.data() || {};
    if (d.teacherId && d.teacherId !== teacherId) {
      return res.status(403).json({ success:false, error:'forbidden' });
    }

    await doc.ref.delete();
    return res.status(200).json({ success:true, deleted:true });
  } catch (e) {
    console.error('[delete-activity] error:', e);
    return res.status(500).json({ success:false, error:'DELETE_ACTIVITY_FAIL' });
  }
}
