#!/usr/bin/env python3
"""
员工360画像标签生成脚本
以"姓名"为主键，聚合 data/ 下所有可关联数据源
输出: src/data/employee-tags.json

注意：员工信息表(225人)缺少姓名字段，无法直接关联到个体。
      本脚本以技能考试表(210人) + 代码量表(11人) + 个人周报(4人) 为基础人群。
      员工信息表的匿名统计摘要另行生成。
"""

import pandas as pd
import json
import numpy as np
from collections import defaultdict

# ========== 1. 读取所有数据源 ==========

# 技能考试表（基础人群）
df_exam_rd = pd.read_excel('data/技能考试/2026年技术序列考试成绩-研发及管理岗.xlsx')
df_exam_test = pd.read_excel('data/技能考试/2026年技术序列考试成绩-测试.xlsx')

# 合并并去重，取每人最高成绩
exam_records = {}
for df_e in [df_exam_rd, df_exam_test]:
    for _, row in df_e.iterrows():
        name = str(row['姓名']).strip()
        if not name or pd.isna(name):
            continue
        try:
            score = float(row['考试成绩']) if pd.notna(row.get('考试成绩')) else 0
        except (ValueError, TypeError):
            score = 0
        if name not in exam_records or score > exam_records[name]['score']:
            exam_records[name] = {
                'dept': str(row.get('所属科室', '')).strip(),
                'position': str(row.get('拟岗位', '')).strip(),
                'exam_type': str(row.get('26年考试类型', '')).strip(),
                'level': str(row.get('试卷级别', '')).strip(),
                'score': score,
            }

# 代码量表
code_map = {}
df_code = pd.read_excel('data/代码量/数据部3月份代码量统计-员工360画像.xlsx')
for _, row in df_code.iterrows():
    name = str(row['姓名']).strip().strip("'\"")  # 去除可能包裹的单引号
    name = name.replace(' ', '')  # 去除中间空格
    code_map[name] = {
        'department': str(row.get('部门', '')).strip(),
        'position': str(row.get('岗位', '')).strip(),
        'code_3月': float(row.get('3月代码行数', 0) or 0),
        'code_4月': float(row.get('4月代码行数', 0) or 0),
        'late_3月': int(row.get('迟到次数3月', 0) or 0),
        'late_4月': int(row.get('迟到次数4月', 0) or 0),
        'overtime_3月': float(row.get('加班时长3月', 0) or 0),
        'overtime_4月': float(row.get('加班时长4月', 0) or 0),
        'training': int(row.get('培训参与次数', 0) or 0),
        'activity': int(row.get('活动参与次数', 0) or 0),
        'level': str(row.get('职级', '')).strip(),
        'exam_score': float(row.get('技能考试成绩', 0) or 0),
        'cert': str(row.get('外部证书', '')).strip(),
    }

# 工时/考勤数据
work_hours_map = {}
df_ot = pd.read_excel('data/工时/2026年3月行员迟到加班统计-202603.xlsx', sheet_name='2026年加班时长')
for _, row in df_ot.iterrows():
    name = str(row.get('姓名', '')).strip()
    if not name or pd.isna(row.get('姓名')):
        continue
    total_ot = 0
    for m in ['1月', '2月', '3月']:
        v = row.get(m, 0)
        if pd.notna(v):
            try:
                total_ot += float(v)
            except:
                pass
    work_hours_map[name] = {'overtime_total': round(total_ot, 2), 'dept': str(row.get('所属团队', '')).strip()}

df_late = pd.read_excel('data/工时/2026年3月行员迟到加班统计-202603.xlsx', sheet_name='2026年迟到次数')
for _, row in df_late.iterrows():
    name = str(row.get('姓名', '')).strip()
    if not name or pd.isna(row.get('姓名')):
        continue
    total_late = 0
    for m in ['1月', '2月', '3月']:
        v = row.get(m, 0)
        if pd.notna(v):
            try:
                total_late += int(float(v))
            except:
                pass
    if name not in work_hours_map:
        work_hours_map[name] = {}
    work_hours_map[name]['late_total'] = total_late

