/**
 * 知识库导出工具
 */
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import { WeeklyReport } from '../weekly-report-v2/types';
import { ExportOptions } from './types';
import {
  generateReportMarkdown,
  generateWeekSummaryMarkdown,
  generateDeptTimelineMarkdown,
  generateTopicIndexMarkdown,
} from './generator';

/**
 * 导出为ZIP文件（完整目录结构）
 */
export async function exportAsZip(reports: WeeklyReport[], options: ExportOptions): Promise<void> {
  const zip = new JSZip();

  // 根据scope筛选报告
  let filteredReports = reports;
  if (options.scope === 'week' && options.target) {
    filteredReports = reports.filter(r => r.weekLabel === options.target);
  } else if (options.scope === 'dept' && options.target) {
    filteredReports = reports.filter(r => r.dept === options.target);
  }

  // 1. 创建README
  const readme = generateReadme(filteredReports);
  zip.file('README.md', readme);

  // 2. 创建metadata.json
  const metadata = {
    generated_at: new Date().toISOString(),
    total_reports: filteredReports.length,
    weeks: [...new Set(filteredReports.map(r => r.weekLabel))].sort(),
    depts: [...new Set(filteredReports.map(r => r.dept))].sort(),
  };
  zip.file('metadata.json', JSON.stringify(metadata, null, 2));

  // 3. 按周次归档
  const byWeekFolder = zip.folder('by-week');
  const weekGroups = filteredReports.reduce((acc, r) => {
    if (!acc[r.weekLabel]) acc[r.weekLabel] = [];
    acc[r.weekLabel].push(r);
    return acc;
  }, {} as Record<string, WeeklyReport[]>);

  for (const [week, weekReports] of Object.entries(weekGroups)) {
    const weekFolder = byWeekFolder!.folder(week);

    // 周汇总
    weekFolder!.file('_summary.md', generateWeekSummaryMarkdown(week, weekReports));

    // 各科室周报
    weekReports.forEach(r => {
      weekFolder!.file(`${r.dept}.md`, generateReportMarkdown(r));
    });
  }

  // 4. 按科室归档
  const byDeptFolder = zip.folder('by-dept');
  const deptGroups = filteredReports.reduce((acc, r) => {
    if (!acc[r.dept]) acc[r.dept] = [];
    acc[r.dept].push(r);
    return acc;
  }, {} as Record<string, WeeklyReport[]>);

  for (const [dept, deptReports] of Object.entries(deptGroups)) {
    const deptFolder = byDeptFolder!.folder(dept);
    const sortedReports = deptReports.sort((a, b) => a.weekLabel.localeCompare(b.weekLabel));

    // 时间线
    deptFolder!.file('_timeline.md', generateDeptTimelineMarkdown(dept, sortedReports));

    // 各周周报
    sortedReports.forEach(r => {
      deptFolder!.file(`${r.weekLabel}.md`, generateReportMarkdown(r));
    });
  }

  // 5. 按主题归档
  const byTopicFolder = zip.folder('by-topic');
  const keywords = ['信创', '立项', 'AI', '大模型', '数据治理', '测试', '需求', '架构', '风险', '预算'];

  keywords.forEach(kw => {
    const topicReports = filteredReports.filter(r => {
      const text = `${r.plan} ${r.currentWork} ${r.nextPlan} ${r.other}`;
      return text.includes(kw);
    });

    if (topicReports.length > 0) {
      const topicFolder = byTopicFolder!.folder(kw);
      topicFolder!.file('related-reports.md', generateTopicIndexMarkdown(kw, topicReports));
    }
  });

  // 生成ZIP并下载
  const blob = await zip.generateAsync({ type: 'blob' });
  const filename = options.scope === 'all'
    ? `周报知识库_${new Date().toISOString().slice(0, 10)}.zip`
    : `周报知识库_${options.target}_${new Date().toISOString().slice(0, 10)}.zip`;

  saveAs(blob, filename);
}

/**
 * 导出为单个Markdown文件
 */
