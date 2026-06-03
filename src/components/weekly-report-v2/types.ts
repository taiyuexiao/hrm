/**
 * 企业级智能周报管理系统 - 类型定义
 * 数据层：localStorage（替代数据库存储）
 */

export interface User {
  id: string;
  name: string;
  dept: string;
  role: 'admin' | 'user';
  avatar: string;
  color: string;
}

export interface TaskItem {
  id: string;
  text: string;
  checked: boolean;
  highlighted?: boolean; // 是否标记为重点任务
  children?: TaskItem[]; // 子任务，支持树形层级
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
  // 总经理室（管理员）
  {
    id: '306852',
    name: '于浩瀚',
    dept: '总经理室',
    role: 'admin',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=306852&backgroundColor=b6e3f4',
    color: '#1890ff',
  },
  {
    id: '314043',
    name: '宋晓迪',
    dept: '总经理室',
    role: 'admin',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=314043&backgroundColor=b6e3f4',
    color: '#1890ff',
  },
  {
    id: '301953',
    name: '徐启鹏',
    dept: '总经理室',
    role: 'admin',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=301953&backgroundColor=b6e3f4',
    color: '#1890ff',
  },
  {
    id: '306776',
    name: '卢易',
    dept: '总经理室',
    role: 'admin',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=306776&backgroundColor=b6e3f4',
    color: '#1890ff',
  },
  // 新增管理员
  {
    id: '303439',
    name: '管理员',
    dept: '系统管理员',
    role: 'admin',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=303439&backgroundColor=b6e3f4',
    color: '#1890ff',
  },
  {
    id: '33528',
    name: '管理员',
    dept: '系统管理员',
    role: 'admin',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=33528&backgroundColor=b6e3f4',
    color: '#1890ff',
  },
  // 保留原账号的部门
  {
    id: 'xmgl',
    name: '项目管理',
    dept: '项目管理',
    role: 'user',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=xmgl&backgroundColor=c0aede',
    color: '#722ed1',
  },
  {
    id: 'xqgl',
    name: '需求管理',
    dept: '需求管理',
    role: 'user',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=xqgl&backgroundColor=ffd5dc',
    color: '#eb2f96',
  },
  {
    id: 'jggl',
    name: '架构管理',
    dept: '架构管理',
    role: 'user',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=jggl&backgroundColor=d1d4f9',
    color: '#52c41a',
  },
  // 清单中的部门（工号账号）
  {
    id: '319915',
    name: '马胤',
    dept: '综合管理部',
    role: 'user',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=319915&backgroundColor=ffdfbf',
    color: '#fa8c16',
  },
  {
    id: '306253',
    name: '杨萍',
    dept: '数据测试部',
    role: 'user',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=306253&backgroundColor=f0f0f0',
    color: '#595959',
  },
  {
    id: '305249',
    name: '单曙兵',
    dept: '数据治理部',
    role: 'user',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=305249&backgroundColor=d9d9d9',
    color: '#8c8c8c',
  },
  {
    id: '302390',
    name: '李焕彰',
    dept: '信息管理部',
    role: 'user',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=302390&backgroundColor=ffe7ba',
    color: '#fa8c16',
  },
  {
    id: '305069',
    name: '舒宝龙',
    dept: '机构服务团队',
    role: 'user',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=305069&backgroundColor=d9f7be',
    color: '#52c41a',
  },
  {
    id: '306844',
    name: '吴证',
    dept: '数据平台部',
    role: 'user',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=306844&backgroundColor=ffd6e7',
    color: '#eb2f96',
  },
  {
    id: '303028',
    name: '白迪',
    dept: '数据平台部',
    role: 'user',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=303028&backgroundColor=ffd6e7',
    color: '#eb2f96',
  },
  {
    id: '319914',
    name: '顾恺',
    dept: '数据开发部',
    role: 'user',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=319914&backgroundColor=fff1b8',
    color: '#faad14',
  },
  {
    id: '302330',
    name: '杨青',
    dept: '数据开发部',
    role: 'user',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=302330&backgroundColor=fff1b8',
    color: '#faad14',
  },
  {
    id: '300523',
    name: '贺文军',
    dept: '信息统计部',
    role: 'user',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=300523&backgroundColor=efdbff',
    color: '#722ed1',
  },
  {
    id: '304105',
    name: '刘异',
    dept: '研发管理部',
    role: 'user',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=304105&backgroundColor=d4b896',
    color: '#ad6800',
  },
  {
    id: '307298',
    name: '胡申民',
    dept: '智能平台部',
    role: 'user',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=307298&backgroundColor=bfbfbf',
    color: '#262626',
  },
  {
    id: '302577',
    name: '杨晓彦',
    dept: '智能应用一部',
    role: 'user',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=302577&backgroundColor=b5f5ec',
    color: '#13c2c2',
  },
  {
    id: '305393',
    name: '陈嘉琳',
    dept: '智能应用二部',
    role: 'user',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=305393&backgroundColor=e6f7ff',
    color: '#1890ff',
  },
];

export const DEPTS = [
  '项目管理',
  '需求管理',
  '架构管理',
  '综合管理部',
  '机构服务团队',
  '信息统计部',
  '信息管理部',
  '数据开发部',
  '数据平台部',
  '数据治理部',
  '数据测试部',
  '智能平台部',
  '研发管理部',
  '智能应用一部',
  '智能应用二部',
];
