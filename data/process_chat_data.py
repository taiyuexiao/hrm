#!/usr/bin/env python3
"""
Process HR data sources and generate a structured knowledge base JSON
for LLM chat prompts. Keeps total output concise (<4000 tokens).
"""

import json
import os
import re
import warnings
from pathlib import Path
from typing import Any

import pandas as pd
from openpyxl import load_workbook

warnings.filterwarnings("ignore", category=UserWarning)

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_GONGSHI_DIR = BASE_DIR / "data" / "工时"
EMPLOYEE_INFO_PATH = BASE_DIR / "data" / "员工信息数据.xlsx"
CODE_SUBMISSION_PATH = BASE_DIR / "src" / "data" / "code-submission.json"
DEPT_WORK_PLANS_PATH = BASE_DIR / "src" / "data" / "dept-work-plans.json"
OUTPUT_PATH = BASE_DIR / "src" / "data" / "chat-knowledge-base.json"

TOP_N = 5
AGG_TOP_N = 20  # 按人汇总的Top N数量
MAX_SUMMARY_LEN = 220


def read_sheet_with_fallback(path: str, sheet_name: str) -> tuple[pd.DataFrame | None, str]:
    """Try pandas first, then openpyxl read_only."""
    try:
        df = pd.read_excel(path, sheet_name=sheet_name, engine="openpyxl")
        return df, "pandas"
    except Exception:
        try:
            wb = load_workbook(path, data_only=True, read_only=True)
            try:
                ws = wb[sheet_name]
                rows = [row for row in ws.iter_rows(values_only=True)]
                wb.close()
                if not rows:
                    return pd.DataFrame(), "openpyxl_empty"
                df = pd.DataFrame(rows[1:], columns=rows[0])
                return df, "openpyxl"
            except Exception as e_sheet:
                wb.close()
                return None, f"openpyxl_sheet_error: {e_sheet}"
        except Exception as e_wb:
            return None, f"openpyxl_wb_error: {e_wb}"


def clean_dataframe(df: pd.DataFrame) -> pd.DataFrame:
    if df is None or df.empty:
        return df
    df = df.dropna(how="all").dropna(axis=1, how="all")
    df.columns = [
        "" if isinstance(c, str) and c.startswith("Unnamed:") else c
        for c in df.columns
    ]
    return df.reset_index(drop=True)


def numeric_stats(df: pd.DataFrame) -> dict[str, dict[str, float]]:
    stats = {}
    numeric_df = df.select_dtypes(include=["number"])
    for col in numeric_df.columns:
        if pd.isna(col) or col == "":
            continue
        series = numeric_df[col].dropna()
        if series.empty:
            continue
        stats[str(col)] = {
            "sum": round(float(series.sum()), 1),
            "mean": round(float(series.mean()), 1),
            "max": round(float(series.max()), 1),
            "min": round(float(series.min()), 1),
        }
    return stats


def pick_best_top_column(df: pd.DataFrame) -> str | None:
    """Pick the single best numeric column for top-N ranking."""
    numeric_df = df.select_dtypes(include=["number"])
    best = None
    best_score = -999
    for col in numeric_df.columns:
        if pd.isna(col) or col == "":
            continue
        col_str = str(col)
        series = numeric_df[col].dropna()
        if len(series) < 2:
            continue
        score = 0
        # Strongly prefer totals / business metrics
        if any(k in col_str for k in ["合计", "总计", "sum", "total", "时长", "工时", "加班", "迟到", "人天", "次数", "行数"]):
            score += 20
        if series.std() > 0:
            score += 2
        # Deprioritize IDs
        if col_str in ["编号", "工号", "ID", "id", "序号", "员工ID"]:
            score -= 10
        if score > best_score:
            best_score = score
            best = col_str
    return best


