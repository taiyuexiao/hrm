import type { TaskItem } from './types';

function genId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

interface MarkerDef {
  name: string;
  pattern: string;
  rank: number;
  flags?: string;
}

/**
 * 支持的层级标记：
 * - rank 0：根级点号/顿号（1. / 1、 / 一、）
 * - rank 1：字母/罗马点号（a. / i.）
 * - rank 2：括号标记（（1）/（一）/（a））
 * - rank 3：右括号/带圈数字（1）/①）
 */
const MARKER_DEFS: MarkerDef[] = [
  { name: 'paren-letter', pattern: '[（(][a-zA-Z][）)]', rank: 2 },
  { name: 'paren-arabic', pattern: '[（(]\\d{1,3}[）)]', rank: 2 },
  { name: 'paren-chinese', pattern: '[（(][一二三四五六七八九十]+[）)]', rank: 2 },
  { name: 'right-paren-arabic', pattern: '\\d{1,3}[）)]', rank: 3 },
  { name: 'right-paren-chinese', pattern: '[一二三四五六七八九十]+[）)]', rank: 3 },
  { name: 'circled', pattern: '[①②③④⑤⑥⑦⑧⑨⑩]', rank: 3 },
  { name: 'roman-dot', pattern: '[ivxlcdm]+[\\.．。](?!\\d)', rank: 1, flags: 'i' },
  { name: 'letter-dot', pattern: '[a-zA-Z][\\.．。](?!\\d)', rank: 1 },
  { name: 'chinese-dot', pattern: '[一二三四五六七八九十]+[\\.．、](?!\\d)', rank: 0 },
  { name: 'arabic-dot', pattern: '\\d{1,3}[\\.．、](?!\\d)', rank: 0 },
  { name: 'bullet', pattern: '^[-*+·]\\s+', rank: 0 },
];

const MARKER_PATTERNS = MARKER_DEFS.map(d => ({ ...d, regex: new RegExp(`^${d.pattern}`, d.flags || '') }));

const INLINE_MARKER_REGEX = new RegExp(
  `(${MARKER_DEFS.map(d => `(?:${d.pattern})`).join('|')})(?=\\s*\\S)`,
  'gi'
);

interface Segment {
  marker: string;
  text: string;
  family: string;
  group: string;
  rank: number;
  effRank?: number;
}

interface SplitResult {
  prefix: string;
  segments: Segment[];
  startsWithMarker: boolean;
  hasMarker: boolean;
}

function matchMarker(text: string): MarkerDef | null {
  for (const p of MARKER_PATTERNS) {
    const m = text.match(p.regex);
    if (m) return { name: p.name, pattern: p.pattern, rank: p.rank };
  }
  return null;
}

function familyGroup(family: string): string {
  if (family.startsWith('paren-')) return 'paren';
  if (family.startsWith('right-paren-')) return 'right-paren';
  if (family === 'letter-dot' || family === 'roman-dot') return 'alpha-dot';
  return family;
}

const DOT_FAMILIES = new Set(['arabic-dot', 'chinese-dot', 'letter-dot', 'roman-dot']);

// 避免在英文单词、URL、版本号中间误拆点号标记，如 www.example.com / v1.0 / A1. B
function isMarkerBoundaryAllowed(line: string, matchStart: number, family: string): boolean {
  if (matchStart === 0) return true;
  const prev = line[matchStart - 1];
  if (/\s/.test(prev)) return true;
  if (DOT_FAMILIES.has(family) && /[a-zA-Z0-9]/.test(prev)) return false;
  return true;
}

function splitLine(line: string): SplitResult {
  INLINE_MARKER_REGEX.lastIndex = 0;
  const rawMatches: { start: number; end: number; marker: string }[] = [];
  let m;
  while ((m = INLINE_MARKER_REGEX.exec(line)) !== null) {
    rawMatches.push({ start: m.index, end: INLINE_MARKER_REGEX.lastIndex, marker: m[1] });
  }

  const matches = rawMatches.filter(match => {
    const info = matchMarker(match.marker);
    return info && isMarkerBoundaryAllowed(line, match.start, info.name);
  });

  const trimmed = line.trim();
  const isMarkerOnly = MARKER_PATTERNS.some(p => {
    const m = trimmed.match(p.regex);
    return m && trimmed.slice(m[0].length).trim() === '';
  });

  if (matches.length === 0) {
    return { prefix: trimmed, segments: [], startsWithMarker: false, hasMarker: isMarkerOnly };
  }

  const prefix = line.slice(0, matches[0].start).trim();
  const segments: Segment[] = [];
  for (let i = 0; i < matches.length; i++) {
    const textStart = matches[i].end;
    const textEnd = i + 1 < matches.length ? matches[i + 1].start : line.length;
    const text = line.slice(textStart, textEnd).trim();
    if (!text) continue;
    const info = matchMarker(matches[i].marker);
    if (info) {
      segments.push({ marker: matches[i].marker, text, family: info.name, group: familyGroup(info.name), rank: info.rank });
    }
  }
  return { prefix, segments, startsWithMarker: prefix === '', hasMarker: isMarkerOnly };
}

