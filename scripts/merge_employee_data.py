#!/usr/bin/env python3
"""
将 data 文件夹下所有含姓名字段的员工数据文件合并为一张宽表。
以【人员画像】2.1 全量203人-11月 为主表，按姓名 left join 其他表。
"""
import pandas as pd
import json
import os

DATA_DIR = "/Users/spl/PycharmProjects/HRM/git_-ehr/data"
OUTPUT_CSV = os.path.join(DATA_DIR, "merged_employee_wide_table.csv")
OUTPUT_JSON = os.path.join(DATA_DIR, "merged_employee_wide_table.json")


def load_portrait_main():
    """主表：人员画像 2.1 全量203人-11月"""
    df = pd.read_excel(
        os.path.join(DATA_DIR, "【人员画像】分析情况汇总-20251106-.xlsx"),
        sheet_name="2.1 全量203人-11月",
        header=1,
    )
    # 前2列是序号和姓名
    df = df.rename(columns={"Unnamed: 0": "序号", "Unnamed: 1": "姓名"})
    # 删除全空列
    df = df.dropna(axis=1, how="all")
    # 清理超长列名
    df.columns = [c.replace("\n", " ").strip()[:80] for c in df.columns]
    print(f"[主表] 人员画像 2.1 全量203人-11月: {len(df)}行 x {len(df.columns)}列")
    return df


def load_2025_portrait():
    """2025数据管理与应用部个人画像导出"""
    df = pd.read_csv(
        os.path.join(DATA_DIR, "2025数据管理与应用部个人画像导出.csv"),
        encoding="gbk",
    )
    # 去重：同一人可能有多行（不同年份？这里只有2025年）
    df = df.drop_duplicates(subset=["姓名"], keep="first")
    # 重命名避免冲突
    df = df.rename(columns={
        "科室名称": "画像导出_科室名称",
        "年份": "画像导出_年份",
    })
    print(f"[附表] 2025个人画像导出: {len(df)}行 x {len(df.columns)}列")
    return df[["姓名", "画像导出_年份", "画像导出_科室名称", "邮件标签", "邮件来往人",
               "close_departments", "work_rhythm_description", "work_rhythm_details", "summary"]]


def load_employee_info():
    """员工信息数据"""
    df = pd.read_csv(
        os.path.join(DATA_DIR, "员工信息数据.csv"),
        encoding="utf-8-sig",
    )
    # 员工信息有225行，去重
    df = df.drop_duplicates(subset=["员工ID"], keep="first")
    # 通过员工ID关联？不，这个表没有姓名。通过其他方式。
    # 等等，员工信息数据表没有姓名列！只有员工ID。
    # 无法直接按姓名合并。先检查是否有姓名。
    if "姓名" not in df.columns:
        print(f"[附表] 员工信息数据: {len(df)}行 x {len(df.columns)}列 — 警告：无'姓名'列，无法直接合并")
        return None
    return df


def load_attendance_code():
    """考勤/代码量画像"""
    df = pd.read_excel(
        os.path.join(DATA_DIR, "考勤/数据部3月份代码量统计-员工360画像.xlsx"),
        sheet_name="Sheet2",
    )
    df = df.rename(columns={
        "部门": "考勤_部门",
        "岗位": "考勤_岗位",
    })
    print(f"[附表] 考勤代码量画像: {len(df)}行 x {len(df.columns)}列")
    return df


def load_exam_test():
    """技能考试-测试"""
    df = pd.read_excel(
        os.path.join(DATA_DIR, "技能考试/2026年技术序列考试成绩-测试.xlsx"),
        sheet_name="考试成绩清单",
    )
    df = df.dropna(subset=["姓名"])
    # 按姓名聚合：取平均成绩、考试次数
    agg = df.groupby("姓名").agg({
        "考试成绩": ["mean", "max", "count"],
    }).reset_index()
    agg.columns = ["姓名", "测试_考试平均成绩", "测试_考试最高成绩", "测试_考试次数"]
    print(f"[附表] 技能考试-测试: {len(agg)}人")
    return agg


def load_exam_dev():
    """技能考试-研发及管理岗"""
    df = pd.read_excel(
        os.path.join(DATA_DIR, "技能考试/2026年技术序列考试成绩-研发及管理岗.xlsx"),
        sheet_name="考试成绩清单",
    )
    df.columns = [str(c) for c in df.columns]
    df = df.dropna(subset=["姓名"])
    df["姓名"] = df["姓名"].astype(str)
    df["考试成绩"] = pd.to_numeric(df["考试成绩"], errors="coerce")
    agg = df.groupby("姓名").agg({
        "考试成绩": ["mean", "max", "count"],
    }).reset_index()
    agg.columns = ["姓名", "研发_考试平均成绩", "研发_考试最高成绩", "研发_考试次数"]
    print(f"[附表] 技能考试-研发及管理岗: {len(agg)}人")
    return agg


def load_late():
    """工时-迟到次数"""
    df = pd.read_excel(
        os.path.join(DATA_DIR, "工时/2026年3月行员迟到加班统计-202603.xlsx"),
        sheet_name="2026年迟到次数",
    )
    df = df.dropna(subset=["姓名"])
    df = df.rename(columns={
        "2026年迟到合计": "迟到_2026年迟到合计",
        "所属团队": "迟到_所属团队",
        "所属组": "迟到_所属组",
    })
    print(f"[附表] 2026年迟到次数: {len(df)}人")
    return df[["姓名", "迟到_2026年迟到合计", "迟到_所属团队", "迟到_所属组"]]


