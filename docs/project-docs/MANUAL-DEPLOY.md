# 智能周报系统 — 手动部署完整教程

> 目标：把前后端分离项目部署到**两台云服务器**上练手
> 适用：Linux（CentOS / Ubuntu / Debian）

---

## 一、先搞清楚架构

```
用户浏览器
    │
    ▼
┌─────────────────┐         ┌─────────────────────┐
│  前端服务器      │ ──────▶ │  后端服务器          │
│  Tomcat 9       │         │  Java 17 + Spring Boot│
│  静态文件        │         │  SQLite 数据库       │
│  80/8080端口    │         │  8080端口            │
└─────────────────┘         └─────────────────────┘
```

- **前端服务器**：只跑 Tomcat 9，提供网页
- **后端服务器**：跑 Java 程序，提供 API 接口
- 两台服务器通过公网/内网 IP 互相通信

---

## 二、环境准备（两台服务器都要做基础准备）

### 2.1 购买/准备两台云服务器

| 角色 | 最低配置 | 系统建议 | 需要开放端口 |
|------|---------|---------|-------------|
| 前端服务器 | 1核2G | Ubuntu 22.04 | 80（HTTP） |
| 后端服务器 | 1核2G | Ubuntu 22.04 | 8080（API） |

> 如果只是练手，**一台服务器也可以**，把前端后端都放一起，下文会标注"一台服务器时"的注意事项。

### 2.2 登录服务器

用 SSH 登录（Windows 用 PowerShell / Git Bash / Xshell，Mac/Linux 直接用终端）：

```bash
ssh root@你的服务器IP
```

输入密码后进入服务器。

### 2.3 基础环境更新

```bash
# Ubuntu/Debian
apt update && apt upgrade -y

# CentOS
yum update -y
```

---

## 三、后端服务器部署

### 3.1 安装 Java 17

```bash
# Ubuntu/Debian
apt install openjdk-17-jdk -y

# CentOS
yum install java-17-openjdk-devel -y
```

验证安装：
```bash
java -version
# 应该显示 openjdk version "17.0.x"
```

### 3.2 创建应用目录

```bash
mkdir -p /opt/hr-weekly/data
mkdir -p /opt/hr-weekly/backup
cd /opt/hr-weekly
```

### 3.3 上传后端 JAR 包

把 `deploy-package.zip` 解压后，找到 `backend/intelligent-hr-backend-1.0.0.jar`，上传到后端服务器。

**上传方式（三选一）：**

**方式 A：SCP 命令（推荐）**
```bash
# 在本地电脑执行
scp /本地路径/intelligent-hr-backend-1.0.0.jar root@后端服务器IP:/opt/hr-weekly/
```

**方式 B：FTP 工具（WinSCP / FileZilla）**
- 用 WinSCP 连接服务器，拖拽文件到 `/opt/hr-weekly/`

**方式 C：先上传到前端服务器，再用 wget/curl 传到后端**
```bash
# 如果文件在某个可下载的地址
wget http://xxx.com/intelligent-hr-backend-1.0.0.jar -O /opt/hr-weekly/app.jar
```

### 3.4 准备数据库文件

**情况一：有旧的 hr.db 数据库**
```bash
# 把旧的 hr.db 上传到 /opt/hr-weekly/data/
scp /本地路径/hr.db root@后端服务器IP:/opt/hr-weekly/data/
```

**情况二：全新部署（没有旧数据库）**
```bash
# 后端首次启动会自动创建空数据库，无需准备文件
# 但历史数据会丢失，需要重新录入
```

### 3.5 创建启动脚本

```bash
cat > /opt/hr-weekly/start.sh << 'EOF'
#!/bin/bash

# 数据库目录
export DATA_DIR=/opt/hr-weekly/data

# 服务端口（如果被占用可改成 8081/8082 等）
export SERVER_PORT=8080

cd /opt/hr-weekly

# 杀掉旧进程（如果有）
OLD_PID=$(ps -ef | grep "intelligent-hr-backend" | grep -v grep | awk '{print $2}')
if [ -n "$OLD_PID" ]; then
    echo "杀掉旧进程: $OLD_PID"
    kill -9 $OLD_PID
fi

# 启动
nohup java -jar /opt/hr-weekly/intelligent-hr-backend-1.0.0.jar \
    --server.port=${SERVER_PORT} \
    > /opt/hr-weekly/app.log 2>&1 &

echo "后端已启动，PID: $!"
echo "查看日志: tail -f /opt/hr-weekly/app.log"
EOF

chmod +x /opt/hr-weekly/start.sh
```

