#!/usr/bin/env python3
"""
解析部门周报Excel文件，生成前端所需的JSON格式
"""
import pandas as pd
import json
import os
from datetime import datetime
import re

def date_to_week_label(date_str):
    """将日期字符串转换为周标签 (e.g. 2026-03-27 -> 2026-W13)"""
    d = datetime.strptime(date_str, '%Y%m%d')
    # ISO week calculation
    iso_calendar = d.isocalendar()
    return f"{iso_calendar[0]}-W{iso_calendar[1]:02d}"

def parse_plan_to_tasks(plan_text):
    """将计划文本解析为任务列表"""
    if not plan_text or pd.isna(plan_text):
        return []

    tasks = []
    lines = str(plan_text).strip().split('\n')

    for line in lines:
        line = line.strip()
        if not line:
            continue

        # 匹配主项：1、xxx 或 1. xxx 或 （1）xxx
        main_match = re.match(r'^(\d+[、.．）])\s*(.+)$', line)
        if main_match:
            tasks.append({
                'id': f'task-{len(tasks)}',
                'text': line,
                'checked': False
            })
        # 匹配子项：(1) xxx 或 （1）xxx 或 1）xxx
        elif re.match(r'^[（(]\d+[）)]', line) or re.match(r'^\d+[）)]', line):
            tasks.append({
                'id': f'task-{len(tasks)}',
                'text': line,
                'checked': False
            })
        else:
            # 普通文本行也作为任务
            tasks.append({
                'id': f'task-{len(tasks)}',
                'text': line,
                'checked': False
            })

    return tasks

def parse_excel_to_json(excel_dir, output_file):
    """解析所有Excel文件并生成JSON"""
    all_reports = []

    # 科室名称映射（只做必要的名称统一）
    dept_map = {
        # 保留独立团队
        '项目管理': '项目管理',
        '需求管理': '需求管理',
        '架构管理': '架构管理',
        '综合管理部': '综合管理部',
        '机构服务团队': '机构服务团队',
        # 数据部门
        '信息统计部': '信息统计部',
        '信息管理部': '信息管理部',
        '数据开发部': '数据开发部',
        '数据平台部': '数据平台部',
        '数据治理部': '数据治理部',
        '数据测试部': '数据测试部',
        # 智能研发部门（统一去掉"智能研发部-"前缀）
        '智能研发部-智能平台部': '智能平台部',
        '智能平台部': '智能平台部',
        '智能研发部-研发管理部': '研发管理部',
        '研发管理部': '研发管理部',
        '智能研发部-智能应用一部': '智能应用一部',
        '智能应用一部': '智能应用一部',
        '智能研发部-智能应用二部': '智能应用二部',
        '智能应用二部': '智能应用二部',
    }

    # 用户映射（扩展到所有团队）
    user_map = {
        '项目管理': {'id': 'user1', 'name': '项目管理-小明'},
        '需求管理': {'id': 'user2', 'name': '需求管理-小红'},
        '架构管理': {'id': 'user3', 'name': '架构管理-小刚'},
        '综合管理部': {'id': 'user4', 'name': '综合管理-小蓝'},
        '机构服务团队': {'id': 'user5', 'name': '机构服务-小绿'},
        '信息统计部': {'id': 'user6', 'name': '信息统计-小紫'},
        '信息管理部': {'id': 'user7', 'name': '信息管理-小橙'},
        '数据开发部': {'id': 'user8', 'name': '数据开发-小黄'},
        '数据平台部': {'id': 'user9', 'name': '数据平台-小粉'},
        '数据治理部': {'id': 'user10', 'name': '数据治理-小灰'},
        '数据测试部': {'id': 'user11', 'name': '数据测试-小白'},
        '智能平台部': {'id': 'user12', 'name': '智能平台-小黑'},
        '研发管理部': {'id': 'user13', 'name': '研发管理-小棕'},
        '智能应用一部': {'id': 'user14', 'name': '智能应用一-小青'},
        '智能应用二部': {'id': 'user15', 'name': '智能应用二-小银'},
    }

    # 遍历所有Excel文件
    for filename in sorted(os.listdir(excel_dir)):
        if not filename.endswith('.xlsx') or filename.startswith('~'):
            continue

        # 从文件名提取周标签：数据部工作周报-W12-20260327.xlsx
        week_match = re.search(r'-W(\d+)-', filename)
        if not week_match:
            print(f"⚠️  跳过文件（无法提取周数）: {filename}")
            continue

        week_num = int(week_match.group(1))
        week_label = f"2026-W{week_num:02d}"

        file_path = os.path.join(excel_dir, filename)
        print(f"处理文件: {filename} -> {week_label}")

        try:
            df = pd.read_excel(file_path, sheet_name=0)

            for idx, row in df.iterrows():
                raw_dept = str(row['科室/委员会']).strip()
                dept = dept_map.get(raw_dept, raw_dept)
                user = user_map.get(dept, {'id': 'admin', 'name': '系统管理员'})

                # 处理列名变体：上周工作计划 或 本周计划
                prev_plan_col = '上周工作计划' if '上周工作计划' in df.columns else '本周计划'
                prev_plan_text = row.get(prev_plan_col, '')

                # 解析上周工作计划为任务列表（带checkbox）
                prev_plan_tasks = parse_plan_to_tasks(prev_plan_text)

                # 本周工作内容保持为纯文本
                current_content = row.get('本周工作内容', '')
                current_work_text = str(current_content) if not pd.isna(current_content) else ''

                # 下周工作计划
                next_plan = str(row.get('下周工作计划', '')) if not pd.isna(row.get('下周工作计划')) else ''

                # 本周心得 = 本周管理心得 + AI推广案例/心得
                thoughts_parts = []
                if not pd.isna(row.get('本周管理心得')) and str(row.get('本周管理心得')).strip() not in ['无', '暂无', '']:
                    thoughts_parts.append(f"【本周管理心得】\n{row.get('本周管理心得')}")
                if not pd.isna(row.get('AI推广案例/心得')) and str(row.get('AI推广案例/心得')).strip() not in ['无', '暂无', '']:
                    thoughts_parts.append(f"【AI推广案例/心得】\n{row.get('AI推广案例/心得')}")
                thoughts = '\n\n'.join(thoughts_parts)

                # 其他 = 问题与风险
                other = ''
                if not pd.isna(row.get('问题与风险')) and str(row.get('问题与风险')).strip() not in ['无', '暂无', '']:
                    other = str(row.get('问题与风险'))

                report = {
                    'id': f"{week_label}-{dept}-{idx}",
                    'weekLabel': week_label,
                    'dept': dept,
                    'authorId': user['id'],
                    'authorName': user['name'],
                    'plan': str(prev_plan_text) if not pd.isna(prev_plan_text) else '',
                    'content': prev_plan_tasks,
                    'currentWork': current_work_text,
                    'nextPlan': next_plan,
                    'thoughts': thoughts,
                    'other': other,
                    'comments': [],
                    'createdAt': datetime.now().isoformat(),
                    'updatedAt': datetime.now().isoformat(),
                }

                all_reports.append(report)

        except Exception as e:
            print(f"处理文件 {filename} 时出错: {e}")
            continue

    # 保存为JSON
    with open(output_file, 'w', encoding='utf-8') as f:
        json.dump(all_reports, f, ensure_ascii=False, indent=2)

    print(f"\n成功生成 {len(all_reports)} 条周报记录")
    print(f"输出文件: {output_file}")

if __name__ == '__main__':
    excel_dir = 'data/周报/部门周报'
    output_file = 'src/data/dept-weekly-reports.json'
    parse_excel_to_json(excel_dir, output_file)
