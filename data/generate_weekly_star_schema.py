#!/usr/bin/env python3
"""
为200人合成数据生成个人周报星形模型维度建模
输出: src/data/employee-weekly-star-schema.json
"""

import json
import numpy as np
from datetime import datetime, timedelta

np.random.seed(2025)

# ========== 0. 加载已有合成数据 ==========
with open('src/data/employee-synthetic.json', 'r', encoding='utf-8') as f:
    data = json.load(f)
employees = data['employees']
N = len(employees)

# ========== 1. 定义维度数据 ==========

# 时间维度 - 4周
WEEKS = [
    {"date_id": "2026-W13", "week_start": "2026-03-23", "week_end": "2026-03-29",
     "month": 3, "quarter": 1, "year": 2026, "week_of_year": 13, "is_end_of_month": False, "month_name": "3月"},
    {"date_id": "2026-W14", "week_start": "2026-03-30", "week_end": "2026-04-05",
     "month": 4, "quarter": 1, "year": 2026, "week_of_year": 14, "is_end_of_month": False, "month_name": "4月"},
    {"date_id": "2026-W15", "week_start": "2026-04-06", "week_end": "2026-04-12",
     "month": 4, "quarter": 1, "year": 2026, "week_of_year": 15, "is_end_of_month": False, "month_name": "4月"},
    {"date_id": "2026-W16", "week_start": "2026-04-13", "week_end": "2026-04-19",
     "month": 4, "quarter": 1, "year": 2026, "week_of_year": 16, "is_end_of_month": False, "month_name": "4月"},
]

# 项目维度
PROJECT_POOL = [
    {"project_id": "P001", "project_name": "智能问数二期", "project_type": "AI应用", "domain": "智能问答", "status": "进行中", "priority": "高", "start_date": "2026-01-15", "end_date": "2026-06-30"},
    {"project_id": "P002", "project_name": "尽调报告智能体", "project_type": "智能体", "domain": "对公业务", "status": "进行中", "priority": "高", "start_date": "2026-02-01", "end_date": "2026-05-30"},
    {"project_id": "P003", "project_name": "信贷场景MVP", "project_type": "应用开发", "domain": "信贷业务", "status": "测试中", "priority": "高", "start_date": "2026-01-20", "end_date": "2026-04-30"},
    {"project_id": "P004", "project_name": "反诈机器学习模型", "project_type": "模型训练", "domain": "风控安全", "status": "已上线", "priority": "高", "start_date": "2025-11-01", "end_date": "2026-03-15"},
    {"project_id": "P005", "project_name": "流水鉴真场景", "project_type": "应用开发", "domain": "风控安全", "status": "进行中", "priority": "中", "start_date": "2026-02-10", "end_date": "2026-06-15"},
    {"project_id": "P006", "project_name": "AI客户经营", "project_type": "AI应用", "domain": "客户经营", "status": "进行中", "priority": "高", "start_date": "2026-01-10", "end_date": "2026-07-31"},
    {"project_id": "P007", "project_name": "智能外呼分析", "project_type": "AI应用", "domain": "客户经营", "status": "已上线", "priority": "中", "start_date": "2025-12-01", "end_date": "2026-04-01"},
    {"project_id": "P008", "project_name": "客服辅助项目", "project_type": "智能体", "domain": "客户服务", "status": "进行中", "priority": "高", "start_date": "2026-01-05", "end_date": "2026-08-31"},
    {"project_id": "P009", "project_name": "大模型客服技改", "project_type": "技术改造", "domain": "客户服务", "status": "进行中", "priority": "中", "start_date": "2026-03-01", "end_date": "2026-06-30"},
    {"project_id": "P010", "project_name": "绿色金融智能体", "project_type": "智能体", "domain": "绿色金融", "status": "POC", "priority": "中", "start_date": "2026-03-15", "end_date": "2026-09-30"},
    {"project_id": "P011", "project_name": "East数据质量AI分析", "project_type": "数据分析", "domain": "数据治理", "status": "进行中", "priority": "高", "start_date": "2026-02-20", "end_date": "2026-07-15"},
    {"project_id": "P012", "project_name": "授信政策知识体系", "project_type": "知识管理", "domain": "信贷业务", "status": "进行中", "priority": "中", "start_date": "2026-01-25", "end_date": "2026-08-31"},
    {"project_id": "P013", "project_name": "对公信贷智能化", "project_type": "应用开发", "domain": "对公业务", "status": "进行中", "priority": "高", "start_date": "2026-02-15", "end_date": "2026-10-31"},
    {"project_id": "P014", "project_name": "零售客户分群", "project_type": "数据分析", "domain": "客户经营", "status": "已上线", "priority": "低", "start_date": "2025-10-01", "end_date": "2026-02-28"},
    {"project_id": "P015", "project_name": "知识库问答体系建设", "project_type": "知识管理", "domain": "知识服务", "status": "进行中", "priority": "中", "start_date": "2026-01-08", "end_date": "2026-09-15"},
    {"project_id": "P016", "project_name": "中试基地项目", "project_type": "基础平台", "domain": "研发平台", "status": "进行中", "priority": "中", "start_date": "2026-03-01", "end_date": "2026-12-31"},
    {"project_id": "P017", "project_name": "长文本智能分析", "project_type": "AI应用", "domain": "智能分析", "status": "已上线", "priority": "中", "start_date": "2025-11-15", "end_date": "2026-04-15"},
    {"project_id": "P018", "project_name": "智能工单场景", "project_type": "应用开发", "domain": "客户服务", "status": "测试中", "priority": "中", "start_date": "2026-02-25", "end_date": "2026-06-30"},
    {"project_id": "P019", "project_name": "NL2SQL产品POC", "project_type": "POC", "domain": "数据服务", "status": "POC", "priority": "低", "start_date": "2026-03-20", "end_date": "2026-05-20"},
    {"project_id": "P020", "project_name": "信用卡智能后督", "project_type": "应用开发", "domain": "风控安全", "status": "进行中", "priority": "中", "start_date": "2026-01-18", "end_date": "2026-08-15"},
]

