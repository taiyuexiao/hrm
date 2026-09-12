# 智能周报系统 — 部署教学文档

> **目标读者**：熟悉 Python 脚本、但对 Java / 服务器部署不太熟悉的运维人员  
> **部署方式**：前后端分离（前端 Tomcat9 + 后端 Java jar）  
> **适用系统**：Linux（CentOS / Ubuntu）

---

## ⚠️ 部署前必读（2025-06-09 更新）

1. **本包前端已支持子路径部署**（如 `/hr-web/`），会根据当前 JS 文件位置自动推导应用根路径。
2. **分离部署时，`dist/app-config.json` 里的 `apiBaseUrl` 必须改成完整后端地址**，例如 `http://8.136.114.162:8080/api`，不能只写 `/api`。
3. 如果同一台 Tomcat 上已有其他应用，请直接看本文 **「步骤 2（替代）：子路径部署」** 章节。

---

## 一、先理解整体架构

```
用户浏览器
    │
    ▼
┌─────────────────┐      ┌─────────────────────┐      ┌─────────────┐
│  前端 (Tomcat9)  │ ───▶ │  app-config.json    │ ───▶ │ 后端 (Java) │
│  dist/ 静态文件  │      │  配置后端API地址     │      │  8080端口   │
└─────────────────┘      └─────────────────────┘      └─────────────┘
                               │                                │
                               │                                │
                               ▼                                ▼
                        ┌─────────────┐                  ┌─────────────┐
                        │  SQLite     │                  │ 公司大模型网关 │
                        │  hr.db      │                  │ (application.yml│
                        │             │                  │  / 环境变量配置)│
                        └─────────────┘                  └─────────────┘
```

**核心概念**：
- **前端**：就是一堆 HTML/CSS/JS 静态文件，用 Tomcat9 当 "文件服务器" 跑起来
- **后端**：一个 Java 程序（jar 包），自带 Tomcat，监听 8080 端口提供 API
- **数据库**：SQLite 文件（`hr.db`），不是 MySQL，不需要安装数据库软件
- **LLM**：**由后端统一调用**公司内网大模型网关，前端不再直接请求 LLM，API Key 只保存在后端

---

## 二、环境准备

### 1. 服务器清单

| 角色 | 最低配置 | 需要安装 | 示例 IP |
|------|---------|---------|---------|
| 前端服务器 | 2核4G | Tomcat9 | `121.41.172.210` |
| 后端服务器 | 2核4G | Java 17 | `8.136.114.162` |

> **注意**：前端后端可以放在同一台机器，也可以分开。这里按分开讲。

### 2. 检查 Java 版本（后端服务器）

```bash
java -version
```

应该看到 `17` 或更高版本：
```
openjdk version "17.0.x" 202x-xx-xx
```

如果没有，安装 OpenJDK 17：
```bash
# Ubuntu
sudo apt update
sudo apt install openjdk-17-jdk -y

# CentOS
sudo yum install java-17-openjdk-devel -y
```

### 3. 检查 Tomcat9（前端服务器）

```bash
# 查看是否已安装
sudo systemctl status tomcat9

# Ubuntu 安装
sudo apt install tomcat9 -y

# CentOS 安装（需先配置 EPEL）
sudo yum install tomcat9 -y
```

Tomcat9 默认目录：
```
/var/lib/tomcat9/webapps/ROOT/     ← 前端文件放这里
/etc/tomcat9/                      ← 配置文件
/var/log/tomcat9/                  ← 日志
```

---

## 三、部署包说明

拿到 `deploy-package.zip`，解压后结构如下：

```
deploy-package/
├── intelligent-hr-backend-1.0.0.jar        ← 后端程序（~50MB）
├── config/
│   └── application.yml                     ← 【重要】后端外部配置文件（LLM/数据库）
├── start.sh                                ← 后端一键启动脚本
├── stop.sh                                 ← 后端停止脚本
├── data/
│   ├── hr.db                               ← 数据库文件（含用户、周报、批注数据）
│   └── weekly-reports.json                 ← 历史数据备份
│
└── dist/                                   ← 前端静态文件（放 Tomcat）
    ├── index.html
    ├── app-config.json                     ← 【重要】配置后端API地址
    ├── llm-config.json                     ← 已废弃，前端不再使用
    ├── WEB-INF/
    │   └── web.xml                         ← Tomcat 前端路由刷新支持
    └── assets/
        ├── index-xxx.js
        └── index-xxx.css
```

