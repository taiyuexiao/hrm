import React, { useState } from 'react';
import { Card, Input, Button, message, Form, Typography } from 'antd';
import { LockOutlined, CloseOutlined } from '@ant-design/icons';
import { authApi } from '../services/api';
import { validatePassword, PASSWORD_RULE_HINT } from '../utils/password';

const { Title, Text } = Typography;

interface ChangePasswordPageProps {
  onChanged: (token: string) => void;
  onCancel: () => void;
}

const INITIAL_PASSWORD = 'B@s95594!';

const ChangePasswordPage: React.FC<ChangePasswordPageProps> = ({ onChanged, onCancel }) => {
  const [loading, setLoading] = useState(false);
  const [form] = Form.useForm();

  const user = JSON.parse(localStorage.getItem('auth-user') || '{}');
  const username = user?.username || '';

  const handleSubmit = async (values: { oldPassword: string; newPassword: string; confirmPassword: string }) => {
    if (values.newPassword !== values.confirmPassword) {
      message.error('两次输入的新密码不一致');
      return;
    }
    if (values.newPassword === INITIAL_PASSWORD) {
      message.error('新密码不能与初始密码相同');
      return;
    }
    const pwdError = validatePassword(values.newPassword);
    if (pwdError) {
      message.error(pwdError);
      return;
    }

    setLoading(true);
    try {
      const res = await authApi.changePassword(username, values.oldPassword, values.newPassword);
      if (res.success && res.token) {
        localStorage.setItem('auth-token', res.token);
        onChanged(res.token);
        message.success('密码修改成功，请重新登录');
      } else {
        message.error(res.message || '密码修改失败');
      }
    } catch (err: any) {
      console.error('修改密码异常:', err);
      const errorMsg = err?.message || String(err);
      if (errorMsg.includes('Failed to fetch') || errorMsg.includes('NetworkError')) {
        message.error('网络错误，请检查后端服务是否可达');
      } else if (errorMsg.includes('JSON')) {
        message.error('后端返回格式异常，请检查后端服务');
      } else if (errorMsg.includes('HTTP error')) {
        message.error('后端服务异常：' + errorMsg);
      } else {
        message.error('修改密码失败：' + errorMsg);
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
        style={{ width: 460, borderRadius: 16, boxShadow: '0 8px 32px rgba(0,0,0,0.15)', position: 'relative' }}
        bodyStyle={{ padding: '40px 32px' }}
      >
        <Button
          type="text"
          icon={<CloseOutlined />}
          onClick={onCancel}
          title="返回登录页"
          style={{ position: 'absolute', top: 12, right: 12, color: '#999' }}
        />
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <Title level={3} style={{ margin: 0, color: '#333' }}>修改初始密码</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>
            首次登录需要修改密码。{PASSWORD_RULE_HINT}
          </Text>
        </div>

        <Form form={form} onFinish={handleSubmit} size="large">
          <Form.Item
            name="oldPassword"
            rules={[{ required: true, message: '请输入初始密码' }]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: '#999' }} />}
              placeholder="初始密码"
              autoComplete="current-password"
            />
          </Form.Item>

          <Form.Item
            name="newPassword"
            rules={[
              { required: true, message: '请输入新密码' },
              {
                validator: (_, value) => {
                  const err = value ? validatePassword(value) : null;
                  return err ? Promise.reject(new Error(err)) : Promise.resolve();
                },
              },
            ]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: '#999' }} />}
              placeholder="新密码"
              autoComplete="new-password"
            />
          </Form.Item>

          <Form.Item
            name="confirmPassword"
            rules={[{ required: true, message: '请确认新密码' }]}
          >
            <Input.Password
              prefix={<LockOutlined style={{ color: '#999' }} />}
              placeholder="确认新密码"
              autoComplete="new-password"
            />
          </Form.Item>

          <Form.Item style={{ marginBottom: 0, marginTop: 24 }}>
            <Button type="primary" htmlType="submit" block loading={loading}>
              确认修改
            </Button>
          </Form.Item>
        </Form>
      </Card>
    </div>
  );
};

export default ChangePasswordPage;
