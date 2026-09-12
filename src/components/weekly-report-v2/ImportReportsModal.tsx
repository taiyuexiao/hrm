import React, { useCallback, useMemo, useState } from 'react';
import {
  Modal, Upload, Button, Checkbox, Alert, Space, Typography, Spin, Progress, message, Table,
} from 'antd';
import { InboxOutlined, DownloadOutlined } from '@ant-design/icons';
import * as XLSX from 'xlsx';
import { DEPTS, TaskItem, WeeklyReport } from './types';
import {
  genId, getCurrentUser, getNextWeekLabel, getReport, isFrozenWeek, saveReport,
  isAdmin, isSuperAdmin,
} from './data';
import { requestParseWeeklyText } from '../../services/ai';
import { getApiBaseUrl } from '../../config/app';
import { parseHierarchicalText } from './task-parser';

const { Dragger } = Upload;
const { Text } = Typography;

interface ParsedRow {
  deptRaw: string;
  dept: string | null;
  thisWeekRoutine: string;
  thisWeekKey: string;
  nextWeekRoutine: string;
  nextWeekKey: string;
  thoughts: string;
  other: string;
  parsed: {
    thisWeekRoutine: string;
    thisWeekKey: string;
    nextWeekRoutine: string;
    nextWeekKey: string;
  } | null;
}

interface ImportReportsModalProps {
  open: boolean;
  weekLabel: string;
  onClose: () => void;
  onImported: () => void;
}

function normalizeDept(raw: string): string | null {
  const s = String(raw || '').trim();
  if (!s) return null;
  const exact = DEPTS.find(d => d === s);
  if (exact) return exact;
  const contained = DEPTS.filter(d => s.includes(d));
  if (contained.length > 0) {
    return contained.sort((a, b) => b.length - a.length)[0];
  }
  const contains = DEPTS.filter(d => d.includes(s));
  if (contains.length === 1) return contains[0];
  return null;
}


function applyHighlight(tasks: TaskItem[], highlighted: boolean): TaskItem[] {
  return tasks.map(t => ({
    ...t,
    highlighted,
    children: t.children ? applyHighlight(t.children, highlighted) : undefined,
  }));
}

function stampTaskAuthor(tasks: TaskItem[], authorId: string, authorName: string): TaskItem[] {
  return tasks.map(t => ({
    ...t,
    authorId: t.authorId || authorId,
    authorName: t.authorName || authorName,
    children: t.children ? stampTaskAuthor(t.children, authorId, authorName) : undefined,
  }));
}

function flattenTaskText(tasks: TaskItem[], depth = 0): string[] {
  const lines: string[] = [];
  for (const t of tasks) {
    lines.push('  '.repeat(depth) + t.text);
    if (t.children && t.children.length > 0) {
      lines.push(...flattenTaskText(t.children, depth + 1));
    }
  }
  return lines;
}

function tasksToText(tasks: TaskItem[]): string {
  return flattenTaskText(tasks).join('\n');
}