# 报工数据
report_map = {}
try:
    df_report = pd.read_excel('data/报工/智能应用一部报工.xlsx', sheet_name='数管部工时明细')
    for _, row in df_report.iterrows():
        name = str(row.get('姓名', '')).strip()
        if not name or pd.isna(row.get('姓名')):
            continue
        if name not in report_map:
            report_map[name] = {'total_hours': 0, 'task_count': 0, 'task_types': set()}
        hours = row.get('工时（小时）', 0)
        if pd.notna(hours):
            report_map[name]['total_hours'] += float(hours)
            report_map[name]['task_count'] += 1
        tt = row.get('事项类型', '')
        if pd.notna(tt):
            report_map[name]['task_types'].add(str(tt))
    for name in report_map:
        report_map[name]['task_types'] = list(report_map[name]['task_types'])
except Exception as e:
    print(f"报工数据读取失败: {e}")

# 个人周报
weekly_map = {}
import os
for f in os.listdir('data/周报/个人周报'):
    if f.endswith('.xlsx'):
        name = f.replace('.xlsx', '')
        try:
            df_w = pd.read_excel(f'data/周报/个人周报/{f}')
            weekly_map[name] = {
                'weekly_count': len(df_w),
                'avg_content_len': round(df_w['今日学习/工作内容'].dropna().astype(str).apply(len).mean(), 0),
                'problem_count': int((df_w['遇到问题'].notna() & (df_w['遇到问题'] != '无')).sum()),
            }
        except Exception as e:
            print(f"个人周报读取失败 {name}: {e}")


# ========== 工具函数 ==========
def safe_int(val):
    if val is None or pd.isna(val):
        return 0
    return int(float(val))

def safe_float(val):
    if val is None or pd.isna(val):
        return 0.0
    return float(val)

# ========== 2. 标签生成函数 ==========

def get_code_level(lines):
    if lines == 0: return '无数据'
    if lines >= 10000: return '高(≥1万行)'
    if lines >= 1000: return '中(1千-1万行)'
    return '低(<1千行)'

def get_overtime_level(hours):
    if hours == 0: return '无数据'
    if hours >= 10: return '高(≥10h/月)'
    if hours >= 5: return '中(5-10h/月)'
    return '低(<5h/月)'

def get_punctuality(late_count):
    if late_count == 0: return '优秀(0次)'
    if late_count <= 2: return '良好(1-2次)'
    return '较差(≥3次)'

def get_exam_level(score):
    if score >= 85: return '优秀(≥85)'
    if score >= 70: return '良好(70-84)'
    return '及格(<70)'

# 岗位所需技能维度映射
POSITION_SKILL_MAP = {
    '数据研发': ['SQL开发', '数据模型设计', '业务理解'],
    '数据分析': ['数据分析工具运用能力', '算法模型开发能力', '营销运营能力'],
    '应用研发': ['技术架构设计', '应用开发能力'],
    '算法工程': ['数学与建模理论基础', '编程与工程实现'],
    'AI算法': ['数学与建模理论基础', '编程与工程实现'],
    '智能研发': ['数学与建模理论基础', '编程与工程实现'],
    '架构管理': ['技术架构设计', '应用开发能力'],
}

def detect_skill_mismatch(position, exam_type, exam_score):
    """基于考试类型和成绩判断技能与岗位匹配度"""
    if not position:
        return '无法判断'
    
    # 根据岗位关键词匹配期望的考试类型
    pos_str = str(position)
    if any(k in pos_str for k in ['算法', 'AI', '智能', '模型']):
        expected = '智能研发'
    elif any(k in pos_str for k in ['数据研发', '数仓', 'ETL']):
        expected = '数据开发'
    elif any(k in pos_str for k in ['应用研发', '开发', '架构']):
        expected = '软件研发'
    elif any(k in pos_str for k in ['测试', '质量']):
        expected = '测试'
    elif any(k in pos_str for k in ['数据分析', '分析']):
        expected = '数据分析'
    else:
        expected = None
    
    if not expected:
        return '无法判断(岗位未定义)'
    
    if exam_score >= 85:
        return '匹配度高(优秀)'
    if exam_score >= 70:
        return '匹配度中(良好)'
    if exam_score >= 60:
        return '匹配度低(及格)'
    return '错配风险高(技能不足)'


