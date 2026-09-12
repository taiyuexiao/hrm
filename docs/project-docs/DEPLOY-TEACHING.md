# 从代码到服务器：前后端分离部署原理完全指南

> **目标**：不告诉你"按哪几个按钮"，而是让你理解"为什么按这几个按钮"

---

## 第一章：你的代码本质上是什么？

### 1.1 前端代码的本质

你看到的 React 代码（`.tsx`、`.ts`）：
```tsx
function App() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}
```

**浏览器不认识这些。** 浏览器只认识三种东西：
- HTML（页面结构）
- CSS（样式）
- JavaScript（逻辑）

所以 `npm run build` 做的事情，就是**把你的 React/TypeScript 代码翻译成浏览器能懂的 JS + CSS + HTML**。

翻译后的产物在 `dist/` 目录：
```
dist/
├── index.html          ← 入口页面（包含 <div id="root"></div>）
├── assets/
│   ├── index-xxx.js    ← 你写的所有 TSX 被翻译成了一坨 JS
│   └── index-xxx.css   ← 你写的所有样式被翻译成了 CSS
└── app-config.json     ← 配置文件（浏览器运行时读取）
```

**关键理解**：`dist/` 里没有任何"程序"，只有**静态文件**——跟你在桌面上放一张 `.jpg` 图片没有本质区别。它们不需要"运行"，只需要被"展示"。

### 1.2 后端代码的本质

你的 Java 代码（`Controller.java`、`Service.java`）：
```java
@RestController
public class ReportController {
    @GetMapping("/api/reports")
    public List<Report> getReports() { ... }
}
```

**操作系统不认识 Java 代码。** 计算机只认识机器码（0 和 1）。

所以 `mvn package` 做的事情是：
1. 把 `.java` 翻译成 `.class`（字节码，JVM 能懂但操作系统不懂）
2. 把所有 `.class` 文件 + 依赖库（Spring Boot、SQLite 驱动等）**打包成一个 jar 文件**

**jar 文件本质上是一个 zip 压缩包**，里面装着一堆 `.class` 文件和资源文件。

### 1.3 为什么 Java 需要一个"虚拟机"（JVM）？

Python 脚本你比较熟：
```bash
python script.py    ← Python 解释器直接读源码执行
```

Java 不一样：
```bash
java -jar app.jar   ← JVM（Java 虚拟机）读字节码执行
```

**JVM 是什么？** 可以理解成 Java 的"专属解释器"。

| 语言 | 执行方式 | 需要安装什么 |
|------|---------|------------|
| Python | 解释器直接读 `.py` | Python 解释器 |
| Java | JVM 读 `.class` | JDK（包含 JVM） |

这就是为什么后端服务器必须装 Java 17——因为没装 JVM 的话，`java` 命令不存在，jar 包跑不起来。

---

## 第二章：前后端分离到底是什么意思？

### 2.1 原来不分离是怎么跑的？

早期项目（本项目之前也是），前后端代码混在一起：

```
项目/
├── src/
│   ├── main/
│   │   ├── java/          ← 后端 Java 代码
│   │   └── resources/
│   │       └── static/    ← 前端 HTML/JS/CSS 也放这里
```

**Spring Boot 启动时，会把 `static/` 目录下的文件当成静态资源一起 serve 出去。**

访问流程：
```
浏览器 → http://localhost:8080/       ← Spring Boot 返回 static/index.html
浏览器 → http://localhost:8080/api/xx ← Spring Boot 执行 Java 代码返回 JSON
```

**问题**：
- 前端改个按钮颜色，需要重新打包整个 Java 项目
- 前端和后端必须部署在同一台机器上
- 前端无法独立扩容（比如加 CDN）

### 2.2 分离后怎么跑的？

现在把前端从 Java 项目里彻底拆出来：

```
前端服务器 (Tomcat9)
    │
    ├── 监听 8080 端口
    ├── 收到请求：GET /
    └── 返回：/var/lib/tomcat9/webapps/ROOT/index.html
    
后端服务器 (Java jar)
    │
    ├── 监听 8080 端口
    ├── 收到请求：GET /api/reports
    └── 执行 Java 代码 → 查 SQLite → 返回 JSON
```

**关键变化**：前端和后端变成了两个完全独立的进程，跑在两台（或一台）服务器上。

### 2.3 它们怎么通信？

前端代码在浏览器里运行，浏览器是"客户端"。它要获取数据，就得**主动发 HTTP 请求**到后端。

```javascript
// 前端代码（在浏览器里执行）
fetch('http://后端IP:8080/api/reports')  
  .then(res => res.json())
  .then(data => { /* 展示数据 */ });
```

**这里有一个安全问题：同源策略（Same-Origin Policy）。**

