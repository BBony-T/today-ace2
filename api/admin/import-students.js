// /api/admin/import-students.js
import { db } from '../_fb.js';
import admin from 'firebase-admin';
import { getUserFromReq } from '../_shared/initAdmin.js';

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success:false, error:'Method Not Allowed' });

    const me = getUserFromReq(req);
    const teacherId =
      (me && (me.role === 'super' && req.query.teacherId ? req.query.teacherId : (me.teacherId || me.uid))) ||
      req.query.teacherId ||
      'T_DEFAULT';

    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const rows = Array.isArray(body.roster) ? body.roster
               : (Array.isArray(body.students) ? body.students : []);
    if (!rows.length) return res.status(400).json({ success:false, error:'업로드 데이터가 비어있습니다.' });

    const catType = body.categoryType || body.type || '';
    const catName = body.categoryName || body.name || '';
    // 혹시 비어있으면 데이터에서 유추
    const first = rows.find(r => r.subject || r.club);
    const derivedName = first?.subject || first?.club || '';
    const title = (catName || derivedName || '무제 명부');

    const now = admin.firestore.FieldValue.serverTimestamp();
    const rosterRef = db().collection('rosters').doc();
    const rosterId  = rosterRef.id;

    await rosterRef.set({
      type: 'roster',
      teacherId,
      title,
      categoryType: catType || (first?.subject ? 'subject' : first?.club ? 'club' : ''),
      categoryName: catName || derivedName || '',
      itemCount: 0,
      published: false,
      createdAt: now,
      updatedAt: now,
    }, { merge: true });

    // 학생 저장(처음에는 enabled=false)
    const studentsCol = db().collection('students');
    let batch = db().batch();
    let ops = 0, imported = 0;

    for (const r of rows) {
      const name = (r.name || r['이름'] || '').toString().trim();
      const sid  = (r.username || r.studentId || r.id || r['학번'] || '').toString().trim();
      if (!name || !sid) continue;

      const docRef = studentsCol.doc(sid);
      batch.set(docRef, {
        teacherId,
        rosterId,
        enabled: false,
        username: sid,
        password: name,
        name,
        studentId: sid,
        subject: (catType === 'subject') ? (catName || derivedName) : (r.subject || ''),
        club:    (catType === 'club')    ? (catName || derivedName) : (r.club    || ''),
        createdAt: now,
        updatedAt: now,
      }, { merge: true });

      imported++; ops++;
      if (ops >= 450) { await batch.commit(); batch = db().batch(); ops = 0; }
    }
    if (ops > 0) await batch.commit();

    await rosterRef.set({ itemCount: imported, updatedAt: now }, { merge: true });

    return res.status(200).json({ success:true, rosterId, importedCount: imported });
  } catch (e) {
    console.error('[import-students] error:', e);
    return res.status(500).json({ success:false, error: e?.message || 'server error' });
  }
}