def load_overtime():
    """工时-加班时长"""
    df = pd.read_excel(
        os.path.join(DATA_DIR, "工时/2026年3月行员迟到加班统计-202603.xlsx"),
        sheet_name="2026年加班时长",
    )
    df = df.dropna(subset=["姓名"])
    df = df.rename(columns={
        "2026年加班时长合计": "加班_2026年加班时长合计",
    })
    print(f"[附表] 2026年加班时长: {len(df)}人")
    return df[["姓名", "加班_2026年加班时长合计"]]


def load_report():
    """报工和考勤数据"""
    df = pd.read_excel(
        os.path.join(DATA_DIR, "工时/工时分析_行员区分.xlsx"),
        sheet_name="报工和考勤数据",
    )
    df = df.dropna(subset=["姓名"])
    df = df.rename(columns={
        "部门": "报工_部门",
        "时长（分钟）": "报工_时长分钟",
        "考勤人天数": "报工_考勤人天数",
        "考勤日期数": "报工_考勤日期数",
        "报工人天": "报工_报工人天",
        "报工差异比例": "报工_报工差异比例",
    })
    print(f"[附表] 报工和考勤数据: {len(df)}人")
    return df[["姓名", "报工_部门", "报工_时长分钟", "报工_考勤人天数",
               "报工_考勤日期数", "报工_报工人天", "报工_报工差异比例"]]


def load_leader_list():
    """组长骨干名单"""
    df = pd.read_excel(
        os.path.join(DATA_DIR, "【人员画像】分析情况汇总-20251106-.xlsx"),
        sheet_name="组长骨干名单",
    )
    df = df.dropna(subset=["姓名"])
    df = df.rename(columns={
        "团队": "骨干_团队",
        "组名": "骨干_组名",
        "标识": "骨干_标识",
    })
    print(f"[附表] 组长骨干名单: {len(df)}人")
    return df[["姓名", "骨干_团队", "骨干_组名", "骨干_标识"]]


def load_work_years():
    """累计工龄"""
    df = pd.read_excel(
        os.path.join(DATA_DIR, "【人员画像】分析情况汇总-20251106-.xlsx"),
        sheet_name="累计工龄",
    )
    # 只取前两列
    df = df.iloc[:, :2].copy()
    df.columns = ["姓名", "累计工龄_画像"]
    df = df.dropna(subset=["姓名"])
    print(f"[附表] 累计工龄: {len(df)}人")
    return df


def load_pm_arch():
    """产品经理架构师 — 按人聚合应用个数"""
    df = pd.read_excel(
        os.path.join(DATA_DIR, "【人员画像】分析情况汇总-20251106-.xlsx"),
        sheet_name="产品经理架构师",
    )
    df = df.dropna(subset=["姓名"])
    agg = df.groupby("姓名").agg({
        "应用个数": "sum",
    }).reset_index()
    agg.columns = ["姓名", "PM架构_应用个数合计"]
    print(f"[附表] 产品经理架构师: {len(agg)}人")
    return agg


def merge_all():
    """执行合并"""
    print("=" * 60)
    print("开始合并所有员工数据文件")
    print("=" * 60)

    # 主表
    main = load_portrait_main()

    # 逐张 left join
    tables = [
        ("2025个人画像导出", load_2025_portrait),
        ("员工信息数据", load_employee_info),
        ("考勤代码量画像", load_attendance_code),
        ("技能考试-测试", load_exam_test),
        ("技能考试-研发", load_exam_dev),
        ("迟到次数", load_late),
        ("加班时长", load_overtime),
        ("报工考勤", load_report),
        ("组长骨干", load_leader_list),
        ("累计工龄", load_work_years),
        ("PM架构师", load_pm_arch),
    ]

    merged = main.copy()
    merged_cols_before = len(merged.columns)
    all_fields = {("主表-人员画像", c) for c in main.columns}

    for label, loader in tables:
        try:
            df = loader()
            if df is None:
                print(f"  -> 跳过 {label}（无法加载）")
                continue
            before = len(merged)
            merged = merged.merge(df, on="姓名", how="left")
            after = len(merged)
            new_cols = [c for c in merged.columns if c not in [x[1] for x in all_fields]]
            for c in new_cols:
                all_fields.add((label, c))
            print(f"  -> 合并后: {len(merged.columns)}列, 行数{'（出现膨胀！）' if after != before else '正常'}")
        except Exception as e:
            print(f"  -> {label} 合并失败: {e}")

    # 输出
    merged.to_csv(OUTPUT_CSV, index=False, encoding="utf-8-sig")

    # JSON 输出（逐行记录）
    records = merged.fillna("").to_dict(orient="records")
    with open(OUTPUT_JSON, "w", encoding="utf-8") as f:
        json.dump({"employees": records}, f, ensure_ascii=False, indent=2)

    print("\n" + "=" * 60)
    print(f"合并完成！")
    print(f"  宽表行数: {len(merged)}")
    print(f"  宽表列数: {len(merged.columns)}")
    print(f"  CSV输出: {OUTPUT_CSV}")
    print(f"  JSON输出: {OUTPUT_JSON}")
    print("=" * 60)

    # 列出所有字段来源
    print("\n字段来源统计：")
    source_counts = {}
    for src, col in all_fields:
        source_counts[src] = source_counts.get(src, 0) + 1
    for src, cnt in sorted(source_counts.items(), key=lambda x: -x[1]):
        print(f"  {src}: {cnt}个字段")

    # 检查主表中未匹配到的人数
    unmatched = merged["姓名"].isna().sum()
    print(f"\n未匹配到姓名的记录: {unmatched}人")

    return merged, all_fields


if __name__ == "__main__":
    merge_all()
