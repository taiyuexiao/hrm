import React, { useState, useEffect, useCallback } from 'react';
import { Table, Tag, Select, DatePicker, Button, Space, message, Card, Popconfirm } from 'antd';
import { ReloadOutlined, RollbackOutlined } from '@ant-design/icons';
import { getApiBaseUrl } from '../../config/app';

const { RangePicker } = DatePicker;

const ACTION_COLORS: Record<string, string> = {
  edit: 'blue',
  submit: 'green',
  view: 'default',
  login: 'cyan',
  logout: 'default',
  export: 'purple',
  admin_unlock: 'orange',
  admin_lock: 'red',
  comment_add: 'geekblue',
  delete_task: 'magenta',
  create_week: 'blue',
  delete_week: 'red',
  import_excel: 'purple',
  restore: 'cyan',
  permission_deny: 'orange',
  change_password: 'purple',
  reset_password: 'volcano',
};

const ACTION_LABELS: Record<string, string> = {
  edit: '编辑',
  submit: '提交',
  view: '查看',
  login: '登录',
  logout: '登出',
  export: '导出',
  admin_unlock: '解锁',
  admin_lock: '锁定',
  comment_add: '评论',
  delete_task: '删除任务',
  create_week: '新建周期',
  delete_week: '删除周期',
  import_excel: '导入 Excel',
  restore: '恢复内容',
  permission_deny: '权限拒绝',
  change_password: '修改密码',
  reset_password: '重置密码',
};

