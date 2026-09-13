import React from 'react';
import { Card, Space, Typography } from 'antd';
import { BarChartOutlined, RocketOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

const { Title, Text } = Typography;

/**
 * 双系统账号登录后的选择页（科室周报管理 / 新人日报管理）。
 * 选择后写入 sessionStorage，同一会话内不再询问；退出登录后重新询问。
 */
const ChoosePage: React.FC = () => {
  const navigate = useNavigate();

  const authUser = (() => {
    try {
      const raw = localStorage.getItem('auth-user');
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  })();

  const choose = (path: string) => {
    sessionStorage.setItem('appChosen', '1');
    navigate(path, { replace: true });
  };

  const cardStyle: React.CSSProperties = {
    width: 300, borderRadius: 14, cursor: 'pointer', textAlign: 'left',
    boxShadow: '0 4px 16px rgba(0,0,0,.06)',
  };

  return (
    <div style={{
      minHeight: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center',
      background: 'linear-gradient(135deg, #f0f5ff 0%, #f6ffed 100%)',
    }}>
      <Title level={2} style={{ marginBottom: 6 }}>您好，{authUser?.name || ''} 👋</Title>
      <Text type="secondary" style={{ marginBottom: 32 }}>您的账号可访问以下两个系统，请选择进入</Text>
      <Space size={28}>
        <Card hoverable style={cardStyle} onClick={() => choose('/')}>
          <div style={{ fontSize: 38, marginBottom: 12 }}><BarChartOutlined /></div>
          <Title level={4} style={{ marginBottom: 8 }}>科室周报管理</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>各科室周报填报、提交流转、评论协作与知识库</Text>
        </Card>
        <Card hoverable style={cardStyle} onClick={() => choose('/daily')}>
          <div style={{ fontSize: 38, marginBottom: 12 }}><RocketOutlined /></div>
          <Title level={4} style={{ marginBottom: 8 }}>新人日报管理</Title>
          <Text type="secondary" style={{ fontSize: 13 }}>新人培养日报 / 周报 / 月报，带教评估与提交看板</Text>
        </Card>
      </Space>
    </div>
  );
};

export default ChoosePage;
