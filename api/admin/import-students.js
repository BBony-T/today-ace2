// /api/admin/import-students.js
import { db } from '../_fb.js';

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method Not Allowed' });
    }

    // 본문 파싱 안전 처리
    let bodyRaw = req.body;
    if (typeof bodyRaw === 'string') {
      try { bodyRaw = JSON.parse(bodyRaw); } 
      catch (e) { 
        return res.status(400).json({ success:false, error:`Invalid JSON body: ${e.message}` }); 
      }
    }
    const { roster = [], skipExisting = true, categoryType = '', categoryName = '' } = bodyRaw || {};
    if (!Array.isArray(roster) || roster.length === 0) {
      return res.status(400).json({ success: false, error: '명부가 비어있습니다.' });
    }

    const col = db().collection('students');

    // 기존 학번 목록 (skipExisting일 때만 조회)
    let existingIds = new Set();
    if (skipExisting) {
      const snap = await col.get();
      existingIds = new Set(snap.docs.map(d => d.id));
    }

    const batch = db().batch();
    const now = new Date();
    const imported = [];

    for (const s of roster) {
      const name = (s.name || '').toString().trim();
      const studentId = (s.studentId || '').toString().trim();
      if (!name || !studentId) continue;

      // 로그인 정책: 아이디=학번, 비밀번호=이름
      const username = studentId;
      const password = name;

      if (skipExisting && existingIds.has(studentId)) continue;

      const docRef = col.doc(studentId);
      const data = {
        username,            // 학번
        password,            // 이름
        name,
        studentId,
        class: s.class || '',
        year: s.year || '',
        subject: s.subject || '',
        club: s.club || '',
        // 업로드 시 UI에서 지정한 카테고리(선택사항)
        categoryType: categoryType || s.categoryType || '',
        categoryName: categoryName || s.categoryName || '',
        updatedAt: now,
        createdAt: s.createdAt || now,
      };

      batch.set(docRef, data, { merge: true }); // 업서트
      imported.push({ id: studentId, name, username });
    }

    await batch.commit();
    return res.status(200).json({ success: true, importedCount: imported.length, imported });
  } catch (e) {
    console.error('import-students 오류:', e);
    // 항상 JSON으로 반환
    return res.status(500).json({ success: false, error: e?.message || '서버 오류' });
  }
}