def calc_skill_match_score(exam_score, position=''):
    """技能匹配度 0-100"""
    if exam_score == 0:
        return 50
    return min(100, int(exam_score / 100 * 100))

def calc_experience_score(code_lines, training, activity, cert):
    """项目经验/综合能力 0-100"""
    score = 0
    if code_lines > 0:
        score += min(30, int(code_lines / 10000 * 30))
    score += min(20, training * 4)
    score += min(10, activity * 3)
    if cert and cert != 'nan':
        score += 15
    return min(100, score)

def calc_hardworking_score(overtime, late, code_lines):
    """吃苦耐劳 0-100"""
    score = 0
    if overtime > 0:
        score += min(40, int(overtime / 10))
    if late == 0:
        score += 20
    elif late <= 2:
        score += 10
    if code_lines > 0:
        score += min(20, int(code_lines / 10000 * 20))
    return min(100, score)

def calc_innovation_score(exam_score, cert, training):
    """创新潜力 0-100"""
    score = 0
    if exam_score > 0:
        score += int(exam_score / 100 * 40)
    if cert and cert != 'nan':
        score += 20
    score += min(20, training * 3)
    return min(100, score)


# ========== 3. 为每个人生成标签 ==========

# 收集所有有数据的人名
all_names = set(exam_records.keys())
all_names.update(code_map.keys())
all_names.update(work_hours_map.keys())
all_names.update(report_map.keys())
all_names.update(weekly_map.keys())

tags = {}

for name in sorted(all_names):
    if not name or name == 'nan':
        continue
    
    exam = exam_records.get(name, {})
    code = code_map.get(name, {})
    wh = work_hours_map.get(name, {})
    rep = report_map.get(name, {})
    week = weekly_map.get(name, {})
    
    # 优先使用代码量表的部门和岗位（更精确），否则用考试表
    dept = code.get('department', '') or exam.get('dept', '') or wh.get('dept', '')
    position = code.get('position', '') or exam.get('position', '')
    total_code = code.get('code_3月', 0) + code.get('code_4月', 0)
    total_ot = code.get('overtime_3月', 0) + code.get('overtime_4月', 0)
    if total_ot == 0:
        total_ot = wh.get('overtime_total', 0)
    total_late = code.get('late_3月', 0) + code.get('late_4月', 0)
    if total_late == 0:
        total_late = wh.get('late_total', 0)
    exam_score = exam.get('score', 0)
    code_exam_score = code.get('exam_score', 0)
    final_exam_score = max(exam_score, code_exam_score)
    
    person_tags = {
        'name': name,
        'department': dept or '未知',
        'position': position or '未知',
        
        '基础信息': {
            '所属科室': dept or '未知',
            '岗位': position or '未知',
            '考试类型': exam.get('exam_type', '无'),
            '考试级别': exam.get('level', '无'),
            '职级': code.get('level', '无'),
            '外部证书': code.get('cert', '无') if code.get('cert') and str(code.get('cert')) != 'nan' else '无',
        },
        
        '能力评估': {
            '考试成绩': final_exam_score,
            '成绩等级': get_exam_level(final_exam_score),
            '代码贡献': get_code_level(total_code),
        },
        
        '工作投入': {
            '3月代码行数': safe_int(code.get('code_3月', 0)),
            '4月代码行数': safe_int(code.get('code_4月', 0)),
            '总代码行数': safe_int(total_code),
            '3月加班时长': round(safe_float(code.get('overtime_3月', 0)), 1),
            '4月加班时长': round(safe_float(code.get('overtime_4月', 0)), 1),
            '总加班时长': round(safe_float(total_ot), 1),
            '迟到次数': safe_int(total_late),
            '培训参与': safe_int(code.get('training', 0)),
            '活动参与': safe_int(code.get('activity', 0)),
            '考勤纪律': get_punctuality(total_late),
            '加班强度': get_overtime_level(total_ot),
        },
        
        '错配检测': {
            '技能-岗位匹配': detect_skill_mismatch(position, exam.get('exam_type', ''), final_exam_score),
        },
        
        '项目选人评分': {
            '技能匹配度': calc_skill_match_score(final_exam_score, position),
            '经验丰富度': calc_experience_score(total_code, code.get('training', 0), code.get('activity', 0), code.get('cert', '')),
            '吃苦耐劳度': calc_hardworking_score(total_ot, total_late, total_code),
            '创新潜力': calc_innovation_score(final_exam_score, code.get('cert', ''), code.get('training', 0)),
        },
    }
    
    if week:
        person_tags['周报数据'] = week
    if rep:
        person_tags['报工数据'] = rep
    
    tags[name] = person_tags


