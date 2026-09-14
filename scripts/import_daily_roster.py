#!/usr/bin/env python3
"""新人日报账号批量导入（数据源 scripts/daily_roster.csv，格式见文件头注释）

幂等：可反复执行；已存在账号只补日报字段，小组/账号不会重复创建。
用法：
  python3 scripts/import_daily_roster.py --dry-run          # 只打印计划，不落库
  SUPER_USER=308193 SUPER_PWD=xxx python3 scripts/import_daily_roster.py --apply
"""
import argparse
import csv
import json
import os
import sys
import urllib.request

API = os.environ.get('DAILY_API', 'http://localhost:8080/api')
ROSTER = os.path.join(os.path.dirname(__file__), 'daily_roster.csv')
INITIAL_PASSWORD = os.environ.get('INITIAL_PASSWORD', 'B@s95594!')


def call(method, path, token=None, body=None):
    req = urllib.request.Request(
        API + path,
        method=method,
        data=json.dumps(body).encode() if body is not None else None,
        headers={'Content-Type': 'application/json', **({'Authorization': f'Bearer {token}'} if token else {})},
    )
    with urllib.request.urlopen(req, timeout=15) as resp:
        return json.loads(resp.read())


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--apply', action='store_true')
    ap.add_argument('--dry-run', action='store_true')
    args = ap.parse_args()
    apply = args.apply and not args.dry_run

    rows = []
    with open(ROSTER, encoding='utf-8') as f:
        for line in f:
            if line.startswith('#') or not line.strip():
                continue
            rows.append(line)
    reader = csv.DictReader(rows)
    people = [r for r in reader if r.get('姓名')]

    missing = [p['姓名'] for p in people if not (p.get('工号') or '').strip()]
    if missing:
        print('⚠️ 以下人员缺工号，将跳过：' + '、'.join(missing))
    people = [p for p in people if (p.get('工号') or '').strip()]

    groups = sorted({(p.get('小组') or '').strip() for p in people if (p.get('小组') or '').strip()})
    no_group = [p['姓名'] for p in people if p['身份'] == 'newbie' and not (p.get('小组') or '').strip()]
    if no_group:
        print('⚠️ 以下新人未分配小组，将跳过：' + '、'.join(no_group))
        people = [p for p in people if p['身份'] != 'newbie' or (p.get('小组') or '').strip()]

    plan = [f'建小组：{"、".join(groups) or "（无）"}'] + [
        f"{'补日报身份' if p['身份'] == 'mentor' else '建/补新人账号'}：{p['姓名']}({p['工号']})"
        + (f" → {p['小组']} / 带教 {p['带教老师工号']}" if p['身份'] == 'newbie' else '')
        for p in people
    ]
    print('\n'.join(plan))
    if not apply:
        print('\n（dry-run，未落库；加 --apply 执行）')
        return

    token = call('POST', '/auth/login', body={
        'username': os.environ['SUPER_USER'], 'password': os.environ['SUPER_PWD'],
    })['token']

    group_ids = {}
    for g in groups:
        res = call('POST', '/daily/groups', token, {'name': g})
        if not res.get('success') and '已存在' not in res.get('message', ''):
            print(f'❌ 建组失败 {g}: {res.get("message")}')
            continue
    meta = call('GET', '/daily/meta', token)
    group_ids = {g['name']: g['id'] for g in meta['groups']}

    ok = skip = fail = 0
    for p in people:
        username = p['工号'].strip()
        name = p['姓名'].strip()
        role = p['身份'].strip()
        try:
            exists = call('GET', '/auth/users', token)
            user_map = {u['username']: u for u in exists.get('users', [])}
            if username in user_map:
                # 已有账号：只补日报字段，不动周报角色
                body = {'dailyRole': 'mentor' if role == 'mentor' else 'newbie'}
                if role == 'newbie':
                    body['groupId'] = group_ids.get(p['小组'].strip(), '')
                    if (p.get('带教老师工号') or '').strip():
                        body['mentor'] = p['带教老师工号'].strip()
                res = call('PUT', f'/auth/users/{username}', token, body)
                if res.get('success'):
                    print(f'✅ 补日报身份 {name}({username})')
                    ok += 1
                else:
                    print(f'❌ 更新失败 {name}: {res.get("message")}')
                    fail += 1
            else:
                body = {
                    'username': username, 'password': INITIAL_PASSWORD, 'name': name,
                    'role': 'daily', 'dailyRole': 'mentor' if role == 'mentor' else 'newbie',
                }
                if role == 'newbie':
                    body['groupId'] = group_ids.get(p['小组'].strip(), '')
                    if (p.get('带教老师工号') or '').strip():
                        body['mentor'] = p['带教老师工号'].strip()
                res = call('POST', '/auth/users', token, body)
                if res.get('success'):
                    print(f'✅ 创建账号 {name}({username})')
                    ok += 1
                else:
                    print(f'❌ 创建失败 {name}: {res.get("message")}')
                    fail += 1
        except Exception as e:
            print(f'❌ 异常 {name}: {e}')
            fail += 1
        skip += 0
    print(f'\n完成：成功 {ok}，失败 {fail}')


if __name__ == '__main__':
    main()
