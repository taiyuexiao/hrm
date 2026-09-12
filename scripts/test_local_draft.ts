/**
 * 自测脚本：验证本地草稿读写
 * 运行：npx tsx scripts/test_local_draft.ts
 */
// 在 Node 环境下 mock localStorage
const store: Record<string, string> = {};
(globalThis as any).localStorage = {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = value; },
  removeItem: (key: string) => { delete store[key]; },
};

import { loadDraft, saveDraft, clearDraft } from '../src/components/weekly-report-v2/data';
import { WeeklyReport } from '../src/components/weekly-report-v2/types';

const report: WeeklyReport = {
  id: 'r1',
  weekLabel: '20260101',
  dept: '测试部',
  authorId: 'u1',
  authorName: 'U1',
  plan: '',
  content: [{ id: 't1', text: '草稿任务', checked: false }],
  currentWork: '草稿任务',
  nextPlan: '[]',
  thoughts: '',
  other: '',
  comments: [],
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

// 保存草稿
saveDraft({ userId: 'u1', weekLabel: '20260101', dept: '测试部', baseUpdatedAt: 'base-at', savedAt: Date.now(), report });
const loaded = loadDraft('u1', '20260101', '测试部');
if (!loaded) {
  console.error('FAIL: 草稿未读取到');
  process.exit(1);
}
if (loaded.report.content[0].text !== '草稿任务') {
  console.error('FAIL: 草稿内容不一致');
  process.exit(1);
}
console.log('PASS 草稿保存与读取');

// 清理草稿
clearDraft('u1', '20260101', '测试部');
if (loadDraft('u1', '20260101', '测试部')) {
  console.error('FAIL: 草稿未清理');
  process.exit(1);
}
console.log('PASS 草稿清理');

console.log('全部本地草稿自测通过');