# ========== 4. 生成匿名统计摘要（来自员工信息表） ==========
# 员工信息表缺少姓名，但可以做部门/岗位级别的统计
summary = {}
try:
    df_main = pd.read_excel('data/员工信息数据.xlsx')
    summary['totalEmployees'] = len(df_main)
    summary['avgPerformance'] = round(df_main['近2年绩效平均分'].mean(), 2) if '近2年绩效平均分' in df_main else None
    summary['avgDailyHours'] = round(df_main['近2年日均工时'].mean(), 2) if '近2年日均工时' in df_main else None
    summary['avgProjects'] = round(df_main['近2年牵头项目个数'].mean(), 1) if '近2年牵头项目个数' in df_main else None
    summary['leaderCount'] = int(df_main['组长/骨干标识'].sum()) if '组长/骨干标识' in df_main else None
    summary['keyProjectCount'] = int(df_main['重点项目成员标识'].sum()) if '重点项目成员标识' in df_main else None
    
    # 技能平均分
    skill_cols = [
        '数据分析师-数据分析工具运用能力', '数据分析师-算法模型开发能力', '数据分析师-营销运营能力',
        '数据研发师-SQL开发', '数据研发师-数据模型设计', '数据研发师-业务理解',
        '应用研发-技术架构设计', '应用研发-应用开发能力',
        'AI算法工程师-数学与建模理论基础', 'AI算法工程师-编程与工程实现',
    ]
    skill_avgs = {}
    for sc in skill_cols:
        if sc in df_main:
            skill_avgs[sc.split('-')[1]] = round(df_main[sc].mean(), 2)
    summary['skillAverages'] = skill_avgs
    
    # 软技能平均分
    soft_cols = ['学习能力', '创新思维', '任务拆解能力', '领导力', '团队合作']
    soft_avgs = {}
    for sc in soft_cols:
        if sc in df_main:
            soft_avgs[sc] = round(df_main[sc].mean(), 2)
    summary['softSkillAverages'] = soft_avgs
except Exception as e:
    print(f"员工信息表统计失败: {e}")


# ========== 5. 保存 ==========
output = {
    'total': len(tags),
    'anonymousSummary': summary,
    'employees': tags,
}

with open('src/data/employee-tags.json', 'w', encoding='utf-8') as f:
    json.dump(output, f, ensure_ascii=False, indent=2)

print(f"标签生成完成: {len(tags)} 人")
print(f"匿名统计: {summary}")
print(f"输出: src/data/employee-tags.json")

# 打印4个目标员工样本
for name in ['占桐', '廖宇杰', '沈子新', '陈彦百']:
    if name in tags:
        t = tags[name]
        print(f"\n=== {name} ===")
        print(f"  科室: {t['基础信息']['所属科室']}, 岗位: {t['基础信息']['岗位']}")
        print(f"  考试成绩: {t['能力评估']['考试成绩']} ({t['能力评估']['成绩等级']})")
        print(f"  代码行数: {t['工作投入']['总代码行数']}")
        print(f"  技能-岗位匹配: {t['错配检测']['技能-岗位匹配']}")
        print(f"  项目选人评分: {t['项目选人评分']}")