### 3.6 开放防火墙端口

```bash
# Ubuntu（ufw）
ufw allow 8080/tcp
ufw status

# CentOS（firewalld）
firewall-cmd --permanent --add-port=8080/tcp
firewall-cmd --reload

# 如果是云服务器（阿里云/腾讯云/AWS），还要在安全组里放行 8080 端口！
```

### 3.7 启动后端

```bash
cd /opt/hr-weekly
./start.sh
```

查看日志确认启动成功：
```bash
tail -f /opt/hr-weekly/app.log
```

看到类似以下内容就是成功了：
```
Started IntelligentHrBackendApplication in x.x seconds
Tomcat started on port(s): 8080 (http)
```

按 `Ctrl+C` 退出日志查看（程序继续在后台跑）。

### 3.8 验证后端 API

```bash
# 在后端服务器上测试
curl http://localhost:8080/api/reports

# 或者在你的电脑上测试（把 IP 换成后端服务器公网 IP）
curl http://后端服务器公网IP:8080/api/reports
```

如果返回 JSON 数据（周报列表），说明后端部署成功。

> **如果返回连接超时**：检查云服务器安全组是否放行了 8080 端口。

---

## 四、前端服务器部署

> **为什么用 Tomcat？** 你之前的文档就是 Tomcat 版。Tomcat 和 Nginx 都能跑前端，Nginx 更轻量，Tomcat 你更熟悉。**下面提供 Tomcat 版本**，如果你想用 Nginx，看文末附录。

### 4.1 安装 Tomcat 9

```bash
# Ubuntu/Debian
apt install tomcat9 -y

# CentOS
yum install tomcat9 -y

# 启动
systemctl start tomcat9
systemctl enable tomcat9
```

验证 Tomcat：
```bash
# 浏览器访问 http://前端服务器IP:8080，应该看到 Tomcat 欢迎页
curl http://localhost:8080
```

> Tomcat 默认端口也是 8080，如果跟后端冲突，后端改 `SERVER_PORT=8081`

### 4.2 上传前端文件

Tomcat 默认网页目录：
```
/var/lib/tomcat9/webapps/ROOT/
```

先把旧文件备份，再上传新的：
```bash
# 在前端服务器上执行
mv /var/lib/tomcat9/webapps/ROOT /var/lib/tomcat9/webapps/ROOT.bak.$(date +%Y%m%d)
mkdir -p /var/lib/tomcat9/webapps/ROOT
```

上传文件：
```bash
# 在本地电脑执行
scp -r /本地路径/dist/* root@前端服务器IP:/var/lib/tomcat9/webapps/ROOT/
```

确认文件结构：
```bash
ls -la /var/lib/tomcat9/webapps/ROOT/
# 应该看到：index.html  app-config.json  llm-config.json  WEB-INF/  assets/
```

### 4.3 修改 app-config.json（关键步骤！）

```bash
nano /var/lib/tomcat9/webapps/ROOT/app-config.json
```

改成：
```json
{
  "apiBaseUrl": "http://你的后端服务器公网IP:8080/api"
}
```

> **一台服务器部署时**：写成 `http://localhost:8080/api`

### 4.4 确认 WEB-INF/web.xml 存在

你的 `dist/` 里已经带了 `WEB-INF/web.xml`，Tomcat 会自动识别。内容应该是：
```xml
<?xml version="1.0" encoding="UTF-8"?>
<web-app>
  <error-page>
    <error-code>404</error-code>
    <location>/index.html</location>
  </error-page>
</web-app>
```

这就是前端路由刷新支持，不用额外配置。

### 4.5 开放防火墙端口

```bash
# Ubuntu
ufw allow 8080/tcp
ufw status

# CentOS
firewall-cmd --permanent --add-port=8080/tcp
firewall-cmd --reload

# 云服务器安全组也要放行 8080！
```

### 4.6 重启 Tomcat

```bash
systemctl restart tomcat9

# 查看日志
sudo tail -f /var/log/tomcat9/catalina.out
```

### 4.6 验证前端

在浏览器访问：
```
http://你的前端服务器公网IP
```

应该能看到登录页面。

打开浏览器开发者工具（F12）→ Network 标签 → 刷新页面，看是否有 `reports` 或 `login` 请求。

- 如果状态码是 200：前后端联通成功 ✅
- 如果报错 CORS / Network Error：检查 `app-config.json` 里的 IP 是否填对