# 工作类型维度
WORK_TYPES = [
    {"work_type_id": "WT01", "work_type_name": "开发（含模型、应用、数仓等）", "category": "技术实施", "description": "包括代码开发、模型训练、数据处理等技术实施工作"},
    {"work_type_id": "WT02", "work_type_name": "测试", "category": "质量保障", "description": "功能测试、性能测试、自动化测试等质量保障工作"},
    {"work_type_id": "WT03", "work_type_name": "需求分析", "category": "业务分析", "description": "需求调研、需求文档编写、需求评审等"},
    {"work_type_id": "WT04", "work_type_name": "项目管理（含外包管理）", "category": "管理协调", "description": "项目计划、进度跟踪、资源协调、外包管理等"},
    {"work_type_id": "WT05", "work_type_name": "生产运维", "category": "运维保障", "description": "生产环境监控、故障处理、系统维护等"},
    {"work_type_id": "WT06", "work_type_name": "数据分析", "category": "数据分析", "description": "数据报表、数据挖掘、业务分析等"},
    {"work_type_id": "WT07", "work_type_name": "架构设计", "category": "技术规划", "description": "技术架构设计、方案评审、技术选型等"},
    {"work_type_id": "WT08", "work_type_name": "其他", "category": "综合事务", "description": "培训、会议、文档等综合事务"},
]

# 问题模板池
PROBLEM_TEMPLATES = [
    "接口文档与实现不一致，需与下游系统对齐",
    "测试环境数据缺失，影响功能验证进度",
    "模型推理性能不达标，需优化推理链路",
    "需求变更频繁，导致开发计划调整",
    "第三方服务响应超时，需增加容错机制",
    "数据质量问题导致模型效果下降",
    "前端组件兼容性问题，需多浏览器适配",
    "生产环境配置与测试环境不一致，排查困难",
    "跨部门协作沟通成本高，进度推进缓慢",
    "技术方案评审意见不统一，需二次论证",
    "无",
    "无",
    "无",
]

