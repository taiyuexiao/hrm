# 周报系统端到端测试（E2E）

两套可独立调用的自动化测试工程：

| 工程 | 路径 | 定位 | 运行成本 |
|---|---|---|---|
| **路径一：Playwright 脚本回归** | `e2e/` | 确定性回归测试，覆盖已验证功能点 | 秒级、零成本 |
| **路径二：Midscene AI 驱动测试** | `e2e/midscene/` | 自然语言用例 + AI 语义断言，覆盖柔性场景 | 每次消耗 LLM token |

---

## 路径一：Playwright 脚本回归

### 前置条件

1. 本地服务运行：前端 `localhost:5173` + 后端 `localhost:8080`
2. 本机装有 Chrome（复用系统浏览器，无需下载 Playwright 浏览器）
3. 测试账号已内置：`e2e_test / E2e@test123`（role=admin，创建于本地 dev 数据库）

### 运行

```bash
cd e2e
npm install        # 首次
npm test           # 跑全部用例（约 1~2 分钟）
npm run test:headed   # 有头模式（看浏览器实际操作）
npm run test:ui       # Playwright UI 调试模式
npm run report        # 查看 HTML 报告
```

单独跑某个文件：

```bash
npx playwright test tests/04-parse-block.spec.ts
```

### 超管用例（回收站恢复）

涉及 33528 的用例通过环境变量开启（未设置则自动跳过）：

```bash
E2E_SUPER_PASSWORD='超管密码' npm test
```

### 用例清单

| 文件 | 覆盖功能 |
|---|---|
| 01-auth | 登录页渲染、错误密码提示、正确登录、角色菜单差异 |
| 02-week-dropdown | 周期选项加载、当前周保底、切换周 |
| 03-task-tree | 添加/编辑根任务、添加子任务、删除（含确认） |
| 04-parse-block | 栏级整段解析：预览、追加、覆盖+二次确认、序号 |
| 05-parse-into | 根任务级解析：标题智能识别、追加合并、子任务序号连续 |
| 06-week-lifecycle | 删除周期→回收站、重建拦截；恢复（超管，可跳过） |
| 07-submit | 编辑→自动保存→提交→已提交标识 |
| 08-admin-pages | 行为日志、提交管理、演示模式 |
| 09-export | 导出当前周 Excel（下载校验） |

### 数据隔离

- 测试专用周期 `20260904` + 科室 `综合管理部`，每个 spec 前创建、跑完清理（软删除 + 直接清库）
- 不触碰任何真实周报数据

### 常见维护点

- **antd Select**：用 `dispatchEvent('mousedown')` 打开（`fixtures.ts#selectWeek`）
- **React 受控输入**：用原生 setter 注入（`fixtures.ts#setReactInput`）
- **任务序号**：前缀与文本间有空格，断言用正则 `\s*`（见 04/05 用例）
- **删除按钮**：下拉框内元素动画期间用 `click({ force: true })`

---

## 路径二：Midscene AI 驱动测试

### 适用场景

结果不确定、写不死断言的用例：AI 总结内容质量、复杂交互流、探索性测试。

### 前置条件

1. 本地服务运行（同路径一）
2. **行内 LLM 网关可达**，且网关提供**多模态视觉模型**（如 qwen-vl 系列）——纯文本模型无法做 UI 元素定位
3. 配置环境：

```bash
cd e2e/midscene
cp .env.example .env
# 编辑 .env：填入 OPENAI_BASE_URL / OPENAI_API_KEY / MIDSCENE_MODEL_NAME
```

### 运行

```bash
cd e2e/midscene
npm install        # 首次
npm test
```

### 说明

- 登录等确定性步骤用普通 API 注入（不浪费 token），只有"操作"和"断言"交给 AI
- 用例见 `tests/ai-driven.spec.ts`：通过 `base.extend(PlaywrightAiFixture())` 注入 AI 方法，自然语言步骤用 `aiAction()`，语义断言用 `aiAssert()`
- 当前本机到行内网关（10.202.32.20）网络不通，需在行内网络环境运行
- 已验证：工程可正常加载（`npx playwright test --list` 列出 2 条用例）