**配置说明：**
- `config/application.yml` 是 Spring Boot 标准外部配置文件，放在 jar 同级的 `config/` 目录下即可覆盖 jar 内部默认配置，**不用重新打包**
- `dist/app-config.json` 里的 `apiBaseUrl` 必须改成完整后端地址，如 `http://8.136.114.162:8080/api`
- `dist/llm-config.json` 已废弃，AI 请求统一由后端转发，LLM 参数在 `config/application.yml` 中配置

---

## 四、如何把文件传到服务器（手把手教学）

> 很多运维人员对 Linux 命令不熟，这里提供 **3 种上传方式**，选一种你会的就行。

### 方式一：SCP 命令（最简单，有密码就行）

**前提**：你的电脑能连上服务器（有 IP、用户名、密码）

**Step 1：先在本机解压 zip**

```bash
# Windows 用 PowerShell 或 Git Bash
# Mac/Linux 直接用终端

# 进入 zip 所在目录
cd /Users/spl/PycharmProjects/HRM/周报管理

# 解压
unzip deploy-package.zip
```

解压后会得到一个 `deploy-package/` 文件夹。

**Step 2：传后端文件到后端服务器**

```bash
# 命令格式：scp -r 本地路径 用户名@服务器IP:远程路径

# 传整个 deploy-package 目录到后端服务器（最推荐，保留目录结构）
scp -r deploy-package root@8.136.114.162:/opt/hr-weekly

# 或者单独传：
# scp deploy-package/intelligent-hr-backend-1.0.0.jar root@8.136.114.162:/opt/hr-weekly/
# scp -r deploy-package/config root@8.136.114.162:/opt/hr-weekly/
# scp -r deploy-package/data root@8.136.114.162:/opt/hr-weekly/
# scp deploy-package/start.sh deploy-package/stop.sh root@8.136.114.162:/opt/hr-weekly/
```

输入密码后等待传输完成。

**Step 3：传前端文件到前端服务器**

```bash
# 先备份旧文件（如果有）
ssh root@121.41.172.210 "mv /var/lib/tomcat9/webapps/ROOT /var/lib/tomcat9/webapps/ROOT.bak.$(date +%Y%m%d)"

# 创建新目录
ssh root@121.41.172.210 "mkdir -p /var/lib/tomcat9/webapps/ROOT"

# 传前端文件（-r 表示递归传整个目录）
scp -r deploy-package/dist/* root@121.41.172.210:/var/lib/tomcat9/webapps/ROOT/
```

### 方式二：WinSCP（Windows 图形界面，最直观）

**Step 1：下载安装 WinSCP**
- 官网：https://winscp.net/
- 下载免费版安装

**Step 2：连接服务器**
- 打开 WinSCP
- 文件协议：SFTP
- 主机名：填服务器 IP（如 `8.136.114.162`）
- 用户名：root
- 密码：你的服务器密码
- 点击"登录"

**Step 3：传文件（拖拽就行）**

左边是你本地电脑，右边是服务器：

**传后端文件：**
- 在右边（服务器）创建目录：`/opt/hr-weekly/data`
- 左边找到 `deploy-package/backend/intelligent-hr-backend-1.0.0.jar`，拖到右边 `/opt/hr-weekly/`
- 左边找到 `deploy-package/backend/data/hr.db`，拖到右边 `/opt/hr-weekly/data/`

**传前端文件：**
- 在右边（服务器）进入 `/var/lib/tomcat9/webapps/ROOT/`
- 左边找到 `deploy-package/dist/` 里的所有文件，全选拖到右边

### 方式三：Xshell + Xftp（企业常用）

**Step 1：用 Xshell 登录服务器**
- 新建会话 → 填 IP → 用户名 root → 密码 → 连接

**Step 2：创建目录**

在 Xshell 终端里执行：
```bash
mkdir -p /opt/hr-weekly/data
mkdir -p /var/lib/tomcat9/webapps/ROOT
```