# ========== 2. 构建维度表 ==========

# 员工维度
dim_employee = []
for emp in employees:
    skill_tags = []
    for k, v in emp.items():
        if '-' in k and any(x in k for x in ['能力', '设计', '开发', '理论基础', '实现']):
            if isinstance(v, int) and v >= 4:
                skill_tags.append(k.split('-', 1)[1])
    
    dim_employee.append({
        "employee_id": emp['员工ID'],
        "name": emp['姓名'],
        "gender": emp['性别'],
        "age": emp['年龄'],
        "education": emp['最高学历'],
        "position": emp['拟岗位'],
        "job_level": emp.get('job_level', '13级'),
        "group_name": emp['所属分组'],
        "is_leader": bool(emp['组长/骨干标识']),
        "is_key_project": bool(emp['重点项目成员标识']),
        "department": emp['所属科室'],
        "skill_tags": skill_tags[:5],
    })

# 科室维度 - 去重
dim_department = []
dept_map = {}
for emp in employees:
    dept = emp['所属科室']
    group = emp['所属分组']
    key = f"{dept}#{group}"
    if key not in dept_map:
        dept_map[key] = {
            "dept_id": f"D{len(dept_map)+1:03d}",
            "dept_name": dept.split('-')[-1] if '-' in dept else dept,
            "dept_full_name": dept,
            "group_name": group,
            "dept_type": "智能研发" if "智能" in dept else "数据管理" if "数据" in dept else "综合管理",
            "parent_dept": dept.split('-')[0] if '-' in dept else dept,
            "employee_count": 0,
        }
    dept_map[key]["employee_count"] += 1

dim_department = list(dept_map.values())

# 构建 dept_name -> dept_id 映射
dept_id_map = {d['dept_full_name']: d['dept_id'] for d in dim_department}

# 项目维度 - 使用PROJECT_POOL
dim_project = PROJECT_POOL
project_id_map = {p['project_name']: p['project_id'] for p in PROJECT_POOL}

# 工作类型维度
dim_work_type = WORK_TYPES
work_type_name_map = {w['work_type_name']: w['work_type_id'] for w in WORK_TYPES}

# 时间维度
dim_date = WEEKS

# ========== 3. 生成事实表 ==========

fact_records = []
task_records = []
task_id_counter = 1

