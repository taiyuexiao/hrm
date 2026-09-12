import { WeeklyReport, TaskItem } from './types';
import { parseNextPlan } from './data';

export type ConflictType =
  | 'taskText'
  | 'taskDeletedModified'
  | 'taskModifiedDeleted'
  | 'taskDeletedNew'
  | 'fieldText';

export interface TaskConflict {
  type: 'taskText' | 'taskDeletedModified' | 'taskModifiedDeleted' | 'taskDeletedNew';
  taskId: string;
  baseText?: string;
  serverText: string;
  userText: string;
  authorId?: string;
  authorName?: string;
}

export interface FieldConflict {
  type: 'fieldText';
  field: 'plan' | 'currentWork' | 'thoughts' | 'other';
  base?: string;
  server: string;
  user: string;
}

export type ConflictItem = TaskConflict | FieldConflict;

export interface MergeResult {
  report: WeeklyReport;
  conflicts: ConflictItem[];
}

function taskMap(tasks: TaskItem[]): Map<string, TaskItem> {
  const map = new Map<string, TaskItem>();
  for (const t of tasks) map.set(t.id, t);
  return map;
}

function cloneTask(t: TaskItem): TaskItem {
  return {
    ...t,
    children: t.children ? t.children.map(cloneTask) : undefined,
  };
}

function childrenEqual(a: TaskItem[] | undefined, b: TaskItem[] | undefined): boolean {
  const ca = a || [];
  const cb = b || [];
  if (ca.length !== cb.length) return false;
  for (let i = 0; i < ca.length; i++) {
    if (ca[i].id !== cb[i].id) return false;
    if (ca[i].text !== cb[i].text) return false;
    if (!childrenEqual(ca[i].children, cb[i].children)) return false;
  }
  return true;
}

interface TaskListMergeResult {
  merged: TaskItem[];
  conflicts: TaskConflict[];
}

export function mergeTaskLists(
  base: TaskItem[],
  user: TaskItem[],
  server: TaskItem[],
): TaskListMergeResult {
  const baseMap = taskMap(base);
  const userMap = taskMap(user);
  const serverMap = taskMap(server);

  const merged: TaskItem[] = [];
  const conflicts: TaskConflict[] = [];

  // 顺序：base 中的顺序优先，再把 user/server 各自新增的任务按出现顺序追加
  const orderedIds: string[] = [];
  const seen = new Set<string>();
  for (const t of base) if (!seen.has(t.id)) { seen.add(t.id); orderedIds.push(t.id); }
  for (const t of user) if (!seen.has(t.id)) { seen.add(t.id); orderedIds.push(t.id); }
  for (const t of server) if (!seen.has(t.id)) { seen.add(t.id); orderedIds.push(t.id); }

  for (const id of orderedIds) {
    const b = baseMap.get(id);
    const u = userMap.get(id);
    const s = serverMap.get(id);

    // 先递归合并子任务
    const childMerge = mergeTaskLists(
      b?.children || [],
      u?.children || [],
      s?.children || [],
    );

    // 双方都新增同一个 id（极少见，如 genId 冲突）
    if (!b && u && s) {
      if (u.text === s.text && childrenEqual(u.children, s.children)) {
        merged.push({ ...cloneTask(u), children: childMerge.merged.length > 0 ? childMerge.merged : undefined });
      } else {
        conflicts.push({
          type: 'taskText',
          taskId: id,
          baseText: undefined,
          serverText: s.text,
          userText: u.text,
          authorId: s.authorId,
          authorName: s.authorName,
        });
        merged.push({ ...cloneTask(u), children: childMerge.merged.length > 0 ? childMerge.merged : undefined });
      }
      conflicts.push(...childMerge.conflicts);
      continue;
    }

    // 本地新增、服务端没有：保留本地
    if (!b && u && !s) {
      merged.push({ ...cloneTask(u), children: childMerge.merged.length > 0 ? childMerge.merged : undefined });
      conflicts.push(...childMerge.conflicts);
      continue;
    }

    // 服务端新增、本地没有：自动合并保留
    if (!b && !u && s) {
      merged.push({ ...cloneTask(s), children: childMerge.merged.length > 0 ? childMerge.merged : undefined });
      conflicts.push(...childMerge.conflicts);
      continue;
    }

    // 用户在 base 存在时删除了该任务
    if (!u) {
      if (s) {
        // 如果服务器也删了，直接接受删除（不加入 merged）
        // 如果服务器保留或修改了，视为冲突
        if (b && (s.text !== b.text || !childrenEqual(s.children, b.children))) {
          conflicts.push({
            type: 'taskDeletedModified',
            taskId: id,
            baseText: b.text,
            serverText: s.text,
            userText: '(已删除)',
            authorId: s.authorId,
            authorName: s.authorName,
          });
          merged.push({ ...cloneTask(s), children: childMerge.merged.length > 0 ? childMerge.merged : undefined });
        }
        // 否则服务器没改，用户删除被接受
      }
      conflicts.push(...childMerge.conflicts);
      continue;
    }

    // 服务器在 base 存在时删除了该任务
    if (!s) {
      if (b) {
        // 用户保留或修改了 -> 冲突
        if (u.text !== b.text || !childrenEqual(u.children, b.children)) {
          conflicts.push({
            type: 'taskModifiedDeleted',
            taskId: id,
            baseText: b.text,
            serverText: '(已删除)',
            userText: u.text,
            authorId: u.authorId,
            authorName: u.authorName,
          });
        }
        // 如果用户没改，接受服务器删除（不加入 merged）
      }
      // base 不存在但 u 存在的情况已上面处理
      merged.push({ ...cloneTask(u), children: childMerge.merged.length > 0 ? childMerge.merged : undefined });
      conflicts.push(...childMerge.conflicts);
      continue;
    }

    // 双方都保留该任务
    const textEqual = u.text === s.text;
    const childrenEq = childrenEqual(u.children, s.children);

    if (textEqual && childrenEq) {
      merged.push({ ...cloneTask(u), children: childMerge.merged.length > 0 ? childMerge.merged : undefined });
      conflicts.push(...childMerge.conflicts);
      continue;
    }

    const onlyUserChanged =
      (b && s.text === b.text && childrenEqual(s.children, b.children)) ||
      (!b && s.text === u.text && childrenEqual(s.children, u.children));
    const onlyServerChanged =
      b && u.text === b.text && childrenEqual(u.children, b.children);

    if (onlyUserChanged) {
      merged.push({ ...cloneTask(u), children: childMerge.merged.length > 0 ? childMerge.merged : undefined });
    } else if (onlyServerChanged) {
      merged.push({ ...cloneTask(s), children: childMerge.merged.length > 0 ? childMerge.merged : undefined });
    } else {
      // 双方都改了，且文本或子任务不同 -> 冲突
      conflicts.push({
        type: 'taskText',
        taskId: id,
        baseText: b?.text,
        serverText: s.text,
        userText: u.text,
        authorId: b?.authorId || s.authorId || u.authorId,
        authorName: b?.authorName || s.authorName || u.authorName,
      });
      merged.push({ ...cloneTask(u), children: childMerge.merged.length > 0 ? childMerge.merged : undefined });
    }

    conflicts.push(...childMerge.conflicts);
  }

  return { merged, conflicts };
}

