import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { Table, Button, Tag, Space, message, Card, Select, Typography } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { useDepts } from '../../services/deptStore';
import { initDemoData, getReports } from '../weekly-report-v2/data';

const { Text } = Typography;

function parseDateLabel(label: string): Date {
  const y = parseInt(label.slice(0, 4));
  const m = parseInt(label.slice(4, 6)) - 1;
  const d = parseInt(label.slice(6, 8));
  return new Date(y, m, d);
}

function formatDeadline(weekLabel: string): string {
  try {
    const date = parseDateLabel(weekLabel);
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd} 20:00`;
  } catch {
    return '-';
  }
}

function getCurrentFridayWeekLabel(): string {
  const now = new Date();
  const day = now.getDay() || 7; // Mon=1 ... Sun=7
  const offset = (5 - day + 7) % 7; // 距离本周五还有几天
  const friday = new Date(now);
  friday.setDate(now.getDate() + offset);
  const yyyy = String(friday.getFullYear());
  const mm = String(friday.getMonth() + 1).padStart(2, '0');
  const dd = String(friday.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

interface ReportRow {
  key: string;
  weekLabel: string;
  dept: string;
  authorName: string;
  submitted: boolean;
  submitCount: number;
  deadline: string;
  hasData: boolean;
}

const ReportManagement: React.FC = () => {
  const deptList = useDepts();
  const [reports, setReports] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedWeek, setSelectedWeek] = useState<string>(getCurrentFridayWeekLabel());

  const fetchReports = useCallback(async () => {
    setLoading(true);
    try {
      await initDemoData();
      setReports(getReports());
    } catch (e) {
      message.error('获取周报列表失败');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchReports();
  }, [fetchReports]);

  // 从已有数据中抽取所有周次选项
  const weekOptions = useMemo(() => {
    const existing = new Set(reports.map(r => r.weekLabel));
    const current = getCurrentFridayWeekLabel();
    if (!existing.has(current)) existing.add(current);
    return Array.from(existing).sort((a, b) => b.localeCompare(a)); // 降序，最新的在前
  }, [reports]);

  // 判断是否为真正的用户提交（排除后端自动初始化的空 v1）
  const isActuallySubmitted = (report: any): boolean => {
    const submissions = report?.submissions || [];
    if (submissions.length === 0) return false;
    if (submissions.length >= 2) return true;
    // length === 1，检查内容是否为空（后端 migrateSubmissionsIfNeeded 会创建空 v1）
    const content = submissions[0]?.content;
    if (!content) return false;
    const hasContent = !!content.plan ||
      (Array.isArray(content.content) && content.content.length > 0) ||
      !!content.currentWork ||
      !!content.nextPlan ||
      !!content.thoughts ||
      !!content.other;
    return hasContent;
  };

  // 构建当前选中周期的部门提交状态表
  const dataSource: ReportRow[] = useMemo(() => {
    const weekReports = reports.filter(r => r.weekLabel === selectedWeek);
    const reportMap = new Map(weekReports.map((r: any) => [r.dept, r]));

    return deptList.map(dept => {
      const report = reportMap.get(dept);
      const submitted = isActuallySubmitted(report);
      const count = report?.submissions?.length || 0;
      return {
        key: `${selectedWeek}-${dept}`,
        weekLabel: selectedWeek,
        dept,
        authorName: report?.authorName || '-',
        submitted,
        submitCount: submitted ? count : 0,
        deadline: formatDeadline(selectedWeek),
        hasData: !!report,
      };
    });
  }, [reports, selectedWeek, deptList]);

  const submittedCount = dataSource.filter(d => d.submitted).length;
  const unsubmittedDepts = dataSource.filter(d => !d.submitted).map(d => d.dept);

  const columns = [
    {
      title: '周次',
      dataIndex: 'weekLabel',
      width: 120,
      align: 'center' as const,
    },
    {
      title: '科室',
      dataIndex: 'dept',
      width: 160,
    },
    {
      title: '作者',
      dataIndex: 'authorName',
      width: 120,
      render: (v: string) => v || '-',
    },
    {
      title: '提交状态',
      width: 140,
      align: 'center' as const,
      render: (_: any, record: ReportRow) => {
        if (record.submitted) {
          return <Tag color="success" style={{ fontSize: 13, padding: '2px 10px' }}>已提交</Tag>;
        }
        return <Tag color="error" style={{ fontSize: 13, padding: '2px 10px' }}>未提交</Tag>;
      },
    },
    {
      title: '截止状态',
      width: 180,
      align: 'center' as const,
      render: (_: any, record: ReportRow) => (
        <Text type="secondary">{record.deadline}</Text>
      ),
    },
    {
      title: '操作',
      width: 120,
      align: 'center' as const,
      render: (_: any, record: ReportRow) => {
        if (record.submitCount > 0) {
          return <Tag color="processing">v{record.submitCount}</Tag>;
        }
        return '-';
      },
    },
  ];

  return (
    <Card style={{ margin: 24 }} bodyStyle={{ padding: '20px 24px' }}>
      {/* 头部：标题 + 统计 + 周次选择 */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <span style={{ fontSize: 18, fontWeight: 700 }}>📊 周报提交管理</span>
          <Space size={12}>
            <Tag color="success">已提交 {submittedCount}/{deptList.length}</Tag>
            {unsubmittedDepts.length > 0 && (
              <Tag color="error">未提交 {unsubmittedDepts.length} 个部门</Tag>
            )}
          </Space>
        </div>
        <Space>
          <Select
            style={{ width: 160 }}
            value={selectedWeek}
            onChange={setSelectedWeek}
            options={weekOptions.map(w => ({ label: w, value: w }))}
          />
          <Button icon={<ReloadOutlined />} onClick={fetchReports}>刷新</Button>
        </Space>
      </div>

      {/* 未提交部门快捷提示 */}
      {unsubmittedDepts.length > 0 && (
        <div style={{
          marginBottom: 16,
          padding: '10px 16px',
          background: '#fff2f0',
          border: '1px solid #ffccc7',
          borderRadius: 8,
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          flexWrap: 'wrap',
        }}>
          <span style={{ color: '#cf1322', fontWeight: 600 }}>⚠️ 未提交部门：</span>
          {unsubmittedDepts.map(dept => (
            <Tag color="error" key={dept} style={{ margin: 0 }}>{dept}</Tag>
          ))}
        </div>
      )}

      <Table
        dataSource={dataSource}
        columns={columns}
        rowKey="key"
        loading={loading}
        pagination={false}
        size="middle"
        bordered
        rowClassName={(record: ReportRow) => (record.submitted ? '' : 'unsubmitted-row')}
      />

      <style>{`
        .unsubmitted-row {
          background-color: #fff2f0 !important;
        }
        .unsubmitted-row:hover > td {
          background-color: #ffe6e6 !important;
        }
      `}</style>
    </Card>
  );
};

export default ReportManagement;
