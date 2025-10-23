// /api/admin/upsert-activity.js
import { getDB } from '../../lib/admin.js';
import { FieldValue } from 'firebase-admin/firestore';

const s = v => (v ?? '').toString().trim();

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    const db = getDB();

    const teacherId = s(req.query.teacherId);
    if (!teacherId) return res.status(400).json({ success:false, error:'teacherId required' });

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const id       = s(body.id);                       // 수정 시 사용(옵션)
    const rosterId = s(body.rosterId);                 // UI에서 필수
    const date     = s(body.date).slice(0, 10);        // YYYY-MM-DD
    const name     = s(body.name || body.title);       // 둘 다 허용

    if (!rosterId) return res.status(400).json({ success:false, error:'rosterId required' });
    if (!date || !name) return res.status(400).json({ success:false, error:'date & name required' });

    // 수정(아이디가 있으면 update)
    if (id) {
      await db.collection('activities').doc(id).set({
        teacherId, rosterId, date, name, title: name,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      return res.status(200).json({ success:true, id, mode:'update' });
    }

    // 신규: 같은 키(teacherId, rosterId, date, name) 중복 방지 시도
    const dup = await db.collection('activities')
      .where('teacherId', '==', teacherId)
      .where('rosterId', '==', rosterId)
      .where('date', '==', date)
      .where('name', '==', name)
      .limit(1)
      .get();

    if (!dup.empty) {
      const doc = dup.docs[0];
      await doc.ref.set({ updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      return res.status(200).json({ success:true, id: doc.id, mode:'exists' });
    }

    const ref = await db.collection('activities').add({
      teacherId, rosterId, date, name, title: name,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return res.status(200).json({ success:true, id: ref.id, mode:'insert' });
  } catch (e) {
    console.error('[upsert-activity] error:', e);
    return res.status(500).json({ success:false, error:'UPSERT_ACTIVITY_FAIL' });
  }
}