function findLastLeaf(node: TaskItem): TaskItem {
  if (!node.children || node.children.length === 0) return node;
  return findLastLeaf(node.children[node.children.length - 1]);
}

/**
 * 通用层级文本解析器。
 * 支持任意混合格式、单行紧凑列表、有无空格、中文/阿拉伯/括号/带圈/字母等编号体系，
 * 并且不会把 1.5 这样的小数误拆成任务。
 *
 * 段落规则：
 * - 空行是段落分隔符：空行后的无序号行开启新的根任务，而不是合并进上一个任务；
 * - 段落开头（首行或空行后）的无序号行，若其后紧跟 ≥2 个同级序号项，则视为段落标题，
 *   后续序号任务挂到它下面（如 "标题\n1. A\n2. B" → 标题为父，A/B 为子）；
 * - 行内同族序号回到本行已有的层级（如 "（1）a 1）b （2）c" 中（2）与（1）同级），
 *   不会随标记种族切换越嵌越深。
 */
export function parseHierarchicalText(text: string): TaskItem[] {
  if (!text || !text.trim()) return [];
  // 保留空行信息：记录每条内容行之前是否隔着空行（段落分隔）
  const lines: { text: string; blankBefore: boolean }[] = [];
  let sawBlank = false;
  for (const raw of text.split(/\r?\n/)) {
    const t = raw.trim();
    if (!t) {
      sawBlank = true;
      continue;
    }
    lines.push({ text: t, blankBefore: sawBlank });
    sawBlank = false;
  }
  const root: TaskItem = { id: genId(), text: '', checked: false, children: [] };
  const stack: { node: TaskItem; rank: number }[] = [{ node: root, rank: -1 }];
  let lastLeaf: TaskItem | null = null;
  let lastLineStart: { family: string; group: string; rank: number } | null = null;
  const familyRank = new Map<string, number>();
  let nextFamilyRank = 0;
  // 段落标题：下一行序号首次出现时作为其子任务
  let pendingHeading: TaskItem | null = null;

  const createRootNode = (lineText: string): TaskItem => {
    while (stack.length > 1) stack.pop();
    const node: TaskItem = {
      id: genId(),
      text: lineText,
      checked: false,
      highlighted: false,
      children: [],
    };
    (node as any).__rank = 0;
    root.children = root.children || [];
    root.children.push(node);
    stack.push({ node, rank: 0 });
    return node;
  };

  // 判断从 startIdx 开始的序号段是否包含 ≥2 个同级项（用于识别段落标题）
  const isHeadingFor = (startIdx: number): boolean => {
    const first = splitLine(lines[startIdx].text);
    if (!first.startsWithMarker || first.segments.length === 0) return false;
    const g = first.segments[0].group;
    let count = first.segments.filter(s => s.group === g).length;
    for (let j = startIdx + 1; j < lines.length; j++) {
      if (lines[j].blankBefore) break;
      const s = splitLine(lines[j].text);
      if (!s.startsWithMarker) break;
      if (s.segments[0].group === g) count++;
    }
    return count >= 2;
  };

  for (let li = 0; li < lines.length; li++) {
    const { text: line, blankBefore } = lines[li];
    const { prefix, segments, startsWithMarker, hasMarker } = splitLine(line);

    if (segments.length === 0) {
      if (hasMarker) {
        // 标记后无内容，跳过该行（如空序号行）
      } else if (li === 0 || blankBefore || !lastLeaf) {
        // 段落开头（首行或空行后）的无序号行：开启新的根任务
        const node = createRootNode(line);
        // 若后续紧跟 ≥2 个同级序号项，视为段落标题，序号项挂到它下面
        pendingHeading = li + 1 < lines.length && isHeadingFor(li + 1) ? node : null;
        lastLeaf = node;
        lastLineStart = null;
      } else {
        // 紧跟上一行的无序号行：合并到上一个任务文本
        lastLeaf.text = (lastLeaf.text ? `${lastLeaf.text} ` : '') + line;
        pendingHeading = null;
      }
      continue;
    }

    let prevSeg: Segment | null = null;
    let baseRank: number | null = null;
    if (!startsWithMarker) {
      pendingHeading = null;
      if (lastLeaf) {
        lastLeaf.text = (lastLeaf.text ? `${lastLeaf.text} ` : '') + prefix;
        baseRank = (lastLeaf as any).__rank ?? -1;
      } else if (prefix) {
        // 行首有普通文本 followed by 序号，把前缀作为根节点，序号作为子任务
        const prefixNode = createRootNode(prefix);
        lastLeaf = prefixNode;
        lastLineStart = null;
        baseRank = 0;
      }
    }

    // 本行内已出现的序号族 → 层级，行内同族序号回到同一层级（兄弟）
    const inlineGroupRank = new Map<string, number>();

    for (let i = 0; i < segments.length; i++) {
      const seg = segments[i];
      const isLineStart = startsWithMarker && i === 0;
      let effRank: number;

      if (isLineStart) {
        // 动态推断：首次出现的编号体系作为新层级，后续同体系保持该层级
        if (!familyRank.has(seg.group)) {
          if (pendingHeading) {
            // 段落标题下首次出现的编号体系：作为标题的下一级
            const assigned = ((pendingHeading as any).__rank ?? 0) + 1;
            familyRank.set(seg.group, assigned);
            nextFamilyRank = Math.max(nextFamilyRank, assigned + 1);
          } else {
            familyRank.set(seg.group, nextFamilyRank);
            nextFamilyRank++;
          }
        }
        effRank = familyRank.get(seg.group)!;
        inlineGroupRank.set(seg.group, effRank);
      } else {
        const lineStart = lastLineStart;
        if (lineStart && seg.group === lineStart.group) {
          // 与当前行首标记同体系：作为同级兄弟
          effRank = lineStart.rank;
        } else if (inlineGroupRank.has(seg.group)) {
          // 本行内已出现过同族序号：回到同一层级（兄弟）
          effRank = inlineGroupRank.get(seg.group)!;
        } else {
          let depth = lineStart ? lineStart.rank + 1 : (baseRank !== null ? baseRank + 1 : seg.rank);
          if (prevSeg) {
            if (seg.group === prevSeg.group) {
              depth = prevSeg.effRank ?? seg.rank;
            } else {
              depth = Math.max(depth, (prevSeg.effRank ?? seg.rank) + 1);
            }
          }
          effRank = Math.max(seg.rank, depth);
        }
        inlineGroupRank.set(seg.group, effRank);
      }
      seg.effRank = effRank;

      while (stack.length > 1 && effRank <= stack[stack.length - 1].rank) {
        stack.pop();
      }
      const parent = stack[stack.length - 1].node;
      const node: TaskItem = {
        id: genId(),
        text: seg.text,
        checked: false,
        highlighted: false,
        children: [],
      };
      (node as any).__rank = effRank;
      parent.children = parent.children || [];
      parent.children.push(node);
      stack.push({ node, rank: effRank });
      lastLeaf = findLastLeaf(node);

      if (isLineStart) {
        lastLineStart = { family: seg.family, group: seg.group, rank: effRank };
        pendingHeading = null;
      }
      prevSeg = seg;
    }
  }

  // 清理内部使用的 rank 标记
  const clean = (nodes: TaskItem[]) => {
    for (const n of nodes) {
      delete (n as any).__rank;
      if (n.children?.length) clean(n.children);
    }
  };
  clean(root.children || []);

  return root.children || [];
}

