import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Layout, Menu, Button, Space, Badge, Popover, List, Drawer,
  Switch, Divider, Avatar, Input, message, Dropdown, Modal,
} from 'antd';
import {
  MessageOutlined,
  FormOutlined,
  LockOutlined,
  LogoutOutlined,
  UserOutlined,
  SettingOutlined,
  TeamOutlined,
  BookOutlined,
  BarChartOutlined,
  FileTextOutlined,
  DeleteOutlined,
  RocketOutlined,
} from '@ant-design/icons';
import { BrowserRouter as Router, Routes, Route, Link, useLocation, useNavigate, Navigate } from 'react-router-dom';
import WeeklyReportV2 from './components/weekly-report-v2/WeeklyReportV2';
import PresentationView from './components/weekly-report-v2/PresentationView';
import DailyApp from './components/newbie-daily/DailyApp';
import ChoosePage from './components/newbie-daily/ChoosePage';
import Login from './pages/Login';
import ChangePasswordPage from './pages/ChangePasswordPage';
import UserManagement from './components/user-management/UserManagement';
import KnowledgeBase from './components/knowledge-base/KnowledgeBase';
import ActionLogPage from './components/admin/ActionLogPage';
import ReportManagement from './components/admin/ReportManagement';
import SuggestionBoxPage from './components/admin/SuggestionBoxPage';
import RecycleBinPage from './components/admin/RecycleBinPage';
import PermissionManager from './components/permission-manager/PermissionManager';
import { authApi } from './services/api';
import { loadDepts } from './services/deptStore';
import { getApiBaseUrl, getAppBasePath } from './config/app';
import { validatePassword, PASSWORD_RULE_HINT } from './utils/password';


interface NoticeItem {
  id: string;
  type: 'mention' | 'dept_comment';
  /** 通知表原始类型：DAILY_ 前缀的为新人日报通知，点击路由到 /daily */
  rawType?: string;
  title: string;
  desc: string;
  weekLabel: string;
  dept: string;
  createdAt: string;
}

/**
 * 从全量评论轻量列表（/reports/comment-feed）派生通知：@提及、同部门评论/回复。
 * 2026-09-15 性能优化：替代原先拉取 1.8MB 全量周报的做法。
 */
function calcNoticesFromFeed(feed: any[], userId: string, userDept: string): NoticeItem[] {
  const notices: NoticeItem[] = [];
  for (const c of feed) {
    if (c.authorId === userId) continue;
    const isMentioned = (c.mentionIds || []).includes(userId);
    const isDeptComment = c.dept === userDept;
    const isReply = !!c.parentId;

    if (isMentioned) {
      notices.push({
        id: `${isReply ? 'mr' : 'm'}-${c.id}`,
        type: 'mention',
        title: isReply ? `${c.authorName} 在回复中 @了你` : `${c.authorName} 在 ${c.dept} 周报中 @了你`,
        desc: c.content,
        weekLabel: c.weekLabel,
        dept: c.dept,
        createdAt: c.createdAt,
      });
    } else if (isDeptComment) {
      notices.push({
        id: `${isReply ? 'dr' : 'd'}-${c.id}`,
        type: 'dept_comment',
        title: isReply ? `${c.authorName} 回复了 ${c.dept} 周报` : `${c.authorName} 评论了 ${c.dept} 周报`,
        desc: c.content,
        weekLabel: c.weekLabel,
        dept: c.dept,
        createdAt: c.createdAt,
      });
    }
  }
  return notices.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}

const { Header, Sider, Content } = Layout;

