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

    let payload = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const {
      roster = [],
      skipExisting = true,
      categoryType = 'roster',
      categoryName = '',
      teacherId: teacherIdFromBody
    } = payload;

    if (!Array.isArray(roster) || roster.length === 0) {
      return res.status(400).json({ success:false, error:'명부(roster) 배열이 필요합니다.' });
    }

    const me = getUserFromReq?.(req) || {};
    // 저장 규칙(프런트/리스트와 일치하도록 이메일 우선)
    const teacherId = teacherIdFromBody || me.email || me.teacherId || me.uid || 'T_DEFAULT';
    const teacherEmail = me.email || '';

    const studentsCol = db().collection('students');

    let existingIds = new Set();
    if (skipExisting) {
      const snap = await studentsCol.get();
      existingIds = new Set(snap.docs.map(d => d.id));
    }

    const nowTS = admin.firestore.FieldValue.serverTimestamp();
    const imported = [];
    let batch = db().batch(), ops = 0;

    for (const s of roster) {
      const name = (s.name || s['이름'] || '').toString().trim();
      const studentIdRaw = (s.studentId || s.id || s['학번'] || s['학생번호'] || '').toString().trim();
      if (!name || !studentIdRaw) continue;
      if (skipExisting && existingIds.has(studentIdRaw)) continue;

      batch.set(studentsCol.doc(studentIdRaw), {
        username: studentIdRaw,
        password: name, // 요구사항: 해시 불필요
        name,
        studentId: studentIdRaw,
        klass: s.class || s.klass || s['반'] || '',
        year: s.year || s['학년'] || '',
        subject: s.subject || '',
        club: s.club || '',
        categoryType: categoryType || s.categoryType || '',
        categoryName: categoryName || s.categoryName || '',
        teacherId,
        createdAt: nowTS,
        updatedAt: nowTS,
      }, { merge: true });

      imported.push({ id: studentIdRaw, name });
      if (++ops >= 450) { await batch.commit(); batch = db().batch(); ops = 0; }
    }
    if (ops > 0) await batch.commit();

    // ✅ rosters 메타 문서 생성 (프런트가 기대하는 키까지 포함)
    const rosterDoc = {
      teacherId,
      teacherEmail,
      type: categoryType || 'roster',
      name: categoryName || '',
      title: categoryName || `${categoryType || '명부'} 업로드`,
      studentCount: imported.length,
      count: imported.length,                 // 호환 키
      published: false,
      createdAt: nowTS,
      updatedAt: nowTS,
    };
    const ref = await db().collection('rosters').add(rosterDoc);

    return res.status(200).json({
      success: true,
      importedCount: imported.length,
      rosterId: ref.id,
      roster: { id: ref.id, ...rosterDoc }
    });
  } catch (e) {
    console.error('[import-students] error:', e);
    return res.status(500).json({ success:false, error: e?.message || 'server error' });
  }
}