def get_top_records(df: pd.DataFrame, col: str, n: int = TOP_N) -> list[dict[str, Any]]:
    if col not in df.columns:
        return []
    # Keep only name-like identifiers + the metric
    keep = [col]
    for c in df.columns:
        s = str(c)
        if s == col:
            continue
        if s in ["姓名"]:
            keep.insert(0, c)
        elif s in ["部门", "所属团队", "团队"]:
            keep.append(c)
    keep = keep[:3]  # max 3 fields
    sub = df[keep].copy()
    try:
        sub[col] = pd.to_numeric(sub[col], errors="coerce")
    except Exception:
        return []
    sub = sub.dropna(subset=[col])
    if sub.empty:
        return []
    top = sub.nlargest(n, col)
    records = []
    for _, row in top.iterrows():
        rec = {}
        for c in top.columns:
            v = row[c]
            if pd.isna(v):
                continue
            rec[str(c)] = v if isinstance(v, (str, int, float, bool)) else str(v)
        records.append(rec)
    return records


def aggregate_by_person(df: pd.DataFrame) -> pd.DataFrame | None:
    """对考勤/工时类sheet按姓名汇总，返回汇总后的DataFrame"""
    # 查找姓名列和数值列
    name_col = None
    dept_col = None
    for c in df.columns:
        s = str(c)
        if s == "姓名":
            name_col = c
        elif s in ["部门", "所属团队", "团队"]:
            dept_col = c
    if name_col is None:
        return None

    numeric_cols = [c for c in df.columns if pd.api.types.is_numeric_dtype(df[c])]
    # 优先汇总与工时/加班/时长相关的列
    agg_cols = [c for c in numeric_cols if any(k in str(c) for k in ["加班", "工时", "时长", "工作"])]
    if not agg_cols:
        agg_cols = numeric_cols[:3]  #  fallback

    agg_dict = {c: "sum" for c in agg_cols}
    group_cols = [name_col]
    if dept_col:
        group_cols.append(dept_col)

    try:
        grouped = df.groupby(group_cols, as_index=False).agg(agg_dict)
        return grouped
    except Exception:
        return None


def get_aggregated_top_records(df: pd.DataFrame, n: int = AGG_TOP_N) -> dict[str, list[dict[str, Any]]]:
    """按人汇总后取Top N"""
    agg_df = aggregate_by_person(df)
    if agg_df is None or agg_df.empty:
        return {}

    result = {}
    for col in agg_df.columns:
        if col in ["姓名"] or pd.api.types.is_string_dtype(agg_df[col]):
            continue
        col_str = str(col)
        if any(k in col_str for k in ["加班", "工时", "时长", "工作"]):
            try:
                top = agg_df.nlargest(n, col)[[c for c in agg_df.columns if c in ["姓名", "部门", "所属团队", "团队", col]]]
                records = []
                for _, row in top.iterrows():
                    rec = {}
                    for c in top.columns:
                        v = row[c]
                        if pd.isna(v):
                            continue
                        rec[str(c)] = v if isinstance(v, (str, int, float, bool)) else str(v)
                    records.append(rec)
                if records:
                    result[f"{col}_汇总"] = records
            except Exception:
                continue
    return result


def summarize_sheet(file_name: str, sheet_name: str, df: pd.DataFrame, source: str) -> dict[str, Any] | None:
    df = clean_dataframe(df)
    row_count = len(df)
    if row_count == 0 and source.startswith("openpyxl"):
        # Skip empty unreadable sheets silently
        return None

    col_names = [str(c) for c in df.columns if c != "" and not pd.isna(c)]
    stats = numeric_stats(df)
    best_col = pick_best_top_column(df)
    top_records = {}
    if best_col:
        recs = get_top_records(df, best_col, n=TOP_N)
        if recs:
            top_records[best_col] = recs

    # 对考勤/工时类sheet，额外生成按人汇总的Top N
    aggregated_records = {}
    if any(k in sheet_name for k in ["考勤", "工时", "加班", "迟到"]) or any(k in file_name for k in ["工时", "考勤", "加班"]):
        aggregated_records = get_aggregated_top_records(df, n=AGG_TOP_N)

    # Compact summary text
    parts = [f"{sheet_name}({row_count}行,{len(col_names)}列)"]
    if stats:
        stat_parts = []
        for col, s in list(stats.items())[:4]:
            stat_parts.append(f"{col}:均值{s['mean']}最大{s['max']}")
        parts.append(";".join(stat_parts))
    if top_records:
        parts.append(f"Top by {best_col}: {[r.get('姓名', r.get(best_col)) for r in list(top_records.values())[0]]}")
    if aggregated_records:
        first_key = list(aggregated_records.keys())[0]
        names = [r.get('姓名', '?') for r in aggregated_records[first_key][:5]]
        parts.append(f"按人汇总Top: {', '.join(names)}...")

    summary_text = " | ".join(parts)
    if len(summary_text) > MAX_SUMMARY_LEN:
        summary_text = summary_text[:MAX_SUMMARY_LEN] + "..."

    return {
        "sheet": sheet_name,
        "summary": summary_text,
        "topRecords": top_records,
        "aggregatedRecords": aggregated_records,
    }


