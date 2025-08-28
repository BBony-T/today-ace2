// /api/admin/import-students.js
import { db } from '../_fb.js';

const BATCH_LIMIT = 450; // Firestore 500 제한(여유 두고)

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, error: 'Method Not Allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    const { roster, skipExisting = false } = body;

    if (!Array.isArray(roster) || roster.length === 0) {
      return res.status(400).json({ success: false, error: '명부가 비어있습니다.' });
    }

    const col = db().collection('students');

    // 1) 정규화 + 파일 내부 중복 제거(문서ID: username=studentId)
    const seen = new Set();
    const rows = [];
    for (const s of roster) {
      const username = String((s.username || s.studentId || '')).trim();
      const name = String(s.name || '').trim();
      if (!username || !name) continue; // 필수값 없으면 스킵
      if (seen.has(username)) continue;  // 파일 안 중복 제거
      seen.add(username);

      rows.push({
        id: username,                             // 문서 ID
        data: {
          username,
          password: String((s.password || s.studentId || '')).trim(), // (추후 해시 권장)
          name,
          studentId: String((s.studentId || username)).trim(),
          class: String(s.class || '').trim(),
          year: String(s.year || '').trim(),
          subject: String(s.subject || '').trim(),
          club: String(s.club || '').trim(),
          updatedAt: new Date(),
          // createdAt은 신규 생성시에만 넣을 예정
        }
      });
    }

    if (rows.length === 0) {
      return res.status(400).json({ success: false, error: '유효한 행이 없습니다.' });
    }

    // 2) 현재 존재하는 문서 조회(업서트/스킵 통계를 위해 공통 수행)
    const docRefs = rows.map(r => col.doc(r.id));
    let snapshots = [];
    if (typeof db().getAll === 'function') {
      // Admin SDK면 getAll 사용 가능
      snapshots = await db().getAll(...docRefs);
    } else {
      // 환경에 따라 getAll이 없을 수 있음
      snapshots = await Promise.all(docRefs.map(ref => ref.get()));
    }
    const existsSet = new Set(snapshots.filter(s => s.exists).map(s => s.id));

    // 3) 분기: skipExisting 이면 기존은 건너뛰기, 아니면 업서트
    const toCreate = [];
    const toUpdateOrCreate = []; // 업서트 대상(전체)

    for (const r of rows) {
      if (skipExisting) {
        if (!existsSet.has(r.id)) {
          // 신규 생성만
          toCreate.push(r);
        }
      } else {
        toUpdateOrCreate.push(r); // 모두 업서트
      }
    }

    // 4) 배치 커밋 (chunk 처리)
    const runBatches = async (items, mode /* 'create' | 'upsert' */) => {
      let count = 0;
      for (let i = 0; i < items.length; i += BATCH_LIMIT) {
        const slice = items.slice(i, i + BATCH_LIMIT);
        const batch = db().batch();
        for (const r of slice) {
          const ref = col.doc(r.id);
          if (mode === 'create') {
            batch.set(ref, { ...r.data, createdAt: new Date() }, { merge: false });
          } else {
            // 업서트: 있으면 갱신, 없으면 생성(생성 시 createdAt 세팅)
            const isNew = !existsSet.has(r.id);
            const payload = isNew
              ? { ...r.data, createdAt: new Date() }
              : r.data;
            batch.set(ref, payload, { merge: true });
          }
        }
        await batch.commit();
        count += slice.length;
      }
      return count;
    };

    let importedCount = 0;
    let updatedCount = 0;
    let skippedCount = 0;

    if (skipExisting) {
      // 기존은 건너뜀
      skippedCount = rows.filter(r => existsSet.has(r.id)).length;
      importedCount = await runBatches(toCreate, 'create');
    } else {
      // 업서트
      const newCount = rows.filter(r => !existsSet.has(r.id)).length;
      const updCount = rows.length - newCount;
      await runBatches(toUpdateOrCreate, 'upsert');
      importedCount = newCount;
      updatedCount = updCount;
    }

    return res.status(200).json({
      success: true,
      importedCount,
      updatedCount,
      skippedCount
    });
  } catch (e) {
    console.error('import-students 오류:', e);
    return res.status(500).json({ success: false, error: '서버 오류' });
  }
}
