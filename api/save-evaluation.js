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

    // 세션에서 학생 확인
    const me = getUserFromReq?.(req) || null;
    if (!me || me.role !== 'student') {
      return res.status(401).json({ success: false, error: 'STUDENT_SESSION_REQUIRED' });
    }

    // 세션에서 기본 컨텍스트 확보
    let teacherId = toStr(me.teacherId || '');
    let rosterId  = toStr(me.rosterId || '');
    let myUid     = toStr(me.uid || '');
    let myName    = toStr(me.name || '');
    let myUsername= toStr(me.username || '');

    // 누락 시 보강: students/{uid} 를 읽어서 teacherId/rosterId/name/username 채우기
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

    // 클라이언트 payload
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const date = toStr(body.date) || new Date().toISOString().slice(0,10);
    const peerEvaluations = Array.isArray(body.peerEvaluations) ? body.peerEvaluations : [];
    const selfEvaluation  = body.selfEvaluation || null;

    // --- 같은 명부(rosterId) 안의 학생 목록을 싹 읽어 이름으로 매핑 ---
    // 1) 해당 선생님 + 해당 roster 의 학생들만
    const qs = await db()
      .collection('students')
      .where('teacherId', '==', teacherId)
      .where('rosterId', '==', rosterId)
      .get();

    // 2) 이름 정규화 인덱스 (동명이인 대비: 배열로 모아둠)
    const nameIndex = new Map(); // normName -> [ {id, username, studentId, name} ]
    qs.forEach(d => {
      const s = d.data();
      const key = normName(s.name || '');
      if (!key) return;
      if (!nameIndex.has(key)) nameIndex.set(key, []);
      nameIndex.get(key).push({
        id: d.id,
        username: toStr(s.username || s.studentId || d.id),
        studentId: toStr(s.studentId || s.username || d.id),
        name: toStr(s.name || '')
      });
    });

    // 3) 입력된 각 이름을 같은 명부 안에서 해석
    const resolvedPeers = [];
    const unresolved = [];

    for (const item of peerEvaluations) {
      const comp  = toStr(item.competency);
      const input = toStr(item.name);
      const why   = toStr(item.reason);

      if (!input) continue;

      const cand = nameIndex.get(normName(input)) || [];
      if (cand.length === 1) {
        const c = cand[0];
        resolvedPeers.push({
          competency: comp,
          targetName: c.name,
          targetUsername: c.username,
          targetStudentId: c.studentId,
          targetDocId: c.id,
          reason: why,
          resolved: true
        });
      } else if (cand.length > 1) {
        // 동명이인: 가장 작은 학번으로 고정 매핑(원하면 정책 변경 가능)
        const pick = [...cand].sort((a,b)=>a.studentId.localeCompare(b.studentId,'ko'))[0];
        resolvedPeers.push({
          competency: comp,
          targetName: pick.name,
          targetUsername: pick.username,
          targetStudentId: pick.studentId,
          targetDocId: pick.id,
          reason: why,
          resolved: true,
          ambiguous: true,
          candidates: cand.map(x=>x.studentId)
        });
      } else {
        unresolved.push({ competency: comp, inputName: input });
        resolvedPeers.push({
          competency: comp,
          targetName: input,   // 원문 보존
          targetUsername: null,
          targetStudentId: null,
          targetDocId: null,
          reason: why,
          resolved: false
        });
      }
    }

    // --- 저장 형태(샘플: evaluations 컬렉션) ---
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
      resolved: resolvedPeers.filter(p=>p.resolved).length,
      unresolved,                         // 어떤 이름이 매칭 안됐는지 프런트가 알 수 있게 반환
    });
  } catch (e) {
    console.error('[save-evaluation] error', e);
    return res.status(500).json({ success:false, error: e?.message || 'SERVER_ERROR' });
  }
}