const ActionLogPage: React.FC = () => {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);
  const [filters, setFilters] = useState<{
    userId?: string;
    action?: string;
    startTime?: string;
    endTime?: string;
  }>({});

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('page', String(page));
      params.set('pageSize', String(pageSize));
      if (filters.userId) params.set('userId', filters.userId);
      if (filters.action) params.set('action', filters.action);
      if (filters.startTime) params.set('startTime', filters.startTime);
      if (filters.endTime) params.set('endTime', filters.endTime);

      const res = await fetch(`${getApiBaseUrl()}/admin/action-logs?${params.toString()}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('auth-token') || ''}` },
      });
      const data = await res.json();
      if (data.success) {
        setLogs(data.data || []);
        setTotal(data.total || 0);
      } else {
        message.error(data.message || '查询失败');
      }
    } catch (e) {
      message.error('网络错误');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, filters]);

  const canRestore = (log: any): boolean => {
    if (log.action !== 'edit' || !log.details) return false;
    try {
      const obj = typeof log.details === 'string' ? JSON.parse(log.details) : log.details;
      return (
        obj &&
        typeof obj.taskCountBefore === 'number' &&
        typeof obj.taskCountAfter === 'number' &&
        obj.taskCountBefore > 0 &&
        obj.taskCountAfter === 0 &&
        Array.isArray(obj.removedTasks) &&
        obj.removedTasks.length > 0
      );
    } catch {
      return false;
    }
  };

  const handleRestore = async (log: any) => {
    const targetId = log.targetId;
    if (!targetId || !targetId.includes('-')) {
      message.error('日志对象标识异常');
      return;
    }
    const lastDash = targetId.lastIndexOf('-');
    const weekLabel = targetId.substring(0, lastDash);
    const dept = targetId.substring(lastDash + 1);

    try {
      const res = await fetch(
        `${getApiBaseUrl()}/reports/${encodeURIComponent(weekLabel)}/${encodeURIComponent(dept)}/restore-from-log/${log.id}`,
        {
          method: 'POST',
          headers: { Authorization: `Bearer ${localStorage.getItem('auth-token') || ''}` },
        }
      );
      const data = await res.json();
      if (data.success) {
        message.success(data.message || '恢复成功');
        fetchLogs();
      } else {
        message.error(data.message || '恢复失败');
      }
    } catch (e) {
      message.error('网络错误');
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const columns = [
    {
      title: '时间',
      dataIndex: 'createdAt',
      width: 180,
      render: (v: string) => new Date(v).toLocaleString('zh-CN'),
    },
    {
      title: '用户',
      dataIndex: 'userName',
      width: 120,
    },
    {
      title: '行为',
      dataIndex: 'action',
      width: 100,
      render: (v: string) => (
        <Tag color={ACTION_COLORS[v] || 'default'}>{ACTION_LABELS[v] || v}</Tag>
      ),
    },
    {
      title: '对象类型',
      dataIndex: 'targetType',
      width: 100,
      render: (v: string) => {
        const labels: Record<string, string> = { report: '周报', knowledge_base: '知识库', user: '用户', system: '系统' };
        return labels[v] || v;
      },
    },
    {
      title: '对象',
      dataIndex: 'targetDesc',
      width: 200,
    },
    {
      title: '详情',
      dataIndex: 'details',
      render: (v: string) => {
        if (!v) return '-';
        try {
          const obj = JSON.parse(v);
          const parts: React.ReactNode[] = [];

          // 新增任务
          if (obj.addedTasks && Array.isArray(obj.addedTasks) && obj.addedTasks.length > 0) {
            parts.push(
              <div key="added" style={{ marginBottom: 4 }}>
                <Tag color="green">新增</Tag>
                {obj.addedTasks.map((t: string, i: number) => (
                  <span key={i} style={{ color: '#52c41a', marginRight: 8 }}>{t || '(空)'}</span>
                ))}
              </div>
            );
          }

          // 删除任务
          if (obj.removedTasks && Array.isArray(obj.removedTasks) && obj.removedTasks.length > 0) {
            parts.push(
              <div key="removed" style={{ marginBottom: 4 }}>
                <Tag color="red">删除</Tag>
                {obj.removedTasks.map((t: any, i: number) => {
                  const text = typeof t === 'string' ? t : t?.text;
                  return (
                    <span key={i} style={{ color: '#ff4d4f', textDecoration: 'line-through', marginRight: 8 }}>{text || '(空)'}</span>
                  );
                })}
              </div>
            );
          }

          // 修改任务
          if (obj.modifiedTasks && Array.isArray(obj.modifiedTasks) && obj.modifiedTasks.length > 0) {
            parts.push(
              <div key="modified" style={{ marginBottom: 4 }}>
                <Tag color="blue">修改</Tag>
                {obj.modifiedTasks.map((t: string, i: number) => (
                  <span key={i} style={{ color: '#1890ff', marginRight: 8 }}>{t || '(空)'}</span>
                ))}
              </div>
            );
          }

          // 提交内容快照
          if (obj.currentWork !== undefined) {
            parts.push(<div key="cw" style={{ marginBottom: 2 }}><b>本周工作:</b> {obj.currentWork}</div>);
          }
          if (obj.nextPlan !== undefined) {
            parts.push(<div key="np" style={{ marginBottom: 2 }}><b>下周计划:</b> {obj.nextPlan}</div>);
          }
          if (obj.thoughts !== undefined) {
            parts.push(<div key="th" style={{ marginBottom: 2 }}><b>其他:</b> {obj.thoughts}</div>);
          }
          if (obj.other !== undefined) {
            parts.push(<div key="ot" style={{ marginBottom: 2 }}><b>问题风险:</b> {obj.other}</div>);
          }
          if (obj.taskSummary && Array.isArray(obj.taskSummary) && obj.taskSummary.length > 0) {
            parts.push(
              <div key="ts" style={{ marginBottom: 2 }}>
                <b>任务({obj.taskCount}条):</b> {obj.taskSummary.slice(0, 5).join(' · ')}{obj.taskSummary.length > 5 ? '...' : ''}
              </div>
            );
          }

          // 其他通用字段
          const skipKeys = ['addedTasks', 'removedTasks', 'modifiedTasks', 'currentWork', 'nextPlan', 'thoughts', 'other', 'taskSummary', 'taskCount'];
          Object.entries(obj).forEach(([k, val]) => {
            if (skipKeys.includes(k)) return;
            if (Array.isArray(val)) {
              parts.push(<div key={k} style={{ marginBottom: 2 }}><b>{k}:</b> {val.join(' · ')}</div>);
            } else {
              parts.push(<div key={k} style={{ marginBottom: 2 }}><b>{k}:</b> {String(val)}</div>);
            }
          });

          return parts.length > 0 ? <div>{parts}</div> : '-';
        } catch {
          return v;
        }
      },
    },
    {
      title: 'IP',
      dataIndex: 'ip',
      width: 120,
    },
    {
      title: '操作',
      key: 'action',
      width: 120,
      fixed: 'right' as const,
      render: (_: any, log: any) => {
        if (!canRestore(log)) return null;
        return (
          <Popconfirm
            title="恢复被删除的周报内容"
            description="仅当当前周报内容为空时才会执行恢复，是否继续？"
            onConfirm={() => handleRestore(log)}
            okText="恢复"
            cancelText="取消"
          >
            <Button type="primary" size="small" icon={<RollbackOutlined />}>恢复</Button>
          </Popconfirm>
        );
      },
    },
  ];

  return (
    <Card title="📋 用户行为日志" style={{ margin: 24 }}>
      <Space style={{ marginBottom: 16 }} wrap>
        <Select
          placeholder="行为类型"
          allowClear
          style={{ width: 140 }}
          value={filters.action}
          onChange={(v) => setFilters(prev => ({ ...prev, action: v }))}
          options={Object.entries(ACTION_LABELS).map(([k, l]) => ({ label: l, value: k }))}
        />
        <RangePicker
          showTime
          onChange={(dates) => {
            if (dates) {
              const [s, e] = dates;
              if (s && e) {
                setFilters(prev => ({
                  ...prev,
                  startTime: s.toISOString(),
                  endTime: e.toISOString(),
                }));
              } else {
                setFilters(prev => ({ ...prev, startTime: undefined, endTime: undefined }));
              }
            } else {
              setFilters(prev => ({ ...prev, startTime: undefined, endTime: undefined }));
            }
          }}
        />
        <Button icon={<ReloadOutlined />} onClick={fetchLogs}>刷新</Button>
      </Space>
      <Table
        dataSource={logs}
        columns={columns}
        rowKey="id"
        loading={loading}
        pagination={{
          current: page,
          pageSize,
          total,
          showSizeChanger: true,
          showTotal: (t) => `共 ${t} 条`,
          onChange: (p, ps) => { setPage(p); setPageSize(ps); },
        }}
        scroll={{ x: 1200 }}
        size="small"
      />
    </Card>
  );
};

export default ActionLogPage;
