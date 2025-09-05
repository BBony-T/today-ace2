// /api/admin/import-students.js
import { db } from '../_fb.js';
import admin from 'firebase-admin';

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method Not Allowed' });
    }

    // 디버그: 실제 들어온 헤더/바디 형태 확인
    const ct = req.headers['content-type'];
    console.log('[import-students] content-type =', ct, ', typeof req.body =', typeof req.body);

    // 본문 안전 파싱 (Vercel은 보통 객체로 파싱되어 옴)
    let payload = req.body;
    if (typeof payload === 'string') {
      try { payload = JSON.parse(payload); }
      catch (e) {
        return res.status(400).json({ success:false, error:`Invalid JSON body: ${e.message}` });
      }
    }
    if (!payload) {
      return res.status(400).json({ success:false, error:'Empty body' });
    }

    const {
      roster = [],
      skipExisting = true,
      categoryType = '',
      categoryName = '',
    } = payload;

    console.log('[import-students] roster length =', Array.isArray(roster) ? roster.length : 'N/A');
    if (!Array.isArray(roster) || roster.length === 0) {
      return res.status(400).json({ success:false, error:'명부(roster) 배열이 필요합니다.' });
    }
    console.log('[import-students] sample[0] =', roster[0]);

    const col = db().collection('students');

    // 기존 학번(문서ID) 조회 (skipExisting일 때만)
    let existingIds = new Set();
    if (skipExisting) {
      const snap = await col.get();
      existingIds = new Set(snap.docs.map(d => d.id));
      console.log('[import-students] existing count =', existingIds.size);
    }

    // 배치 커밋
    const imported = [];
    let batch = db().batch();
    let ops = 0;

    const now = admin.firestore.FieldValue.serverTimestamp();

    for (const s of roster) {
      // 다양한 키 지원: name/이름, studentId/id/학번
      const name = (s.name || s['이름'] || '').toString().trim();
      const studentIdRaw = (s.studentId || s.id || s['학번'] || s['학생번호'] || '').toString().trim();
      if (!name || !studentIdRaw) continue;

      const docId = studentIdRaw; // 문서ID = 학번(혹은 id)

      if (skipExisting && existingIds.has(docId)) continue;

      const docRef = col.doc(docId);
      const data = {
        username: docId,             // 로그인 아이디로 학번 사용
        password: name,              // 임시: 이름
        name,
        studentId: docId,
        klass: s.class || s.klass || s['반'] || '',  // class는 예약어 아님이지만 혼동 줄이기
        year: s.year || s['학년'] || '',
        subject: s.subject || '',
        club: s.club || '',
        categoryType: categoryType || s.categoryType || '',
        categoryName: categoryName || s.categoryName || '',
        updatedAt: now,
        createdAt: now,
      };

      batch.set(docRef, data, { merge: true });
      ops += 1;
      imported.push({ id: docId, name });

      // Firestore batch 제한 예방 (500 미만 안전)
      if (ops >= 450) {
        await batch.commit();
        batch = db().batch();
        ops = 0;
      }
    }

    if (ops > 0) await batch.commit();

    console.log('[import-students] importedCount =', imported.length);
    return res.status(200).json({ success: true, importedCount: imported.length, imported });
  } catch (e) {
    console.error('[import-students] error:', e);
    return res.status(500).json({ success:false, error: e?.message || 'server error' });
  }
}
