import React, { useEffect, useState, useCallback } from 'react';
import { Card, List, Button, Tag, message, Space, Select, Input, Popconfirm, Typography, Badge } from 'antd';
import { ReloadOutlined, CheckOutlined, MessageOutlined } from '@ant-design/icons';
import { suggestionApi, Suggestion } from '../../services/api';

const { Text, Paragraph } = Typography;
const { Option } = Select;

const STATUS_LABELS: Record<string, string> = {
  pending: '待处理',
  resolved: '已解决',
  ignored: '已忽略',
};

const STATUS_COLORS: Record<string, string> = {
  pending: 'orange',
  resolved: 'green',
  ignored: 'default',
};

const SuggestionBoxPage: React.FC = () => {
  const [data, setData] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<string>('');
  const [keyword, setKeyword] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await suggestionApi.list({ status, keyword });
      if (res.success) {
        setData(res.data || []);
      } else {
        message.error(res.message || '加载失败');
      }
    } catch {
      message.error('网络错误');
    } finally {
      setLoading(false);
    }
  }, [status, keyword]);

  useEffect(() => {
    load();
  }, [load]);

  const handleResolve = async (id: number, newStatus: string) => {
    try {
      const res = await suggestionApi.update(id, { status: newStatus });
      if (res.success) {
        message.success('状态已更新');
        load();
      } else {
        message.error(res.message || '更新失败');
      }
    } catch {
      message.error('网络错误');
    }
  };

  const pendingCount = data.filter(d => d.status === 'pending').length;

  return (
    <Card
      title={
        <Space>
          <MessageOutlined />
          <span>用户建议箱</span>
          {pendingCount > 0 && <Badge count={pendingCount} style={{ backgroundColor: '#ff4d4f' }} />}
        </Space>
      }
      style={{ margin: 24 }}
    >
      <Space style={{ marginBottom: 16 }} wrap>
        <Select
          placeholder="状态筛选"
          allowClear
          style={{ width: 140 }}
          value={status || undefined}
          onChange={(v) => setStatus(v || '')}
        >
          <Option value="pending">待处理</Option>
          <Option value="resolved">已解决</Option>
          <Option value="ignored">已忽略</Option>
        </Select>
        <Input.Search
          placeholder="搜索内容 / 姓名 / 科室"
          allowClear
          onSearch={(v) => setKeyword(v)}
          style={{ width: 260 }}
        />
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>刷新</Button>
      </Space>

      <List
        loading={loading}
        dataSource={data}
        renderItem={(item) => (
          <List.Item
            actions={[
              item.status === 'pending' && (
                <Popconfirm
                  key="resolve"
                  title="标记为已解决？"
                  onConfirm={() => handleResolve(item.id, 'resolved')}
                >
                  <Button type="primary" size="small" icon={<CheckOutlined />}>已解决</Button>
                </Popconfirm>
              ),
              item.status === 'pending' && (
                <Popconfirm
                  key="ignore"
                  title="标记为已忽略？"
                  onConfirm={() => handleResolve(item.id, 'ignored')}
                >
                  <Button size="small">忽略</Button>
                </Popconfirm>
              ),
              item.status !== 'pending' && (
                <Popconfirm
                  key="reopen"
                  title="重新打开？"
                  onConfirm={() => handleResolve(item.id, 'pending')}
                >
                  <Button size="small">重新打开</Button>
                </Popconfirm>
              ),
            ].filter(Boolean)}
          >
            <List.Item.Meta
              title={
                <Space>
                  <Text strong>#{item.id}</Text>
                  <Tag color={STATUS_COLORS[item.status] || 'default'}>{STATUS_LABELS[item.status] || item.status}</Tag>
                  <Text type="secondary">{item.name}（{item.username}）</Text>
                  {item.dept && <Tag>{item.dept}</Tag>}
                </Space>
              }
              description={
                <div>
                  <Paragraph style={{ marginBottom: 8, marginTop: 8, maxWidth: 800 }}>{item.content}</Paragraph>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    提交时间：{new Date(item.createdAt).toLocaleString('zh-CN')}
                  </Text>
                  {item.adminReply && (
                    <div style={{ marginTop: 8, padding: 8, background: '#f6ffed', borderRadius: 4 }}>
                      <Text type="secondary" style={{ fontSize: 12 }}>管理员回复：</Text>
                      <div>{item.adminReply}</div>
                    </div>
                  )}
                </div>
              }
            />
          </List.Item>
        )}
      />
    </Card>
  );
};

export default SuggestionBoxPage;
