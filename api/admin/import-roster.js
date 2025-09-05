// /api/admin/import-roster.js
import { db } from '../_fb.js';
import admin from 'firebase-admin';

export default async function handler(req, res) {
  try {
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ success:false, error:'Method Not Allowed' });

    const teacherId = req.user?.teacherId || req.query.teacherId || 'T_DEFAULT'; // TODO: 실제 세션 연동
    let { title = '', type = 'club', roster = [] } = (typeof req.body === 'string') ? JSON.parse(req.body) : req.body;
    if (!Array.isArray(roster) || roster.length === 0) return res.status(400).json({ success:false, error:'명부가 비어있습니다.' });

    const rostersCol = db().collection('rosters');
    const rosterRef = rostersCol.doc(); // 새 명부
    const now = admin.firestore.FieldValue.serverTimestamp();

    // 1) rosters/<id> 메타 저장
    await rosterRef.set({ teacherId, title, type, itemCount: roster.length, published:false, createdAt: now, updatedAt: now });

    // 2) items 저장 + students/users 비활성 업서트
    const itemsCol = rosterRef.collection('items');
    let batch = db().batch(); let ops = 0; let imported = 0;
    for (const raw of roster) {
      const name = (raw.name || raw['이름'] || '').toString().trim();
      const sid  = (raw.studentId || raw.id || raw['학번'] || '').toString().trim();
      if (!name || !sid) continue;

      // 2-1) roster items
      batch.set(itemsCol.doc(sid), {
        studentId: sid, name,
        year: raw.year || raw['학년'] || '',
        klass: raw.class || raw.klass || raw['반'] || '',
        subject: raw.subject || '', club: raw.club || '',
        createdAt: now, updatedAt: now,
      }, { merge:true });

      // 2-2) students (현황판용)
      const stuId = `${teacherId}:${sid}`;
      batch.set(db().collection('students').doc(stuId), {
        teacherId, studentId: sid, name,
        year: raw.year || '', klass: raw.class || '',
        rosterId: rosterRef.id, status:'미시작',
        enabled: false, createdAt: now, updatedAt: now
      }, { merge:true });

      // 2-3) users (로그인 계정)
      batch.set(db().collection('users').doc(stuId), {
        role:'student', teacherId, username: sid, password: name,
        enabled: false, rosterId: rosterRef.id, createdAt: now, updatedAt: now
      }, { merge:true });

      if (++ops >= 450) { await batch.commit(); batch = db().batch(); ops = 0; }
      imported++;
    }
    if (ops > 0) await batch.commit();

    return res.status(200).json({ success:true, rosterId: rosterRef.id, imported });
  } catch (e) {
    console.error('[import-roster] error', e);
    return res.status(500).json({ success:false, error: e?.message || 'server error' });
  }
}