for emp in employees:
    emp_tasks = emp.get('近期工作任务', [])
    emp_projects = emp.get('手头项目', [])
    emp_work_types = emp.get('工作类型', [])
    base_saturation = emp.get('工作饱和度', {}).get('总体饱和度', 80)
    base_hours = emp.get('近2年日均工时', 8.0)
    
    for week in WEEKS:
        # 本周主要项目
        primary_proj = np.random.choice(emp_projects) if emp_projects else "日常工作"
        proj_id = project_id_map.get(primary_proj, "P000")
        
        # 工作类型
        primary_work_type = emp_work_types[0] if emp_work_types else "开发（含模型、应用、数仓等）"
        wt_id = work_type_name_map.get(primary_work_type, "WT01")
        
        # 工作内容：从任务池中随机抽取3-5条
        n_content = np.random.randint(3, 6)
        if len(emp_tasks) >= n_content:
            work_content = np.random.choice(emp_tasks, size=n_content, replace=False).tolist()
        else:
            work_content = emp_tasks + [f"完成{primary_proj}相关支撑工作"] * (n_content - len(emp_tasks))
        
        # 下周计划：从任务池中随机生成2-3条
        n_plan = np.random.randint(2, 4)
        next_plan_pool = emp_tasks + [f"推进{primary_proj}下一阶段工作", "参加技术评审会议", "完成代码Review"]
        next_plan = np.random.choice(next_plan_pool, size=min(n_plan, len(next_plan_pool)), replace=False).tolist()
        
        # 遇到问题
        problem = np.random.choice(PROBLEM_TEMPLATES)
        
        # 手头持续任务
        ongoing_tasks = emp_projects[:3] if len(emp_projects) <= 3 else np.random.choice(emp_projects, 3, replace=False).tolist()
        
        # 工时：基于日均工时 × 5 ± 随机波动
        daily = max(6, min(12, base_hours + np.random.normal(0, 0.5)))
        work_hours = round(daily * 5, 1)
        
        # 饱和度微调
        week_saturation = max(50, min(110, base_saturation + np.random.normal(0, 3)))
        
        # 任务完成率
        if week_saturation >= 95:
            completion_rate = round(np.random.uniform(0.80, 0.95), 2)
        elif week_saturation >= 85:
            completion_rate = round(np.random.uniform(0.70, 0.85), 2)
        elif week_saturation >= 70:
            completion_rate = round(np.random.uniform(0.55, 0.75), 2)
        else:
            completion_rate = round(np.random.uniform(0.35, 0.60), 2)
        
        # 完成任务数
        tasks_completed = int(len(work_content) * completion_rate)
        
        # 负荷等级
        load_level = '高负荷' if week_saturation >= 95 else '饱和' if week_saturation >= 85 else '正常' if week_saturation >= 70 else '偏低'
        
        # 生成任务维度记录（本周的工作内容作为独立任务）
        week_tasks = []
        for task in work_content:
            task_rec = {
                "task_id": f"T{task_id_counter:05d}",
                "task_name": task,
                "task_category": primary_work_type,
                "related_project": primary_proj,
                "difficulty": np.random.choice(['简单', '中等', '困难']),
                "estimated_hours": round(np.random.uniform(2, 16), 1),
                "employee_id": emp['员工ID'],
                "week_date": week['week_start'],
            }
            task_records.append(task_rec)
            week_tasks.append(task_rec['task_id'])
            task_id_counter += 1
        
        fact = {
            "fact_id": f"F{emp['员工ID']:03d}_{week['date_id']}",
            "employee_id": emp['员工ID'],
            "week_date": week['week_start'],
            "dept_id": dept_id_map.get(emp['所属科室'], 'D000'),
            "primary_project_id": proj_id,
            "work_type_id": wt_id,
            "work_hours": work_hours,
            "daily_avg_hours": round(daily, 1),
            "tasks_completed": tasks_completed,
            "task_completion_rate": completion_rate,
            "work_content": work_content,
            "next_plan": next_plan,
            "problems": problem,
            "ongoing_tasks": ongoing_tasks,
            "saturation_score": round(week_saturation, 1),
            "load_level": load_level,
            "task_ids": week_tasks,
        }
        fact_records.append(fact)
    
    # 同时更新员工数据，添加weeklyReports
    emp['weeklyReports'] = [
        {
            "week_start": w['week_start'],
            "week_end": w['week_end'],
            "work_content": fact_records[i]['work_content'],
            "next_plan": fact_records[i]['next_plan'],
            "problems": fact_records[i]['problems'],
            "ongoing_tasks": fact_records[i]['ongoing_tasks'],
            "work_hours": fact_records[i]['work_hours'],
            "saturation_score": fact_records[i]['saturation_score'],
            "load_level": fact_records[i]['load_level'],
            "primary_project": primary_proj,
        }
        for i, w in enumerate(WEEKS)
    ][len(fact_records) - 4:len(fact_records)]

