/**
 * 知识库页面 - 独立页面
 */
import React, { useState, useEffect, useMemo } from 'react';
import { Layout, Tree, Card, Button, Space, Dropdown, message, Input, Empty, Spin, Tag, Statistic, Row, Col } from 'antd';
import {
  DownloadOutlined, SearchOutlined, FileTextOutlined, FolderOutlined,
  CalendarOutlined, TeamOutlined, TagOutlined, CopyOutlined, ReloadOutlined,
  ArrowLeftOutlined, CloseOutlined,
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import type { DataNode } from 'antd/es/tree';
import ReactMarkdown from 'react-markdown';
import { getReports } from '../weekly-report-v2/data';
import { buildKnowledgeBaseTree, generateKnowledgeBaseStats } from './generator';
import { exportAsZip, exportAsMarkdown, exportAsJson } from './exporter';
import { KnowledgeBaseNode, ExportOptions } from './types';
import './styles.css';

const { Sider, Content } = Layout;
const { Search } = Input;

interface KnowledgeBaseProps {
  onClose?: () => void;
}

const KnowledgeBase: React.FC<KnowledgeBaseProps> = ({ onClose }) => {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [treeData, setTreeData] = useState<DataNode[]>([]);
  const [selectedNode, setSelectedNode] = useState<KnowledgeBaseNode | null>(null);
  const [searchText, setSearchText] = useState('');
  const [expandedKeys, setExpandedKeys] = useState<string[]>(['by-week', 'by-dept', 'by-topic']);

  const reports = useMemo(() => getReports(), []);
  const stats = useMemo(() => generateKnowledgeBaseStats(reports), [reports]);

  // 初始化知识库树
  useEffect(() => {
    setLoading(true);
    try {
      const tree = buildKnowledgeBaseTree(reports);
      const antdTree = convertToAntdTree(tree);
      setTreeData(antdTree);

      // 默认选中第一个周报
      if (tree.length > 0 && tree[0].children && tree[0].children.length > 0) {
        const firstWeek = tree[0].children[0];
        if (firstWeek.children && firstWeek.children.length > 1) {
          setSelectedNode(firstWeek.children[1]); // 跳过summary，选第一个周报
        }
      }
    } catch (error) {
      message.error('知识库加载失败');
      console.error(error);
    } finally {
      setLoading(false);
    }
  }, [reports]);

  // 转换为Ant Design Tree数据格式
  const convertToAntdTree = (nodes: KnowledgeBaseNode[]): DataNode[] => {
    return nodes.map(node => ({
      key: node.key,
      title: node.title,
      icon: getNodeIcon(node.type),
      children: node.children ? convertToAntdTree(node.children) : undefined,
      isLeaf: !node.children || node.children.length === 0,
    }));
  };

  const getNodeIcon = (type: string) => {
    switch (type) {
      case 'week': return <CalendarOutlined />;
      case 'dept': return <TeamOutlined />;
      case 'topic': return <TagOutlined />;
      case 'file': return <FileTextOutlined />;
      default: return <FolderOutlined />;
    }
  };

  // 查找节点
  const findNode = (nodes: KnowledgeBaseNode[], key: string): KnowledgeBaseNode | null => {
    for (const node of nodes) {
      if (node.key === key) return node;
      if (node.children) {
        const found = findNode(node.children, key);
        if (found) return found;
      }
    }
    return null;
  };

  // 树节点选择
  const handleSelect = (selectedKeys: React.Key[]) => {
    if (selectedKeys.length === 0) return;

    const key = selectedKeys[0] as string;
    const tree = buildKnowledgeBaseTree(reports);
    const node = findNode(tree, key);

    if (node && node.content) {
      setSelectedNode(node);
    }
  };

  // 搜索过滤
  const filteredTreeData = useMemo(() => {
    if (!searchText.trim()) return treeData;

    const filterTree = (nodes: DataNode[]): DataNode[] => {
      return nodes
        .map(node => {
          const title = typeof node.title === 'string' ? node.title : '';
          const matches = title.toLowerCase().includes(searchText.toLowerCase());
          const filteredChildren = node.children ? filterTree(node.children) : undefined;

          if (matches || (filteredChildren && filteredChildren.length > 0)) {
            return { ...node, children: filteredChildren };
          }
          return null;
        })
        .filter(Boolean) as DataNode[];
    };

    return filterTree(treeData);
  }, [treeData, searchText]);

  // 导出处理
  const handleExport = async (format: 'zip' | 'markdown' | 'json', scope: 'all' | 'current') => {
    setExporting(true);
    try {
      const options: ExportOptions = {
        format,
        scope,
      };

      if (scope === 'current' && selectedNode) {
        // 导出当前查看的文档
        const currentReport = reports.find(r =>
          selectedNode.metadata?.week === r.weekLabel &&
          selectedNode.metadata?.dept === r.dept
        );

        if (currentReport) {
          if (format === 'zip') {
            await exportAsZip([currentReport], options);
          } else if (format === 'markdown') {
            exportAsMarkdown([currentReport], options);
          } else {
            exportAsJson([currentReport], options);
          }
        }
      } else {
        // 导出全部
        if (format === 'zip') {
          await exportAsZip(reports, options);
        } else if (format === 'markdown') {
          exportAsMarkdown(reports, options);
        } else {
          exportAsJson(reports, options);
        }
      }

      message.success('导出成功');
    } catch (error) {
      message.error('导出失败');
      console.error(error);
    } finally {
      setExporting(false);
    }
  };

  // 复制到剪贴板
  const handleCopy = () => {
    if (!selectedNode?.content) return;

    navigator.clipboard.writeText(selectedNode.content).then(() => {
      message.success('已复制到剪贴板');
    }).catch(() => {
      message.error('复制失败');
    });
  };

  // 去除 YAML frontmatter
  const stripFrontmatter = (md: string): string => {
    return md.replace(/^---\s*\n[\s\S]*?\n---\s*\n*/, '');
  };

  // 刷新知识库
  const handleRefresh = () => {
    setLoading(true);
    setTimeout(() => {
      const tree = buildKnowledgeBaseTree(getReports());
      const antdTree = convertToAntdTree(tree);
      setTreeData(antdTree);
      setLoading(false);
      message.success('知识库已刷新');
    }, 500);
  };

  const handleClose = () => {
    if (onClose) {
      onClose();
    } else {
      navigate('/weekly-report-v2');
    }
  };

  return (
    <Layout style={{ height: '100%', background: '#f0f2f5' }}>
      {/* 左侧目录树 */}
      <Sider width={320} style={{ background: '#fff', borderRight: '1px solid #e8e8e8', overflow: 'auto', position: 'relative', height: '100%', left: 'auto', top: 'auto', minWidth: 320 }}>
        {/* 统计概览 */}
        <Card size="small" style={{ margin: '16px 16px 16px', borderRadius: 8 }}>
          <Row gutter={8}>
            <Col span={12}>
              <Statistic title="周报数" value={stats.totalReports} valueStyle={{ fontSize: 20 }} />
            </Col>
            <Col span={12}>
              <Statistic title="团队数" value={stats.totalDepts} valueStyle={{ fontSize: 20 }} />
            </Col>
          </Row>
          <Row gutter={8} style={{ marginTop: 8 }}>
            <Col span={12}>
              <Statistic title="周次数" value={stats.totalWeeks} valueStyle={{ fontSize: 20 }} />
            </Col>
            <Col span={12}>
              <Statistic title="评论数" value={stats.totalComments} valueStyle={{ fontSize: 20 }} />
            </Col>
          </Row>
          <div style={{ marginTop: 12, fontSize: 12, color: '#999' }}>
            最后更新: {new Date(stats.lastUpdated).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}
          </div>
        </Card>

        {/* 搜索框 */}
        <div style={{ padding: '0 16px 16px' }}>
          <Search
            placeholder="搜索周报..."
            value={searchText}
            onChange={e => setSearchText(e.target.value)}
            allowClear
            prefix={<SearchOutlined />}
          />
        </div>

        {/* 目录树 */}
        <div style={{ padding: '0 16px' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <Spin tip="加载中..." />
            </div>
          ) : (
            <Tree
              showIcon
              treeData={filteredTreeData}
              expandedKeys={expandedKeys}
              onExpand={keys => setExpandedKeys(keys as string[])}
              onSelect={handleSelect}
              defaultExpandAll={false}
            />
          )}
        </div>
      </Sider>

      {/* 右侧内容预览 */}
      <Content style={{ display: 'flex', flexDirection: 'column', overflow: 'hidden', marginLeft: 0, padding: 0, minHeight: 'auto' }}>
        {/* 工具栏 */}
        <div style={{ background: '#fff', padding: '12px 24px', borderBottom: '1px solid #e8e8e8', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Space>
            {onClose && (
              <Button icon={<ArrowLeftOutlined />} onClick={onClose}>
                返回
              </Button>
            )}
            <Dropdown
              menu={{
                items: [
                  {
                    key: 'zip-all',
                    label: '导出完整知识库 (ZIP)',
                    icon: <DownloadOutlined />,
                    onClick: () => handleExport('zip', 'all'),
                  },
                  {
                    key: 'md-all',
                    label: '导出全部周报 (Markdown)',
                    icon: <FileTextOutlined />,
                    onClick: () => handleExport('markdown', 'all'),
                  },
                  {
                    key: 'json-all',
                    label: '导出数据 (JSON)',
                    icon: <FileTextOutlined />,
                    onClick: () => handleExport('json', 'all'),
                  },
                  { type: 'divider' },
                  {
                    key: 'md-current',
                    label: '导出当前文档 (Markdown)',
                    icon: <FileTextOutlined />,
                    onClick: () => handleExport('markdown', 'current'),
                    disabled: !selectedNode,
                  },
                ],
              }}
            >
              <Button type="primary" icon={<DownloadOutlined />} loading={exporting}>
                导出知识库
              </Button>
            </Dropdown>

            <Button icon={<CopyOutlined />} onClick={handleCopy} disabled={!selectedNode}>
              复制内容
            </Button>

            <Button icon={<ReloadOutlined />} onClick={handleRefresh}>
              刷新
            </Button>

            {selectedNode?.metadata && (
              <Space style={{ marginLeft: 16 }}>
                {selectedNode.metadata.week && <Tag color="blue">{selectedNode.metadata.week}</Tag>}
                {selectedNode.metadata.dept && <Tag color="green">{selectedNode.metadata.dept}</Tag>}
                {selectedNode.metadata.author && <Tag>{selectedNode.metadata.author}</Tag>}
              </Space>
            )}
          </Space>
          <Button type="text" icon={<CloseOutlined />} onClick={handleClose} style={{ fontSize: 16 }} />
        </div>

        {/* 内容区域 */}
        <div style={{ flex: 1, overflow: 'auto', padding: 24, background: '#f0f2f5' }}>
          {selectedNode?.content ? (
            <Card
              style={{ maxWidth: 1200, margin: '0 auto', minHeight: '100%' }}
              bodyStyle={{ padding: '32px 48px' }}
            >
              <div className="markdown-body">
                <ReactMarkdown>{stripFrontmatter(selectedNode.content)}</ReactMarkdown>
              </div>
            </Card>
          ) : (
            <Empty
              description="请从左侧目录选择要查看的文档"
              style={{ marginTop: 100 }}
            />
          )}
        </div>
      </Content>
    </Layout>
  );
};

export default KnowledgeBase;
