// /api/admin/publish-roster.js
import { db } from '../_fb.js';
import admin from 'firebase-admin';
import { getUserFromReq } from '../_shared/initAdmin.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ success: false, error: 'Method Not Allowed' });
    }

    // 본문 안전 파싱
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
    let { rosterId, publish = true, teacherId: teacherIdFromBody } = body;
    publish = !!publish;
    if (!rosterId) return res.status(400).json({ success:false, error:'rosterId 필요' });

    const me = getUserFromReq(req) || {};

    // ✅ teacherId 규칙을 import/list와 동일하게 통일 (email 우선)
    // - 수퍼는 body.teacherId 있으면 그걸로 위임 가능
    const teacherId =
      (me.role === 'super' && teacherIdFromBody) ||
      me.email || me.teacherId || me.uid || 'T_DEFAULT';

    // (안전) roster 소유 확인 – 교차 게시 방지
    const rSnap = await db().collection('rosters').doc(rosterId).get();
    if (!rSnap.exists) return res.status(404).json({ success:false, error:'roster 없음' });
    const rData = rSnap.data();
    if (rData.teacherId !== teacherId && me.role !== 'super') {
      return res.status(403).json({ success:false, error:'권한 없음' });
    }

    // 1) boards/{teacherId}.activeRosterIds 업데이트
    const boardRef = db().collection('boards').doc(teacherId);
    await db().runTransaction(async (tx) => {
      const cur = await tx.get(boardRef);
      const arr = new Set(cur.exists ? (cur.data().activeRosterIds || []) : []);
      publish ? arr.add(rosterId) : arr.delete(rosterId);
      tx.set(
        boardRef,
        {
          teacherId,
          activeRosterIds: Array.from(arr),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          createdAt: cur.exists ? (cur.data().createdAt || admin.firestore.FieldValue.serverTimestamp())
                                : admin.firestore.FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    });

    // 2) rosters/{rosterId}.published 동기화
    await db().collection('rosters').doc(rosterId).set(
      { published: publish, updatedAt: admin.firestore.FieldValue.serverTimestamp() },
      { merge: true }
    );

    // 💡 학생/유저 enabled 토글은 제거함
    // (현재 students 문서에 rosterId가 없어서 쿼리가 항상 0건이기 때문)
    // 나중에 필요하면 import 단계에서 학생-명부 매핑 구조를 설계한 뒤 추가하세요.

    return res.status(200).json({ success: true, publish });
  } catch (e) {
    console.error('[publish-roster] error', e);
    return res.status(500).json({ success:false, error: e?.message || 'server error' });
  }
}
