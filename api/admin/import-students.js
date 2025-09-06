// /api/admin/import-students.js
import { db } from '../_fb.js';
import admin from 'firebase-admin';

function normId(v = '') {
  // 학번: 문자열화 + 앞뒤 공백 제거 (선행 0 보존)
  return String(v ?? '').trim();
}
function normName(v = '') {
  // 이름: 앞뒤 공백 제거 + 유니코드 정규화(NFC)
  return String(v ?? '').trim().normalize('NFC');
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  // teacherId: 쿼리 우선, body 보강 허용
  let teacherId = String(req.query.teacherId || '').trim();
  let body = {};
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
  } catch {
    return res.status(400).json({ success: false, error: 'Invalid JSON body' });
  }
  if (!teacherId) teacherId = String(body.teacherId || '').trim();

  const {
    categoryType = 'subject',   // 'subject' | 'club'
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
      active: false,           // 공개(현황판 노출) 여부는 별도 토글에서 제어
      createdAt: now,
      updatedAt: now
    });

    // 2) 학생 upsert
    const batch = db().batch();
    let upserts = 0;

    for (const r of roster) {
      const rawId = normId(r.studentId ?? r.username);
      const rawName = normName(r.name ?? r.password);

      if (!rawId || rawId.includes('/')) continue; // 문서ID 불가 문자 방지
      if (!rawName) continue;

      // 현재 구조 유지: 문서ID = 학번
      const docRef = db().collection('students').doc(rawId);

      const data = {
        studentId: rawId,
        username: rawId,
        usernameNorm: normId(rawId), // 검색 안정성
        name: rawName,
        password: rawName,           // 이름을 기본 비번
        passwordNorm: rawName,       // 정규화본
        teacherId,
        rosterId,
        enabled: true,               // ✅ 항상 로그인 가능
        subject: categoryType === 'subject' ? categoryName : '',
        club:    categoryType === 'club'    ? categoryName : '',
        updatedAt: now
      };

      if (skipExisting) {
        // 기존 값은 보존하면서 갱신
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
    return res.status(500).json({
      success: false,
      error: e?.message || 'server error',
      code: e?.code || null
    });
  }
}
