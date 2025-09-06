// /api/admin/import-students.js
import { db } from '../_fb.js';
import admin from 'firebase-admin';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  // teacherId 는 쿼리로 받습니다. (프런트에서 붙여줌)
  const teacherId = String(req.query.teacherId || '').trim();

  let body = {};
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  } catch (e) {
    return res.status(400).json({ success: false, error: 'Invalid JSON body' });
  }

  const {
    categoryType = 'subject',         // 'subject' | 'club'
    categoryName = '',
    roster = [],
    skipExisting = true
  } = body;

  if (!teacherId) {
    return res.status(400).json({ success: false, error: 'teacherId required' });
  }
  if (!Array.isArray(roster) || roster.length === 0) {
    return res.status(400).json({ success: false, error: 'roster empty' });
  }

  const now = admin.firestore.FieldValue.serverTimestamp();

  try {
    // 1) 명부 문서 생성
    const rosterRef = db().collection('rosters').doc();
    const rosterId = rosterRef.id;

    await rosterRef.set({
      id: rosterId,
      teacherId,
      categoryType,
      categoryName,
      title: categoryName || '무제 명부',
      itemCount: roster.length,
      active: false,
      createdAt: now,
      updatedAt: now
    });

    // 2) 학생들 업서트
    const batch = db().batch();
    let upserts = 0;

    for (const r of roster) {
      const rawId = (r.studentId ?? r.username ?? '').toString().trim();
      const rawName = (r.name ?? r.password ?? '').toString().trim();

      // 비어있거나 슬래시 포함 등 Firestore 문서 ID로 쓸 수 없는 값은 건너뜀
      if (!rawId || rawId.includes('/')) continue;
      if (!rawName) continue;

      const docRef = db().collection('students').doc(rawId);
      const data = {
        studentId: rawId,
        username: rawId,
        name: rawName,
        password: rawName,     // ← 이름을 기본 비번으로
        teacherId,
        rosterId,
        enabled: true,         // ← 항상 로그인 가능
        subject: categoryType === 'subject' ? categoryName : '',
        club:    categoryType === 'club'    ? categoryName : '',
        updatedAt: now
      };

      // 기존 문서 보호 옵션
      if (skipExisting) {
        batch.set(docRef, data, { merge: true });
      } else {
        batch.set(docRef, { ...data, createdAt: now });
      }
      upserts++;
    }

    await batch.commit();

    return res.status(200).json({
      success: true,
      rosterId,
      count: roster.length,
      upserts
    });
  } catch (e) {
    console.error('[import-students] error:', e);
    // ← 여기서 에러 메시지/코드가 그대로 Network Response에 노출됩니다.
    return res.status(500).json({
      success: false,
      error: e?.message || 'server error',
      code: e?.code || null
    });
  }
}
