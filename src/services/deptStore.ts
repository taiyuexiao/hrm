/**
 * 科室清单动态数据源。
 * 启动时从后端 /api/depts 拉取（含 sortOrder 展示次序），失败回落到 types.ts 的历史硬编码清单。
 * 组件用 useDepts()/useDeptItems()，非组件代码用 getDeptsSnapshot()。
 */
import { useSyncExternalStore } from 'react';
import { getApiBaseUrl } from '../config/app';
import { SORTED_DEPTS } from '../components/weekly-report-v2/types';

export interface DeptItem {
  name: string;
  sortOrder: number;
  createdAt?: string;
}

let deptItems: DeptItem[] = SORTED_DEPTS.map((name, i) => ({ name, sortOrder: i }));
const listeners = new Set<() => void>();

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => { listeners.delete(cb); };
}

function getSnapshot() {
  return deptItems;
}

/** 组件用：科室条目（含 sortOrder/createdAt），按展示次序排列 */
export function useDeptItems(): DeptItem[] {
  return useSyncExternalStore(subscribe, getSnapshot);
}

/** 组件用：科室名列表，按展示次序排列 */
export function useDepts(): string[] {
  return useDeptItems().map(d => d.name);
}

/** 非组件代码用：当前科室名快照（如 data.ts、导入匹配） */
export function getDeptsSnapshot(): string[] {
  return deptItems.map(d => d.name);
}

/** 拉取后端科室清单；失败静默回落到内置清单 */
export async function loadDepts(): Promise<void> {
  try {
    const token = localStorage.getItem('auth-token');
    const resp = await fetch(`${getApiBaseUrl()}/depts`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const body = await resp.json();
    if (body?.success && Array.isArray(body.depts) && body.depts.length > 0) {
      deptItems = body.depts;
      listeners.forEach(l => l());
    }
  } catch {
    // 后端不可达时保留 fallback 清单
  }
}

/** 新增科室（仅超管），成功后刷新本地清单 */
export async function createDept(name: string): Promise<{ success: boolean; message?: string }> {
  const token = localStorage.getItem('auth-token');
  const resp = await fetch(`${getApiBaseUrl()}/depts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ name }),
  });
  const body = await resp.json();
  if (body?.success) {
    await loadDepts();
  }
  return body;
}
