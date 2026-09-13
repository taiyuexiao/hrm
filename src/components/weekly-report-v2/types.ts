/**
 * 企业级智能周报管理系统 - 类型定义
 * 数据层：localStorage（替代数据库存储）
 */

/** 生成内联 SVG 头像 data URI（不依赖外部网络，适配内网环境） */
export function genAvatar(seed: string, bgColor: string): string {
  const letter = seed.charAt(0).toUpperCase();
  const color = bgColor.startsWith('#') ? bgColor : `#${bgColor}`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><circle cx="50" cy="50" r="50" fill="${color}"/><text x="50" y="68" font-size="48" text-anchor="middle" fill="#fff" font-family="Arial,sans-serif" font-weight="bold">${letter}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export type UserRole = 'superadmin' | 'admin' | 'leader' | 'user';

export const ROLE_LABELS: Record<UserRole, string> = {
  superadmin: '超级管理员',
  admin: '管理员',
  leader: '总经理室',
  user: '普通用户',
};

// 各角色默认拥有的权限（前端与后端 getDefaultPermissions 保持一致）
export const ROLE_DEFAULT_PERMISSIONS: Record<UserRole, string[]> = {
  superadmin: [
    'VIEW_REPORT', 'EDIT_REPORT', 'SUBMIT_REPORT', 'VIEW_COMMENTS', 'ADD_COMMENT', 'REPLY_COMMENT',
    'EDIT_HISTORY', 'EDIT_AFTER_DEADLINE', 'ADD_COMMENT_UNLIMITED', 'DELETE_COMMENT', 'DELETE_REPLY',
    'RESOLVE_COMMENT', 'AI_SUMMARY', 'AI_GLOBAL_ANALYSIS', 'ADMIN_UNLOCK', 'VIEW_ACTION_LOGS',
    'CREATE_NEXT_WEEK', 'DELETE_WEEK', 'VIEW_SUBMISSIONS', 'KNOWLEDGE_BASE',
    'USER_MANAGE', 'PERMISSION_MANAGE',
  ],
  admin: [
    'VIEW_REPORT', 'EDIT_REPORT', 'SUBMIT_REPORT', 'VIEW_COMMENTS', 'ADD_COMMENT', 'REPLY_COMMENT',
    'EDIT_HISTORY', 'EDIT_AFTER_DEADLINE', 'ADD_COMMENT_UNLIMITED', 'DELETE_COMMENT', 'DELETE_REPLY',
    'RESOLVE_COMMENT', 'AI_SUMMARY', 'AI_GLOBAL_ANALYSIS', 'ADMIN_UNLOCK', 'VIEW_ACTION_LOGS',
    'CREATE_NEXT_WEEK', 'DELETE_WEEK', 'VIEW_SUBMISSIONS', 'KNOWLEDGE_BASE',
  ],
  leader: [
    'VIEW_REPORT', 'VIEW_COMMENTS', 'ADD_COMMENT', 'REPLY_COMMENT',
    'AI_SUMMARY', 'AI_GLOBAL_ANALYSIS', 'VIEW_ACTION_LOGS', 'VIEW_SUBMISSIONS', 'KNOWLEDGE_BASE',
  ],
  user: [
    'VIEW_REPORT', 'EDIT_REPORT', 'SUBMIT_REPORT', 'VIEW_COMMENTS', 'ADD_COMMENT', 'REPLY_COMMENT',
  ],
};

export interface User {
  id: string;
  name: string;
  dept: string;
  role: UserRole;
  avatar: string;
  color: string;
  permissions?: string[];
}

// 可在权限管理界面中单独授予/收回的特殊权限（其余能力由角色默认赋予）
export const PERMISSIONS = [
  { code: 'EDIT_AFTER_DEADLINE', name: '当期截止后编辑', desc: '当期周报截止时间后仍可编辑/提交（不影响历史周报）' },
  { code: 'EDIT_HISTORY', name: '编辑历史周报', desc: '编辑已锁定的历史周次' },
  { code: 'DELETE_WEEK', name: '删除周报周期', desc: '删除当前周之后的未来周报周期' },
  { code: 'ADMIN_UNLOCK', name: '解锁/锁定周报', desc: '对单篇周报执行管理员解锁/重新锁定' },
] as const;

export type PermissionCode = typeof PERMISSIONS[number]['code'];

export interface TaskItem {
  id: string;
  text: string;
  checked: boolean;
  highlighted?: boolean; // 是否标记为重点任务
  children?: TaskItem[]; // 子任务，支持树形层级
  // 多人协作内部字段（不展示在 UI）
  authorId?: string;     // 创建者账号
  authorName?: string;   // 创建者姓名
  updatedBy?: string;    // 最后修改者账号
  updatedAt?: string;    // 最后修改时间
}

export interface ReportSubmission {
  version: number;
  submittedAt: string;
  submittedBy?: string;
  content: {
    plan: string;
    content: TaskItem[];
    currentWork: string;
    nextPlan: string;
    thoughts: string;
    other: string;
    updatedAt: string;
  };
}

export interface WeeklyReport {
  id: string;
  weekLabel: string;
  dept: string;
  authorId: string;
  authorName: string;
  plan: string;           // 上周工作计划（原始文本）
  content: TaskItem[];    // 上周工作计划（任务列表，带checkbox）
  currentWork: string;    // 本周工作内容（纯文本）
  nextPlan: string;       // 下周工作计划
  thoughts: string;       // 本周心得
  other: string;          // 其他
  comments: Comment[];
  aiSummary?: string;
  aiAnalysis?: AiAnalysisResult;
  submissions?: ReportSubmission[];
  adminUnlock?: boolean;
  adminUnlockBy?: string;
  adminUnlockAt?: string;
  locked?: boolean;
  deadline?: string; // 自定义截止时间，ISO 8601 格式（如 2026-07-02T20:00:00）
  deadlineRemaining?: number; // seconds, from backend
  deadlinePassed?: boolean;
  deadlineTime?: string; // 后端解析后的实际截止时间（自定义或默认周五20:00），ISO 格式
  createdAt: string;
  updatedAt: string;
}

export interface Comment {
  id: string;
  reportId: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  authorColor: string;
  content: string;
  targetText?: string;
  targetBlock?: 'content' | 'nextPlan' | 'thoughts' | 'other';
  targetTaskId?: string;
  targetStart?: number;
  targetEnd?: number;
  mentionIds: string[];
  replies: Reply[];
  readBy: string[];
  resolved: boolean;
  createdAt: string;
}

export interface Reply {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar: string;
  authorColor: string;
  content: string;
  createdAt: string;
}

export interface AiAnalysisResult {
  completionRate: number;   // 完成度百分比
  completed: string[];       // 已完成的计划项
  delayed: string[];         // 延迟的计划项
  highlights: string[];      // 亮点提炼
  risks: string[];           // 风险预警
}

// 系统预置用户（模拟 RBAC）
export const SYSTEM_USERS: User[] = [
  // 总经理室（领导）
  {
    id: '306852',
    name: '于浩瀚',
    dept: '总经理室',
    role: 'leader',
    avatar: genAvatar('306852', '#b6e3f4'),
    color: '#1890ff',
  },
  {
    id: '314043',
    name: '宋晓迪',
    dept: '总经理室',
    role: 'leader',
    avatar: genAvatar('314043', '#b6e3f4'),
    color: '#1890ff',
  },
  {
    id: '301953',
    name: '徐启鹏',
    dept: '总经理室',
    role: 'leader',
    avatar: genAvatar('301953', '#b6e3f4'),
    color: '#1890ff',
  },
  {
    id: '306776',
    name: '卢易',
    dept: '总经理室',
    role: 'leader',
    avatar: genAvatar('306776', '#b6e3f4'),
    color: '#1890ff',
  },
  // 新增管理员
  {
    id: '303439',
    name: '管理员',
    dept: '系统管理员',
    role: 'admin',
    avatar: genAvatar('303439', '#b6e3f4'),
    color: '#1890ff',
  },
  {
    id: '33528',
    name: '管理员',
    dept: '系统管理员',
    role: 'superadmin',
    avatar: genAvatar('33528', '#b6e3f4'),
    color: '#1890ff',
  },
  // 保留原账号的部门
  {
    id: 'xmgl',
    name: '项目管理',
    dept: '项目管理',
    role: 'user',
    avatar: genAvatar('xmgl', '#c0aede'),
    color: '#722ed1',
  },
  {
    id: 'xqgl',
    name: '需求管理',
    dept: '需求管理',
    role: 'user',
    avatar: genAvatar('xqgl', '#ffd5dc'),
    color: '#eb2f96',
  },
  {
    id: 'jggl',
    name: '架构管理',
    dept: '架构管理',
    role: 'user',
    avatar: genAvatar('jggl', '#d1d4f9'),
    color: '#52c41a',
  },
  // 清单中的部门（工号账号）
  {
    id: '319915',
    name: '马胤',
    dept: '综合管理部',
    role: 'admin',
    avatar: genAvatar('319915', '#ffdfbf'),
    color: '#fa8c16',
  },
  {
    id: '306253',
    name: '杨萍',
    dept: '数据测试部',
    role: 'user',
    avatar: genAvatar('306253', '#f0f0f0'),
    color: '#595959',
  },
  {
    id: '305249',
    name: '单曙兵',
    dept: '数据治理部',
    role: 'user',
    avatar: genAvatar('305249', '#d9d9d9'),
    color: '#8c8c8c',
  },
  {
    id: '302390',
    name: '李焕彰',
    dept: '信息管理部',
    role: 'user',
    avatar: genAvatar('302390', '#ffe7ba'),
    color: '#fa8c16',
  },
  {
    id: '305069',
    name: '舒宝龙',
    dept: '机构服务团队',
    role: 'user',
    avatar: genAvatar('305069', '#d9f7be'),
    color: '#52c41a',
  },
  {
    id: '306844',
    name: '吴证',
    dept: '数据平台部',
    role: 'user',
    avatar: genAvatar('306844', '#ffd6e7'),
    color: '#eb2f96',
  },
  {
    id: '303028',
    name: '白迪',
    dept: '数据平台部',
    role: 'user',
    avatar: genAvatar('303028', '#ffd6e7'),
    color: '#eb2f96',
  },
  {
    id: '319914',
    name: '顾恺',
    dept: '数据开发部',
    role: 'user',
    avatar: genAvatar('319914', '#fff1b8'),
    color: '#faad14',
  },
  {
    id: '302330',
    name: '杨青',
    dept: '数据开发部',
    role: 'user',
    avatar: genAvatar('302330', '#fff1b8'),
    color: '#faad14',
  },
  {
    id: '300523',
    name: '贺文军',
    dept: '信息统计部',
    role: 'user',
    avatar: genAvatar('300523', '#efdbff'),
    color: '#722ed1',
  },
  {
    id: '304105',
    name: '刘异',
    dept: '研发管理部',
    role: 'user',
    avatar: genAvatar('304105', '#d4b896'),
    color: '#ad6800',
  },
  {
    id: '307298',
    name: '胡申民',
    dept: '智能平台部',
    role: 'user',
    avatar: genAvatar('307298', '#bfbfbf'),
    color: '#262626',
  },
  {
    id: '302577',
    name: '杨晓彦',
    dept: '智能应用一部',
    role: 'user',
    avatar: genAvatar('302577', '#b5f5ec'),
    color: '#13c2c2',
  },
  {
    id: '305393',
    name: '陈嘉琳',
    dept: '智能应用二部',
    role: 'user',
    avatar: genAvatar('305393', '#e6f7ff'),
    color: '#1890ff',
  },
];

// 历史硬编码科室清单：现仅作为 deptStore 拉取后端 /api/depts 失败时的 fallback，
// 业务代码请使用 src/services/deptStore.ts 的 useDepts()/getDeptsSnapshot()
export const DEPTS = [
  '综合管理部',
  '数据治理部',
  '信息统计部',
  '信息管理部',
  '机构服务团队',
  '数据开发部',
  '数据平台部',
  '数据测试部',
  '研发管理部',
  '智能平台部',
  '智能应用一部',
  '智能应用二部',
  '项目管理',
  '需求管理',
  '架构管理',
];

/** 部门固定展示/导出次序（项管→架构→需求→综合→治理→信统→信管→机构→开发→平台→测试→研发→智能平台→一部→二部） */
export const DEPT_ORDER = [
  '项目管理',
  '架构管理',
  '需求管理',
  '综合管理部',
  '数据治理部',
  '信息统计部',
  '信息管理部',
  '机构服务团队',
  '数据开发部',
  '数据平台部',
  '数据测试部',
  '研发管理部',
  '智能平台部',
  '智能应用一部',
  '智能应用二部',
];

/** 按 DEPT_ORDER 排序；不在表中的部门排在末尾（保持原相对顺序） */
export const sortByDeptOrder = <T>(items: T[], getDept: (item: T) => string): T[] =>
  [...items].sort((a, b) => {
    const ia = DEPT_ORDER.indexOf(getDept(a));
    const ib = DEPT_ORDER.indexOf(getDept(b));
    return (ia === -1 ? DEPT_ORDER.length : ia) - (ib === -1 ? DEPT_ORDER.length : ib);
  });

/** 按固定次序排列后的部门列表（用于填写页科室 Tab 等展示场景） */
export const SORTED_DEPTS = sortByDeptOrder(DEPTS, d => d);
