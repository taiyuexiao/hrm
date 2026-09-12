import assert from 'node:assert';
import { parseHierarchicalText, parseTaskHierarchy } from '../src/components/weekly-report-v2/task-parser.ts';

function toPlain(nodes) {
  return nodes.map(n => {
    const out = { text: n.text };
    if (n.children?.length) out.children = toPlain(n.children);
    return out;
  });
}

function assertTree(text, expected) {
  const got = parseHierarchicalText(text);
  try {
    assert.deepStrictEqual(toPlain(got), expected);
    console.log('✅ pass:', JSON.stringify(text).slice(0, 60));
  } catch (e) {
    console.log('❌ fail for:', JSON.stringify(text));
    console.log('expected:', JSON.stringify(expected));
    console.log('got:', JSON.stringify(toPlain(got)));
    throw e;
  }
}

function assertHierarchy(text, expectedRootText, expectedChildren) {
  const got = parseTaskHierarchy(text);
  try {
    assert.strictEqual(got?.rootText, expectedRootText);
    assert.deepStrictEqual(toPlain(got?.children || []), expectedChildren);
    console.log('✅ pass hierarchy:', JSON.stringify(text).slice(0, 60));
  } catch (e) {
    console.log('❌ fail hierarchy for:', JSON.stringify(text));
    console.log('expected root:', expectedRootText, 'children:', JSON.stringify(expectedChildren));
    console.log('got:', JSON.stringify({ rootText: got?.rootText, children: toPlain(got?.children || []) }));
    throw e;
  }
}

// 核心样例
assertTree(
  '一、今天吃什么1.今天早饭吃鸡蛋2.中饭吃汉堡',
  [{ text: '今天吃什么', children: [{ text: '今天早饭吃鸡蛋' }, { text: '中饭吃汉堡' }] }]
);

assertTree(
  '1. 完成A\n（1）子任务1\n（2）子任务2\n2. 完成B',
  [
    { text: '完成A', children: [{ text: '子任务1' }, { text: '子任务2' }] },
    { text: '完成B' },
  ]
);

assertTree('1.完成A 2.完成B', [{ text: '完成A' }, { text: '完成B' }]);
assertTree('1. A\n（1）B\n1）C', [{ text: 'A', children: [{ text: 'B', children: [{ text: 'C' }] }] }]);
assertTree('一、A\n（一）B\n①C', [{ text: 'A', children: [{ text: 'B', children: [{ text: 'C' }] }] }]);
assertTree('1. A\n补充说明\n2. B', [{ text: 'A 补充说明' }, { text: 'B' }]);
assertTree('1. A\n详见 2. B', [{ text: 'A 详见' }, { text: 'B' }]);
assertTree('1. 完成2.0版本', [{ text: '完成2.0版本' }]);
assertTree('1. A\na. B\n(i) C', [{ text: 'A', children: [{ text: 'B', children: [{ text: 'C' }] }] }]);
assertTree(
  '一、目标1.短期2.长期（1）第一季度（2）第二季度',
  [{ text: '目标', children: [{ text: '短期' }, { text: '长期', children: [{ text: '第一季度' }, { text: '第二季度' }] }] }]
);
assertTree('1. A 2. B\n（1） C', [{ text: 'A' }, { text: 'B', children: [{ text: 'C' }] }]);

// 编号体系 corner cases
assertTree('A. 任务A\nB. 任务B', [{ text: '任务A' }, { text: '任务B' }]);
assertTree('1) A\n2) B', [{ text: 'A' }, { text: 'B' }]);
assertTree('一）A\n二）B', [{ text: 'A' }, { text: 'B' }]);
assertTree('① A\n② B\n③ C', [{ text: 'A' }, { text: 'B' }, { text: 'C' }]);
assertTree('1、A\n2、B', [{ text: 'A' }, { text: 'B' }]);
assertTree('十一、A\n十二、B', [{ text: 'A' }, { text: 'B' }]);
assertTree('100. A\n101. B', [{ text: 'A' }, { text: 'B' }]);
assertTree('I. A\nII. B', [{ text: 'A' }, { text: 'B' }]);
assertTree('i. A\nii. B', [{ text: 'A' }, { text: 'B' }]);

// 动态层级 / 混合格式
assertTree('一、A\n1. B\n2. C', [{ text: 'A', children: [{ text: 'B' }, { text: 'C' }] }]);
assertTree('1. A\na. B\n2. C', [{ text: 'A', children: [{ text: 'B' }] }, { text: 'C' }]);
assertTree('1. A\n（1） B\n（一） C', [{ text: 'A', children: [{ text: 'B' }, { text: 'C' }] }]);
assertTree('1. A\na. B\ni. C', [{ text: 'A', children: [{ text: 'B' }, { text: 'C' }] }]);
assertTree('1. A\n（1） B\n1） C', [{ text: 'A', children: [{ text: 'B', children: [{ text: 'C' }] }] }]);

