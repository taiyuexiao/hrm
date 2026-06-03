/**
 * 知识库类型定义
 */

export interface KnowledgeBaseNode {
  key: string;
  title: string;
  type: 'week' | 'dept' | 'topic' | 'file';
  children?: KnowledgeBaseNode[];
  content?: string; // Markdown内容
  metadata?: {
    week?: string;
    dept?: string;
    author?: string;
    date?: string;
    tags?: string[];
  };
}

export interface KnowledgeBaseStats {
  totalReports: number;
  totalWeeks: number;
  totalDepts: number;
  totalComments: number;
  lastUpdated: string;
  weeks: string[];
  depts: string[];
}

export interface ExportOptions {
  format: 'zip' | 'markdown' | 'json';
  scope: 'all' | 'week' | 'dept' | 'current';
  target?: string; // 周次或科室名
}
