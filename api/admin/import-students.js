// /api/admin/import-students.js
import { db } from '../_fb.js';
import admin from 'firebase-admin';
import { getUserFromReq } from '../_shared/initAdmin.js';

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method Not Allowed' });
    }

    // 로그인 정보 → teacherId 계산
    const me = getUserFromReq(req);
    const teacherId =
      (me && (me.role === 'super' && req.query.teacherId ? req.query.teacherId : (me.teacherId || me.uid))) ||
      req.query.teacherId ||
      'T_DEFAULT';

    // body 파싱
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    // 두 가지 스키마 대응: { roster: [...] } 또는 { students: [...] }
    const rows = Array.isArray(body.roster) ? body.roster : (Array.isArray(body.students) ? body.students : []);
    if (!rows.length) {
      return res.status(400).json({ success:false, error:'업로드 데이터가 비어있습니다.' });
    }

    const catType = body.categoryType || body.type || '';   // subject | club | ''(없음)
    const catName = body.categoryName || body.name || '';   // "국어" / "코딩클럽" 등
    const title   = catName || '무제 명부';

    // 1) rosters 문서 미리 생성
    const now = admin.firestore.FieldValue.serverTimestamp();
    const rosterRef = db().collection('rosters').doc();
    const rosterId  = rosterRef.id;

    await rosterRef.set({
      type: 'roster',
      teacherId,
      title,                 // ← 카드에 보일 제목
      categoryType: catType, // subject | club
      categoryName: catName,
      itemCount: 0,          // 업로드 후 갱신
      published: false,
      createdAt: now,
      updatedAt: now,
    }, { merge: true });

    // 2) students 컬렉션에 저장 (enabled=false로 시작)
    const studentsCol = db().collection('students');
    let batch = db().batch();
    let ops   = 0;
    let imported = 0;

    for (const r of rows) {
      // 다양한 키 허용
      const name = (r.name || r['이름'] || '').toString().trim();
      const sid  = (r.username || r.studentId || r.id || r['학번'] || '').toString().trim();
      if (!name || !sid) continue;

      // 문서 id는 “학번” 그대로 사용(기존 구조 유지)
      const docRef = studentsCol.doc(sid);

      batch.set(docRef, {
        teacherId,
        rosterId,
        enabled: false,                 // ← ‘현황판 노출’ 켜기 전까지 비활성
        username: sid,                  // 로그인 아이디
        password: name,                 // 임시 비밀번호(이름)
        name,
        studentId: sid,
        subject: (catType === 'subject') ? catName : (r.subject || ''),
        club:    (catType === 'club')    ? catName : (r.club    || ''),
        createdAt: now,
        updatedAt: now,
      }, { merge: true });

      ops++; imported++;
      if (ops >= 450) { await batch.commit(); batch = db().batch(); ops = 0; }
    }
    if (ops > 0) await batch.commit();

    // 3) rosters.itemCount 갱신
    await rosterRef.set({ itemCount: imported, updatedAt: now }, { merge: true });

    return res.status(200).json({
      success: true,
      rosterId,
      importedCount: imported,
    });
  } catch (e) {
    console.error('[import-students] error:', e);
    return res.status(500).json({ success:false, error: e?.message || 'server error' });
  }
}
