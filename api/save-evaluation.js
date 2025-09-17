// /api/save-evaluation.js
import { getDB } from '../lib/admin.js';
import { FieldValue } from 'firebase-admin/firestore';
import { getUserFromReq } from './_shared/initAdmin.js';

const toStr = v => (v ?? '').toString().trim();
const normName = v => toStr(v).normalize('NFC'); // 이름 비교용

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method Not Allowed' });
    }

    // 1) 세션: 학생만 허용
    const me = getUserFromReq?.(req) || null;
    if (!me || me.role !== 'student') {
      return res.status(401).json({ success: false, error: 'STUDENT_SESSION_REQUIRED' });
    }

    // 2) 컨텍스트 보강
    const db = getDB();
    let teacherId = toStr(me.teacherId || '');
    let rosterId  = toStr(me.rosterId  || '');
    let myUid     = toStr(me.uid       || '');
    let myName    = toStr(me.name      || '');
    let myUser    = toStr(me.username  || '');

    if (!teacherId || !rosterId || !myName || !myUser) {
      const sDoc = await db.collection('students').doc(myUid || myUser).get();
      if (sDoc.exists) {
        const s = sDoc.data() || {};
        teacherId = teacherId || toStr(s.teacherId);
        rosterId  = rosterId  || toStr(s.rosterId);
        myName    = myName    || toStr(s.name);
        myUser    = myUser    || toStr(s.username || s.studentId || sDoc.id);
      }
    }
    if (!rosterId) {
      return res.status(422).json({ success:false, error:'ROSTER_CONTEXT_REQUIRED' });
    }

    // 3) 요청 본문
    const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
    const date = toStr(body.date) || new Date().toISOString().slice(0,10);
    const peerEvaluationsIn = Array.isArray(body.peerEvaluations) ? body.peerEvaluations : [];
    const selfEvaluationIn  = body.selfEvaluation || null;

    // 4) 같은 명부의 학생 이름 → username 매핑(모호성 방지 최소화)
    const snap = await db.collection('students').where('rosterId','==', rosterId).get();
    const nameToUser = new Map(); // 정규화된 이름 -> username
    snap.forEach(d => {
      const s = d.data() || {};
      const nm = normName(s.name || '');
      const un = toStr(s.username || s.studentId || d.id);
      if (nm && un) nameToUser.set(nm, un);
    });

    const myKey = normName(myName);

    // 5) 기존 포맷으로 정규화: nominees = [ "username" ], reasons = [ "텍스트" ]
    const peerOut = [];
    for (const it of peerEvaluationsIn) {
      const comp = toStr(it.competency);
      const inputName = toStr(it.name || it.target || it.nominee || ''); // 다양한 키 허용
      const why       = toStr(it.reason || '');

      if (!comp || !inputName) continue;

      const key = normName(inputName);
      if (key === myKey) {
        return res.status(422).json({ success:false, error:'CANNOT_EVALUATE_SELF', name: inputName });
      }

      const user = nameToUser.get(key);
      if (!user) {
        // 명부에 이름이 없으면 클라이언트에서 바로잡게 에러 리턴(과도한 스키마 변경 없이 최소 정책만)
        return res.status(422).json({ success:false, error:'NAME_NOT_FOUND_IN_ROSTER', unknown:[inputName] });
      }

      // ✅ “기존(레거시) 관리자/학생 화면이 기대하던 형태”
      // - nominees: 문자열 username 배열 (index로 reasons 매칭)
      // - reasons : 같은 길이의 문자열 배열
      peerOut.push({
        competency: comp,
        nominees: [user],
        reasons:  [why].filter(Boolean)
      });
    }

    const selfOut = selfEvaluationIn ? {
      competency: toStr(selfEvaluationIn.competency),
      reason:     toStr(selfEvaluationIn.reason)
    } : null;

    // 6) 저장 다큐먼트: 기존 화면 호환 필드 포함(evaluatorUsername, date, timestamp)
    const doc = {
      teacherId, rosterId,
      date,
      timestamp: new Date().toISOString(),        // ISO로도 넣고
      evaluatorUsername: myUser,                  // 기존 화면이 쓰던 키
      evaluator: { uid: myUid || null, name: myName || null, username: myUser || null },
      peerEvaluations: peerOut,
      selfEvaluation: selfOut,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp()
    };

    const ref = await db.collection('evaluations').add(doc);

    return res.status(200).json({
      success: true,
      id: ref.id,
      saved: peerOut.length + (selfOut ? 1 : 0)
    });
  } catch (e) {
    console.error('[save-evaluation] error', e);
    return res.status(500).json({ success:false, error: e?.message || 'SERVER_ERROR' });
  }
}
