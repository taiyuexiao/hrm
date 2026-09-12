/**
 * 批注高亮工具函数
 * 支持基于选区位置（targetStart/targetEnd）的精确高亮，同时兼容旧数据（仅 targetText）的全局匹配高亮。
 */

import type { Comment } from './types';

export interface HighlightRange {
  start: number;
  end: number;
  commentIds: string[];
}

/**
 * 根据批注列表构建需要高亮的文本区间。
 * - 对于有 targetStart/targetEnd 且文本未发生变化的批注，精确高亮该区间。
 * - 对于旧数据或文本已变化的批注，回退到按 targetText 全局匹配高亮。
 */
export function buildHighlightRanges(
  text: string,
  comments: Comment[],
  blockKey: string
): HighlightRange[] {
  const rawRanges: HighlightRange[] = [];

  for (const c of comments) {
    if (c.targetBlock !== blockKey || !c.targetText) continue;

    const hasValidPosition =
      typeof c.targetStart === 'number' &&
      typeof c.targetEnd === 'number' &&
      c.targetStart >= 0 &&
      c.targetEnd <= text.length &&
      c.targetStart < c.targetEnd;

    if (hasValidPosition && text.slice(c.targetStart!, c.targetEnd!) === c.targetText) {
      // 位置信息有效且文本未变：精确高亮该区间
      rawRanges.push({
        start: c.targetStart!,
        end: c.targetEnd!,
        commentIds: [c.id],
      });
    } else {
      // 旧数据或原文已被修改：回退到全局文本匹配
      let idx = text.indexOf(c.targetText);
      while (idx !== -1) {
        rawRanges.push({
          start: idx,
          end: idx + c.targetText.length,
          commentIds: [c.id],
        });
        idx = text.indexOf(c.targetText, idx + c.targetText.length);
      }
    }
  }

  // 合并重叠或相邻的区间，并合并关联的 commentIds
  rawRanges.sort((a, b) => a.start - b.start);
  const merged: HighlightRange[] = [];
  for (const r of rawRanges) {
    const last = merged[merged.length - 1];
    if (last && r.start <= last.end) {
      last.end = Math.max(last.end, r.end);
      const existing = new Set(last.commentIds);
      for (const id of r.commentIds) {
        if (!existing.has(id)) last.commentIds.push(id);
      }
    } else {
      merged.push({ ...r, commentIds: [...r.commentIds] });
    }
  }

  return merged;
}

/**
 * 计算窗口选区在指定容器内的字符偏移量。
 * 容器内可包含任意嵌套元素，只要最终文本节点属于该容器即可。
 */
export function getSelectionOffsetsInContainer(
  container: HTMLElement
): { start: number; end: number; text: string } | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;

  const range = selection.getRangeAt(0);
  if (!container.contains(range.commonAncestorContainer)) return null;

  const fullText = container.textContent || '';
  const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, null);

  let offset = 0;
  let startOffset = -1;
  let endOffset = -1;
  let node;

  while ((node = walker.nextNode())) {
    const nodeLength = node.textContent?.length || 0;
    if (node === range.startContainer) {
      startOffset = offset + Math.min(range.startOffset, nodeLength);
    }
    if (node === range.endContainer) {
      endOffset = offset + Math.min(range.endOffset, nodeLength);
      break;
    }
    offset += nodeLength;
  }

  if (startOffset === -1 || endOffset === -1 || startOffset >= endOffset) {
    return null;
  }

  return {
    start: startOffset,
    end: endOffset,
    text: fullText.slice(startOffset, endOffset),
  };
}

/**
 * 对选区文本做 trim，并返回调整后的起止位置与文本。
 */
export function trimSelectionOffsets(
  text: string,
  start: number,
  end: number
): { text: string; start: number; end: number } | null {
  const raw = text.slice(start, end);
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const leading = raw.length - raw.trimStart().length;
  const trailing = raw.length - raw.trimEnd().length;
  return {
    text: trimmed,
    start: start + leading,
    end: end - trailing,
  };
}
