// /api/admin/import-students.js
import { db } from '../_fb.js';
import admin from 'firebase-admin';
import { getSession } from '../_shared/initAdmin.js'; // 세션에서 teacherId 꺼내는 헬퍼

const t = s => (s ?? '').toString().trim();

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ success:false, error:'Method Not Allowed' });

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const {
      categoryType = 'subject',   // 'subject' | 'club'
      categoryName = '',
      roster = [],                // [{name, studentId}, ...]
      skipExisting = false
    } = body || {};

    const sess = await getSession(req); // { teacherId, ... }
    const teacherId = sess?.teacherId || body.teacherId || null;
    if (!teacherId) return res.status(401).json({ success:false, error:'교사 로그인 필요' });

    if (!Array.isArray(roster) || roster.length === 0) {
      return res.status(400).json({ success:false, error:'roster 비어있음' });
    }

    // 1) roster 문서 만들기
    const now = admin.firestore.FieldValue.serverTimestamp();
    const rRef = db().collection('rosters').doc();
    const rosterId = rRef.id;

    await rRef.set({
      id: rosterId,
      teacherId,
      title: categoryName || '무제 명부',
      categoryType,
      categoryName,
      count: roster.length,
      active: false,         // 현황판 노출은 따로 토글
      createdAt: now,
      updatedAt: now,
    });

    // 2) 학생 upsert (항상 enabled: true)
    let created = 0, updated = 0;
    const batchSize = 400;
    for (let i=0; i<roster.length; i+=batchSize) {
      const chunk = roster.slice(i, i+batchSize);
      const batch = db().batch();

      for (const raw of chunk) {
        const name = t(raw.name);
        const studentId = t(raw.studentId);
        if (!name || !studentId) continue;

        // 문서를 studentId로 고정하면 조회/로그인 편함
        const sRef = db().collection('students').doc(studentId);
        const sSnap = await sRef.get();

        const patch = {
          name,
          studentId,
          username: studentId,
          password: name,     // 기본 비번은 이름
          teacherId,
          rosterId,
          subject: categoryType === 'subject' ? categoryName : '',
          club:    categoryType === 'club'    ? categoryName : '',
          enabled: true,       // ✅ 업로드 즉시 로그인 가능
          updatedAt: now,
        };

        if (!sSnap.exists) {
          batch.set(sRef, {
            ...patch,
            createdAt: now,
          });
          created++;
        } else if (!skipExisting) {
          batch.set(sRef, patch, { merge: true });
          updated++;
        }
      }
      await batch.commit();
    }

    return res.status(200).json({ success:true, rosterId, created, updated, total: roster.length });
  } catch (e) {
    console.error('[import-students] error', e);
    return res.status(500).json({ success:false, error: e?.message || 'server error' });
  }
}
