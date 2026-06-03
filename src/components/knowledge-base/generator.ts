/**
 * 知识库生成器 - 将周报数据转换为Markdown格式
 */
import { WeeklyReport } from '../weekly-report-v2/types';
import { KnowledgeBaseNode, KnowledgeBaseStats } from './types';

/**
 * 生成单个周报的Markdown内容
 */
export function generateReportMarkdown(report: WeeklyReport): string {
  const { weekLabel, dept, authorName, plan, content, currentWork, nextPlan, thoughts, other, comments, updatedAt } = report;

  // 计算完成率
  const totalTasks = content.length;
  const completedTasks = content.filter(t => t.checked).length;
  const completionRate = totalTasks > 0 ? ((completedTasks / totalTasks) * 100).toFixed(1) : '0.0';

  // 提取标签
  const tags: string[] = [];
  const text = `${plan} ${currentWork} ${nextPlan} ${other}`;
  const keywords = ['信创', '立项', 'AI', '大模型', '数据治理', '测试', '需求', '架构', '风险', '预算'];
  keywords.forEach(kw => {
    if (text.includes(kw)) tags.push(kw);
  });

  let md = `---
week: ${weekLabel}
dept: ${dept}
author: ${authorName}
updated: ${updatedAt}
tags: [${tags.join(', ')}]
---

# ${dept} - ${weekLabel} 周报

> **周次**: ${weekLabel}
> **作者**: ${authorName}
> **更新时间**: ${new Date(updatedAt).toLocaleString('zh-CN')}

---

## 📋 上周工作计划

`;

  // 上周计划任务列表
  if (content.length > 0) {
    content.forEach(task => {
      const checkbox = task.checked ? '[x]' : '[ ]';
      md += `- ${checkbox} ${task.text}\n`;
    });
    md += `\n**完成率**: ${completionRate}% (${completedTasks}/${totalTasks})\n`;
  } else {
    md += '（无上周计划）\n';
  }

  md += `\n---

## 📝 本周工作内容

`;

  if (currentWork && currentWork.trim()) {
    md += currentWork + '\n';
  } else {
    md += '（无本周工作内容）\n';
  }

  md += `\n---

## 📅 下周工作计划

`;

  if (nextPlan && nextPlan.trim()) {
    md += nextPlan + '\n';
  } else {
    md += '（无下周计划）\n';
  }

  md += `\n---

## 💡 本周心得

`;

  if (thoughts && thoughts.trim()) {
    md += thoughts + '\n';
  } else {
    md += '（无本周心得）\n';
  }

  md += `\n---

## ⚠️ 问题与风险

`;

  if (other && other.trim()) {
    md += other + '\n';
  } else {
    md += '（无问题与风险）\n';
  }

  // 评论部分
  if (comments && comments.length > 0) {
    md += `\n---

## 💬 评论与讨论

`;
    comments.forEach((comment, idx) => {
      md += `\n### 评论 #${idx + 1}
**作者**: ${comment.authorName}
**时间**: ${new Date(comment.createdAt).toLocaleString('zh-CN')}
`;
      if (comment.targetBlock) {
        const blockNames: Record<string, string> = {
          content: '本周工作内容',
          nextPlan: '下周工作计划',
          thoughts: '本周心得',
          other: '问题与风险',
        };
        md += `**针对**: ${blockNames[comment.targetBlock]}`;
        if (comment.targetText) {
          md += ` - "${comment.targetText.substring(0, 30)}..."`;
        }
        md += '\n';
      }
      md += `\n> ${comment.content}\n`;

      // 回复
      if (comment.replies && comment.replies.length > 0) {
        md += '\n**回复**:\n';
        comment.replies.forEach(reply => {
          md += `- **${reply.authorName}** (${new Date(reply.createdAt).toLocaleString('zh-CN')}): ${reply.content}\n`;
        });
      }
    });
  }

  // 数据统计
  md += `\n---

## 📊 数据统计

- **上周计划完成率**: ${completionRate}%
- **本周工作项数**: ${currentWork ? currentWork.split('\n').filter(l => l.trim()).length : 0}
- **风险项数**: ${other ? other.split('\n').filter(l => l.trim() && (l.includes('风险') || l.includes('问题'))).length : 0}
- **评论数**: ${comments ? comments.length : 0}

---

## 🔗 相关链接

- [查看所有周报](../../README.md)
- [${dept}团队时间线](../../by-dept/${dept}/_timeline.md)
`;

  return md;
}

