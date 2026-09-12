# 智能周报系统 — 版本更新教程（只更新代码，不丢数据）

> **目标读者**：已经部署过智能周报系统，现在需要升级到新版本，但不想丢失生产数据的新手运维人员  
> **核心原则**：数据库（`hr.db`）和代码是分离的，更新代码时**不要覆盖** `data/` 目录  
> **适用系统**：Linux（CentOS / Ubuntu）

---

## 一、先理解一个关键概念：数据库就是文件

智能周报系统用的是 **SQLite** 数据库，它不像 MySQL 那样是一个独立运行的服务。SQLite 的数据库就是一个普通文件：`data/hr.db`。

这意味着：

- 用户每提交一份周报、每修改一个任务、每新建一个周期，都会写入 `data/hr.db`；
- 这个文件会随着时间越来越大，里面的数据是**生产数据**；
- 新版本的后端 jar 包只要知道 `data/hr.db` 在哪里，就能直接读取这些历史数据。

所以：**升级版本 ≠ 重新初始化数据库**。你只需要替换新的程序文件，保留旧的 `hr.db` 即可。

---

## 二、哪些文件要换，哪些文件不要换

假设你的生产环境目录是 `/opt/hr-weekly/`，结构如下：

```
/opt/hr-weekly/
├── intelligent-hr-backend-1.0.0.jar   ← 后端程序，要替换
├── start.sh                           ← 启动脚本，通常不用换
├── stop.sh                            ← 停止脚本，通常不用换
├── config/
│   └── application.yml                ← 后端配置，按需更新，一般不动
└── data/
    ├── hr.db                          ← ❌ 千万不要覆盖！生产数据库
    ├── .initial-password-reset-v1     ← ❌ 千万不要删除！密码重置标记文件
    └── weekly-reports.json            ← 历史备份，一般不动
```

前端目录（假设在 Tomcat 里）：

```
/var/lib/tomcat9/webapps/ROOT/        ← 前端静态文件，要替换
├── index.html
├── app-config.json                   ← 前端配置，按需修改
└── assets/
```

### 更新清单

| 文件/目录 | 是否替换 | 说明 |
|----------|---------|------|
| `intelligent-hr-backend-1.0.0.jar` | ✅ 替换 | 新版本后端程序 |
| `dist/`（前端文件） | ✅ 替换 | 新版本前端页面 |
| `data/hr.db` | ❌ 不要覆盖 | 生产数据库，包含所有用户数据 |
| `data/.initial-password-reset-v1` | ❌ 不要删除 | 初始密码一次性重置标记文件。删除会导致所有用户密码被再次重置为 `B@s95594!` |
| `config/application.yml` | ⚠️ 按需 | 如果配置没变，保留旧的；如果新增配置项，可对比后合并 |
| `start.sh` / `stop.sh` | ⚠️ 按需 | 一般不变，除非启动方式有改动 |

---

## 三、更新前必做：备份

虽然只要按流程操作就不会丢数据，但**做任何升级前都要备份**，这是好习惯。

### 1. 备份数据库

在后端服务器执行：

```bash
# 进入后端目录
cd /opt/hr-weekly

# 备份数据库，文件名带时间戳
cp data/hr.db data/hr.db.bak.$(date +%Y%m%d%H%M%S)

# 确认备份成功
ls -lh data/hr.db.bak.*
```

### 2. 备份前端（可选但推荐）

```bash
# 在前端服务器执行
sudo mv /var/lib/tomcat9/webapps/ROOT /var/lib/tomcat9/webapps/ROOT.bak.$(date +%Y%m%d%H%M%S)
```

### 3. 备份后端 jar（可选）

```bash
cd /opt/hr-weekly
cp intelligent-hr-backend-1.0.0.jar intelligent-hr-backend-1.0.0.jar.bak.$(date +%Y%m%d%H%M%S)
```

### 4. 关于 `data/.initial-password-reset-v1` 标记文件

