#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
基于 merged_employee_wide_table.csv 的86个字段，为每个员工生成统一标签体系。
标签写入新列 "标签体系"。
"""

import pandas as pd
import json
import numpy as np
import re


def parse_email_tags(tag_str):
    """解析邮件标签JSON字符串"""
    if pd.isna(tag_str) or not str(tag_str).strip():
        return {}
    try:
        return json.loads(str(tag_str).replace("'", '"'))
    except:
        return {}


def parse_close_departments(dept_str):
    """解析close_departments"""
    if pd.isna(dept_str) or not str(dept_str).strip():
        return []
    try:
        d = json.loads(str(dept_str).replace("'", '"'))
        return [x for x in d if x and str(x).strip()]
    except:
        return []


def generate_tags(row):
    """为单行数据生成完整标签列表"""
    tags = []

    # ========== 1. 人员属性 ==========
    gender = str(row.get('性别', '')).strip()
    if gender == '男':
        tags.append('男员工')
    elif gender == '女':
        tags.append('女员工')

    edu = str(row.get('最高学历', '')).strip()
    if edu == '研究生':
        tags.append('研究生学历')
    elif edu == '大学本科':
        tags.append('本科学历')

    recruit = str(row.get('校招/社招标识', '')).strip()
    if recruit == '校园招聘':
        tags.append('校招生')
    elif recruit == '社会招聘':
        tags.append('社招员工')

    work_years = pd.to_numeric(row.get('累计工龄'), errors='coerce')
    if pd.notna(work_years):
        if work_years <= 2:
            tags.append('工龄新手')
        elif work_years <= 5:
            tags.append('工龄成长型')
        elif work_years <= 10:
            tags.append('工龄中坚')
        else:
            tags.append('工龄资深')

    # ========== 2. 角色身份 ==========
    role = str(row.get('科长/组长/骨干标识', '')).strip()
    if role == '科长':
        tags.append('科长')
    elif role == '组长':
        tags.append('组长')
    elif role == '骨干':
        tags.append('骨干员工')

    pm_arch = str(row.get('产品经理/架构师标识', '')).strip()
    if '产品经理' in pm_arch:
        tags.append('产品经理')
    if '架构师' in pm_arch:
        tags.append('架构师')

    mentor = pd.to_numeric(row.get('近2年带教人数'), errors='coerce')
    if pd.notna(mentor) and mentor > 0:
        tags.append('带教师傅')

    # ========== 3. 工作饱和度 ==========
    saturation = str(row.get('饱和度量化 不饱和：平均加班时长1h以下/无变更任务无主管应用非组长骨干/科长评定不饱和 超负荷：季度变更任务≥10/加班4H以上超过30次/平均加班时长3H以', '')).strip()
    if '超负荷' in saturation:
        tags.append('工作超负荷')
    elif '不饱和' in saturation:
        tags.append('工作不饱和')
    elif '适中' in saturation:
        tags.append('工作饱和度适中')

    avg_overtime = pd.to_numeric(row.get('平均加班时长'), errors='coerce')
    if pd.notna(avg_overtime):
        if avg_overtime > 2.7:
            tags.append('高加班')
        elif avg_overtime >= 1.5:
            tags.append('中加班')
        elif avg_overtime < 1.0:
            tags.append('低加班')

    overtime_4h = pd.to_numeric(row.get('加班4h以上频次'), errors='coerce')
    if pd.notna(overtime_4h):
        if overtime_4h >= 20:
            tags.append('深夜加班频繁')
        elif overtime_4h == 0:
            tags.append('无深夜加班')

    # ========== 4. 工作产出 ==========
    lead_proj = pd.to_numeric(row.get('牵头项目数量'), errors='coerce')
    if pd.notna(lead_proj) and lead_proj > 0:
        tags.append('项目负责人')

    lead_req = pd.to_numeric(row.get('牵头需求数量'), errors='coerce')
    if pd.notna(lead_req):
        if lead_req >= 5:
            tags.append('高频需求负责人')
        elif lead_req >= 2:
            tags.append('需求负责人')

    app_sys = pd.to_numeric(row.get('主管应用系统数量（近六个月有变更的数量）'), errors='coerce')
    if pd.notna(app_sys) and app_sys > 0:
        tags.append('应用主管')

    change_q2 = pd.to_numeric(row.get('二季度变更任务数'), errors='coerce')
    change_q3 = pd.to_numeric(row.get('三季度变更任务数'), errors='coerce')
    total_change = (change_q2 if pd.notna(change_q2) else 0) + (change_q3 if pd.notna(change_q3) else 0)
    if total_change >= 10:
        tags.append('变更任务密集')
    elif total_change >= 5:
        tags.append('变更任务较多')

    paso = pd.to_numeric(row.get('新paso体系参与应用数量'), errors='coerce')
    if pd.notna(paso) and paso > 0:
        tags.append('PASO参与者')

    code_4m = pd.to_numeric(row.get('4月代码行数'), errors='coerce')
    if pd.notna(code_4m) and code_4m > 50000:
        tags.append('高代码产出')

    # ========== 5. 能力与评价 ==========
    leadership = pd.to_numeric(row.get('领导力'), errors='coerce')
    if pd.notna(leadership):
        if leadership >= 2:
            tags.append('领导力优秀')
        elif leadership <= 1:
            tags.append('领导力待提升')

    prof = pd.to_numeric(row.get('专业能力'), errors='coerce')
    if pd.notna(prof):
        if prof >= 4:
            tags.append('专业能力突出')
        elif prof >= 3:
            tags.append('专业能力优秀')
        elif prof <= 2:
            tags.append('专业能力良好')

    attitude = pd.to_numeric(row.get('工作态度'), errors='coerce')
    if pd.notna(attitude):
        if attitude >= 3:
            tags.append('工作态度积极')
        elif attitude == 2:
            tags.append('工作态度良好')
        elif attitude <= 1:
            tags.append('工作态度待加强')

    teamwork = pd.to_numeric(row.get('团队合作'), errors='coerce')
    if pd.notna(teamwork):
        if teamwork >= 3:
            tags.append('团队合作佳')
        elif teamwork >= 2:
            tags.append('团队合作良好')

    total_score = pd.to_numeric(row.get('累计'), errors='coerce')
    if pd.notna(total_score):
        if total_score >= 10:
            tags.append('综合评分高')
        elif total_score >= 7:
            tags.append('综合评分中')
        else:
            tags.append('综合评分待提升')

    # ========== 6. 培养潜力 ==========
    category = str(row.get('归类', '')).strip()
    if '高潜' in category:
        tags.append('高潜培养对象')
    if '二梯队' in category or '可培养' in category:
        tags.append('二梯队人才')
    if '技术路线' in category:
        tags.append('技术路线推荐')
    if '不作为优先' in category:
        tags.append('非优先培养对象')

    # ========== 7. 考试与技能 ==========
    test_avg = pd.to_numeric(row.get('测试_考试平均成绩'), errors='coerce')
    dev_avg = pd.to_numeric(row.get('研发_考试平均成绩'), errors='coerce')
    exam_scores = [s for s in [test_avg, dev_avg] if pd.notna(s)]
    if exam_scores:
        best = max(exam_scores)
        if best >= 85:
            tags.append('考试成绩优秀')
        elif best >= 70:
            tags.append('考试成绩良好')
        elif best < 60:
            tags.append('考试成绩待提升')

    skill_exam = pd.to_numeric(row.get('技能考试成绩'), errors='coerce')
    if pd.notna(skill_exam):
        if skill_exam >= 85:
            tags.append('技能考试高分')
        elif skill_exam < 60:
            tags.append('技能考试待提升')

    cert = str(row.get('外部证书', '')).strip()
    if cert and cert != 'nan' and cert != '0':
        tags.append('持外部证书')

    # ========== 8. 培训与学习 ==========
    train_total = pd.to_numeric(row.get('年度参加培训次数'), errors='coerce')
    if pd.notna(train_total):
        if train_total >= 14:
            tags.append('学习积极分子')
        elif train_total >= 8:
            tags.append('学习活跃')

    internal_train = pd.to_numeric(row.get('年度部门内培训次数'), errors='coerce')
    if pd.notna(internal_train) and internal_train > 0:
        tags.append('内训讲师')

    external_train = pd.to_numeric(row.get('年度部门外培训次数'), errors='coerce')
    if pd.notna(external_train) and external_train > 0:
        tags.append('外训参与者')

    kb = pd.to_numeric(row.get('查看知识库会议纪要次数(3个月)'), errors='coerce')
    if pd.notna(kb) and kb >= 3:
        tags.append('知识库活跃')

    train_participate = pd.to_numeric(row.get('培训参与次数'), errors='coerce')
    if pd.notna(train_participate) and train_participate >= 7:
        tags.append('培训参与度高')

    # ========== 9. 考勤纪律 ==========
    late_total = pd.to_numeric(row.get('迟到_2026年迟到合计'), errors='coerce')
    if pd.notna(late_total):
        if late_total == 0:
            tags.append('考勤全勤')
        elif late_total <= 3:
            tags.append('考勤良好')
        elif late_total >= 15:
            tags.append('考勤问题严重')
        elif late_total >= 8:
            tags.append('考勤需关注')

    # ========== 10. 工作节奏与沟通风格 ==========
    rhythm = str(row.get('work_rhythm_description', '')).strip()
    if '高强度' in rhythm or '高负荷' in rhythm:
        tags.append('高强度工作')
    if '项目驱动' in rhythm:
        tags.append('项目驱动型')
    if '监管驱动' in rhythm:
        tags.append('监管驱动型')
    if '流程' in rhythm:
        tags.append('流程导向型')
    if '专注' in rhythm:
        tags.append('专注型工作风格')
    if '协作' in rhythm:
        tags.append('协作型工作风格')

    # 邮件标签分析
    email_tags = parse_email_tags(row.get('邮件标签'))
    if email_tags:
        total_emails = sum(v for v in email_tags.values() if isinstance(v, (int, float)))
        if total_emails > 1000:
            tags.append('邮件高频用户')

        # 会议相关
        meeting_count = sum(v for k, v in email_tags.items() if '会议' in k and isinstance(v, (int, float)))
        if meeting_count > 100:
            tags.append('会议达人')

        # 项目相关
        proj_count = sum(v for k, v in email_tags.items() if '项目' in k and isinstance(v, (int, float)))
        if proj_count > 200:
            tags.append('邮件项目管理型')

        # 运维/技术支持
        ops_count = sum(v for k, v in email_tags.items() if any(x in k for x in ['运维', '技术支持', '问题排查']) and isinstance(v, (int, float)))
        if ops_count > 100:
            tags.append('邮件运维支持型')

        # 数据开发/模型
        data_count = sum(v for k, v in email_tags.items() if any(x in k for x in ['数据开发', '模型', '数据治理', '数据资产']) and isinstance(v, (int, float)))
        if data_count > 100:
            tags.append('邮件数据开发型')

        # 授权审批/流程
        auth_count = sum(v for k, v in email_tags.items() if any(x in k for x in ['授权', '审批', '流程']) and isinstance(v, (int, float)))
        if auth_count > 200:
            tags.append('邮件流程审批型')

    # 跨部门协作
    close_depts = parse_close_departments(row.get('close_departments'))
    if len(close_depts) > 15:
        tags.append('跨部门广泛协作')
    elif len(close_depts) > 8:
        tags.append('跨部门协作活跃')

    # ========== 11. 其他特质 ==========
    traits = str(row.get('其他特质', '')).strip()
    if traits and traits != 'nan':
        if '冲劲' in traits:
            tags.append('有冲劲')
        if '潜力' in traits or '培养' in traits:
            tags.append('有潜力')
        if '思想' in traits:
            tags.append('有思想')
        if '外向' in traits:
            tags.append('偏外向')
        if '大局观' in traits:
            tags.append('大局观')
        if '人缘' in traits or '意见领袖' in traits:
            tags.append('人缘好')
        if '进取' in traits or '渴望' in traits:
            tags.append('进取心强')
        if '管理张力' in traits and '欠缺' in traits:
            tags.append('管理张力不足')
        if '埋头苦干' in traits:
            tags.append('埋头苦干型')
        if '敬业' in traits:
            tags.append('敬业')

    # ========== 12. 部门 ==========
    dept = str(row.get('团队', '')).strip()
    if dept and dept != 'nan':
        tags.append(f'部门_{dept}')

    # 岗位变动
    job_change = pd.to_numeric(row.get('岗位变动次数'), errors='coerce')
    if pd.notna(job_change) and job_change >= 2:
        tags.append('岗位经历丰富')

    # ========== 13. 专业方向（基于summary字段提取） ==========
    summary = str(row.get('summary', ''))
    if summary and summary != 'nan':
        # 定义专业方向关键词映射
        prof_directions = [
            ('数据开发', ['数据开发', 'ETL', '数据集成', '数据加工']),
            ('数据建模', ['模型设计', '数据建模', '数据仓库']),
            ('AI算法', ['AI算法', '算法', '机器学习', '深度学习', '人工智能', '大模型']),
            ('数据平台', ['数据平台', '平台运维', '数据中台', '数据湖', '大数据平台']),
            ('架构设计', ['架构设计', '技术架构', '系统架构', '架构评审', '架构迁移']),
            ('数据库管理', ['数据库', 'DBA', '数据库变更', '数据存储']),
            ('征信合规', ['征信', '征信报送', '数据合规', '监管报送', '监管合规']),
            ('测试工程', ['测试', '投产演练', '系统测试', '自动化测试', '性能测试']),
            ('项目管理', ['项目管理', '需求管理', '需求评估', '项目协调', '项目推进']),
            ('数据治理', ['数据治理', '数据质量', '数据标准', '元数据', '数据血缘']),
            ('应用开发', ['应用开发', '系统开发', '软件开发', '接口开发', 'API']),
            ('信创迁移', ['信创', '国产化', '技术升级', '架构迁移']),
            ('数据分析', ['数据分析', 'BI', '报表', '数据可视化', '数据挖掘']),
            ('运维支持', ['运维支持', '技术支持', '系统运维', '平台运维']),
            ('数据安全', ['数据安全', '权限', '脱敏', '加密', '安全管控']),
            ('风险模型', ['风险模型', '风控', '反欺诈', '反洗钱']),
            ('对公业务', ['对公', '公司业务']),
            ('零售业务', ['零售', '信用卡', '普惠']),
            ('文档流程', ['知识库', '文档管理', '流程管理', '制度规范']),
            ('数据迁移', ['数据迁移', '数据同步', '数据清洗']),
        ]
        for tag_name, keywords in prof_directions:
            for kw in keywords:
                if kw in summary:
                    tags.append(tag_name)
                    break

    # 去重并返回
    seen = set()
    unique_tags = []
    for t in tags:
        if t not in seen:
            seen.add(t)
            unique_tags.append(t)
    return unique_tags


def main():
    df = pd.read_csv('data/merged_employee_wide_table.csv', encoding='utf-8-sig')
    
    print(f"加载数据: {df.shape[0]} 人 × {df.shape[1]} 字段")
    
    all_tags = []
    tag_counts = {}
    for idx, row in df.iterrows():
        tags = generate_tags(row)
        all_tags.append('、'.join(tags))
        for t in tags:
            tag_counts[t] = tag_counts.get(t, 0) + 1
    
    df['标签体系'] = all_tags
    
    # 保存
    df.to_csv('data/merged_employee_wide_table.csv', index=False, encoding='utf-8-sig')
    print(f"\n标签已写入 '标签体系' 列")
    
    # 统计
    print(f"\n共生成 {len(tag_counts)} 种标签，人均标签数: {np.mean([len(t.split('、')) for t in all_tags]):.1f}")
    print(f"\n标签分布Top30:")
    for tag, cnt in sorted(tag_counts.items(), key=lambda x: -x[1])[:30]:
        print(f"  {tag}: {cnt}人")
    
    # 输出样例
    print(f"\n样例标签（前3人）:")
    for i in range(min(3, len(df))):
        name = df.iloc[i]['姓名']
        tags = all_tags[i]
        print(f"  {name}: {tags}")


if __name__ == '__main__':
    main()
