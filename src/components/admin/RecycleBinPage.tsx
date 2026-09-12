import React, { useEffect, useState, useCallback } from 'react';
import { Card, List, Button, Tag, message, Space, Typography, Empty, Popconfirm } from 'antd';
import { DeleteOutlined, ReloadOutlined, UndoOutlined } from '@ant-design/icons';
import { fetchRecycleBin, restoreWeekReports, formatWeekLabel, RecycleBinItem } from '../weekly-report-v2/data';

const { Text } = Typography;

/**
 * 回收站（仅超级管理员可见）
 * 被删除的周报周期在这里保留，数据未丢失；一键恢复后原封不动回到周报周期下拉框。
 */
const RecycleBinPage: React.FC = () => {
  const [data, setData] = useState<RecycleBinItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [restoring, setRestoring] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const items = await fetchRecycleBin();
      setData(items);
    } catch (e: any) {
      message.error(e.message || '加载回收站失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const handleRestore = async (weekLabel: string) => {
    setRestoring(weekLabel);
    try {
      const result = await restoreWeekReports(weekLabel);
      if (result.success) {
        message.success(`周报周期 ${formatWeekLabel(weekLabel)} 已恢复到周期下拉框`);
        load();
      } else {
        message.error(result.message || '恢复失败');
      }
    } catch (e: any) {
      message.error(`恢复失败: ${e.message}`);
    } finally {
      setRestoring(null);
    }
  };

  return (
    <Card
      title={
        <Space>
          <DeleteOutlined />
          <span>回收站</span>
          <Text type="secondary" style={{ fontSize: 12, fontWeight: 'normal' }}>
            删除的周报周期仅从下拉框隐藏，数据完整保留
          </Text>
        </Space>
      }
      extra={
        <Button icon={<ReloadOutlined />} onClick={load} loading={loading}>
          刷新
        </Button>
      }
      style={{ margin: 24 }}
    >
      <List
        loading={loading}
        dataSource={data}
        locale={{ emptyText: <Empty description="回收站为空" /> }}
        renderItem={(item) => (
          <List.Item
            actions={[
              <Popconfirm
                key="restore"
                title="一键恢复"
                description={`恢复后 ${formatWeekLabel(item.weekLabel)} 周期的周报将原封不动回到周期下拉框`}
                okText="恢复"
                cancelText="取消"
                onConfirm={() => handleRestore(item.weekLabel)}
              >
                <Button type="primary" icon={<UndoOutlined />} loading={restoring === item.weekLabel}>
                  一键恢复
                </Button>
              </Popconfirm>,
            ]}
          >
            <List.Item.Meta
              title={
                <Space>
                  <span style={{ fontWeight: 600 }}>{formatWeekLabel(item.weekLabel)}</span>
                  <Tag color="orange">{item.reportCount} 条周报</Tag>
                </Space>
              }
              description={
                <Text type="secondary" style={{ fontSize: 12 }}>
                  由 {item.deletedBy || '未知'} 删除于 {item.deletedAt ? new Date(item.deletedAt).toLocaleString('zh-CN') : '未知时间'}
                </Text>
              }
            />
          </List.Item>
        )}
      />
    </Card>
  );
};

export default RecycleBinPage;