/**
 * 为 TaskTree 定制的解析入口。
 * 第一行作为根任务文本，其余内容作为层级子任务。
 * 同时兼容同一行内的紧凑序号列表，例如：
 *   "主要工作 1. xxx 2. yyy"
 */
export function parseTaskHierarchy(text: string): { rootText: string; children: TaskItem[] } | null {
  const lines = text.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  if (lines.length === 0) return null;

  const firstSplit = splitLine(lines[0]);
  let rootText: string;
  let children: TaskItem[];

  if (firstSplit.segments.length === 0) {
    rootText = lines[0];
    children = parseHierarchicalText(lines.slice(1).join('\n'));
  } else if (firstSplit.prefix) {
    // 第一行在序号前还有根任务描述，例如 "主要工作 1. xxx 2. yyy"
    rootText = firstSplit.prefix;
    const firstBody = firstSplit.segments.map(s => s.marker + s.text).join(' ');
    children = parseHierarchicalText([firstBody, ...lines.slice(1)].join('\n'));
  } else {
    // 第一行以序号开头，例如 "1. 任务A\n（1）子1\n2. 任务B"
    const parsed = parseHierarchicalText(lines.join('\n'));
    if (parsed.length === 0) {
      rootText = firstSplit.segments[0].text;
      children = [];
    } else {
      const [firstRoot, ...siblings] = parsed;
      rootText = firstRoot.text;
      children = [...(firstRoot.children || []), ...siblings];
    }
  }

  return { rootText, children };
}
