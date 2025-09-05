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

    // 현재 로그인 사용자
    const me = getUserFromReq(req);
    if (!me || (me.role !== 'teacher' && me.role !== 'super')) {
      return res.status(401).json({ success: false, error: '로그인 필요' });
    }

    // 최종 teacherId 계산 (수퍼는 ?teacherId= 로 지정 가능)
    const teacherId =
      (me && (me.role === 'super' && req.query.teacherId ? req.query.teacherId : (me.teacherId || me.uid || me.email))) ||
      req.query.teacherId ||
      'T_DEFAULT';

    // 본문 파싱
    let payload = req.body;
    if (typeof payload === 'string') {
      try { payload = JSON.parse(payload); } catch (e) { return res.status(400).json({ success:false, error:'Invalid JSON' }); }
    }
    if (!payload) return res.status(400).json({ success:false, error:'Empty body' });

    // 클라이언트가 roster 또는 students 중 아무 키로 보낼 수 있게 양쪽 다 허용
    const arr = Array.isArray(payload.roster) ? payload.roster
              : Array.isArray(payload.students) ? payload.students
              : [];
    if (!arr.length) return res.status(400).json({ success:false, error:'명부 배열이 비었습니다.' });

    // 카테고리(과목/동아리) 메타 (없으면 빈 값)
    const categoryType = payload.categoryType || '';
    const categoryName = payload.categoryName || '';

    // 1) rosters 문서 생성
    const nowSV = admin.firestore.FieldValue.serverTimestamp();
    const rosterRef = db().collection('rosters').doc();
    const rosterDoc = {
      type: 'roster',
      teacherId,
      name: categoryName || '',
      categoryType: categoryType || (categoryName ? 'subject' : ''), // name이 있으면 기본 subject
      title: categoryName ? `${(categoryType === 'club') ? '동아리' : '과목'}: ${categoryName}` : '명부 업로드',
      itemCount: 0,
      published: false,
      createdAt: nowSV,
      updatedAt: nowSV,
    };
    await rosterRef.set(rosterDoc);
    const rosterId = rosterRef.id;

    // 2) 학생/유저 문서 저장
    const studentsCol = db().collection('students');
    const usersCol    = db().collection('users');

    // skipExisting이 true면 기존 학번은 덮어쓰지 않음(merge true 이지만 처음만 생성)
    const skipExisting = payload.skipExisting !== false;

    // 미리 존재 학번 가져오기(옵션)
    let existingIds = new Set();
    if (skipExisting) {
      const snap = await studentsCol.where('teacherId', '==', teacherId).get();
      existingIds = new Set(snap.docs.map(d => d.id));
    }

    let batch = db().batch();
    let ops = 0;
    let imported = 0;

    for (const s of arr) {
      const name = (s.name || s['이름'] || '').toString().trim();
      const rawId = (s.username || s.studentId || s.id || s['학번'] || s['학생번호'] || '').toString().trim();
      if (!name || !rawId) continue;
      if (skipExisting && existingIds.has(rawId)) continue;

      const subject = s.subject || (categoryType === 'subject' ? categoryName : '');
      const club    = s.club    || (categoryType === 'club'    ? categoryName : '');
      const data = {
        username: rawId,
        password: s.password || name,   // 정책: 초기 PW=이름
        name,
        studentId: rawId,
        teacherId,
        rosterId,
        subject,
        club,
        enabled: false,                 // 노출 전까지 비활성
        createdAt: nowSV,
        updatedAt: nowSV,
      };

      const stuRef = studentsCol.doc(rawId);
      batch.set(stuRef, data, { merge: true });

      // 로그인 테이블(교사별 네임스페이스 키)
      const userKey = `${teacherId}:${rawId}`;
      batch.set(usersCol.doc(userKey), {
        role: 'student',
        username: rawId,
        password: data.password,
        name,
        teacherId,
        rosterId,
        enabled: false,
        createdAt: nowSV,
        updatedAt: nowSV,
      }, { merge: true });

      imported++; ops++;
      if (ops >= 450) { await batch.commit(); batch = db().batch(); ops = 0; }
    }
    if (ops > 0) await batch.commit();

    // 3) rosters.itemCount 갱신
    await rosterRef.set({ itemCount: imported, updatedAt: nowSV }, { merge: true });

    return res.status(200).json({ success:true, importedCount: imported, rosterId });
  } catch (e) {
    console.error('[import-students] error:', e);
    return res.status(500).json({ success:false, error: e?.message || 'server error' });
  }
}