浏览器规定：如果前端页面从 `http://前端IP:8080` 加载的，那么它默认只能向 `http://前端IP:8080` 发请求。如果它向 `http://后端IP:8080` 发请求，浏览器会拦截，报 CORS 错误。

**解决方案**：后端告诉浏览器"我允许这个前端域名访问我"。这就是 `WebConfig.java` 里做的事情：
```java
registry.addMapping("/api/**")
    .allowedOriginPatterns("*");  // 允许所有来源
```

**总结**：前后端分离 = 前端是"静态文件展示器"，后端是"JSON 数据提供者"，两者通过 HTTP + CORS 通信。

---

## 第三章：前端部署原理——为什么 Tomcat 能跑前端？

### 3.1 Tomcat 到底是什么？

Tomcat 是一个 **Web 服务器**。

它的核心工作很简单：
1. 监听某个端口（默认 8080）
2. 收到 HTTP 请求
3. 根据请求的路径，找到对应的文件返回

```
浏览器请求：GET /index.html
Tomcat 查找：/var/lib/tomcat9/webapps/ROOT/index.html
Tomcat 返回：文件内容
```

**这跟 Nginx 做的事情本质上一样**，只是 Tomcat 还能跑 Java Servlet（本项目前端不需要这个功能）。

### 3.2 为什么前端文件要放在 `webapps/ROOT/`？

Tomcat 的 `webapps/` 目录可以部署多个应用：
```
webapps/
├── ROOT/           ← 访问 http://IP:8080/ 时命中这里
├── app1/           ← 访问 http://IP:8080/app1/ 时命中这里
└── app2/           ← 访问 http://IP:8080/app2/ 时命中这里
```

`ROOT` 是默认应用，访问 `http://IP:8080/` 时会自动找这里面的文件。

### 3.3 为什么需要 `WEB-INF/web.xml`？

React 是**单页应用（SPA）**：
- 只有一个真实的 HTML 文件：`index.html`
- 路由变化（如 `/reports`、`/admin`）是前端 JS 自己切换的，不是真的去服务器请求新页面

**问题**：
- 用户首次访问 `http://IP:8080/` → Tomcat 返回 `index.html` ✅
- 用户点击按钮跳转到 `/reports` → 前端 JS 切换 ✅
- 用户在 `/reports` 页面按 F5 刷新 → 浏览器发请求 `GET /reports` → Tomcat 找不到这个文件 → 404 ❌

**解决方案**：`web.xml` 告诉 Tomcat："如果找不到文件（404），就返回 `index.html`，让前端 JS 自己处理路由"。

```xml
<error-page>
  <error-code>404</error-code>
  <location>/index.html</location>
</error-page>
```

---

## 第四章：后端部署原理——jar 包是怎么跑起来的？

### 4.1 Spring Boot 为什么能"自带服务器"？

传统 Java Web 项目（非 Spring Boot）：
```
1. 把代码编译成 .war 文件
2. 把 .war 丢到 Tomcat 的 webapps/ 目录
3. 启动 Tomcat
4. Tomcat 加载 .war 里的代码
```

**Spring Boot 的革命性设计**：
> "既然每个项目都需要 Tomcat，不如把 Tomcat 直接打包进 jar 里。"

所以 `intelligent-hr-backend-1.0.0.jar` 里面**已经包含了一个精简版的 Tomcat**。

执行 `java -jar app.jar` 时：
1. JVM 启动
2. 加载 jar 里的 Spring Boot 代码
3. Spring Boot 启动内嵌 Tomcat
4. 内嵌 Tomcat 监听 8080 端口
5. 等待 HTTP 请求

**这就是为什么只需要一个 `java` 命令就能跑起来，不需要额外装 Tomcat。**

### 4.2 环境变量是怎么工作的？

`application.yml` 里有：
```yaml
app:
  data-dir: ${DATA_DIR:./data}
```

这行代码的意思是：
- 先去环境变量里找 `DATA_DIR`
- 如果找到了，就用它的值
- 如果没找到，默认用 `./data`（jar 包同级的 data 目录）

**环境变量的作用域**：
```bash
export DATA_DIR=/opt/hr-weekly/data   ← 当前终端会话有效
java -jar app.jar                      ← 这个命令能读到 DATA_DIR
```

如果另开一个终端窗口，`DATA_DIR` 就不存在了（除非写进 `.bashrc` 或 systemd 配置）。

### 4.3 systemd 是什么？为什么用它？

直接运行 `java -jar app.jar` 的问题是：
- 关掉终端窗口，程序就停了
- 服务器重启后，程序不会自动启动
- 程序挂了不会自动重启

**systemd 是 Linux 的"进程管家"**：
- 你告诉它"帮我盯着这个程序"
- 开机自动启动
- 崩溃自动重启
- 统一管理日志（`journalctl`）

---

## 第五章：数据库原理——为什么不需要装 MySQL？

### 5.1 SQLite 是什么？

