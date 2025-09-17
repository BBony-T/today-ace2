// /api/_fb.js
import { getDB } from '../lib/admin.js';
import { FieldValue } from 'firebase-admin/firestore';
import * as admin from 'firebase-admin';

// 기존 코드들이 기대하는 형태를 그대로 제공
export function db() {
  return getDB(); // 중앙집중 초기화
}

// 자주 쓰는 타임스탬프 헬퍼
export const nowTS = () => FieldValue.serverTimestamp();

// FieldValue 자체가 필요한 곳도 있을 수 있어 함께 노출
export { FieldValue };

// (호환용) 혹시 어딘가에서 default로 admin을 가져다 쓰면 깨지지 않도록 내보냄
export default admin;
