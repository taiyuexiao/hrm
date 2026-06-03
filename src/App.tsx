import { useState } from 'react';
import {
  Layout, Menu, Button, Space, Badge, Popover, List, Tag, Drawer,
  Switch, Divider, Avatar, Input, message, Dropdown, Modal,
} from 'antd';
import {
  MessageOutlined,
  FormOutlined,
  LockOutlined,
  LogoutOutlined,
  UserOutlined,
  SettingOutlined,
} from '@ant-design/icons';
import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import WeeklyReportV2 from './components/weekly-report-v2/WeeklyReportV2';
import Login from './pages/Login';
import { authApi } from './services/api';

const { Header, Sider, Content } = Layout;

function AppContent() {
  const [collapsed, setCollapsed] = useState(false);
  const [msgOpen, setMsgOpen] = useState(false);
  const [settingOpen, setSettingOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [pwdModalOpen, setPwdModalOpen] = useState(false);
  const [oldPwd, setOldPwd] = useState('');
  const [newPwd, setNewPwd] = useState('');
  const [confirmPwd, setConfirmPwd] = useState('');

  const handleLogout = () => {
    localStorage.removeItem('auth-token');
    localStorage.removeItem('auth-user');
    window.location.reload();
  };

  const handleChangePassword = async () => {
    if (!oldPwd || !newPwd || !confirmPwd) {
      message.warning('请填写完整密码信息');
      throw new Error('参数不完整');
    }
    if (newPwd !== confirmPwd) {
      message.warning('两次输入的新密码不一致');
      throw new Error('密码不一致');
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

  const avatarMenuItems = [
    {
      key: 'name',
      label: authUser?.name || '未登录',
      disabled: true,
      icon: <UserOutlined />,
    },
    { type: 'divider' as const },
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

  const notifications = [
    { title: '高风险预警：岗位错配', desc: '黎河川（架构管理/应用研发）技能与岗位匹配度低', time: '10分钟前', level: '高' },
    { title: '倦怠风险预警', desc: '白海（信息统计部）持续3周高负荷工作', time: '30分钟前', level: '中' },
    { title: '离职风险预警', desc: '廖夏（信息统计部）综合风险评分偏高', time: '1小时前', level: '高' },
    { title: '高潜人才推荐', desc: '万言初（智能应用一部）综合评分84，建议重点培养', time: '2小时前', level: '低' },
    { title: '周报数据更新', desc: '200人×4周星形模型周报已生成完毕', time: '今天 09:30', level: '低' },
  ];

  return (
    <Layout style={{ minHeight: '100vh', position: 'relative' }}>
      <Sider collapsible collapsed={collapsed} onCollapse={(value) => setCollapsed(value)} width={200} collapsedWidth={80}>
        <div className="logo" style={{ height: '64px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '18px', fontWeight: 'bold', color: '#fff' }}>
          智能人才管理系统
        </div>
        <Menu
          theme="dark"
          mode="inline"
          defaultSelectedKeys={['7']}
          items={[
            {
              key: '7',
              icon: <FormOutlined />,
              label: <Link to="/weekly-report-v2">周报管理</Link>,
            },
          ]}
        />
      </Sider>
      <Layout className="site-layout">
        <Header className="site-layout-background" style={{ padding: '0 24px', display: 'flex', alignItems: 'center', justifyContent: 'flex-end' }}>
          <Space>
            <Popover
              open={msgOpen}
              onOpenChange={setMsgOpen}
              placement="bottomRight"
              title={<div style={{ fontWeight: 'bold' }}>🔔 系统通知 ({notifications.length})</div>}
              content={
                <List
                  size="small"
                  style={{ width: 320, maxHeight: 360, overflow: 'auto' }}
                  dataSource={notifications}
                  renderItem={(item: any) => (
                    <List.Item style={{ padding: '8px 0', cursor: 'pointer' }}>
                      <div style={{ width: '100%' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 500, fontSize: 13 }}>{item.title}</span>
                          <Tag color={item.level === '高' ? 'red' : item.level === '中' ? 'orange' : 'green'} style={{ fontSize: 11, padding: '0 4px', lineHeight: '16px' }}>{item.level}</Tag>
                        </div>
                        <div style={{ fontSize: 12, color: '#666', marginTop: 2 }}>{item.desc}</div>
                        <div style={{ fontSize: 11, color: '#999', marginTop: 2 }}>{item.time}</div>
                      </div>
                    </List.Item>
                  )}
                />
              }
              trigger="click"
            >
              <Badge count={notifications.length} showZero>
                <Button icon={<MessageOutlined />} onClick={() => setMsgOpen(!msgOpen)} />
              </Badge>
            </Popover>
            <Dropdown menu={{ items: avatarMenuItems }} placement="bottomRight">
              <Avatar size="small" style={{ background: '#1890ff', cursor: 'pointer' }}>
                {authUser?.name?.[0] || 'U'}
              </Avatar>
            </Dropdown>
          </Space>
        </Header>
        <Content className="site-layout-background">
          <Routes>
            <Route path="/" element={<WeeklyReportV2 />} />
            <Route path="/weekly-report-v2" element={<WeeklyReportV2 />} />
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
            <div style={{ fontSize: 13, color: '#666' }}>智能人才管理系统 v1.0</div>
            <div style={{ fontSize: 12, color: '#999', marginTop: 4 }}>数据覆盖 200 人合成数据 + 800 条周报事实记录</div>
          </div>
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
          </div>
          <div>
            <div style={{ marginBottom: 4, fontSize: 13, color: '#333' }}>确认新密码</div>
            <Input.Password placeholder="请再次输入新密码" value={confirmPwd} onChange={e => setConfirmPwd(e.target.value)} />
          </div>
        </div>
      </Modal>
    </Layout>
  );
}

function App() {
  const [token, setToken] = useState<string | null>(localStorage.getItem('auth-token'));

  const handleLogin = (newToken: string) => {
    localStorage.setItem('auth-token', newToken);
    setToken(newToken);
  };

  if (!token) {
    return <Login onLogin={handleLogin} />;
  }

  return (
    <Router>
      <AppContent />
    </Router>
  );
}

export default App;
