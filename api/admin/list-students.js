// /api/admin/list-students.js
import { db } from '../_fb.js';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ success: false, error: 'Method Not Allowed' });

  try {
    const { year = '', subject = '', club = '' } = req.query || {};

    let q = db().collection('students');
    if (year)   q = q.where('year', '==', year);
    if (subject) q = q.where('subject', '==', subject);
    if (club)    q = q.where('club', '==', club);

    const snap = await q.get();
    const students = snap.docs.map(d => ({
      ...d.data(),
      // 초기 단계: 상태 필드가 없다면 기본값
      status: d.data().status || 'not-started',
      hasPeerEvaluation: !!d.data().hasPeerEvaluation,
      hasSelfEvaluation: !!d.data().hasSelfEvaluation,
      lastUpdate: d.data().lastUpdate || '미참여'
    }));

    return res.status(200).json({ success: true, students });
  } catch (e) {
    console.error('list-students 오류:', e);
    return res.status(500).json({ success: false, error: '서버 오류' });
  }
}
