// /api/admin/list-students.js
import { db } from '../_fb.js';

export default async function handler(req, res) {
  // CORS/프리플라이트 대응
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    // 쿼리(옵션) – 없으면 전체 조회
    const { year = '', subject = '', club = '' } = req.query || {};
    const col = db().collection('students');

    // 기본은 전체 가져오고, 가능하면 서버에서 필터
    let query = col;
    if (year)    query = query.where('year', '==', year);
    if (subject) query = query.where('subject', '==', subject);
    if (club)    query = query.where('club', '==', club);

    let snap;
    try {
      snap = await query.get();
    } catch (e) {
      // 복합 인덱스가 없어서 실패하는 경우: 전체를 가져와서 메모리 필터로 대체
      // (오류 메시지에 "requires an index" 가 보통 포함됨)
      console.warn('list-students: index fallback ->', e.message);
      const all = await col.get();
      const filtered = all.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .filter(s => (!year || s.year === year)
                  && (!subject || s.subject === subject)
                  && (!club || s.club === club));
      return res.status(200).json({ success: true, students: filtered });
    }

    const students = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return res.status(200).json({ success: true, students });
  } catch (err) {
    console.error('list-students 오류:', err);
    return res.status(500).json({ success: false, error: err.message || '서버 오류' });
  }
}
