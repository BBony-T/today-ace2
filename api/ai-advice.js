// /api/ai-advice.js
import { db } from './_fb.js';
import admin from 'firebase-admin';
import { getUserFromReq } from './_shared/initAdmin.js';
import { generateAdvice } from './_shared/gemini-advice.js';

function toStr(v){ return (v ?? '').toString().trim(); }
function normalize(s){ return toStr(s).toLowerCase(); }

export default async function handler(req, res){
  try{
    if (req.method !== 'POST') {
      return res.status(405).json({ success:false, error:'Method Not Allowed' });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body||'{}') : (req.body||{});
    const career       = toStr(body.career);
    const statsSummary = toStr(body.statsSummary);
    const stats        = body.stats || {};
    const usernameIn   = toStr(body.username);
    const rosterIdIn   = toStr(body.rosterId);

    // 세션 보조
    const me = getUserFromReq?.(req) || {};
    const username = usernameIn || toStr(me.username || me.uid);
    if (!username) {
      return res.status(400).json({ success:false, error: 'username required' });
    }

    // 최근 120일/최대 100문서 안에서 "나를 지목한 추천"의 "이유" 텍스트 수집
    const reasons = [];
    const since = admin.firestore.Timestamp.fromDate(new Date(Date.now() - 1000*60*60*24*120));
    // 컬렉션 이름은 기존 코드와 동일하게 'evaluations' 가정
    const qs = await db()
      .collection('evaluations')
      .where('date', '>=', since)
      .orderBy('date', 'desc')
      .limit(100)
      .get();

    const wantRoster = rosterIdIn || null;

    qs.forEach(doc=>{
      const d = doc.data() || {};
      // 명부 제한(있다면 우선 적용)
      if (wantRoster && d.rosterId && d.rosterId !== wantRoster) return;

      // 서버형: peerEvaluations: [{competency, nominees:[...], reasons:[...] }]
      if (Array.isArray(d.peerEvaluations)) {
        d.peerEvaluations.forEach(pe=>{
          const noms = Array.isArray(pe.nominees) ? pe.nominees : [];
          const idxs = [];
          noms.forEach((nm, idx)=>{
            if (normalize(nm) === normalize(username)) idxs.push(idx);
          });
          if (idxs.length && Array.isArray(pe.reasons)) {
            // 지목 받은 위치의 reason 우선, 없으면 전체 reason 수집
            idxs.forEach(i=>{
              const r = toStr(pe.reasons[i]);
              if (r) reasons.push(`[${pe.competency}] ${r}`);
            });
            if (!idxs.length) {
              pe.reasons.forEach(r=>{
                const t = toStr(r);
                if (t) reasons.push(`[${pe.competency}] ${t}`);
              });
            }
          }
        });
      }

      // 로컬형/레거시: peerEvaluations: [{competency, name, reason}]
      if (Array.isArray(d.peerEvaluations)) {
        d.peerEvaluations.forEach(pe=>{
          const isMe = normalize(pe.name) === normalize(username);
          if (isMe && toStr(pe.reason)) {
            reasons.push(`[${pe.competency}] ${toStr(pe.reason)}`);
          }
        });
      }
    });

    // 너무 길면 24개까지만 사용 (모델 프롬프트 길이 제한)
    const topReasons = reasons.slice(0, 24);

    // Gemini 프롬프트 구성
    const prompt = [
      '너는 중·고등학생 대상 ‘성장 코치’야. 아래의 통계 요약과 최근 동료들의 추천 이유를 바탕으로,',
      '학생의 강점을 살려 앞으로 1~2주간 실천할 수 있는 “구체적 행동 계획”을 한국어로 5줄 이내로 제시해.',
      '형식은 다음을 지켜:',
      '1) 첫 줄: 핵심 강점 한 문장 요약 (이모지 1개 포함 가능)',
      '2) 2~4줄: 강점 기반 행동 2~3개 (매일/매주, 횟수/시간 등 수치 포함)',
      '3) 마지막 줄: 회고 방법(간단 체크리스트 형태)',
      '',
      career ? `학생의 관심/진로: ${career}` : '학생의 관심/진로: (입력 없음)',
      '',
      '통계 요약:',
      statsSummary || '(요약 없음)',
      '',
      '최근 추천 이유(최대 24개):',
      topReasons.length ? topReasons.join('\n') : '(이유 텍스트 없음)',
      '',
      '가능하면 추천 이유에서 반복적으로 드러나는 행동/상황을 실천 계획에 반영해.',
      '모호한 말 대신 “언제, 무엇을, 얼마나, 어떻게 측정”을 포함해.'
    ].join('\n');

    // Gemini 호출
    const advice = await generateAdvice(prompt, { stats, career });

    return res.status(200).json({ success:true, advice });
  }catch(e){
    console.error('[ai-advice] error:', e);
    return res.status(500).json({ success:false, error: e?.message || 'server error' });
  }
}
