// /api/admin/import-students.js
import { db } from '../_fb.js';
import { getUserFromReq } from '../_shared/initAdmin.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return res.status(405).json({ success:false, error:'Method Not Allowed' });

    const me = getUserFromReq(req);
    const teacherId =
      (me && (me.teacherId || me.uid)) ||
      req.query.teacherId || req.body.teacherId || 'T_DEFAULT';

    const { categoryType = 'subject', categoryName = '무제 명부', skipExisting = true } = req.body || {};
    const incoming = Array.isArray(req.body.roster) ? req.body.roster
                   : Array.isArray(req.body.students) ? req.body.students : [];
    if (incoming.length === 0) return res.status(400).json({ success:false, error:'명부가 비어있습니다.' });

    // 1) roster 문서 생성
    const rosterRef = db().collection('rosters').doc();
    const rosterId = rosterRef.id;
    await rosterRef.set({
      id: rosterId,
      teacherId,
      title: categoryName,
      type: categoryType,              // 'subject' | 'club'
      itemCount: incoming.length,
      createdAt: Date.now(),
      active: false,                   // 표시는 publish-roster에서
    });

    // 2) students 저장 (enabled는 기본 false)
    const col = db().collection('students');
    let batch = db().batch(), cnt = 0, imported = 0;

    for (const s of incoming) {
      const name = (s.name || '').trim();
      const studentId = String(s.studentId || s.username || '').trim();
      if (!name || !studentId) continue;

      // 교사별-학번 고유키로 저장(중복 방지)
      const docId = `${teacherId}_${studentId}`;
      const ref = col.doc(docId);

      const data = {
        teacherId,
        rosterId,
        name,
        studentId,
        subject: categoryType === 'subject' ? categoryName : '',
        club:    categoryType === 'club'    ? categoryName : '',
        enabled: false,                     // 현황판 노출X (publish로 전환)
        status: 'not-started',
        updatedAt: Date.now(),
      };

      batch.set(ref, data, { merge: !!skipExisting });
      imported++; cnt++;
      if (cnt % 400 === 0) { await batch.commit(); batch = db().batch(); }
    }
    await batch.commit();

    return res.status(200).json({ success:true, rosterId, importedCount: imported });
  } catch (e) {
    console.error('[import-students] error:', e);
    return res.status(500).json({ success:false, error:e?.message || 'server error' });
  }
}