/**
 * 生成周汇总Markdown
 */
export function generateWeekSummaryMarkdown(week: string, reports: WeeklyReport[]): string {
  let md = `---
week: ${week}
teams: ${reports.length}
---

# ${week} 周报汇总

> **周次**: ${week}
> **参与团队**: ${reports.length}个
> **周报数量**: ${reports.length}份

---

## 📊 整体概览

| 科室 | 完成率 | 风险项 | 评论数 |
|------|--------|--------|--------|
`;

  reports.forEach(r => {
    const total = r.content.length;
    const completed = r.content.filter(t => t.checked).length;
    const rate = total > 0 ? ((completed / total) * 100).toFixed(0) : '0';
    const risks = r.other ? r.other.split('\n').filter(l => l.includes('风险') || l.includes('问题')).length : 0;
    const commentCount = r.comments ? r.comments.length : 0;
    md += `| ${r.dept} | ${rate}% | ${risks} | ${commentCount} |\n`;
  });

  md += `\n---

## 🔥 本周亮点

`;

  // 提取完成率高的团队
  const highlights = reports
    .filter(r => {
      const total = r.content.length;
      const completed = r.content.filter(t => t.checked).length;
      return total > 0 && (completed / total) >= 0.8;
    })
    .slice(0, 5);

  if (highlights.length > 0) {
    highlights.forEach((r, idx) => {
      md += `${idx + 1}. **${r.dept}**: 完成率${((r.content.filter(t => t.checked).length / r.content.length) * 100).toFixed(0)}%\n`;
    });
  } else {
    md += '（本周暂无突出亮点）\n';
  }

  md += `\n---

## ⚠️ 重点风险

`;

  // 提取有风险的周报
  const riskyReports = reports.filter(r => r.other && r.other.trim());
  if (riskyReports.length > 0) {
    riskyReports.slice(0, 5).forEach((r, idx) => {
      const firstRisk = r.other.split('\n').find(l => l.trim());
      if (firstRisk) {
        md += `${idx + 1}. **${r.dept}**: ${firstRisk.substring(0, 100)}...\n`;
      }
    });
  } else {
    md += '（本周无重点风险）\n';
  }

  md += `\n---

## 🔗 详细周报

`;

  reports.forEach(r => {
    md += `- [${r.dept}](./${r.dept}.md)\n`;
  });

  return md;
}

/**
 * 生成团队时间线Markdown
 */