export const ImportReportsModal: React.FC<ImportReportsModalProps> = ({
  open,
  weekLabel,
  onClose,
  onImported,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [rows, setRows] = useState<ParsedRow[] | null>(null);
  const [overwriteCurrent, setOverwriteCurrent] = useState(false);
  const [overwriteAll, setOverwriteAll] = useState(false);
  const [fillNextWeek, setFillNextWeek] = useState(false);
  const [exampleOpen, setExampleOpen] = useState(false);

  const handleDownloadTemplate = useCallback(() => {
    const data = exampleData.map(item => ({
      '科室/委员会': item.dept,
      '本周工作内容': item.thisWeekRoutine,
      '重点工作推进情况（本周）': item.thisWeekKey,
      '下周工作计划': item.nextWeekRoutine,
      '重点工作推进情况（下周）': item.nextWeekKey,
      '本周管理心得/AI推广案例/心得': item.thoughts,
      '问题与风险': item.other,
    }));
    const ws = XLSX.utils.json_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, '周报导入模板');
    XLSX.writeFile(wb, `周报导入模板_${weekLabel}.xlsx`);
  }, [weekLabel]);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [parseError, setParseError] = useState<string | null>(null);

  const currentUser = useMemo(() => getCurrentUser(), []);

  const recordActionLog = useCallback((payload: {
    action: string;
    targetType: string;
    targetId: string;
    targetDesc: string;
    details?: Record<string, any>;
  }) => {
    fetch(`${getApiBaseUrl()}/admin/action-logs/record`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, userId: currentUser.id, userName: currentUser.name }),
    }).catch(() => {});
  }, [currentUser.id, currentUser.name]);

  const canImportAll = useMemo(
    () => isAdmin(currentUser) || isSuperAdmin(currentUser),
    [currentUser],
  );

  const matchedRows = useMemo(() => rows?.filter(r => r.dept) ?? [], [rows]);
  const userDept = currentUser?.dept;
  const allowedRows = useMemo(() => {
    if (!rows) return [];
    if (canImportAll) return matchedRows;
    if (!userDept) return [];
    return matchedRows.filter(r => r.dept === userDept);
  }, [rows, matchedRows, canImportAll, userDept]);

  const unmatchedDepts = useMemo(() => {
    const set = new Set<string>();
    rows?.forEach(r => {
      if (!r.dept && r.deptRaw) set.add(r.deptRaw);
    });
    return Array.from(set);
  }, [rows]);

  const reset = useCallback(() => {
    setFile(null);
    setRows(null);
    setOverwriteCurrent(false);
    setOverwriteAll(false);
    setFillNextWeek(false);
    setExampleOpen(false);
    setParsing(false);
    setImporting(false);
    setProgress(0);
    setParseError(null);
  }, []);

  const handleClose = useCallback(() => {
    if (!importing) {
      reset();
      onClose();
    }
  }, [importing, onClose, reset]);

  const readRowsFromFile = useCallback((f: File): Promise<ParsedRow[]> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = e => {
        try {
          const data = new Uint8Array(e.target?.result as ArrayBuffer);
          const workbook = XLSX.read(data, { type: 'array' });
          const ws = workbook.Sheets[workbook.SheetNames[0]];
          const json = XLSX.utils.sheet_to_json(ws, { defval: '' }) as Record<string, any>[];

          const parsedRows: ParsedRow[] = json.map(row => ({
            deptRaw: String(row['科室/委员会'] || '').trim(),
            dept: normalizeDept(String(row['科室/委员会'] || '')),
            thisWeekRoutine: String(row['本周工作内容'] || '').trim(),
            thisWeekKey: String(row['重点工作推进情况（本周）'] || '').trim(),
            nextWeekRoutine: String(row['下周工作计划'] || '').trim(),
            nextWeekKey: String(row['重点工作推进情况（下周）'] || '').trim(),
            thoughts: String(row['本周管理心得/AI推广案例/心得'] || '').trim(),
            other: String(row['问题与风险'] || '').trim(),
            parsed: null,
          }));
          resolve(parsedRows);
        } catch (err) {
          reject(err);
        }
      };
      reader.onerror = reject;
      reader.readAsArrayBuffer(f);
    });
  }, []);

  const parseWithAI = useCallback(async (f: File) => {
    setParsing(true);
    setParseError(null);
    setRows(null);
    try {
      const rawRows = await readRowsFromFile(f);
      const parsedRows: ParsedRow[] = [];
      for (let i = 0; i < rawRows.length; i++) {
        const row = rawRows[i];
        setProgress(Math.round(((i) / rawRows.length) * 50));
        if (!row.dept) {
          parsedRows.push(row);
          continue;
        }
        const result = await requestParseWeeklyText(
          row.thisWeekRoutine,
          row.thisWeekKey,
          row.nextWeekRoutine,
          row.nextWeekKey,
        );
        if (result.success) {
          row.parsed = {
            thisWeekRoutine: result.thisWeekRoutine || '',
            thisWeekKey: result.thisWeekKey || '',
            nextWeekRoutine: result.nextWeekRoutine || '',
            nextWeekKey: result.nextWeekKey || '',
          };
        } else {
          row.parsed = {
            thisWeekRoutine: row.thisWeekRoutine,
            thisWeekKey: row.thisWeekKey,
            nextWeekRoutine: row.nextWeekRoutine,
            nextWeekKey: row.nextWeekKey,
          };
          console.warn(`${row.deptRaw} LLM 解析失败，使用原文本`, result.message);
        }
        parsedRows.push(row);
      }
      setProgress(50);
      setRows(parsedRows);
    } catch (err: any) {
      setParseError(err?.message || '解析 Excel 失败');
    } finally {
      setParsing(false);
    }
  }, [readRowsFromFile]);

  const handleImport = useCallback(async () => {
    if (!rows || allowedRows.length === 0) return;
    if (isFrozenWeek(weekLabel)) {
      message.error(`当前周期 ${weekLabel} 为已固化的历史周报，禁止导入`);
      return;
    }

    setImporting(true);
    setProgress(50);
    let processed = 0;
    const nextWeekLabel = getNextWeekLabel(weekLabel);

    try {
      for (let i = 0; i < allowedRows.length; i++) {
        const row = allowedRows[i];
        if (!row.dept || !row.parsed) continue;

        const parsed = row.parsed;
        const currentReport = getReport(weekLabel, row.dept);

        const shouldOverwriteCurrent = overwriteCurrent || overwriteAll;

        // 本周工作内容
        let content: TaskItem[] = currentReport?.content || [];
        let currentWork = currentReport?.currentWork || '';
        if (shouldOverwriteCurrent || content.length === 0) {
          const routineTasks = applyHighlight(parseHierarchicalText(parsed.thisWeekRoutine), false);
          const keyTasks = applyHighlight(parseHierarchicalText(parsed.thisWeekKey), true);
          content = stampTaskAuthor([...routineTasks, ...keyTasks], currentUser.id, currentUser.name);
          currentWork = [parsed.thisWeekRoutine, parsed.thisWeekKey].filter(Boolean).join('\n');
        }

        // 下周工作计划
        const nextRoutineTasks = applyHighlight(parseHierarchicalText(parsed.nextWeekRoutine), false);
        const nextKeyTasks = applyHighlight(parseHierarchicalText(parsed.nextWeekKey), true);
        const nextPlanTasks = stampTaskAuthor([...nextRoutineTasks, ...nextKeyTasks], currentUser.id, currentUser.name);
        const nextPlan = JSON.stringify(nextPlanTasks);

        const updatedReport: WeeklyReport = {
          ...(currentReport || {
            id: genId(),
            weekLabel,
            dept: row.dept,
            authorId: currentUser.id,
            authorName: currentUser.name,
            createdAt: new Date().toISOString(),
          }),
          content,
          currentWork,
          nextPlan,
          thoughts: overwriteAll ? row.thoughts : (row.thoughts || currentReport?.thoughts || ''),
          other: overwriteAll ? row.other : (row.other || currentReport?.other || ''),
          // 沿用服务端 updatedAt，避免乐观锁冲突；新建科室时才生成新时间
          updatedAt: currentReport?.updatedAt || new Date().toISOString(),
        } as WeeklyReport;

        try {
          await saveReport(updatedReport);
        } catch (e: any) {
          message.error(`${row.dept} 本周导入失败：${e.message}`);
          continue;
        }

        // 填充到下一周
        if (fillNextWeek && !isFrozenWeek(nextWeekLabel)) {
          const nextReport = getReport(nextWeekLabel, row.dept);
          const filledNextReport: WeeklyReport = {
            ...(nextReport || {
              id: genId(),
              weekLabel: nextWeekLabel,
              dept: row.dept,
              authorId: currentUser.id,
              authorName: currentUser.name,
              createdAt: new Date().toISOString(),
            }),
            content: nextPlanTasks,
            currentWork: tasksToText(nextPlanTasks),
            nextPlan: nextReport?.nextPlan || '',
            thoughts: nextReport?.thoughts || '',
            other: nextReport?.other || '',
            // 沿用服务端 updatedAt，避免乐观锁冲突
            updatedAt: nextReport?.updatedAt || new Date().toISOString(),
          } as WeeklyReport;
          try {
            await saveReport(filledNextReport);
          } catch (e: any) {
            message.error(`${row.dept} 下周填充失败：${e.message}`);
          }
        }

        processed++;
        setProgress(50 + Math.round((processed / allowedRows.length) * 50));
      }

      message.success(`成功导入 ${processed} 个科室的周报`);
      recordActionLog({
        action: 'import_excel',
        targetType: 'report',
        targetId: weekLabel,
        targetDesc: `${weekLabel} 导入 Excel`,
        details: {
          processed,
          depts: allowedRows.map(r => r.dept).filter(Boolean),
          fillNextWeek,
          overwriteAll,
          overwriteCurrent,
        },
      });
      reset();
      onImported();
    } catch (e: any) {
      message.error(`导入异常：${e.message}`);
    } finally {
      setImporting(false);
    }
  }, [allowedRows, weekLabel, overwriteCurrent, overwriteAll, fillNextWeek, currentUser, reset, onImported]);

  const uploadProps = {
    accept: '.xlsx,.xls',
    multiple: false,
    showUploadList: false,
    beforeUpload: (f: File) => {
      setFile(f);
      parseWithAI(f);
      return false;
    },
  };

  const exampleColumns = [
    { title: '科室/委员会', dataIndex: 'dept', key: 'dept', width: 140 },
    { title: '本周工作内容', dataIndex: 'thisWeekRoutine', key: 'thisWeekRoutine', width: 160 },
    { title: '重点工作推进情况（本周）', dataIndex: 'thisWeekKey', key: 'thisWeekKey', width: 180 },
    { title: '下周工作计划', dataIndex: 'nextWeekRoutine', key: 'nextWeekRoutine', width: 160 },
    { title: '重点工作推进情况（下周）', dataIndex: 'nextWeekKey', key: 'nextWeekKey', width: 180 },
    { title: '本周管理心得/AI推广案例/心得', dataIndex: 'thoughts', key: 'thoughts', width: 180 },
    { title: '问题与风险', dataIndex: 'other', key: 'other', width: 120 },
  ];

  const exampleData = [
    {
      key: '1',
      dept: '数据管理与应用部',
      thisWeekRoutine: '1. 完成周报系统开发\n（1）前端页面开发\n（2）接口联调\n2. 修复导入功能',
      thisWeekKey: '1. 权限体系重构\n（1）角色梳理\n（2）权限模型设计\n2. 安全审计完成',
      nextWeekRoutine: '1. 部署上线\n（1）环境检查\n（2）发布验证\n2. 用户培训',
      nextWeekKey: '1. 生产环境验证\n（1）核心流程验证\n（2）监控检查\n2. 操作手册编写',
      thoughts: '本周推进了AI解析接入，效果明显',
      other: '暂无',
    },
  ];

  return (
    <>
    <Modal
      title={`导入周报：${weekLabel}`}
      open={open}
      onCancel={handleClose}
      width={640}
      footer={(
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Button onClick={() => setExampleOpen(true)}>格式示例</Button>
          <Space>
            <Button onClick={handleClose} disabled={importing}>取消</Button>
            <Button
              type="primary"
              onClick={handleImport}
              loading={importing}
              disabled={!rows || allowedRows.length === 0 || parsing || isFrozenWeek(weekLabel)}
            >
              开始导入
            </Button>
          </Space>
        </div>
      )}
    >
      {isFrozenWeek(weekLabel) && (
        <Alert
          type="error"
          showIcon
          message="当前周期为已固化的历史周报，禁止导入"
          style={{ marginBottom: 16 }}
        />
      )}

      <Dragger {...uploadProps} disabled={parsing || importing}>
        <p className="ant-upload-drag-icon">
          <InboxOutlined />
        </p>
        <p className="ant-upload-text">点击或拖拽 .xlsx / .xls 文件到此处</p>
        <p className="ant-upload-hint">
          将读取“科室/委员会、本周工作内容、重点工作推进情况（本周/下周）、下周工作计划、本周管理心得/AI推广案例/心得、问题与风险”列
        </p>
      </Dragger>

      {file && (
        <div style={{ marginTop: 12 }}>
          <Text type="secondary">已选择：{file.name}</Text>
        </div>
      )}

      {(parsing || importing) && (
        <div style={{ marginTop: 16 }}>
          <Spin spinning={parsing} tip={parsing ? '正在用 DeepSeek 解析文本...' : '正在保存...'}>
            <Progress percent={progress} status="active" />
          </Spin>
        </div>
      )}

      {parseError && (
        <Alert type="error" message={parseError} style={{ marginTop: 16 }} />
      )}

      {unmatchedDepts.length > 0 && (
        <Alert
          type="warning"
          showIcon
          message="以下科室名称无法匹配到系统科室，已跳过"
          description={unmatchedDepts.join('、')}
          style={{ marginTop: 16 }}
        />
      )}

      {rows && !parsing && (
        <div style={{ marginTop: 16 }}>
          <Space direction="vertical" style={{ width: '100%' }}>
            <Checkbox
              checked={overwriteAll}
              onChange={e => {
                const checked = e.target.checked;
                setOverwriteAll(checked);
                if (checked) setOverwriteCurrent(true);
              }}
              disabled={importing}
            >
              覆盖当前周全部内容（含本周工作内容、下周计划、心得、问题与风险）
            </Checkbox>
            <Checkbox
              checked={overwriteCurrent}
              onChange={e => setOverwriteCurrent(e.target.checked)}
              disabled={importing || overwriteAll}
            >
              覆盖当前周已存在的本周工作内容
            </Checkbox>
            <Checkbox
              checked={fillNextWeek}
              onChange={e => setFillNextWeek(e.target.checked)}
              disabled={importing}
            >
              将下周工作计划填充到下一周（{getNextWeekLabel(weekLabel)}）的本周工作内容
            </Checkbox>
          </Space>
          <Alert
            type="info"
            showIcon
            message={`共识别 ${rows.length} 行，匹配到 ${matchedRows.length} 个科室，您可导入 ${allowedRows.length} 个科室`}
            style={{ marginTop: 12 }}
          />
          {!canImportAll && userDept && (
            <Alert
              type="warning"
              showIcon
              message={`您仅拥有【${userDept}】的导入权限，其他科室数据已自动过滤`}
              style={{ marginTop: 12 }}
            />
          )}
        </div>
      )}
    </Modal>

    <Modal
      title="导入模板字段示例"
      open={exampleOpen}
      onCancel={() => setExampleOpen(false)}
      footer={(
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Button type="primary" icon={<DownloadOutlined />} onClick={handleDownloadTemplate}>
            下载模板示例
          </Button>
          <Button onClick={() => setExampleOpen(false)}>关闭</Button>
        </div>
      )}
      width={960}
    >
      <p>上传的 Excel 需要包含以下列名。任务层级建议：一级任务用“1.”，二级子任务用“（1）”，三级子任务用“①”，换行分隔。</p>
      <Table
        columns={exampleColumns}
        dataSource={exampleData}
        pagination={false}
        bordered
        size="small"
        scroll={{ x: 'max-content' }}
      />
    </Modal>
  </>
  );
};

export default ImportReportsModal;