function AppContent() {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(true);
  const [msgOpen, setMsgOpen] = useState(false);
  const navigate = useNavigate();
  const [notices, setNotices] = useState<NoticeItem[]>([]);
  const [readIds, setReadIds] = useState<string[]>([]);

  const loadNotices = useCallback(async () => {
    if (!authUser) return;
    try {
      // 1. 从评论派生通知（@提及、同部门评论）——轻量端点，只含评论字段
      const feedRes = await fetch(`${getApiBaseUrl()}/reports/comment-feed`, { headers: { 'Cache-Control': 'no-cache' } });
      let list: NoticeItem[] = [];
      if (feedRes.ok) {
        const feed = await feedRes.json();
        list = calcNoticesFromFeed(feed, authUser.id, authUser.dept);
      }
      // 2. 从 notifications 表读取持久化通知（任务被覆盖/删除等）
      const notifyRes = await fetch(`${getApiBaseUrl()}/notifications?userId=${authUser.id}&unreadOnly=false`, { headers: { 'Cache-Control': 'no-cache' } });
      if (notifyRes.ok) {
        const notifications = await notifyRes.json();
        for (const n of notifications) {
          list.push({
            id: `n-${n.id}`,
            type: n.type === 'TASK_OVERWRITTEN' || n.type === 'TASK_DELETED' ? 'dept_comment' : 'mention',
            rawType: n.type,
            title: n.title,
            desc: n.content,
            weekLabel: n.weekLabel,
            dept: n.dept,
            createdAt: n.createdAt,
          });
        }
      }
      list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      setNotices(list);
    } catch { /* ignore */ }
  }, []);

  useEffect(() => {
    loadNotices();
    const timer = setInterval(loadNotices, 30000);
    return () => clearInterval(timer);
  }, [loadNotices]);

  // 启动时拉取动态科室清单（失败回落到内置清单，不阻塞渲染）
  useEffect(() => {
    if (authUser) loadDepts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 双系统账号（传统角色 + 日报身份）登录后先选择进入哪个系统；纯日报账号由根路由直接重定向到 /daily
  useEffect(() => {
    if (!authUser) return;
    const dualApp = authUser.dailyRole && authUser.role !== 'daily';
    if (dualApp && !sessionStorage.getItem('appChosen') && location.pathname !== '/choose') {
      navigate('/choose', { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [settingOpen, setSettingOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [inactivityTimeout, setInactivityTimeout] = useState(() => {
    const saved = localStorage.getItem('inactivity-timeout-ms');
    return saved ? parseInt(saved, 10) : 30 * 60 * 1000;
  });
  const [pwdModalOpen, setPwdModalOpen] = useState(false);
  const [userMgmtOpen, setUserMgmtOpen] = useState(false);
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');

  const handleLogout = () => {
    localStorage.removeItem('auth-token');
    localStorage.removeItem('auth-user');
    sessionStorage.removeItem('appChosen');
    window.location.reload();
  };

  const INITIAL_PASSWORD = 'B@s95594!';

  const handleChangePassword = async () => {
    if (!oldPwd || !newPwd || !confirmPwd) {
      message.warning('请填写完整密码信息');
      throw new Error('参数不完整');
    }
    if (newPwd !== confirmPwd) {
      message.warning('两次输入的新密码不一致');
      throw new Error('密码不一致');
    }
    const pwdError = validatePassword(newPwd);
    if (pwdError) {
      message.warning(pwdError);
      throw new Error(pwdError);
    }
    if (newPwd === INITIAL_PASSWORD) {
      message.warning('新密码不能与初始密码相同');
      throw new Error('与初始密码相同');
    }
    if (!authUser) {
      message.error('用户未登录');
      throw new Error('未登录');
    }
    try {
      const res = await authApi.changePassword(authUser.username, oldPwd, newPwd);
      if (res.success) {
        message.success('密码修改成功，请重新登录');
        setOldPwd('');
        setNewPwd('');
        setConfirmPwd('');
        setTimeout(() => {
          handleLogout();
        }, 1500);
      } else {
        message.error(res.message || '修改失败');
        throw new Error(res.message || '修改失败');
      }
    } catch {
      message.error('网络错误，修改密码失败');
      throw new Error('网络错误');
    }
  };

  const authUser = (() => {
    try {
      const raw = localStorage.getItem('auth-user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  })();

  useEffect(() => {
    if (!authUser) return;
    const key = `notifications-read-${authUser.id}`;
    try {
      const stored = JSON.parse(localStorage.getItem(key) || '[]');
      setReadIds(stored);
    } catch { /* ignore */ }
  }, [authUser?.id]);

  // 无操作自动退出
  // 依赖只放 inactivityTimeout，避免 authUser/handleLogout 每次渲染都变导致计时器被反复重置
  useEffect(() => {
    if (!localStorage.getItem('auth-token')) return;

    let timer: number;
    const timeoutText = inactivityTimeout >= 60 * 1000
      ? `${Math.round(inactivityTimeout / 60 / 1000)}分钟`
      : `${Math.round(inactivityTimeout / 1000)}秒`;

    const logout = () => {
      message.info(`您已 ${timeoutText}未操作，系统已自动退出`);
      localStorage.removeItem('auth-token');
      localStorage.removeItem('auth-user');
      window.location.reload();
    };

    const resetTimer = () => {
      if (timer) clearTimeout(timer);
      timer = window.setTimeout(logout, inactivityTimeout);
    };

    const events = ['mousedown', 'keydown', 'touchstart', 'scroll'];
    events.forEach(event => window.addEventListener(event, resetTimer));
    resetTimer();

    return () => {
      if (timer) clearTimeout(timer);
      events.forEach(event => window.removeEventListener(event, resetTimer));
    };
  }, [inactivityTimeout]);

  const unreadCount = notices.filter(n => !readIds.includes(n.id)).length;

  const markAllRead = () => {
    if (notices.length === 0 || !authUser) return;
    const key = `notifications-read-${authUser.id}`;
    const allIds = notices.map(n => n.id);
    const updated = [...new Set([...readIds, ...allIds])];
    setReadIds(updated);
    localStorage.setItem(key, JSON.stringify(updated));
  };

  const avatarMenuItems = [
    {
      key: 'name',
      label: authUser?.name || '未登录',
      disabled: true,
      icon: <UserOutlined />,
    },
    { type: 'divider' as const },
    ...(authUser?.permissions?.includes('USER_MANAGE') ? [{
      key: 'userMgmt',
      label: '账号管理',
      icon: <TeamOutlined />,
      onClick: () => setUserMgmtOpen(true),
    }] : []),
    ...(authUser?.permissions?.includes('PERMISSION_MANAGE') ? [{
      key: 'permMgmt',
      label: '权限管理',
      icon: <SettingOutlined />,
      onClick: () => navigate('/admin/permissions'),
    }] : []),
    {
      key: 'settings',
      label: '系统设置',
      icon: <SettingOutlined />,
      onClick: () => setSettingOpen(true),
    },
    {
      key: 'changePwd',
      label: '修改密码',
      icon: <LockOutlined />,
      onClick: () => setPwdModalOpen(true),
    },
    {
      key: 'logout',
      label: '退出登录',
      icon: <LogoutOutlined />,
      onClick: handleLogout,
    },
  ];


  return (
    <Layout style={{ minHeight: '100vh', position: 'relative' }}>
      <Sider collapsible collapsed={collapsed} onCollapse={(value) => setCollapsed(value)} width={200} collapsedWidth={80}>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[
            location.pathname === '/daily' ? 'daily' :
            location.pathname === '/knowledge-base' ? 'kb' :
            location.pathname === '/admin/action-logs' ? 'logs' :
            location.pathname === '/admin/reports' ? 'reports' :
            location.pathname === '/admin/suggestions' ? 'suggestions' :
            location.pathname === '/admin/recycle-bin' ? 'recycle-bin' : '7'
          ]}
          items={[
            // 纯日报账号（新人/mentor）不显示周报入口，避免进入无权限的周报页
            ...(authUser?.role !== 'daily' ? [
              {
                key: '7',
                icon: <FormOutlined />,
                label: <Link to="/weekly-report-v2">周报管理</Link>,
              },
            ] : []),
            // 新人报告入口：所有非纯日报账号可见（老员工均可见日报），daily 账号也靠它回到日报页
            {
              key: 'daily',
              icon: <RocketOutlined />,
              label: <Link to="/daily">新人报告</Link>,
            },
            ...(authUser?.permissions?.includes('KNOWLEDGE_BASE') ? [
              {
                key: 'kb',
                icon: <BookOutlined />,
                label: <Link to="/knowledge-base">知识库</Link>,
              },
            ] : []),
            ...(authUser?.permissions?.includes('VIEW_SUBMISSIONS') ? [
              {
                key: 'reports',
                icon: <FileTextOutlined />,
                label: <Link to="/admin/reports">周报提交管理</Link>,
              },
            ] : []),
            ...(authUser?.permissions?.includes('VIEW_ACTION_LOGS') ? [
              {
                key: 'logs',
                icon: <BarChartOutlined />,
                label: <Link to="/admin/action-logs">行为日志</Link>,
              },
            ] : []),
            ...(authUser?.role === 'superadmin' ? [
              {
                key: 'suggestions',
                icon: <MessageOutlined />,
                label: <Link to="/admin/suggestions">建议箱</Link>,
              },
              {
                key: 'recycle-bin',
                icon: <DeleteOutlined />,
                label: <Link to="/admin/recycle-bin">回收站</Link>,
              },
            ] : []),
          ]}
        />
      </Sider>
      <Layout className="site-layout">
        <Header className="site-layout-background" style={{ position: 'sticky', top: 0, zIndex: 1000, padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: '18px', fontWeight: 'bold', color: '#1890ff' }}>
            数据部管理工作台
          </div>
          <Space>
            <Popover
              open={msgOpen}
              onOpenChange={(open) => {
                setMsgOpen(open);
                if (open) markAllRead();
              }}
              placement="bottomRight"
              title={<div style={{ fontWeight: 'bold' }}>🔔 消息通知 ({notices.length})</div>}
              content={
                notices.length > 0 ? (
                  <List
                    size="small"
                    style={{ width: 360, maxHeight: 400, overflow: 'auto' }}
                    dataSource={notices}
                    renderItem={(item: NoticeItem) => {
                      const isUnread = !readIds.includes(item.id);
                      return (
                        <List.Item style={{ padding: '8px 0' }}>
                          <div
                            style={{ width: '100%', cursor: 'pointer' }}
                            onClick={(e) => {
                              e.stopPropagation();
                              setMsgOpen(false);
                              // 新人日报通知跳日报系统，其余维持原周报跳转
                              if (item.rawType?.startsWith('DAILY')) {
                                navigate('/daily');
                              } else {
                                navigate(`/?weekLabel=${encodeURIComponent(item.weekLabel)}&dept=${encodeURIComponent(item.dept)}`);
                              }
                            }}
                          >
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                              <span style={{ fontWeight: isUnread ? 600 : 400, fontSize: 13, color: isUnread ? '#1890ff' : '#333' }}>
                                {item.type === 'mention' ? '@你 ' : ''}{item.title}
                              </span>
                              {isUnread && <Badge color="#1890ff" />}
                            </div>
                            <div style={{ fontSize: 12, color: '#666', marginTop: 2, lineHeight: 1.5 }}>{item.desc}</div>
                            <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>{item.weekLabel} · {item.dept}</div>
                          </div>
                        </List.Item>
                      );
                    }}
                  />
                ) : (
                  <div style={{ width: 320, padding: '20px 0', textAlign: 'center', color: '#999' }}>暂无消息</div>
                )
              }
              trigger="click"
            >
              <Badge count={unreadCount}>
                <Button icon={<MessageOutlined />} onClick={() => setMsgOpen(!msgOpen)} />
              </Badge>
            </Popover>
            {location.pathname !== '/presentation' && (
              <Dropdown menu={{ items: avatarMenuItems }} placement="bottomRight">
                <Avatar size="small" style={{ background: '#1890ff', cursor: 'pointer' }}>
                  {authUser?.name?.[0] || 'U'}
                </Avatar>
              </Dropdown>
            )}
          </Space>
        </Header>
        <Content className="site-layout-background">
          <Routes>
            {/* 纯日报账号（新人/mentor）登录后直达日报系统 */}
            <Route path="/" element={authUser?.role === 'daily' ? <Navigate to="/daily" replace /> : <WeeklyReportV2 />} />
            <Route path="/weekly-report-v2" element={<WeeklyReportV2 />} />
            <Route path="/daily" element={<DailyApp />} />
            <Route path="/choose" element={<ChoosePage />} />
            <Route path="/presentation" element={<PresentationView />} />
            <Route path="/knowledge-base" element={<KnowledgeBase />} />
            <Route path="/admin/action-logs" element={<ActionLogPage />} />
            <Route path="/admin/suggestions" element={<SuggestionBoxPage />} />
            <Route path="/admin/recycle-bin" element={<RecycleBinPage />} />
            <Route path="/admin/reports" element={<ReportManagement />} />
            <Route path="/admin/permissions" element={<PermissionManager />} />
          </Routes>
        </Content>
      </Layout>

      <Drawer
        title="⚙️ 系统设置"
        placement="right"
        onClose={() => setSettingOpen(false)}
        open={settingOpen}
        width={320}
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div>
            <div style={{ fontWeight: 'bold', marginBottom: 8 }}>界面设置</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>深色模式</span>
              <Switch checked={darkMode} onChange={setDarkMode} />
            </div>
          </div>
          <Divider style={{ margin: '8px 0' }} />
          <div>
            <div style={{ fontWeight: 'bold', marginBottom: 8 }}>数据刷新</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <span>自动刷新</span>
              <Switch checked={autoRefresh} onChange={setAutoRefresh} />
            </div>
            <div style={{ fontSize: 12, color: '#999' }}>开启后，Dashboard 数据每 5 分钟自动刷新</div>
          </div>
          <Divider style={{ margin: '8px 0' }} />
          <div>
            <div style={{ fontWeight: 'bold', marginBottom: 8 }}>关于系统</div>
            <div style={{ fontSize: 13, color: '#666' }}>数据部管理工作台 v1.0</div>
            <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>数据覆盖 200 人合成数据 + 800 条周报事实记录</div>
          </div>
          {authUser?.role === 'superadmin' && (
            <>
              <Divider style={{ margin: '8px 0' }} />
              <div>
                <div style={{ fontWeight: 'bold', marginBottom: 8 }}>测试设置（仅超管可见）</div>
                <div style={{ marginBottom: 8, fontSize: 13 }}>自动退出时间</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <Button
                    size="small"
                    type={inactivityTimeout === 20 * 1000 ? 'primary' : 'default'}
                    onClick={() => {
                      const value = 20 * 1000;
                      setInactivityTimeout(value);
                      localStorage.setItem('inactivity-timeout-ms', String(value));
                    }}
                  >
                    20秒
                  </Button>
                  <Button
                    size="small"
                    type={inactivityTimeout === 30 * 60 * 1000 ? 'primary' : 'default'}
                    onClick={() => {
                      const value = 30 * 60 * 1000;
                      setInactivityTimeout(value);
                      localStorage.setItem('inactivity-timeout-ms', String(value));
                    }}
                  >
                    30分钟
                  </Button>
                </div>
                <div style={{ fontSize: 12, color: '#999', marginTop: 8 }}>
                  当前：{inactivityTimeout === 30 * 60 * 1000 ? '30分钟' : `${Math.round(inactivityTimeout / 1000)}秒`}
                </div>
              </div>
            </>
          )}
        </div>
      </Drawer>

      <Modal
        title="修改密码"
        open={pwdModalOpen}
        onOk={handleChangePassword}
        onCancel={() => {
          setPwdModalOpen(false);
          setOldPwd('');
          setNewPwd('');
          setConfirmPwd('');
        }}
        okText="确认修改"
        cancelText="取消"
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, marginTop: 8 }}>
          <div>
            <div style={{ marginBottom: 4, fontSize: 13, color: '#333' }}>旧密码</div>
            <Input.Password placeholder="请输入旧密码" value={oldPwd} onChange={e => setOldPwd(e.target.value)} />
          </div>
          <div>
            <div style={{ marginBottom: 4, fontSize: 13, color: '#333' }}>新密码</div>
            <Input.Password placeholder="请输入新密码" value={newPwd} onChange={e => setNewPwd(e.target.value)} />
            <div style={{ marginTop: 4, fontSize: 12, color: '#999' }}>{PASSWORD_RULE_HINT}</div>
          </div>
          <div>
            <div style={{ marginBottom: 4, fontSize: 13, color: '#333' }}>确认新密码</div>
            <Input.Password placeholder="请再次输入新密码" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} />
          </div>
        </div>
      </Modal>

      {/* 账号管理（仅 USER_MANAGE 权限） */}
      {authUser?.permissions?.includes('USER_MANAGE') && (
        <UserManagement open={userMgmtOpen} onClose={() => setUserMgmtOpen(false)} />
      )}
    </Layout>
  );
}

function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('auth-token'));

  const handleLogin = (newToken: string, _user?: any) => {
    localStorage.setItem('auth-token', newToken);
    setToken(newToken);
  };

  const needChangePassword = useMemo(() => {
    if (!token) return false;
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      return payload.needChangePassword === true;
    } catch {
      return false;
    }
  }, [token]);

  if (!token) {
    return <Login onLogin={handleLogin} />;
  }

  const handleCancelChangePassword = () => {
    localStorage.removeItem('auth-token');
    localStorage.removeItem('auth-user');
    setToken(null);
  };

  if (needChangePassword) {
    return <ChangePasswordPage onChanged={handleLogin} onCancel={handleCancelChangePassword} />;
  }

  const basename = getAppBasePath().replace(/\/$/, '');
  return (
    <Router basename={basename}>
      <AppContent />
    </Router>
  );
}

export default App;