// 单行紧凑 & 无空格
assertTree('任务1.A 2.B', [{ text: '任务', children: [{ text: 'A' }, { text: 'B' }] }]);
assertTree('1.A 2.B', [{ text: 'A' }, { text: 'B' }]);
assertTree('1. A a. B b. C', [{ text: 'A', children: [{ text: 'B' }, { text: 'C' }] }]);
assertTree('1. A （1） B 2. C', [{ text: 'A', children: [{ text: 'B' }] }, { text: 'C' }]);

// 非编号文本不被误拆
assertTree('访问 www.example.com 网站\n1. 任务A', [{ text: '访问 www.example.com 网站' }, { text: '任务A' }]);
assertTree('升级 v1.2.3\n1. 任务A', [{ text: '升级 v1.2.3' }, { text: '任务A' }]);
assertTree('成本 1.5 元\n2. 任务A', [{ text: '成本 1.5 元' }, { text: '任务A' }]);
assertTree('2024.01.01 发布\n1. A', [{ text: '2024.01.01 发布' }, { text: 'A' }]);
assertTree('联系 user.name@example.com\n1. A', [{ text: '联系 user.name@example.com' }, { text: 'A' }]);
assertTree('重要（紧急）\n1. A', [{ text: '重要（紧急）' }, { text: 'A' }]);

// 前言、空行、无文本标记
// 段落标题：后随 ≥2 个同级序号项的无序号行，序号项挂到标题下
assertTree('本周工作\n1. A\n2. B', [{ text: '本周工作', children: [{ text: 'A' }, { text: 'B' }] }]);
assertTree('1. A\n\n2. B', [{ text: 'A' }, { text: 'B' }]);
assertTree('1. \n2. B', [{ text: 'B' }]);
assertTree('1. A\r\n2. B', [{ text: 'A' }, { text: 'B' }]);

// 空行分段：空行后的无序号行开启新根任务，不再合并进上一个任务
assertTree('1. A\n\n补充说明', [{ text: 'A' }, { text: '补充说明' }]);

// 多段落 + 无序号标题（标题后随 ≥2 个同级序号 → 嵌套；只随 1 个 → 保持兄弟）
assertTree(
  '这是一个没有序号的标题\n1.这是第一部分\n（1）这是第一部分的第一小节\n（2）这是第一部分的第二小节\n2.这是第二部分\n\n这是没有标题的第二段\n1. 第二段测试\n2.第二个',
  [
    {
      text: '这是一个没有序号的标题',
      children: [
        { text: '这是第一部分', children: [{ text: '这是第一部分的第一小节' }, { text: '这是第一部分的第二小节' }] },
        { text: '这是第二部分' },
      ],
    },
    { text: '这是没有标题的第二段', children: [{ text: '第二段测试' }, { text: '第二个' }] },
  ]
);

// 单行紧凑混合序号：行内同族序号回到同一层级，不随种族切换越嵌越深
assertTree(
  '1.xxxxxxx（1）kkkkk（2）ssssss\n2.yyyyyyy（1）ssssss 1）wwwwww 2）iiiiii （2）是生生世世',
  [
    { text: 'xxxxxxx', children: [{ text: 'kkkkk' }, { text: 'ssssss' }] },
    {
      text: 'yyyyyyy',
      children: [
        { text: 'ssssss', children: [{ text: 'wwwwww' }, { text: 'iiiiii' }] },
        { text: '是生生世世' },
      ],
    },
  ]
);

// Markdown 项目符号
assertTree('* A\n* B\n- C\n+ D', [{ text: 'A' }, { text: 'B' }, { text: 'C' }, { text: 'D' }]);
assertTree('* A\n  1. B\n  2. C', [{ text: 'A', children: [{ text: 'B' }, { text: 'C' }] }]);

// TaskTree 专用入口
assertHierarchy('主要工作 1. xxx 2. yyy', '主要工作', [{ text: 'xxx' }, { text: 'yyy' }]);
assertHierarchy('1. 任务A\n（1）子1\n（2）子2\n2. 任务B', '任务A', [{ text: '子1' }, { text: '子2' }, { text: '任务B' }]);
assertHierarchy('任务A\n1. B\n2. C', '任务A', [{ text: 'B' }, { text: 'C' }]);
assertHierarchy('1. A 2. B', 'A', [{ text: 'B' }]);

console.log('\n✅ 所有测试通过');
