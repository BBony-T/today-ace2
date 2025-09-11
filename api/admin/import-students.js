// /api/admin/import-students.js
import { getDB } from '../../lib/admin.js';
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
    body = typeof req.body === 'string'
      ? JSON.parse(req.body || '{}')
      : (req.body || {});
  } catch {
    return res.status(400).json({ success: false, error: 'Invalid JSON body' });
  }
  if (!teacherId) teacherId = String(body.teacherId || '').trim();

  const {
    // 'subject' | 'club'
    categoryType = 'subject',
    categoryName = '',
    // 기존 명부에 추가하고 싶을 때 사용 (옵션)
    rosterId: rosterIdInBody = '',
    // [{ name, studentId, username?, password? }, ...]
    roster = [],
    // 기존 학생 문서가 있어도 덮어쓰지 말고 merge
    skipExisting = true,
  } = body;

  if (!teacherId) {
    return res.status(400).json({ success: false, error: 'teacherId required' });
  }
  if (!Array.isArray(roster) || roster.length === 0) {
    return res.status(400).json({ success: false, error: 'roster empty' });
  }
  const type = (categoryType === 'club') ? 'club' : 'subject'; // 가드
  const title = String(categoryName || '').trim() || '무제 명부';

  const nowServer = admin.firestore.FieldValue.serverTimestamp();

  try {
    const dbo = db();

    // 1) 명부 메타 upsert: rosterId가 오면 재사용, 없으면 새로 생성
    const rosterRef = rosterIdInBody
      ? dbo.collection('rosters').doc(String(rosterIdInBody))
      : dbo.collection('rosters').doc();

    const rosterId = rosterRef.id;

    // 메타는 언제나 merge(upsert)
    await rosterRef.set(
      {
        id: rosterId,
        teacherId,
        categoryType: type,
        categoryName: title,
        title,               // 화면 표시명
        active: false,       // 현황판 노출은 UI에서 토글
        updatedAt: nowServer,
        // 최초 생성일 보존
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );

    // 2) 학생 upsert
    const batch = dbo.batch();
    let upserts = 0;

    for (const r of roster) {
      const rawId   = normId(r.studentId ?? r.username);
      const rawName = normName(r.name ?? r.password);

      if (!rawId || rawId.includes('/')) continue; // 문서ID 불가 문자 방지
      if (!rawName) continue;

      const docRef = dbo.collection('students').doc(rawId);

      const data = {
        studentId: rawId,
        username: rawId,
        usernameNorm: rawId,      // 검색 안정성
        name: rawName,
        password: rawName,        // 기본 비번 = 이름
        passwordNorm: rawName,
        teacherId,
        rosterId,
        enabled: true,
        subject: type === 'subject' ? title : '',
        club:    type === 'club'    ? title : '',
        updatedAt: nowServer,
      };

      if (skipExisting) {
        batch.set(docRef, data, { merge: true });
      } else {
        batch.set(docRef, { ...data, createdAt: nowServer });
      }
      upserts++;
    }

    await batch.commit();

    // 3) 실제 학생 수 재계산 → rosters.itemCount 갱신
    const snap = await dbo
      .collection('students')
      .where('teacherId', '==', teacherId)
      .where('rosterId', '==', rosterId)
      .get();

    const itemCount = snap.size;

    await rosterRef.set(
      {
        itemCount,
        updatedAt: nowServer,
      },
      { merge: true },
    );

    return res.status(200).json({
      success: true,
      rosterId,
      itemCount,
      upserts,
    });
  } catch (e) {
    console.error('[import-students] error:', e);
    return res.status(500).json({
      success: false,
      error: e?.message || 'server error',
      code: e?.code || null,
    });
  }
}
