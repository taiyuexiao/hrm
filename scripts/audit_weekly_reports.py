#!/usr/bin/env python3
"""周报数据全库体检（只报告，不修改）

扫描 weekly_reports 全部未删除行，按类别列出可疑数据：
  A. content 中任务文本含 JSON 碎片（BUG-003 乱码）
  B. 空数组垃圾任务（text 为 '[]'）
  C. 空文本任务（text 空白）
  D. 任务结构异常（缺 text 键 / children 不是数组 / text 不是字符串）
  E. content 整体不是合法 JSON 数组
  F. next_plan 是 JSON 但无法干净解析（污染）
  G. current_work / plan 文本字段里是原始 JSON（应为格式化文本）
  H. next_plan 是双重编码 JSON（解析出来是字符串而非数组）
"""
import json
import sqlite3

DB = 'backend/data/hr.db'


def walk(nodes, path, issues, row_key):
    for i, n in enumerate(nodes):
        loc = f'{path}/{i}'
        if not isinstance(n, dict):
            issues.append(('D', row_key, f'任务节点不是对象 @{loc}: {str(n)[:50]}'))
            continue
        text = n.get('text')
        if text is None:
            issues.append(('D', row_key, f'缺 text 键 @{loc}'))
        elif not isinstance(text, str):
            issues.append(('D', row_key, f'text 不是字符串 @{loc}: {type(text).__name__}'))
        else:
            t = text.strip()
            if '{"id"' in text or '"checked"' in text or t.startswith('[{'):
                issues.append(('A', row_key, f'JSON 碎片乱码 @{loc}: {text[:60]}'))
            elif t in ('[]', '[ ]'):
                issues.append(('B', row_key, f'空数组垃圾任务 @{loc}'))
            elif t == '':
                issues.append(('C', row_key, f'空文本任务 @{loc}'))
            elif t.startswith('[') and len(t) > 2:
                issues.append(('D', row_key, f'text 以 [ 开头疑似的 JSON @{loc}: {text[:50]}'))
        children = n.get('children')
        if children is not None:
            if not isinstance(children, list):
                issues.append(('D', row_key, f'children 不是数组 @{loc}'))
            else:
                walk(children, loc, issues, row_key)


def try_parse(v):
    try:
        return json.loads(v), None
    except Exception as e:
        return None, str(e)[:60]


def main():
    conn = sqlite3.connect(DB)
    conn.row_factory = sqlite3.Row
    rows = conn.execute(
        "SELECT id, week_label, dept, content, current_work, plan, next_plan FROM weekly_reports WHERE deleted_at IS NULL"
    ).fetchall()

    issues = []
    for row in rows:
        key = f"{row['week_label']} {row['dept']}"
        raw = row['content'] or ''
        content, err = try_parse(raw)
        if err:
            issues.append(('E', key, f'content 非法 JSON: {err} | 前 60: {raw[:60]}'))
        elif not isinstance(content, list):
            issues.append(('E', key, f'content 不是数组: {type(content).__name__}'))
        else:
            walk(content, '', issues, key)

        np = (row['next_plan'] or '').strip()
        if np.startswith('['):
            parsed, err = try_parse(np)
            if err:
                issues.append(('F', key, f'next_plan JSON 无法干净解析: {err}'))
            elif isinstance(parsed, str):
                issues.append(('H', key, 'next_plan 双重编码（解析结果是字符串）'))
            elif not isinstance(parsed, list):
                issues.append(('F', key, f'next_plan 解析结果不是数组: {type(parsed).__name__}'))

        for field in ('current_work', 'plan'):
            v = (row[field] or '').strip()
            if v.startswith('['):
                parsed, _ = try_parse(v)
                if isinstance(parsed, list):
                    issues.append(('G', key, f'{field} 是原始 JSON（{len(parsed)} 项）'))

    order = 'ABCDEFGH'
    title = {
        'A': 'JSON 碎片乱码', 'B': '空数组垃圾任务', 'C': '空文本任务', 'D': '任务结构异常',
        'E': 'content 非法', 'F': 'next_plan 解析异常', 'G': '文本字段为原始 JSON', 'H': 'next_plan 双重编码',
    }
    print(f'共扫描 {len(rows)} 行，发现 {len(issues)} 个问题\n')
    for cat in order:
        cat_issues = [i for i in issues if i[0] == cat]
        if not cat_issues:
            continue
        print(f'== {cat}. {title[cat]}（{len(cat_issues)} 条）==')
        for _, key, desc in cat_issues[:15]:
            print(f'  {key} | {desc}')
        if len(cat_issues) > 15:
            print(f'  … 其余 {len(cat_issues) - 15} 条从略')
        print()
    if not issues:
        print('✅ 未发现可疑数据')
    conn.close()


if __name__ == '__main__':
    main()