MySQL、PostgreSQL 是**数据库服务器**：
- 需要单独安装一个程序
- 程序启动后监听一个端口（如 3306）
- 你的应用通过网络连接它

SQLite 是**嵌入式数据库**：
- 不需要安装任何程序
- 它就是一个普通的**文件**（`hr.db`）
- Java 通过 JDBC 驱动直接读写这个文件

```
Java 程序 → JDBC 驱动 → 直接读写 hr.db 文件
                    ↑
            不需要数据库服务器进程
```

**优势**：部署简单，复制一个文件就行。
**劣势**：不适合高并发，不适合多台服务器共享数据。

本项目数据量小、并发低，用 SQLite 完全够用。

### 5.2 JDBC 是什么？

JDBC（Java Database Connectivity）是 Java 连接数据库的**标准接口**。

`pom.xml` 里引入：
```xml
<dependency>
    <groupId>org.xerial</groupId>
    <artifactId>sqlite-jdbc</artifactId>
</dependency>
```

这行代码的意思是：下载 SQLite 的 JDBC 驱动，让 Java 能"说 SQLite 的语言"。

`application.yml` 配置：
```yaml
spring:
  datasource:
    url: jdbc:sqlite:/opt/hr-weekly/data/hr.db
    driver-class-name: org.sqlite.JDBC
```

- `jdbc:sqlite:` → 协议头，告诉 JDBC 我要连 SQLite
- `/opt/hr-weekly/data/hr.db` → 数据库文件的路径
- `org.sqlite.JDBC` → 使用哪个驱动类

---

## 第六章：网络通信全链路——一个请求是怎么走的？

### 6.1 用户在浏览器输入地址，发生了什么？

```
1. 用户输入：http://121.41.172.210:8080/
   
2. DNS 解析（这里没有域名，直接是 IP，跳过）

3. 浏览器向 121.41.172.210:8080 建立 TCP 连接
   
4. 浏览器发送 HTTP 请求：
   GET / HTTP/1.1
   Host: 121.41.172.210:8080
   
5. 前端服务器的 Tomcat9 收到请求
   → 查找 /var/lib/tomcat9/webapps/ROOT/index.html
   → 返回 HTML 内容
   
6. 浏览器解析 HTML，发现要加载 JS 和 CSS
   → 再次发请求：GET /assets/index-xxx.js
   → Tomcat 返回 JS 文件
   
7. JS 代码执行，发现需要数据
   → 读取 app-config.json：apiBaseUrl = "http://8.136.114.162:8080/api"
   → 发请求：GET http://8.136.114.162:8080/api/reports
   
8. 后端服务器的 Java 程序收到请求
   → Spring Boot 路由到 ReportController.getReports()
   → 查 SQLite 数据库
   → 返回 JSON：{"data": [...]}
   
9. 浏览器收到 JSON，JS 代码把数据渲染到页面上
```

### 6.2 为什么要开放防火墙？

服务器默认会拒绝所有外来连接（安全考虑）。

```
浏览器 ──TCP──▶ 服务器:8080
              ↑
              防火墙：不认识你，拒绝！
```

`ufw allow 8080/tcp` 就是告诉防火墙：
> "8080 端口的 TCP 连接是合法的，放行。"

### 6.3 为什么需要 CORS？

浏览器有一个**安全机制**：同源策略。

- 同源：协议相同 + 域名相同 + 端口相同
  - `http://a.com:8080` 和 `http://a.com:8080/api` → 同源 ✅
  - `http://a.com:8080` 和 `http://b.com:8080` → 不同源 ❌
  - `http://a.com:8080` 和 `http://a.com:9090` → 不同源 ❌

当前端（`121.41.172.210:8080`）向后端（`8.136.114.162:8080`）发请求时，**端口虽然相同但 IP 不同**，所以浏览器认为是"跨域"。

浏览器会先发一个 **OPTIONS 预检请求**：
```
OPTIONS /api/reports HTTP/1.1
Origin: http://121.41.172.210:8080
```

后端必须回应：
```
HTTP/1.1 200 OK
Access-Control-Allow-Origin: *
```

浏览器收到这个头，才允许真正的请求发出去。

这就是后端 `WebConfig.java` 配置 CORS 的原因。

---

## 第七章：配置文件的工作原理

### 7.1 为什么改 JSON 不用重新编译？

前端构建时（`npm run build`），代码里写的是：
```typescript
const res = await fetch('/app-config.json');
const config = await res.json();
const apiUrl = config.apiBaseUrl;
```

注意：它不是在构建时读 `app-config.json`，而是在**浏览器运行时**读。

所以：
- 构建产物 `dist/assets/index-xxx.js` 里没有硬编码任何 API 地址
- 每次页面刷新，浏览器都会重新请求 `/app-config.json`
- 改 JSON 文件 → 刷新页面 → 立即生效

