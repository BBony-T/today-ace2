// /api/admin/import-students.js
import { db } from '../_fb.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ success: false, error: 'Method Not Allowed' });

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { roster } = body;
    if (!Array.isArray(roster) || roster.length === 0) {
      return res.status(400).json({ success: false, error: '명부가 비어있습니다.' });
    }

    const batch = db().batch();
    const col = db().collection('students');
    const imported = [];

    roster.forEach((s) => {
      const username = (s.username || s.studentId || '').toString().trim();
      const password = (s.password || s.studentId || '').toString().trim();
      const docRef = col.doc(username || undefined); // username을 문서ID로 사용(빠른 조회)
      const data = {
        username,
        password,           // 추후 해시로 교체 권장
        name: s.name || '',
        studentId: s.studentId || '',
        class: s.class || '',
        year: s.year || '',
        subject: s.subject || '',
        club: s.club || '',
        createdAt: new Date(),
        updatedAt: new Date()
      };
      batch.set(docRef, data, { merge: true });
      imported.push({ username: data.username, name: data.name, studentId: data.studentId });
    });

    await batch.commit();
    return res.status(200).json({ success: true, importedCount: imported.length, imported });
  } catch (e) {
    console.error('import-students 오류:', e);
    return res.status(500).json({ success: false, error: '서버 오류' });
  }
}
