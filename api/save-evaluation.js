// /api/save-evaluation.js
import { db } from './_fb.js';
import admin from 'firebase-admin';
import { getUserFromReq } from './_shared/initAdmin.js';

const nowTS = () => admin.firestore.FieldValue.serverTimestamp();
const toStr = (v) => (v ?? '').toString().trim();
const normName = (v='') => toStr(v).normalize('NFC');

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method Not Allowed' });
    }

    // 세션에서 "학생" 확인
    const me = getUserFromReq?.(req) || null;
    if (!me || me.role !== 'student') {
      return res.status(401).json({ success: false, error: 'STUDENT_SESSION_REQUIRED' });
    }

    // 기본 컨텍스트
    let teacherId = toStr(me.teacherId || '');
    let rosterId  = toStr(me.rosterId || '');
    let myUid     = toStr(me.uid || '');
    let myName    = toStr(me.name || '');
    let myUsername= toStr(me.username || '');

    // 누락 보강
    if (!teacherId || !rosterId || !myName || !myUsername) {
      const sDoc = await db().collection('students').doc(myUid || myUsername).get();
      if (sDoc.exists) {
        const s = sDoc.data();
        teacherId  = teacherId  || toStr(s.teacherId);
        rosterId   = rosterId   || toStr(s.rosterId);
        myName     = myName     || toStr(s.name);
        myUsername = myUsername || toStr(s.username || s.studentId || sDoc.id);
      }
    }

    if (!rosterId) {
      return res.status(422).json({ success:false, error:'ROSTER_CONTEXT_REQUIRED' });
    }

    // 클라이언트 payload
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const date = toStr(body.date) || new Date().toISOString().slice(0,10);
    const peerEvaluations = Array.isArray(body.peerEvaluations) ? body.peerEvaluations : [];
    const selfEvaluation  = body.selfEvaluation || null;

    // === 같은 "명부(rosterId)" 안의 학생만 불러와 이름 매핑 인덱스 생성 ===
    const qs = await db()
      .collection('students')
      .where('rosterId','==', rosterId)
      .get();

    const byName = new Map();          // normName -> [{id, studentId, username, name}]
    const duplicates = new Map();      // normName -> [studentIds] (동명이인 감지용)

    qs.forEach(d => {
      const s = d.data();
      const key = normName(s.name || '');
      if (!key) return;
      const entry = { id:d.id, studentId: toStr(s.studentId || d.id), username: toStr(s.username || d.id), name: toStr(s.name || '') };
      if (!byName.has(key)) byName.set(key, [entry]);
      else {
        byName.get(key).push(entry);
        duplicates.set(key, byName.get(key).map(x=>x.studentId));
      }
    });

    // 정책 1: 같은 명부에서 동명이인 금지(있으면 거절)
    if (duplicates.size > 0) {
      // 입력 값에 실제로 중복 이름이 포함된 경우에만 에러로 리턴
      const usedKeys = new Set(peerEvaluations.map(p => normName(p?.name)));
      const hit = [...duplicates.entries()].filter(([k]) => usedKeys.has(k));
      if (hit.length > 0) {
        return res.status(422).json({
          success:false,
          error:'AMBIGUOUS_NAME_IN_ROSTER',
          details: hit.map(([k, ids]) => ({ name: k, candidates: ids }))
        });
      }
    }

    // 정책 2: 자기 자신은 추천 불가
    const myKey = normName(myName);

    // 이름 해석(같은 명부 안에서만)
    const resolvedPeers = [];
    const unknown = [];

    for (const item of peerEvaluations) {
      const comp  = toStr(item.competency);
      const input = toStr(item.name);
      const why   = toStr(item.reason);

      if (!input) continue;

      const key = normName(input);

      if (key === myKey) {
        return res.status(422).json({ success:false, error:'CANNOT_EVALUATE_SELF', name: input });
      }

      const list = byName.get(key) || [];
      if (list.length === 1) {
        const t = list[0];
        resolvedPeers.push({
          competency: comp,
          targetName: t.name,
          targetUsername: t.username,
          targetStudentId: t.studentId,
          targetDocId: t.id,
          reason: why
        });
      } else {
        // 같은 명부 안에서 못 찾음(또는 중복 에러는 위에서 이미 걸러짐)
        unknown.push(input);
      }
    }

    if (unknown.length > 0) {
      return res.status(422).json({
        success:false,
        error:'NAME_NOT_FOUND_IN_ROSTER',
        unknown   // 저장하지 않고 입력 보정 유도
      });
    }

    // 저장
    const doc = {
      type: 'daily-evaluation',
      date,
      teacherId,
      rosterId,
      evaluator: {
        uid: myUid || null,
        username: myUsername || null,
        name: myName || null,
      },
      peerEvaluations: resolvedPeers,
      selfEvaluation: selfEvaluation ? {
        competency: toStr(selfEvaluation.competency),
        reason: toStr(selfEvaluation.reason)
      } : null,
      createdAt: nowTS(),
      updatedAt: nowTS()
    };

    const ref = await db().collection('evaluations').add(doc);

    return res.status(200).json({
      success: true,
      id: ref.id,
      saved: resolvedPeers.length + (selfEvaluation ? 1 : 0)
    });
  } catch (e) {
    console.error('[save-evaluation] error', e);
    return res.status(500).json({ success:false, error: e?.message || 'SERVER_ERROR' });
  }
}
