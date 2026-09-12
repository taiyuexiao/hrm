/**
 * 自测脚本：验证任务条目级合并逻辑
 * 运行：npx tsx scripts/test_collab_merge.ts
 */
import { mergeReports } from '../src/components/weekly-report-v2/merge';
import { WeeklyReport, TaskItem } from '../src/components/weekly-report-v2/types';

function makeReport(content: TaskItem[], nextPlan: TaskItem[] = [], currentWork = ''): WeeklyReport {
  return {
    id: 'r1',
    weekLabel: '20260101',
    dept: '测试部',
    authorId: 'u1',
    authorName: 'U1',
    plan: '',
    content,
    currentWork,
    nextPlan: JSON.stringify(nextPlan),
    thoughts: '',
    other: '',
    comments: [],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

const baseTask1: TaskItem = { id: 't1', text: '原始任务1', checked: false, authorId: 'u1', authorName: 'U1' };
const base = makeReport([baseTask1]);

// 场景1：A 改任务1，B 新增任务2 => 自动合并，无冲突
const userA = makeReport([{ ...baseTask1, text: 'A修改了任务1' }]);
const serverB = makeReport([
  baseTask1,
  { id: 't2', text: 'B新增任务2', checked: false, authorId: 'u2', authorName: 'U2' },
]);
const r1 = mergeReports(base, userA, serverB);
assert(r1.conflicts.length === 0, '场景1 不应有冲突');
const ids1 = r1.report.content.map(t => t.id).sort();
assert(JSON.stringify(ids1) === '["t1","t2"]', '场景1 应同时保留 t1 和 t2');
assert(r1.report.content.find(t => t.id === 't1')?.text === 'A修改了任务1', '场景1 应保留A对t1的修改');
console.log('PASS 场景1：A修改t1 + B新增t2 自动合并');

// 场景2：A 和 B 都修改了任务1 => 冲突
const userA2 = makeReport([{ ...baseTask1, text: 'A修改了任务1' }]);
const serverB2 = makeReport([{ ...baseTask1, text: 'B修改了任务1', authorId: 'u2', authorName: 'U2' }]);
const r2 = mergeReports(base, userA2, serverB2);
assert(r2.conflicts.length === 1, '场景2 应有1个冲突');
assert(r2.conflicts[0].type === 'taskText', '场景2 冲突类型应为 taskText');
console.log('PASS 场景2：A和B都修改t1 产生冲突');

// 场景3：B 新增任务2，A 删除了任务2（base 中没有） => 自动保留B的任务，不冲突
const userA3 = makeReport([]); // A 删除了 t2（base 中没有）
const serverB3 = makeReport([baseTask1, { id: 't2', text: 'B新增任务2', checked: false, authorId: 'u2', authorName: 'U2' }]);
const r3 = mergeReports(base, userA3, serverB3);
assert(r3.conflicts.length === 0, '场景3 不应有冲突');
assert(r3.report.content.some(t => t.id === 't2'), '场景3 应保留B新增的t2');
console.log('PASS 场景3：A删除B新增任务 自动保留');

// 场景4：B 修改了 A 创建的任务1，且 author 不一致 => 冲突中携带 authorName
const userA4 = makeReport([{ ...baseTask1, text: 'A修改了任务1' }]);
const serverB4 = makeReport([{ ...baseTask1, text: 'B修改了任务1', authorId: 'u2', authorName: 'U2' }]);
const r4 = mergeReports(base, userA4, serverB4);
const c4 = r4.conflicts[0] as any;
assert(c4.authorName === 'U2' || c4.authorName === 'U1', '场景4 冲突应携带作者信息');
console.log('PASS 场景4：冲突携带作者信息');

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('FAIL:', msg);
    process.exit(1);
  }
}

console.log('全部协作合并自测通过');