export function generateDeptTimelineMarkdown(dept: string, reports: WeeklyReport[]): string {
  const sortedReports = [...reports].sort((a, b) => a.weekLabel.localeCompare(b.weekLabel));

  let md = `---
dept: ${dept}
weeks: [${sortedReports.map(r => r.weekLabel).join(', ')}]
---

# ${dept}团队 - 工作时间线

> **团队**: ${dept}
> **周报数量**: ${sortedReports.length}份
> **时间跨度**: ${sortedReports[0]?.weekLabel} ~ ${sortedReports[sortedReports.length - 1]?.weekLabel}

---

## 📅 时间线索引

| 周次 | 完成率 | 风险项 | 评论数 | 链接 |
|------|--------|--------|--------|------|
`;

  sortedReports.forEach(r => {
    const total = r.content.length;
    const completed = r.content.filter(t => t.checked).length;
    const rate = total > 0 ? ((completed / total) * 100).toFixed(0) : '0';
    const risks = r.other ? r.other.split('\n').filter(l => l.includes('风险') || l.includes('问题')).length : 0;
    const commentCount = r.comments ? r.comments.length : 0;
    md += `| ${r.weekLabel} | ${rate}% | ${risks} | ${commentCount} | [查看详情](./${r.weekLabel}.md) |\n`;
  });

  md += `\n---

## 📊 数据趋势

### 完成率变化
\`\`\`
`;

  sortedReports.forEach(r => {
    const total = r.content.length;
    const completed = r.content.filter(t => t.checked).length;
    const rate = total > 0 ? Math.round((completed / total) * 100) : 0;
    const bars = '█'.repeat(Math.floor(rate / 10)) + '░'.repeat(10 - Math.floor(rate / 10));
    md += `${r.weekLabel}: ${rate}% ${bars}\n`;
  });

  md += `\`\`\`

### 风险项变化
\`\`\`
`;

  sortedReports.forEach(r => {
    const risks = r.other ? r.other.split('\n').filter(l => l.includes('风险') || l.includes('问题')).length : 0;
    const warnings = '⚠️'.repeat(risks);
    md += `${r.weekLabel}: ${risks}项 ${warnings}\n`;
  });

  md += `\`\`\`

---

## 🔗 相关文档

- [按周查看](../../by-week/)
- [主题索引](../../by-topic/)
`;

  return md;
}

/**
 * 生成主题索引Markdown
 */