**Step 3：用 Xftp 传文件**
- Xshell 工具栏点击 Xftp 图标（绿色文件夹）
- 左侧本地，右侧服务器，直接拖拽文件

---

## 五、部署步骤

### 步骤 1：部署后端（Java jar）

#### 1.1 确保文件已上传

登录后端服务器，确认文件存在：
```bash
ssh root@8.136.114.162

ls -la /opt/hr-weekly/
# 应该看到：
# intelligent-hr-backend-1.0.0.jar
# config/
#   application.yml
# start.sh
# stop.sh
# data/
#   hr.db
```

#### 1.2 创建启动脚本

#### 1.2 修改配置文件

编辑 `/opt/hr-weekly/config/application.yml`：

```bash
nano /opt/hr-weekly/config/application.yml
```

重点检查这几项：
```yaml
app:
  data-dir: /opt/hr-weekly/data          # 数据库目录

server:
  port: 8080                             # 后端端口

jwt:
  secret: 请改成强密码                    # 生产环境必须修改！

llm:
  base-url: http://10.202.32.20:8180/lm/v2
  api-key: your-llm-api-key
  model: qwen35-35b-a3b-nothink
```

#### 1.3 启动服务

直接运行自带的启动脚本（推荐）：

```bash
cd /opt/hr-weekly
chmod +x start.sh stop.sh
./start.sh
```

查看日志确认启动成功：
```bash
tail -f /opt/hr-weekly/backend.log
```

日志中应看到类似：
```
[LLM] 已配置 base-url: http://10.202.32.20:8180/lm/v2
[LLM] 已配置 model: qwen35-35b-a3b-nothink
[LLM] 完整请求地址: http://10.202.32.20:8180/lm/v2/chat/completions
Started IntelligentHrBackendApplication in x.x seconds
Tomcat started on port(s): 8080
```

按 `Ctrl+C` 退出日志查看（程序继续在后台跑）。

#### 1.4 配置 systemd 服务（推荐，开机自启）

创建文件 `/etc/systemd/system/hr-weekly.service`：

```ini
[Unit]
Description=HR Weekly Report System
After=network.target

[Service]
Type=simple
User=root
Environment="DATA_DIR=/opt/hr-weekly/data"
Environment="SERVER_PORT=8080"
# LLM 配置也可写在 /opt/hr-weekly/config/application.yml 中
Environment="LLM_BASE_URL=http://10.202.32.20:8180/lm/v2"
Environment="LLM_API_KEY=your-llm-api-key"
Environment="LLM_MODEL=qwen35-35b-a3b-nothink"
WorkingDirectory=/opt/hr-weekly
ExecStart=/usr/bin/java -jar /opt/hr-weekly/intelligent-hr-backend-1.0.0.jar
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

加载并启动：
```bash
sudo systemctl daemon-reload
sudo systemctl enable hr-weekly
sudo systemctl start hr-weekly

# 查看状态
sudo systemctl status hr-weekly

# 查看日志
sudo journalctl -u hr-weekly -f
```

#### 1.5 开放防火墙

```bash
# Ubuntu (ufw)
sudo ufw allow 8080/tcp

# CentOS (firewalld)
sudo firewall-cmd --permanent --add-port=8080/tcp
sudo firewall-cmd --reload
```

---

### 步骤 2：部署前端（Tomcat9）

#### 2.1 确认文件已上传

登录前端服务器：
```bash
ssh root@121.41.172.210

ls -la /var/lib/tomcat9/webapps/ROOT/
# 应该看到：
# index.html  app-config.json  llm-config.json  WEB-INF/  assets/
```

#### 2.2 关键：修改配置文件

**修改 `app-config.json`** — 指向前端要调用的后端地址（**唯一必须修改的前端配置**）：

```bash
sudo nano /var/lib/tomcat9/webapps/ROOT/app-config.json
```

内容改为（**换成你实际的后端地址**）：
```json
{
  "apiBaseUrl": "http://后端服务器IP:8080/api"
}
```

示例：
```json
{
  "apiBaseUrl": "http://8.136.114.162:8080/api"
}
```

> 如果前端后端在同一台机器，也可以写 `http://localhost:8080/api`

**LLM 大模型配置** — 已迁移到后端，前端 `llm-config.json` 不再使用：

