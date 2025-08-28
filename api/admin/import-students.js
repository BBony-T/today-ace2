// /api/admin/import-students.js
import { db } from '../_fb.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { roster, skipExisting = false } = body;

    if (!Array.isArray(roster) || roster.length === 0) {
      return res.status(400).json({ success: false, error: '명부가 비어있습니다.' });
    }

    const col = db().collection('students');
    const batch = db().batch();

    let importedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;
    const imported = [];

    for (const s of roster) {
      const username = (s.username || s.studentId || '').toString().trim();
      const password = (s.password || s.studentId || '').toString().trim();
      if (!username) { skippedCount++; continue; }

      const docRef = col.doc(username);
      const snap = await docRef.get();

      // skipExisting 옵션: 기존 문서는 건너뜀
      if (skipExisting && snap.exists) {
        skippedCount++;
        continue;
      }

      const now = new Date();
      const base = {
        username,
        password,                    // (주의) 실서비스는 해시 권장
        name: s.name || '',
        studentId: s.studentId || username,
        class: s.class || '',
        year: s.year || '',
        subject: s.subject || '',
        club: s.club || '',
        updatedAt: now
      };

      if (!snap.exists) {
        batch.set(docRef, { ...base, createdAt: now }, { merge: true }); // 업서트
        importedCount++;
      } else {
        batch.set(docRef, base, { merge: true }); // merge 업데이트
        updatedCount++;
      }

      imported.push({ username: base.username, name: base.name, studentId: base.studentId });
    }

    await batch.commit();

    return res.status(200).json({
      success: true,
      importedCount,
      updatedCount,
      skippedCount,
      imported
    });
  } catch (e) {
    console.error('import-students 오류:', e);
    return res.status(500).json({ success: false, error: e.message || '서버 오류' });
  }
}