### 7.2 application.yml 是怎么被加载的？

Spring Boot 启动时，会按优先级读取配置：

1. **命令行参数**：`java -jar app.jar --server.port=9090`
2. **环境变量**：`SERVER_PORT=9090`
3. **application.yml**：jar 包内部的配置文件
4. **默认值**：代码里写死的 fallback

这就是为什么可以通过环境变量覆盖 `application.yml` 里的配置。

### 7.3 环境变量 vs 配置文件的区别

| 特性 | 环境变量 | 配置文件 |
|------|---------|---------|
| 修改方式 | 启动前设置 | 直接编辑文件 |
| 生效方式 | 重启进程 | 重启进程（大部分） |
| 适合场景 | 服务器相关配置（路径、端口） | 应用逻辑配置（超时时间、功能开关） |
| 安全性 | 敏感信息（密码、密钥） | 一般配置 |

本项目把 `DATA_DIR` 做成环境变量，是因为不同服务器的目录结构不一样。

---

## 第八章：从开发到部署的完整链路

### 8.1 本地开发阶段

```
开发者电脑
├── 前端：npm run dev → Vite 启动开发服务器（localhost:5173）
│         → 自动编译 TSX → 热更新到浏览器
│
└── 后端：mvn spring-boot:run → 启动 Java 程序（localhost:8080）
          → 自动编译 Java → 热部署
```

### 8.2 构建阶段

```
前端构建：npm run build
    ├── TypeScript 编译 → JavaScript
    ├── Tree Shaking → 去掉没用到的代码
    ├── 代码压缩 → 体积变小
    └── 输出到 dist/

后端构建：mvn clean package
    ├── Java 编译 → .class 字节码
    ├── 运行单元测试（跳过：-DskipTests）
    ├── 打包 → .jar（包含 .class + 依赖库 + 内嵌 Tomcat）
    └── 输出到 backend/target/
```

### 8.3 部署阶段

```
1. 把 dist/ 复制到前端服务器的 Tomcat ROOT 目录
2. 把 jar 复制到后端服务器
3. 配置环境变量（DATA_DIR）
4. 启动后端：java -jar app.jar
5. 重启前端 Tomcat
6. 验证：浏览器访问，检查数据是否正常加载
```

---

## 第九章：常见问题背后的原理

### Q1：为什么前端页面刷新就 404？

**原理**：React Router 是前端路由，URL 变化不会真的发请求到服务器。但按 F5 刷新时，浏览器会真的发请求到服务器，Tomcat 找不到对应的文件。

**解决**：`web.xml` 配置 404 回退到 `index.html`。

### Q2：为什么改了代码要重新 build？

**原理**：浏览器只能跑 JS/CSS/HTML，不能跑 TSX/Java。每次代码修改后，必须重新翻译（构建）才能部署。

**例外**：`app-config.json`、`llm-config.json` 是运行时读取的，不需要重新构建。

### Q3：为什么 jar 包 48MB 这么大？

**原理**：jar 包里除了你的代码，还包含了：
- Spring Boot 框架（~10MB）
- 内嵌 Tomcat（~5MB）
- SQLite JDBC 驱动（~1MB）
- 前端静态文件（~2MB）
- 其他依赖库（~30MB）

这就是为什么叫" Fat Jar"（胖 jar）——自己就是一个完整的运行环境。

### Q4：systemd 里的 `Restart=always` 是什么意思？

**原理**：systemd 会监控进程状态。如果 Java 程序因为内存溢出（OOM）或其他原因崩溃了，systemd 会自动重新启动它。

对比：
- `nohup java -jar app.jar &` → 进程挂了没人管
- `systemctl start hr-weekly` → 进程挂了 systemd 自动重启

---

## 第十章：总结

| 概念 | 一句话理解 |
|------|-----------|
| **dist/** | 前端代码翻译后的静态文件，跟图片一样不需要"运行" |
| **Tomcat9** | Web 文件服务器，收到 HTTP 请求就返回对应的文件 |
| **jar 包** | 包含 Java 字节码 + 依赖库 + 内嵌 Tomcat 的压缩包 |
| **JVM** | Java 的专属解释器，把字节码翻译成机器码执行 |
| **Spring Boot** | 把 Tomcat 打包进 jar，让 Java 程序能独立运行 |
| **SQLite** | 不需要安装的数据库，就是一个文件 |
| **JDBC** | Java 连接数据库的通用接口 |
| **CORS** | 浏览器安全机制，后端需要明确允许跨域请求 |
| **环境变量** | 操作系统级别的"全局变量"，程序启动时可以读取 |
| **systemd** | Linux 的进程管家，负责开机启动、自动重启、日志管理 |

---

理解这些原理后，你再去看任何部署文档，都会知道"为什么要这样做"，而不仅仅是"怎么做"。