export function exportAsMarkdown(reports: WeeklyReport[], options: ExportOptions): void {
  let content = '';

  // 根据scope筛选报告
  let filteredReports = reports;
  let title = '周报知识库';

  if (options.scope === 'week' && options.target) {
    filteredReports = reports.filter(r => r.weekLabel === options.target);
    title = `${options.target} 周报汇总`;
  } else if (options.scope === 'dept' && options.target) {
    filteredReports = reports.filter(r => r.dept === options.target);
    title = `${options.target} 团队周报`;
  } else if (options.scope === 'current') {
    // 当前查看的单个文档
    filteredReports = [reports[0]];
    title = `${reports[0].dept} - ${reports[0].weekLabel}`;
  }

  // 生成标题
  content += `# ${title}\n\n`;
  content += `> 生成时间: ${new Date().toLocaleString('zh-CN')}\n`;
  content += `> 周报数量: ${filteredReports.length}份\n\n`;
  content += `---\n\n`;

  // 生成目录
  content += `## 目录\n\n`;
  filteredReports.forEach((r, idx) => {
    content += `${idx + 1}. [${r.dept} - ${r.weekLabel}](#${idx + 1}-${r.dept.replace(/\s/g, '-')}-${r.weekLabel})\n`;
  });
  content += `\n---\n\n`;

  // 生成各周报内容
  filteredReports.forEach((r, idx) => {
    content += `<div id="${idx + 1}-${r.dept.replace(/\s/g, '-')}-${r.weekLabel}"></div>\n\n`;
    content += generateReportMarkdown(r);
    content += `\n\n---\n\n`;
  });

  // 下载
  const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
  const filename = options.scope === 'current'
    ? `${filteredReports[0].dept}_${filteredReports[0].weekLabel}.md`
    : `${title}_${new Date().toISOString().slice(0, 10)}.md`;

  saveAs(blob, filename);
}

/**
 * 导出为JSON文件
 */
export function exportAsJson(reports: WeeklyReport[], options: ExportOptions): void {
  // 根据scope筛选报告
  let filteredReports = reports;

  if (options.scope === 'week' && options.target) {
    filteredReports = reports.filter(r => r.weekLabel === options.target);
  } else if (options.scope === 'dept' && options.target) {
    filteredReports = reports.filter(r => r.dept === options.target);
  } else if (options.scope === 'current') {
    filteredReports = [reports[0]];
  }

  const data = {
    metadata: {
      generated_at: new Date().toISOString(),
      total_reports: filteredReports.length,
      weeks: [...new Set(filteredReports.map(r => r.weekLabel))].sort(),
      depts: [...new Set(filteredReports.map(r => r.dept))].sort(),
    },
    reports: filteredReports,
  };

  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json;charset=utf-8' });
  const filename = options.scope === 'all'
    ? `周报数据_${new Date().toISOString().slice(0, 10)}.json`
    : `周报数据_${options.target}_${new Date().toISOString().slice(0, 10)}.json`;

  saveAs(blob, filename);
}

/**
 * 生成README内容
 */
function generateReadme(reports: WeeklyReport[]): string {
  const weeks = [...new Set(reports.map(r => r.weekLabel))].sort();
  const depts = [...new Set(reports.map(r => r.dept))].sort();

  return `# 周报知识库

> 生成时间: ${new Date().toLocaleString('zh-CN')}

## 📊 统计概览

- **总周报数**: ${reports.length}
- **覆盖周次**: ${weeks.length}周 (${weeks[0]} ~ ${weeks[weeks.length - 1]})
- **参与团队**: ${depts.length}个
- **总评论数**: ${reports.reduce((sum, r) => sum + (r.comments?.length || 0), 0)}

## 📁 目录结构

\`\`\`
knowledge-base/
├── README.md                    # 本文件
├── metadata.json                # 元数据
├── by-week/                     # 按周次归档
│   ├── ${weeks[0]}/
│   │   ├── _summary.md         # 周汇总
│   │   ├── ${depts[0]}.md
│   │   └── ...
│   └── ...
├── by-dept/                     # 按科室归档
│   ├── ${depts[0]}/
│   │   ├── _timeline.md        # 时间线
│   │   ├── ${weeks[0]}.md
│   │   └── ...
│   └── ...
└── by-topic/                    # 按主题归档
    ├── 信创/
    ├── 立项/
    └── ...
\`\`\`

## 🚀 使用指南

### 按周次查看
进入 \`by-week/{周次}/\` 目录，查看该周所有团队的周报。

### 按科室查看
进入 \`by-dept/{科室}/\` 目录，查看该团队的历史周报和时间线。

### 按主题查看
进入 \`by-topic/{主题}/\` 目录，查看包含该主题的所有周报片段。

## 📝 文档格式说明

每个周报文档包含以下部分：
- 📋 上周工作计划（带完成状态）
- 📝 本周工作内容
- 📅 下周工作计划
- ⚠️ 问题与风险
- 💡 其他（本周管理心得 / AI推广案例/心得）
- 💬 评论与讨论
- 📊 数据统计

## 🔍 搜索建议

使用文本搜索工具（如grep、ripgrep）快速查找关键词：

\`\`\`bash
# 搜索包含"信创"的所有周报
grep -r "信创" by-week/

# 搜索某个团队的所有风险项
grep -r "风险" by-dept/项目管理/
\`\`\`

## 📞 技术支持

如有问题，请联系数据部技术支持团队。
`;
}