# 修正 weeklyReports 赋值（上面的写法有问题）
for idx, emp in enumerate(employees):
    start_idx = idx * 4
    emp['weeklyReports'] = []
    for i, w in enumerate(WEEKS):
        f = fact_records[start_idx + i]
        emp['weeklyReports'].append({
            "week_start": w['week_start'],
            "week_end": w['week_end'],
            "work_content": f['work_content'],
            "next_plan": f['next_plan'],
            "problems": f['problems'],
            "ongoing_tasks": f['ongoing_tasks'],
            "work_hours": f['work_hours'],
            "saturation_score": f['saturation_score'],
            "load_level": f['load_level'],
            "primary_project": f['primary_project_id'],
        })

# ========== 4. 组装星形模型 ==========

star_schema = {
    "model_type": "star_schema",
    "description": "员工个人周报星形模型维度建模 - 200人×4周=800条事实记录",
    "meta": {
        "fact_count": len(fact_records),
        "employee_count": N,
        "week_count": len(WEEKS),
        "project_count": len(dim_project),
        "task_count": len(task_records),
        "generated_at": "2026-05-18",
    },
    "fact_table": {
        "name": "fact_employee_weekly",
        "description": "员工周报事实表，记录每个人每周的工作内容、工时、饱和度等可度量指标",
        "grain": "每人每周一条记录",
        "records": fact_records,
    },
    "dimensions": {
        "dim_employee": {
            "name": "dim_employee",
            "description": "员工维度表",
            "records": dim_employee,
        },
        "dim_date": {
            "name": "dim_date",
            "description": "时间维度表",
            "records": dim_date,
        },
        "dim_department": {
            "name": "dim_department",
            "description": "科室维度表",
            "records": dim_department,
        },
        "dim_project": {
            "name": "dim_project",
            "description": "项目维度表",
            "records": dim_project,
        },
        "dim_work_type": {
            "name": "dim_work_type",
            "description": "工作类型维度表",
            "records": dim_work_type,
        },
        "dim_task": {
            "name": "dim_task",
            "description": "任务维度表，记录每条独立任务",
            "records": task_records,
        },
    }
}

# ========== 5. 保存 ==========

# 保存星形模型
with open('src/data/employee-weekly-star-schema.json', 'w', encoding='utf-8') as f:
    json.dump(star_schema, f, ensure_ascii=False, indent=2)

# 更新合成数据（添加weeklyReports）
data['meta']['fields'] = list(employees[0].keys())
with open('src/data/employee-synthetic.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)

print(f"星形模型生成完成！")
print(f"  事实记录: {len(fact_records)} 条")
print(f"  员工维度: {len(dim_employee)} 条")
print(f"  时间维度: {len(dim_date)} 条")
print(f"  科室维度: {len(dim_department)} 条")
print(f"  项目维度: {len(dim_project)} 条")
print(f"  工作类型维度: {len(dim_work_type)} 条")
print(f"  任务维度: {len(task_records)} 条")

# 样例
print(f"\n=== 样例：员工{employees[0]['姓名']}的4周周报 ===")
for wk in employees[0]['weeklyReports']:
    print(f"\n  周: {wk['week_start']} ~ {wk['week_end']}")
    print(f"  工时: {wk['work_hours']}h, 饱和度: {wk['saturation_score']}%({wk['load_level']})")
    print(f"  工作内容({len(wk['work_content'])}条):")
    for c in wk['work_content']:
        print(f"    - {c}")
    print(f"  下周计划: {wk['next_plan']}")
    print(f"  问题: {wk['problems']}")

# 统计
load_dist = {'高负荷': 0, '饱和': 0, '正常': 0, '偏低': 0}
for f in fact_records:
    load_dist[f['load_level']] += 1
print(f"\n=== 负荷等级分布（800条事实记录）===")
for k, v in load_dist.items():
    print(f"  {k}: {v}条 ({v/len(fact_records)*100:.1f}%)")

# 文件大小
import os
size = os.path.getsize('src/data/employee-weekly-star-schema.json')
print(f"\n文件大小: {size:,} bytes ({size/1024:.1f} KB)")