本次升级包含「统一初始密码 + 强制改密」功能。后端首次启动时会重置所有用户密码为 `B@s95594!`，并在 `data/` 目录生成 `.initial-password-reset-v1` 标记文件防止重复重置。

- **必须保留**：升级时不要把 `data/` 整个目录覆盖掉，这样标记文件会保留。
- **不要手动删除**：如果误删该文件，后端下次启动会再次把所有密码重置为初始密码，导致已改密用户被迫重新改密。
- **迁移到新服务器时**：连同 `data/hr.db` 一起复制该标记文件；如果目标服务器没有该文件且你不需要重置密码，可以手动创建空文件：`touch data/.initial-password-reset-v1`。

---

## 四、后端更新步骤

### 步骤 1：停止后端服务

```bash
cd /opt/hr-weekly
./stop.sh
```

如果 `stop.sh` 没有，也可以手动停止：

```bash
# 找到后端进程
ps aux | grep intelligent-hr-backend

# 停止进程（把 <PID> 换成实际的进程号）
kill <PID>
```

### 步骤 2：替换 jar 包

把新版本的 `intelligent-hr-backend-1.0.0.jar` 上传到服务器。

```bash
# 方式一：用 scp（在本地电脑执行）
scp /本地路径/intelligent-hr-backend-1.0.0.jar root@服务器IP:/opt/hr-weekly/

# 方式二：用 FTP / 堡垒机 / 其他工具上传
# 上传后覆盖 /opt/hr-weekly/intelligent-hr-backend-1.0.0.jar
```

### 步骤 3：确认 data 目录没有被覆盖

上传时**千万不要传整个 `deploy-package/` 目录到 `/opt/hr-weekly/` 并覆盖**，因为那样会把生产环境的 `data/hr.db` 也覆盖掉。

如果只上传了 jar 包，`data/` 目录不会变。可以检查一下：

```bash
ls -lh /opt/hr-weekly/data/hr.db
# 确认修改时间还是旧的，说明没被覆盖
```

### 步骤 4：启动后端服务

```bash
cd /opt/hr-weekly
./start.sh
```

### 步骤 5：验证后端是否启动成功

```bash
# 查看日志
tail -f /opt/hr-weekly/backend.log
```

看到类似 `Started HrApplication in x.xxx seconds` 就说明启动成功了。

也可以直接访问健康接口：

```bash
curl http://服务器IP:8080/api/reports
```

如果能返回 JSON（哪怕空数组），说明后端正常。

---

## 五、前端更新步骤

### 步骤 1：上传新的 dist 文件

把新版本的 `dist/` 目录上传到前端服务器。

```bash
# 方式一：用 scp 传整个目录（在本地电脑执行）
scp -r /本地路径/dist root@前端服务器IP:/tmp/hr-web-dist

# 然后在前端服务器上替换
sudo rm -rf /var/lib/tomcat9/webapps/ROOT/*
sudo cp -r /tmp/hr-web-dist/* /var/lib/tomcat9/webapps/ROOT/
```

### 步骤 2：确认前端配置正确

重点检查 `app-config.json`：

```bash
cat /var/lib/tomcat9/webapps/ROOT/app-config.json
```

内容应该类似：

```json
{
  "apiBaseUrl": "http://后端服务器IP:8080/api"
}
```

**注意**：
- 如果是子路径部署（比如 `http://域名/hr-web/`），`apiBaseUrl` 必须写完整后端地址，不能只写 `/api`；
- 如果前端和后端在同一台机器，`apiBaseUrl` 可以写 `http://127.0.0.1:8080/api`。

### 步骤 3：重启 Tomcat（可选但推荐）

```bash
# Ubuntu
sudo systemctl restart tomcat9

# CentOS
sudo systemctl restart tomcat
```

### 步骤 4：验证前端

用浏览器访问前端地址，登录后看看：

- 周报列表是否正常；
- 历史数据是否都在；
- 新增功能是否生效。

---

## 六、完整更新脚本示例

如果你希望把流程脚本化，可以参考下面这个：

### 后端更新脚本（在后端服务器执行）

