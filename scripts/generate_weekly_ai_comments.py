#!/usr/bin/env python3
"""
预生成所有科室周报的 AI 总结，调用 DeepSeek API 填充到 JSON 中。
只基于"本周工作内容"的前十行进行总结。
"""
import json
import time
import requests

from llm_config import API_KEY, get_chat_completion_url

API_URL = get_chat_completion_url()
INPUT_PATH = "src/data/weekly-reports.json"


def take_first_n_lines(text: str, n: int = 10) -> str:
    if not text:
        return ""
    lines = text.splitlines()
    return "\n".join(lines[:n])


def generate_summary(record: dict, retries: int = 3) -> str:
    work_content = take_first_n_lines(record.get('本周工作内容', ''), 10)

    prompt = f"""请对以下科室本周工作内容进行精炼总结（80字以内）。
要求：提取核心进展、关键成果和待办重点，语言简洁专业。

科室：{record.get('科室/委员会') or ''}
本周工作内容（前十行）：
{work_content}
"""

    payload = {
        "model": "deepseek-chat",
        "messages": [
            {"role": "system", "content": "你是数据部门的管理顾问，擅长快速提炼工作周报的核心要点。"},
            {"role": "user", "content": prompt},
        ],
        "temperature": 0.5,
        "max_tokens": 200,
    }

    for attempt in range(retries):
        try:
            resp = requests.post(
                API_URL,
                headers={
                    "Content-Type": "application/json",
                    "Authorization": f"Bearer {API_KEY}",
                },
                json=payload,
                timeout=60,
            )
            resp.raise_for_status()
            data = resp.json()
            choice = data.get("choices", [{}])[0]
            msg = choice.get("message", {})
            content = msg.get("content", "")
            if content and content.strip():
                return content.strip()
            raise ValueError("Empty content")
        except Exception as e:
            wait = 2 ** attempt
            print(f"  retry {attempt + 1}/{retries} after {wait}s: {e}")
            time.sleep(wait)
    return "AI总结生成失败，请稍后重试。"


def save(data: dict):
    with open(INPUT_PATH, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)


def main():
    with open(INPUT_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)

    total = sum(len(w["records"]) for w in data["weeks"])
    processed = 0

    for week in data["weeks"]:
        date = week["date"]
        for rec in week["records"]:
            dept = rec.get("科室/委员会", "未知")
            print(f"[{date}] {dept}: 生成中...", end=" ", flush=True)
            comment = generate_summary(rec)
            rec["aiComment"] = comment
            save(data)
            print(f"OK ({len(comment)}字)")
            processed += 1
            time.sleep(1.0)

    print(f"\n完成。共生成 {processed} 条，总计 {total} 条。")


if __name__ == "__main__":
    main()
