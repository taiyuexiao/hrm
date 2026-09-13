/**
 * 智能解析填入：整段文字按栏目标题识别拆段（本地规则，与周报 04/05 的本地解析同思路）
 * 规则参数化：新人日报与 mentor 带教报告共用一套算法、各自一套标题规则。
 * 命中多个规则时按数组顺序优先（把「下周任务」排在「小组任务」前，避免误吞）。
 */

export interface ParseRule {
  re: RegExp;
  key: string;
}

export function parsePlainText(
  text: string,
  rules: ParseRule[],
  sectionKeys: string[],
  fallbackKey: string,
): Record<string, string> {
  const out: Record<string, string[]> = {};
  sectionKeys.forEach(k => { out[k] = []; });
  let current = fallbackKey;
  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (!line) continue;
    let matched = false;
    for (const { re, key } of rules) {
      if (re.test(line)) {
        current = key;
        const rest = line.replace(re, '').trim();
        if (rest) out[key].push(rest);
        matched = true;
        break;
      }
    }
    if (!matched) out[current].push(line);
  }
  const result: Record<string, string> = {};
  for (const k of sectionKeys) result[k] = out[k].join('\n');
  return result;
}

/** 新人报告（日/周/月通用，标题同义词尽量覆盖） */
export const NEWBIE_PARSE_RULES: ParseRule[] = [
  { re: /^(明日|明天|下周|下月)(的)?(学习|工作|计划|安排)?[:：]?\s*/, key: 'tomorrow' },
  { re: /^(今日|今天|本周|这周|本月|这月)(的)?(学习|工作内容|工作|进展|内容)?[:：]?\s*/, key: 'today' },
  { re: /^(遇到(的)?问题|问题|困难|困惑|问题与困难)[:：]?\s*/, key: 'problems' },
  { re: /^(手头(的)?(学习及工作|学习|工作)?(任务)?|待办(事项)?|任务清单)[:：]?\s*/, key: 'ongoing' },
];

/** mentor 小组报告解析规则（顺序敏感：下周/下月任务必须排在小组任务前） */
export const MENTOR_GROUP_PARSE_RULES: ParseRule[] = [
  { re: /^(下周|下月)(的)?(小组)?任务[:：]?\s*/, key: 'nextTasks' },
  { re: /^(本周|本月|这周)?(的)?小组任务[:：]?\s*/, key: 'groupTasks' },
  { re: /^(本周|本月)?(的)?(培养内容|阅读指标)(达成(情况|评估))?[:：]?\s*/, key: 'training' },
  { re: /^(本周|本月)?(的)?(新人)?(整体情况|资产沉淀(情况)?)[:：]?\s*/, key: 'overall' },
  { re: /^(本周|本月)?(的)?(培养)?(遇到的)?问题(和|与)?(调整(方向|措施)?)?[:：]?\s*/, key: 'issues' },
];

/** mentor 个人报告解析规则（顺序敏感：「如何指导其改进」必须排在「需要改进」前） */
export const MENTOR_PERSON_PARSE_RULES: ParseRule[] = [
  { re: /^(如何指导(其|他|她)?改进|指导(方式|措施|方法))[:：]?\s*/, key: 'guidance' },
  { re: /^((带教)?学员)?特质[:：]?\s*/, key: 'traits' },
  { re: /^(本周|本月)?(的)?进步[:：]?\s*/, key: 'progress' },
  { re: /^(本周|本月)?(的)?(需要|待)改进[:：]?\s*/, key: 'improve' },
  { re: /^((还有什么|其他)?问题)?无法解决(的问题)?[:：]?\s*/, key: 'unsolved' },
];