---

## 五、一台服务器部署（简化版）

如果你只有一台服务器，前端后端都放一起：

```bash
# 1. 安装 Java 17 + Tomcat 9
apt install openjdk-17-jdk tomcat9 -y

# 2. 创建目录
mkdir -p /opt/hr-weekly/data

# 3. 上传文件
# - JAR 放到 /opt/hr-weekly/
# - dist/* 放到 /var/lib/tomcat9/webapps/ROOT/
# - hr.db 放到 /opt/hr-weekly/data/

# 4. 修改 app-config.json
echo '{"apiBaseUrl": "http://localhost:8080/api"}' > /var/lib/tomcat9/webapps/ROOT/app-config.json

# 5. 重启 Tomcat
systemctl restart tomcat9

# 6. 启动后端
cd /opt/hr-weekly
export DATA_DIR=/opt/hr-weekly/data
export SERVER_PORT=8080
nohup java -jar intelligent-hr-backend-1.0.0.jar --server.port=8080 > app.log 2>&1 &

# 7. 访问 http://服务器IP:8080
```

---

## 六、日常运维命令

### 查看后端日志
```bash
tail -f /opt/hr-weekly/app.log
```

### 重启后端
```bash
cd /opt/hr-weekly
./start.sh
```

### 重启 Tomcat
```bash
systemctl restart tomcat9

# 查看日志
sudo tail -f /var/log/tomcat9/catalina.out
```

### 查看进程
```bash
# 看 Java 进程
ps -ef | grep java

# 看 Tomcat 进程
ps -ef | grep tomcat
```

### 备份数据库
```bash
cp /opt/hr-weekly/data/hr.db /opt/hr-weekly/backup/hr.db.$(date +%Y%m%d_%H%M%S)
```

---

## 七、常见问题排查

### Q1：浏览器访问前端 IP 显示空白

1. 按 F12 → Console，看有没有红色报错
2. 如果有 `Failed to load module script`：检查 `index.html` 里的路径是不是 `./assets/...`
3. 如果有 `Cannot GET /xxx`：检查 `WEB-INF/web.xml` 是否存在

### Q2：能进登录页，但登录报错 "Network Error"

1. F12 → Network → 看 `login` 请求的 URL
2. 如果 URL 是 `http://REPLACE_WITH_BACKEND_IP:8080/api/auth/login`：说明 `app-config.json` 没改 IP
3. 如果 URL 正确但报 CORS 红色错误：后端没启动，或防火墙没放行 8080

### Q3：后端启动报错 "Port 8080 already in use"

```bash
# 查看谁占用了 8080
lsof -i:8080
# 或
netstat -tlnp | grep 8080

# 杀掉占用进程
kill -9 PID

# 或者改用其他端口
export SERVER_PORT=8081
# 同时修改前端的 app-config.json
```

### Q4：云服务器安全组怎么放行端口？

**阿里云：** 控制台 → ECS → 安全组 → 配置规则 → 入方向 → 添加规则
- 端口范围：8080/8080
- 授权对象：0.0.0.0/0

**腾讯云：** 控制台 → 服务器 → 防火墙 → 添加规则
- 端口：TCP:8080
- 来源：0.0.0.0/0

### Q5：AI 功能不工作

1. 检查后端日志看 LLM 请求报错
2. 内网不通时，换备用网关：
   ```json
   {
     "baseUrl": "http://10.240.192.142:30005",
     "apiKey": "sk-VTJ7LU7TSrMsyhW3yixyqvhsAD14iwhMTbJiQGHWCjgmct9F",
     "model": "deepseek-v4"
   }
   ```

---

## 八、检查清单（部署完逐项确认）

- [ ] 后端服务器 Java 17 已安装
- [ ] 后端 JAR 已上传到 `/opt/hr-weekly/`
- [ ] `hr.db` 已放到 `/opt/hr-weekly/data/`（如有旧数据）
- [ ] 后端已启动，`curl http://后端IP:8080/api/reports` 返回 JSON
- [ ] 云服务器安全组已放行 8080 端口
- [ ] 前端文件已上传到 `/var/www/hr-web/`
- [ ] `app-config.json` 已改为正确的后端 IP
- [ ] Tomcat 已重启
- [ ] 云服务器安全组已放行 8080 端口（Tomcat 默认端口）
- [ ] 浏览器能访问登录页面
- [ ] 能正常登录并看到周报数据
