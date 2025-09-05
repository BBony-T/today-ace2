// /api/admin/import-students.js
import { db } from '../_fb.js';
import admin from 'firebase-admin';
// ⬇️ 로그인 사용자(교사/수퍼) 정보 읽기 – 경로 다르면 맞게 수정
import { getUserFromReq } from '../_shared/initAdmin.js';

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
      // ⬇️ (선택) 수퍼가 다른 교사 보드에 넣고 싶을때 바디로 teacherId를 넘길 수 있게
      teacherId: teacherIdFromBody
    } = payload;

    console.log('[import-students] roster length =', Array.isArray(roster) ? roster.length : 'N/A');
    if (!Array.isArray(roster) || roster.length === 0) {
      return res.status(400).json({ success:false, error:'명부(roster) 배열이 필요합니다.' });
    }
    console.log('[import-students] sample[0] =', roster[0]);

    // ⬇️ 현재 로그인 사용자 기준 teacherId 결정(수퍼면 body 값 우선)
    const me = getUserFromReq?.(req) || null;
    const teacherId =
      teacherIdFromBody ||
      me?.teacherId || me?.uid || me?.email || 'T_DEFAULT';
    const teacherEmail = me?.email || '';

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

    const nowTS = admin.firestore.FieldValue.serverTimestamp();

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
        password: name,              // 임시: 이름(요구사항대로 해시 없음)
        name,
        studentId: docId,
        klass: s.class || s.klass || s['반'] || '',
        year: s.year || s['학년'] || '',
        subject: s.subject || '',
        club: s.club || '',
        categoryType: categoryType || s.categoryType || '',
        categoryName: categoryName || s.categoryName || '',
        teacherId,                   // ⬅️ 소유 교사 식별자 저장(필요 시 필터에 사용 가능)
        updatedAt: nowTS,
        createdAt: nowTS,
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

    // ✅ 추가: "저장된 명부"에 노출될 메타 문서 기록
    // rosters 컬렉션에 1건 생성 → /api/admin/list-rosters 가 이걸 읽어 목록에 출력
    const rosterDoc = {
      teacherId,
      teacherEmail,
      type: categoryType || 'roster',
      name: categoryName || '',
      title: categoryName || `${categoryType || '명부'} 업로드`,
      studentCount: imported.length,
      published: false,
      createdAt: nowTS,
      updatedAt: nowTS,
    };
    const rosterRef = await db().collection('rosters').add(rosterDoc);

    console.log('[import-students] importedCount =', imported.length, ' rosterId =', rosterRef.id);
    return res.status(200).json({
      success: true,
      importedCount: imported.length,
      imported,
      rosterId: rosterRef.id,
      roster: rosterDoc
    });
  } catch (e) {
    console.error('[import-students] error:', e);
    return res.status(500).json({ success:false, error: e?.message || 'server error' });
  }
}
