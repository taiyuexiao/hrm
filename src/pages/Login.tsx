import React, { useState } from 'react';
import { Card, Input, Button, message, Form, Typography } from 'antd';
import { LockOutlined, UserOutlined } from '@ant-design/icons';
import { authApi } from '../services/api';

const { Title, Text } = Typography;

interface LoginProps {
  onLogin: (token: string, user: any) => void;
}

const Login: React.FC<LoginProps> = ({ onLogin }) => {
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (values: { username: string; password: string }) => {
    setLoading(true);
    try {
      const res = await authApi.login(values.username, values.password);
      if (res.success && res.token) {
        localStorage.setItem('auth-token', res.token);
        localStorage.setItem('auth-user', JSON.stringify(res.user));
        onLogin(res.token, res.user);
        if (res.needChangePassword) {
          message.info('首次登录，请修改初始密码');
        } else {
          message.success('登录成功');
        }
      } else {
        message.error(res.message || '登录失败');
      }
    } catch (err: any) {
      console.error('登录异常:', err);
      const errorMsg = err?.message || String(err);
      if (errorMsg.includes('Failed to fetch') || errorMsg.includes('NetworkError')) {
        message.error('网络错误，请检查后端服务是否可达');
      } else if (errorMsg.includes('JSON')) {
        message.error('后端返回格式异常，请检查后端服务');
      } else if (errorMsg.includes('HTTP error')) {
        message.error('后端服务异常：' + errorMsg);
      } else {
        message.error('登录失败：' + errorMsg);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      }}
    >
      <Card
        style={{ width: 420, borderRadius: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.15)' }}
        bodyStyle={{ padding: '40px 32px' }}
      >
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Title level={3} style={{ margin: 0, color: '#333' }}>数据部管理工作台</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>请使用部门账号登录</Text>
        </div>

        <Form onFinish={handleSubmit} size="large">
          <Form.Item
            name="username"
            rules={[{ required: true, message: '请输入用户名' }]}
          >
            <Input
              prefix={<UserOutlined style={{ color: '#999' }} />}
              placeholder="用户名"
              autoComplete="username"
            />
          </Form.Item>

          <Form.Item
            name="password"
            rules={[{ required: true, message: '请输入密码' }]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: '#999' }} />}
              placeholder="密码"
              autoComplete="current-password"
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, marginTop: 24 }}>
            <Button type="primary" htmlType="submit" block loading={loading}>
              登 录
            </Button>
          </Form.Item>
        </Form>


      </Card>
    </div>
  );
};

export default Login;