大模型地址、Key、模型名在后端 `application.yml`（或启动环境变量）中配置：

```yaml
llm:
  base-url: http://10.202.32.20:8180/lm/v2
  api-key: your-llm-api-key
  model: qwen35-35b-a3b-nothink
```

生产环境推荐通过环境变量注入，避免 key 写入文件：
```bash
export LLM_BASE_URL=http://10.202.32.20:8180/lm/v2
export LLM_API_KEY=your-llm-api-key
export LLM_MODEL=qwen35-35b-a3b-nothink
java -jar intelligent-hr-backend-1.0.0.jar
```

#### 2.3 重启 Tomcat9

```bash
sudo systemctl restart tomcat9

# 查看状态
sudo systemctl status tomcat9

# 查看日志
sudo tail -f /var/log/tomcat9/catalina.out
```

#### 2.4 开放防火墙

```bash
# Tomcat9 默认端口 8080
sudo ufw allow 8080/tcp
```

---

### 步骤 2（替代）：子路径部署

如果同一台 Tomcat9 上已有其他应用占用了 ROOT，需要把本系统部署到子路径（例如 `/hr-web/`），按下面操作：

#### A. 复制前端文件到子目录

```bash
# 以 /hr-web/ 为例，目录名可自定义
sudo rm -rf /var/lib/tomcat9/webapps/hr-web
sudo mkdir -p /var/lib/tomcat9/webapps/hr-web
sudo cp -r deploy-package/dist/* /var/lib/tomcat9/webapps/hr-web/
```

确认文件结构：
```bash
ls -la /var/lib/tomcat9/webapps/hr-web/
# 应该看到：
# index.html  app-config.json  WEB-INF/  assets/
# llm-config.json 已废弃，前端不再使用
```

#### B. 修改 app-config.json

**这一步非常关键。** 子路径部署时，`app-config.json` 里的 `apiBaseUrl` 必须写成**完整后端地址**，不能用相对路径 `/api`：

```bash
sudo nano /var/lib/tomcat9/webapps/hr-web/app-config.json
```

内容示例：
```json
{
  "apiBaseUrl": "http://8.136.114.162:8080/api"
}
```

> 如果前端后端在同一台机器，也可以写 `http://localhost:8080/api`，但不能只写 `/api`。

#### C. 重启 Tomcat9

```bash
sudo systemctl restart tomcat9
```

访问地址变为：
```
http://前端服务器IP:8080/hr-web/
```

---

### 步骤 3：验证部署

#### 3.1 验证后端 API

在后端服务器上测试：
```bash
curl http://localhost:8080/api/reports
```

应该有 JSON 数据返回（科室列表和周报数据）。

#### 3.2 验证前端页面

在浏览器访问：
```
http://前端服务器IP:8080
```

应该能看到登录页面。

#### 3.3 验证前后端联通

打开浏览器开发者工具（F12）→ Network 标签 → 登录或刷新页面，看 `reports` 等请求是否 200。

如果看到 CORS 错误（红色报错），检查后端是否正常启动、防火墙是否放行。

---

## 六、日常运维操作

### 查看后端日志
```bash
# 用 systemd
sudo journalctl -u hr-weekly -f

# 或者直接看文件
tail -f /opt/hr-weekly/backend.log
```

### 重启后端
```bash
sudo systemctl restart hr-weekly
```

### 重启前端（Tomcat）
```bash
sudo systemctl restart tomcat9
```

### 备份数据库
```bash
# SQLite 数据库就是一个文件，直接复制就行
cp /opt/hr-weekly/data/hr.db /opt/hr-weekly/backup/hr.db.$(date +%Y%m%d_%H%M%S)
```

### 修改配置后刷新
如果改了 `app-config.json` 或 `llm-config.json`，**不需要重启 Tomcat**，直接刷新浏览器即可（因为前端是运行时读取的）。

---

## 七、常见问题

### Q1：后端启动报错 "Port 8080 already in use"
端口被占用，修改启动端口：
```bash
export SERVER_PORT=8081
```
同时前端 `app-config.json` 里的地址也要改成 `:8081`。

### Q2：前端页面空白，提示 "Cannot GET /xxx"
当前端目录下缺少 `WEB-INF/web.xml`，或者没配置 404 回退时会出现。检查：

