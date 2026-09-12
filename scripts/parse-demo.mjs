import { parseHierarchicalText } from '../src/components/weekly-report-v2/task-parser.ts';

const text = `手机银行项目组
1. 完成5.0版本需求评审
（1）整理评审意见23条并逐条确认
（2）输出评审纪要和修改清单
2. 推进转账模块开发
（1）完成大额转账风控规则联调
（2）修复UAT环境缺陷8个

对公BP工作
1. 拜访重点客户3家，收集代发工资需求
2. 跟进XX公司授信审批流程
（1）协调风控部门补充材料
（2）预计下周三出审批结果

本周临时事项
1.参加季度安全培训 2.完成合规考试`;

function print(nodes, indent = '') {
  for (const n of nodes) {
    console.log(indent + '• ' + n.text);
    if (n.children?.length) print(n.children, indent + '    ');
  }
}
print(parseHierarchicalText(text));