export function generateTopicIndexMarkdown(topic: string, reports: WeeklyReport[]): string {
  let md = `---
topic: ${topic}
reports: ${reports.length}
---

# 主题: ${topic}

> **关键词**: ${topic}
> **相关周报**: ${reports.length}份
> **涉及团队**: ${new Set(reports.map(r => r.dept)).size}个

---

## 📋 相关周报片段

`;

  reports.forEach(r => {
    const text = `${r.plan} ${r.currentWork} ${r.nextPlan} ${r.other}`;
    const lines = text.split('\n').filter(l => l.includes(topic));

    if (lines.length > 0) {
      md += `\n### ${r.weekLabel} - ${r.dept}

> ${lines[0].substring(0, 200)}...

[查看完整周报](../../by-week/${r.weekLabel}/${r.dept}.md)

---
`;
    }
  });

  md += `\n## 📊 统计分析

### 按周次分布
`;

  const byWeek = reports.reduce((acc, r) => {
    acc[r.weekLabel] = (acc[r.weekLabel] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  Object.entries(byWeek).sort().forEach(([week, count]) => {
    md += `- ${week}: ${count}份\n`;
  });

  md += `\n### 按团队分布
`;

  const byDept = reports.reduce((acc, r) => {
    acc[r.dept] = (acc[r.dept] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  Object.entries(byDept).sort((a, b) => b[1] - a[1]).forEach(([dept, count]) => {
    md += `- ${dept}: ${count}份\n`;
  });

  return md;
}

/**
 * 构建知识库树形结构
 */
export function buildKnowledgeBaseTree(reports: WeeklyReport[]): KnowledgeBaseNode[] {
  const tree: KnowledgeBaseNode[] = [];

  // 1. 按周次分组
  const byWeekNode: KnowledgeBaseNode = {
    key: 'by-week',
    title: '📅 按周次',
    type: 'week',
    children: [],
  };

  const weekGroups = reports.reduce((acc, r) => {
    if (!acc[r.weekLabel]) acc[r.weekLabel] = [];
    acc[r.weekLabel].push(r);
    return acc;
  }, {} as Record<string, WeeklyReport[]>);

  Object.entries(weekGroups).sort().forEach(([week, weekReports]) => {
    const weekNode: KnowledgeBaseNode = {
      key: `week-${week}`,
      title: week,
      type: 'week',
      children: [
        {
          key: `week-${week}-summary`,
          title: '📊 周汇总',
          type: 'file',
          content: generateWeekSummaryMarkdown(week, weekReports),
          metadata: { week },
        },
        ...weekReports.map(r => ({
          key: `week-${week}-${r.dept}`,
          title: r.dept,
          type: 'file' as const,
          content: generateReportMarkdown(r),
          metadata: {
            week: r.weekLabel,
            dept: r.dept,
            author: r.authorName,
            date: r.updatedAt,
          },
        })),
      ],
    };
    byWeekNode.children!.push(weekNode);
  });

  tree.push(byWeekNode);

  // 2. 按科室分组
  const byDeptNode: KnowledgeBaseNode = {
    key: 'by-dept',
    title: '🏢 按科室',
    type: 'dept',
    children: [],
  };

  const deptGroups = reports.reduce((acc, r) => {
    if (!acc[r.dept]) acc[r.dept] = [];
    acc[r.dept].push(r);
    return acc;
  }, {} as Record<string, WeeklyReport[]>);

  Object.entries(deptGroups).sort().forEach(([dept, deptReports]) => {
    const sortedReports = deptReports.sort((a, b) => a.weekLabel.localeCompare(b.weekLabel));
    const deptNode: KnowledgeBaseNode = {
      key: `dept-${dept}`,
      title: dept,
      type: 'dept',
      children: [
        {
          key: `dept-${dept}-timeline`,
          title: '📈 时间线',
          type: 'file',
          content: generateDeptTimelineMarkdown(dept, sortedReports),
          metadata: { dept },
        },
        ...sortedReports.map(r => ({
          key: `dept-${dept}-${r.weekLabel}`,
          title: r.weekLabel,
          type: 'file' as const,
          content: generateReportMarkdown(r),
          metadata: {
            week: r.weekLabel,
            dept: r.dept,
            author: r.authorName,
            date: r.updatedAt,
          },
        })),
      ],
    };
    byDeptNode.children!.push(deptNode);
  });

  tree.push(byDeptNode);

  // 3. 按主题分组
  const byTopicNode: KnowledgeBaseNode = {
    key: 'by-topic',
    title: '🏷️ 按主题',
    type: 'topic',
    children: [],
  };

  const keywords = ['信创', '立项', 'AI', '大模型', '数据治理', '测试', '需求', '架构', '风险', '预算'];
  const topicGroups: Record<string, WeeklyReport[]> = {};

  keywords.forEach(kw => {
    topicGroups[kw] = reports.filter(r => {
      const text = `${r.plan} ${r.currentWork} ${r.nextPlan} ${r.other}`;
      return text.includes(kw);
    });
  });

  Object.entries(topicGroups)
    .filter(([_, reports]) => reports.length > 0)
    .sort((a, b) => b[1].length - a[1].length)
    .forEach(([topic, topicReports]) => {
      const topicNode: KnowledgeBaseNode = {
        key: `topic-${topic}`,
        title: `${topic} (${topicReports.length})`,
        type: 'topic',
        content: generateTopicIndexMarkdown(topic, topicReports),
      };
      byTopicNode.children!.push(topicNode);
    });

  tree.push(byTopicNode);

  return tree;
}

/**
 * 生成知识库统计信息
 */
export function generateKnowledgeBaseStats(reports: WeeklyReport[]): KnowledgeBaseStats {
  const weeks = [...new Set(reports.map(r => r.weekLabel))].sort();
  const depts = [...new Set(reports.map(r => r.dept))].sort();
  const totalComments = reports.reduce((sum, r) => sum + (r.comments?.length || 0), 0);
  const lastUpdated = reports.reduce((latest, r) => {
    return r.updatedAt > latest ? r.updatedAt : latest;
  }, reports[0]?.updatedAt || new Date().toISOString());

  return {
    totalReports: reports.length,
    totalWeeks: weeks.length,
    totalDepts: depts.length,
    totalComments,
    lastUpdated,
    weeks,
    depts,
  };
}