function mergeTextField(
  field: FieldConflict['field'],
  base: string,
  user: string,
  server: string,
): { value: string; conflict?: FieldConflict } {
  if (user === server) return { value: user };
  const userChanged = user !== base;
  const serverChanged = server !== base;
  if (userChanged && serverChanged) {
    return {
      value: user,
      conflict: {
        type: 'fieldText',
        field,
        base,
        server,
        user,
      },
    };
  }
  if (userChanged) return { value: user };
  return { value: server };
}

export function mergeReports(
  base: WeeklyReport,
  user: WeeklyReport,
  server: WeeklyReport,
): MergeResult {
  const contentMerge = mergeTaskLists(base.content, user.content, server.content);
  const nextPlanMerge = mergeTaskLists(
    parseNextPlan(base.nextPlan),
    parseNextPlan(user.nextPlan),
    parseNextPlan(server.nextPlan),
  );

  const conflicts: ConflictItem[] = [...contentMerge.conflicts, ...nextPlanMerge.conflicts];

  const planMerge = mergeTextField('plan', base.plan, user.plan, server.plan);
  if (planMerge.conflict) conflicts.push(planMerge.conflict);

  const currentWorkMerge = mergeTextField('currentWork', base.currentWork, user.currentWork, server.currentWork);
  if (currentWorkMerge.conflict) conflicts.push(currentWorkMerge.conflict);

  const thoughtsMerge = mergeTextField('thoughts', base.thoughts, user.thoughts, server.thoughts);
  if (thoughtsMerge.conflict) conflicts.push(thoughtsMerge.conflict);

  const otherMerge = mergeTextField('other', base.other, user.other, server.other);
  if (otherMerge.conflict) conflicts.push(otherMerge.conflict);

  const merged: WeeklyReport = {
    ...user,
    content: contentMerge.merged,
    nextPlan: JSON.stringify(nextPlanMerge.merged),
    plan: planMerge.value,
    currentWork: currentWorkMerge.value,
    thoughts: thoughtsMerge.value,
    other: otherMerge.value,
    // 合并后以服务器版本时间戳为基准，保存时后端会再次更新
    updatedAt: server.updatedAt,
  };

  return { report: merged, conflicts };
}