```bash
#!/bin/bash
# update-backend.sh

APP_DIR="/opt/hr-weekly"
NEW_JAR="/tmp/intelligent-hr-backend-1.0.0.jar"

echo "1. 备份数据库..."
cp "${APP_DIR}/data/hr.db" "${APP_DIR}/data/hr.db.bak.$(date +%Y%m%d%H%M%S)"

echo "2. 停止后端..."
cd "${APP_DIR}" || exit 1
./stop.sh
sleep 3

echo "3. 替换 jar 包..."
cp "${NEW_JAR}" "${APP_DIR}/intelligent-hr-backend-1.0.0.jar"

echo "4. 启动后端..."
./start.sh

echo "5. 等待启动..."
sleep 5
tail -n 20 "${APP_DIR}/backend.log"

echo "6. 后端更新完成"
```

### 前端更新脚本（在前端服务器执行）

```bash
#!/bin/bash
# update-frontend.sh

TOMCAT_ROOT="/var/lib/tomcat9/webapps/ROOT"
NEW_DIST="/tmp/dist"

echo "1. 备份旧前端..."
sudo mv "${TOMCAT_ROOT}" "${TOMCAT_ROOT}.bak.$(date +%Y%m%d%H%M%S)"
sudo mkdir -p "${TOMCAT_ROOT}"

echo "2. 复制新前端..."
sudo cp -r "${NEW_DIST}"/* "${TOMCAT_ROOT}/"

echo "3. 重启 Tomcat..."
sudo systemctl restart tomcat9

echo "4. 前端更新完成"
```

---

## 七、常见问题

### Q1：更新后页面报 404 或空白

可能原因：
- Tomcat 的 `ROOT` 目录权限不对；
- `dist/WEB-INF/web.xml` 没有上传，导致前端路由刷新 404；
- `app-config.json` 里的 `apiBaseUrl` 配置错误。

解决：
```bash
# 检查权限
ls -la /var/lib/tomcat9/webapps/ROOT/

# 检查 web.xml 是否存在
ls -la /var/lib/tomcat9/webapps/ROOT/WEB-INF/web.xml

# 检查 app-config.json
cat /var/lib/tomcat9/webapps/ROOT/app-config.json
```

### Q2：更新后发现数据没了

**不要慌，先检查是不是覆盖了 `hr.db`**：

```bash
ls -lh /opt/hr-weekly/data/hr.db
```

如果文件大小明显变小，或者修改时间变成了刚才部署的时间，说明被覆盖了。用备份恢复：

```bash
cd /opt/hr-weekly
# 找到最新备份
ls -t data/hr.db.bak.* | head -1

# 恢复
cp data/hr.db.bak.XXXXXX data/hr.db

# 重启后端
./stop.sh
./start.sh
```

### Q3：能不能直接用 `deploy-package` 整个目录覆盖部署？

**首次部署可以**，因为首次没有生产数据。  
**后续版本更新不建议**，因为 `deploy-package/data/hr.db` 是开发/测试数据，会覆盖生产数据。

如果确实想省事，上传前先把生产环境的 `data/` 目录备份，然后只覆盖 `jar` 和 `dist`，不覆盖 `data/`。

### Q4：新版本改了数据库结构怎么办？

目前智能周报系统的数据库结构由后端自动维护（`@PostConstruct` 初始化），新增字段时会自动 `ALTER TABLE ADD COLUMN`。所以一般情况下不需要手动改数据库。

如果某个版本确实需要手动迁移，会在版本发布说明里特别注明。

---

## 八、总结

升级智能周报系统，记住三句话：

1. **只换代码，不换数据** —— 替换 `jar` 和 `dist`，不覆盖 `data/hr.db` 和 `data/.initial-password-reset-v1`；
2. **升级前备份** —— 备份 `hr.db`，出事能恢复；
3. **先停后换再启** —— 停止服务 → 替换文件 → 启动服务 → 验证。

按这个流程操作，即使你是新手，也能安全完成版本更新。
