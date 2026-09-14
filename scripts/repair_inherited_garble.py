#!/usr/bin/env python3
"""修复周报继承乱码（详见 docs/modules/weekly-report-v2.md BUG-003）

背景：next_plan 存的是 JSON 序列化任务树，懒创建路径误用纯文本解析器，
把 JSON 原文拆成乱码任务写入 content；current_work/plan 被塞原始 JSON。

策略：对 content 中任务 text 含 JSON 碎片的行，用 current_work（其次 plan）
中的原始 JSON 重建任务树；current_work/plan 改存格式化文本。
默认 dry-run 只报告，加 --apply 才落库。
"""
import json
import re
import sqlite3
import sys

DB = sys.argv[1] if len(sys.argv) > 1 and sys.argv[1] != '--apply' else 'backend/data/hr.db'
APPLY = '--apply' in sys.argv


def looks_garbled_text(t: str) -> bool:
    return isinstance(t, str) and ('{"id"' in t or '"checked"' in t or t.lstrip().startswith('[{'))


def tree_has_garble(nodes) -> bool:
    for n in nodes or []:
        if looks_garbled_text(n.get('text', '')):
            return True
        if tree_has_garble(n.get('children')):
            return True
    return False


def extract_first_json_array(text: str):
    """与前端 extractFirstJsonArray 等效：容忍末尾污染的 JSON 数组提取"""
    text = (text or '').strip()
    if not text.startswith('['):
        return None
    depth, in_str, esc = 0, False, False
    for i, ch in enumerate(text):
        if esc:
            esc = False
            continue
        if ch == '\\':
            esc = True
            continue
        if ch == '"':
            in_str = not in_str
            continue
        if in_str:
            continue
        if ch == '[':
            depth += 1
        elif ch == ']':
            depth -= 1
            if depth == 0:
                return text[:i + 1]
    return None


def parse_tasks(text):
    if not text:
        return None
    try:
        v = json.loads(text)
        return v if isinstance(v, list) else None
    except Exception:
        pass
    extracted = extract_first_json_array(text)
    if extracted:
        try:
            v = json.loads(extracted)
            return v if isinstance(v, list) else None
        except Exception:
            return None
    return None


def strip_prefix(t: str) -> str:
    t = re.sub(r'^(\d+[、.．）])+\s*', '', t)
    t = re.sub(r'^[（(]\d+[）)]\s*', '', t)
    t = re.sub(r'^\d+[）)]\s*', '', t)
    return t


def fmt_node(node, depth, index):
    indent = '  ' * depth
    prefix = f'{index + 1}. ' if depth == 0 else (f'（{index + 1}）' if depth == 1 else f'{index + 1}）')
    lines = [f'{indent}{prefix}{strip_prefix(node.get("text", ""))}']
    for i, child in enumerate(node.get('children') or []):
        lines += fmt_node(child, depth + 1, i)
    return lines


def format_tasks(tasks) -> str:
    if not tasks:
        return ''
    important = [t for t in tasks if t.get('highlighted')]
    normal = [t for t in tasks if not t.get('highlighted')]
    sections = []
    if important:
        sections.append('重点工作：')
        for i, t in enumerate(important):
            sections += fmt_node(t, 0, i)
    if normal:
        if sections:
            sections.append('')
        sections.append('常规工作：')
        for i, t in enumerate(normal):
            sections += fmt_node(t, 0, i)
    return '\n'.join(sections)


def is_jsonish(t: str) -> bool:
    return isinstance(t, str) and t.strip().startswith('[')


def main():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT id, week_label, dept, content, current_work, plan FROM weekly_reports WHERE deleted_at IS NULL"
    ).fetchall()

    scanned = garbled = repaired = failed = 0
    failed_rows = []
    for row in rows:
        scanned += 1
        try:
            content = json.loads(row['content'] or '[]')
        except Exception:
            continue
        if not isinstance(content, list) or not tree_has_garble(content):
            continue
        garbled += 1

        # 用 current_work（其次 plan）中的原始 JSON 重建
        source = row['current_work'] if is_jsonish(row['current_work'] or '') else row['plan']
        rebuilt = parse_tasks(source)
        if not rebuilt:
            failed += 1
            failed_rows.append((row['week_label'], row['dept']))
            continue

        text = format_tasks(rebuilt)
        if APPLY:
            conn.execute(
                "UPDATE weekly_reports SET content = ?, current_work = ?, plan = ?, updated_at = datetime('now') WHERE id = ?",
                (json.dumps(rebuilt, ensure_ascii=False), text, text, row['id']),
            )
        repaired += 1
        if not APPLY:
            print(f"  可修复 {row['week_label']} {row['dept']}：{len(rebuilt)} 个根任务")

    if APPLY:
        conn.commit()
    print(f"\n扫描 {scanned} 行，乱码 {garbled} 行，{'已修复' if APPLY else '可修复(dry-run)'} {repaired} 行，无法自动修复 {failed} 行")
    for w, d in failed_rows:
        print(f"  ⚠️ 需人工处理：{w} {d}")
    conn.close()


if __name__ == '__main__':
    main()