def process_work_hours() -> dict[str, Any]:
    files = sorted([f for f in os.listdir(DATA_GONGSHI_DIR) if f.endswith(".xlsx")])
    result_files = []
    for fname in files:
        fpath = os.path.join(DATA_GONGSHI_DIR, fname)
        try:
            xl = pd.ExcelFile(fpath, engine="openpyxl")
            sheet_names = xl.sheet_names
        except Exception:
            try:
                wb = load_workbook(fpath, data_only=True, read_only=True)
                sheet_names = wb.sheetnames
                wb.close()
            except Exception as e:
                result_files.append({
                    "file": fname,
                    "sheets": [{"sheet": "ERROR", "summary": f"无法读取: {e}", "topRecords": {}}]
                })
                continue

        sheets = []
        for sname in sheet_names:
            df, note = read_sheet_with_fallback(fpath, sname)
            if df is None:
                # Only keep error note for potentially important sheets
                sheets.append({
                    "sheet": sname,
                    "summary": f"{sname}: 解析失败({note})",
                    "topRecords": {},
                })
            else:
                summarized = summarize_sheet(fname, sname, df, note)
                if summarized:
                    sheets.append(summarized)
        result_files.append({"file": fname, "sheets": sheets})
    return {"files": result_files}


def process_code_submission() -> dict[str, Any]:
    with open(CODE_SUBMISSION_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    if not data:
        return {"summary": "无代码提交数据。", "topContributors": []}

    df = pd.DataFrame(data)
    total_lines = int(df["行数"].sum()) if "行数" in df.columns else 0
    people = len(df)

    lines = [f"代码提交: {people}人, 总行数{total_lines}"]
    if "代码类型" in df.columns:
        langs = df["代码类型"].value_counts().to_dict()
        lines.append(f"语言: {langs}")
    if "部门" in df.columns and "行数" in df.columns:
        dept = df.groupby("部门")["行数"].sum().sort_values(ascending=False).to_dict()
        dept_str = ", ".join([f"{k}:{int(v)}" for k, v in list(dept.items())[:4]])
        lines.append(f"部门代码量: {dept_str}")

    top = []
    if "姓名" in df.columns and "行数" in df.columns:
        top_df = df.nlargest(TOP_N, "行数")[[c for c in ["姓名", "部门", "代码类型", "行数"] if c in df.columns]]
        for _, r in top_df.iterrows():
            top.append({str(c): (int(r[c]) if c == "行数" else str(r[c])) for c in top_df.columns})

    return {
        "summary": " | ".join(lines),
        "topContributors": top,
    }


def process_dept_work_plans() -> dict[str, Any]:
    with open(DEPT_WORK_PLANS_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    if not data:
        return {"summary": "无部门工作计划数据。"}

    df = pd.DataFrame(data)
    depts = df["department"].unique().tolist() if "department" in df.columns else []
    files = df["file"].unique().tolist() if "file" in df.columns else []

    lines = [
        f"部门周报: {len(df)}份",
        f"覆盖部门: {', '.join(depts)}",
        f"报告文件: {', '.join(files)}",
    ]
    # Extract a few keywords from plans
    keywords = set()
    for col in ["weekly_plan", "next_plan"]:
        if col in df.columns:
            for txt in df[col].dropna().astype(str).head(3):
                first = txt.split("\n")[0].strip()[:40]
                if first:
                    keywords.add(first)
    if keywords:
        lines.append(f"近期重点: {'; '.join(list(keywords)[:3])}")

    return {"summary": " | ".join(lines)}


def process_employee_info() -> dict[str, Any]:
    df, note = read_sheet_with_fallback(str(EMPLOYEE_INFO_PATH), "Sheet1")
    if df is None:
        return {"summary": f"员工信息读取失败: {note}"}

    df = clean_dataframe(df)
    n = len(df)
    parts = [f"员工信息: {n}人"]

    if "性别" in df.columns:
        parts.append(f"性别: {df['性别'].value_counts().to_dict()}")
    if "最高学历" in df.columns:
        parts.append(f"学历: {df['最高学历'].value_counts().head(3).to_dict()}")
    if "年龄" in df.columns:
        age = pd.to_numeric(df["年龄"], errors="coerce").dropna()
        parts.append(f"年龄均值{round(age.mean(),1)}范围{int(age.min())}-{int(age.max())}")
    if "近2年绩效平均分" in df.columns:
        perf = pd.to_numeric(df["近2年绩效平均分"], errors="coerce").dropna()
        parts.append(f"绩效均值{round(perf.mean(),2)}")
    if "近2年日均工时" in df.columns:
        wh = pd.to_numeric(df["近2年日均工时"], errors="coerce").dropna()
        parts.append(f"日均工时均值{round(wh.mean(),2)}")
    if "组长/骨干标识" in df.columns:
        lead = int(pd.to_numeric(df["组长/骨干标识"], errors="coerce").fillna(0).sum())
        parts.append(f"骨干{lead}人")

    return {"summary": " | ".join(parts)}


def estimate_tokens(obj: Any) -> int:
    text = json.dumps(obj, ensure_ascii=False)
    cjk = len(re.findall(r'[\u4e00-\u9fff]', text))
    ascii_chars = len(text) - cjk
    return int(cjk + ascii_chars * 0.3)


def main():
    os.makedirs(OUTPUT_PATH.parent, exist_ok=True)

    result = {
        "workHours": process_work_hours(),
        "codeSubmission": process_code_submission(),
        "deptWorkPlans": process_dept_work_plans(),
        "employeeInfo": process_employee_info(),
    }

    # If still too large, trim more aggressively (threshold raised to 8000 for modern LLMs)
    token_est = estimate_tokens(result)
    print(f"  Before trim: ~{token_est} tokens")
    if token_est > 8000:
        # 第一步：压缩 aggregatedRecords 到 Top 15
        for f in result["workHours"]["files"]:
            for s in f["sheets"]:
                txt = s.get("summary", "")
                if len(txt) > 150:
                    s["summary"] = txt[:150] + "..."
                ar = s.get("aggregatedRecords", {})
                for k in list(ar.keys()):
                    ar[k] = ar[k][:15]
        token_est = estimate_tokens(result)
        print(f"  After agg trim: ~{token_est} tokens")
        # 第二步：压缩 aggregatedRecords 到 Top 10
        if token_est > 8000:
            for f in result["workHours"]["files"]:
                for s in f["sheets"]:
                    ar = s.get("aggregatedRecords", {})
                    for k in list(ar.keys()):
                        ar[k] = ar[k][:10]
            token_est = estimate_tokens(result)
            print(f"  After agg trim2: ~{token_est} tokens")
        # 第三步：压缩 topRecords
        if token_est > 8000:
            for f in result["workHours"]["files"]:
                for s in f["sheets"]:
                    tr = s.get("topRecords", {})
                    for k in list(tr.keys()):
                        tr[k] = tr[k][:3]
            token_est = estimate_tokens(result)
            print(f"  After top trim: ~{token_est} tokens")
        # 第四步：清空非核心数据
        if token_est > 8000:
            for f in result["workHours"]["files"]:
                for s in f["sheets"]:
                    s["topRecords"] = {}
            token_est = estimate_tokens(result)
        # 第五步：清空 aggregatedRecords
        if token_est > 8000:
            for f in result["workHours"]["files"]:
                for s in f["sheets"]:
                    s["aggregatedRecords"] = {}

    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(result, f, ensure_ascii=False, indent=2)

    final_tokens = estimate_tokens(result)
    print(f"Knowledge base written to {OUTPUT_PATH}")
    print(f"Estimated token count: ~{final_tokens}")


if __name__ == "__main__":
    main()