- 如果部署在 ROOT：
  ```bash
  cat /var/lib/tomcat9/webapps/ROOT/WEB-INF/web.xml
  ```
- 如果部署在子路径 `/hr-web/`：
  ```bash
  cat /var/lib/tomcat9/webapps/hr-web/WEB-INF/web.xml
  ```

应该包含：
```xml
<error-page>
  <error-code>404</error-code>
  <location>/index.html</location>
</error-page>
```

> 子路径部署时，`/index.html` 会自动解析为当前 webapp 的根目录，不需要手动加 `/hr-web` 前缀。

### Q3：登录报错 "Network Error" / app-config.json 404
打开 F12 → Network，分两种情况：

**情况一：`app-config.json` 本身 404**
- 原因：前端部署在子路径（如 `/hr-web/`），但请求发到了根路径 `/app-config.json`
- 解决：确认 zip 包里的 `dist/WEB-INF/web.xml` 已存在；如果问题依旧，检查前端代码是否已更新为自动推导 basePath（见本包新版前端）

**情况二：`app-config.json` 已 200，但 `login` 请求 404 或 CORS 报错**
- 原因：`app-config.json` 里的 `apiBaseUrl` 还是默认值 `/api`（相对路径），分离部署时必须改成完整后端地址
- 解决：修改部署目录下的 `app-config.json`：
  ```json
  { "apiBaseUrl": "http://后端服务器IP:8080/api" }
  ```

通用检查项：
1. 后端是否启动？`curl http://后端IP:8080/api/reports`
2. `app-config.json` 里的地址是否正确？
3. 防火墙是否放行 8080？

### Q4：AI 功能不工作（AI 总结、AI 全局分析无响应）
1. 确认前端浏览器 Network 中 `ai/summary` 或 `ai/global-analysis` 请求是否发到后端，且状态 200
2. 检查后端日志看具体的 LLM 调用报错（连接失败、key 错误、模型不存在等）
3. 确认后端环境变量/配置中的 LLM 参数正确：
   ```bash
   export LLM_BASE_URL=http://10.202.32.20:8180/lm/v2
   export LLM_API_KEY=your-llm-api-key
   export LLM_MODEL=qwen35-35b-a3b-nothink
   ```
4. 从后端服务器测试 LLM 连通性：
   ```bash
   curl -X POST http://10.202.32.20:8180/lm/v2/chat/completions \
     -H "Authorization: Bearer your-llm-api-key" \
     -H "Content-Type: application/json" \
     -d '{"model":"qwen35-35b-a3b-nothink","messages":[{"role":"user","content":"hello"}],"stream":false}'
   ```

### Q5：jar 包放哪个目录有影响吗？
**没有影响**。数据库路径由 `DATA_DIR` 环境变量决定，跟 jar 包放在哪里没关系。
```bash
# 这两个等效，数据都存在 /opt/hr-weekly/data/
DATA_DIR=/opt/hr-weekly/data java -jar /opt/hr-weekly/app.jar
DATA_DIR=/opt/hr-weekly/data java -jar /home/anywhere/app.jar
```

---

## 八、一键检查清单

部署完成后，按这个清单逐项确认：

- [ ] 后端服务器 Java 17 已安装
- [ ] 前端服务器 Tomcat9 已安装
- [ ] `intelligent-hr-backend-1.0.0.jar` 已上传到后端服务器
- [ ] `application.yml` 已上传到后端服务器，且 LLM/数据库配置正确
- [ ] `hr.db` 和 `weekly-reports.json` 已放在 `DATA_DIR` 指定目录
- [ ] 后端服务已启动，端口监听正常
- [ ] 前端 `dist/` 文件已复制到 Tomcat9 `webapps/ROOT/`
- [ ] `app-config.json` 已修改为正确的后端地址
- [ ] 后端服务器能连通大模型网关
- [ ] 防火墙已放行对应端口
- [ ] 浏览器能正常访问登录页面
- [ ] 能正常登录并看到周报数据

---

## 九、联系开发

部署过程中遇到问题：
1. 先看 `/var/log/tomcat9/catalina.out` 和 `backend.log`
2. 把报错信息截图发给开发
