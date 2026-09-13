import React, { useState, useEffect, useCallback } from 'react';
import {
  Modal, Table, Button, Form, Input, Select, message, Popconfirm, Space, Tag,
} from 'antd';
import { PlusOutlined, LockOutlined, DeleteOutlined, EditOutlined, EyeOutlined, EyeInvisibleOutlined, TeamOutlined } from '@ant-design/icons';
import { authApi } from '../../services/api';
import { useDepts, useDeptItems, createDept } from '../../services/deptStore';
import { ROLE_LABELS, UserRole } from '../weekly-report-v2/types';

interface UserMgmtProps {
  open: boolean;
  onClose: () => void;
}

const UserManagement: React.FC<UserMgmtProps> = ({ open, onClose }) => {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetTarget, setResetTarget] = useState('');
  const [editOpen, setEditOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<any>(null);
  const [editField, setEditField] = useState<'username' | 'name'>('name');
  const [roleOpen, setRoleOpen] = useState(false);
  const [roleTarget, setRoleTarget] = useState<any>(null);
  const [deptEditOpen, setDeptEditOpen] = useState(false);
  const [deptEditTarget, setDeptEditTarget] = useState<any>(null);
  const [deptMgmtOpen, setDeptMgmtOpen] = useState(false);
  const [newDeptName, setNewDeptName] = useState('');
  const [deptCreating, setDeptCreating] = useState(false);
  const deptList = useDepts();
  const deptItems = useDeptItems();
  const [hovered, setHovered] = useState<string | null>(null);
  const [visiblePwds, setVisiblePwds] = useState<Set<string>>(new Set());

  const togglePwdVisible = (username: string) => {
    setVisiblePwds(prev => {
      const next = new Set(prev);
      if (next.has(username)) {
        next.delete(username);
      } else {
        next.add(username);
      }
      return next;
    });
  };
  const [form] = Form.useForm();
  const [resetForm] = Form.useForm();
  const [editForm] = Form.useForm();
  const [roleForm] = Form.useForm();
  const [deptForm] = Form.useForm();

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authApi.listUsers();
      if (res.success && res.users) {
        setUsers(res.users);
      } else {
        message.error(res.message || '获取用户列表失败');
      }
    } catch (e: any) {
      message.error(`获取用户列表失败: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      loadUsers();
    }
  }, [open, loadUsers]);

  const handleCreate = async (values: any) => {
    try {
      const res = await authApi.createUser(values);
      if (res.success) {
        message.success('用户创建成功');
        setCreateOpen(false);
        form.resetFields();
        loadUsers();
      } else {
        message.error(res.message || '创建失败');
      }
    } catch (e: any) {
      message.error(`创建失败: ${e.message}`);
    }
  };

  const handleDelete = async (username: string) => {
    try {
      const res = await authApi.deleteUser(username);
      if (res.success) {
        message.success('用户已删除');
        loadUsers();
      } else {
        message.error(res.message || '删除失败');
      }
    } catch (e: any) {
      message.error(`删除失败: ${e.message}`);
    }
  };

  const handleResetPassword = async (values: any) => {
    try {
      const res = await authApi.resetPassword(resetTarget, values.newPassword);
      if (res.success) {
        message.success('密码已重置');
        setResetOpen(false);
        resetForm.resetFields();
      } else {
        message.error(res.message || '重置失败');
      }
    } catch (e: any) {
      message.error(`重置失败: ${e.message}`);
    }
  };

  const handleEdit = (record: any, field: 'username' | 'name') => {
    setEditTarget(record);
    setEditField(field);
    editForm.setFieldsValue({ value: record[field] });
    setEditOpen(true);
  };

  const handleUpdate = async (values: any) => {
    if (!editTarget) return;
    try {
      const data: any = {};
      if (editField === 'username') {
        data.newUsername = values.value;
      } else {
        data.name = values.value;
      }
      const res = await authApi.updateUser(editTarget.username, data);
      if (res.success) {
        message.success('修改成功');
        setEditOpen(false);
        editForm.resetFields();
        loadUsers();
      } else {
        message.error(res.message || '修改失败');
      }
    } catch (e: any) {
      message.error(`修改失败: ${e.message}`);
    }
  };

  const handleEditRole = (record: any) => {
    setRoleTarget(record);
    roleForm.setFieldsValue({ role: record.role });
    setRoleOpen(true);
  };

  const handleUpdateRole = async (values: any) => {
    if (!roleTarget) return;
    try {
      const res = await authApi.updateUser(roleTarget.username, { role: values.role });
      if (res.success) {
        message.success('角色已更新');
        setRoleOpen(false);
        roleForm.resetFields();
        loadUsers();
      } else {
        message.error(res.message || '角色更新失败');
      }
    } catch (e: any) {
      message.error(`角色更新失败: ${e.message}`);
    }
  };

  const handleEditDept = (record: any) => {
    setDeptEditTarget(record);
    deptForm.setFieldsValue({ dept: record.dept });
    setDeptEditOpen(true);
  };

  const handleUpdateDept = async (values: any) => {
    if (!deptEditTarget) return;
    try {
      const res = await authApi.updateUser(deptEditTarget.username, { dept: values.dept });
      if (res.success) {
        message.success('科室已更新');
        setDeptEditOpen(false);
        deptForm.resetFields();
        loadUsers();
      } else {
        message.error(res.message || '科室更新失败');
      }
    } catch (e: any) {
      message.error(`科室更新失败: ${e.message}`);
    }
  };

  const handleCreateDept = async () => {
    const name = newDeptName.trim();
    if (!name) {
      message.warning('请输入科室名称');
      return;
    }
    setDeptCreating(true);
    try {
      const res = await createDept(name);
      if (res.success) {
        message.success(`科室「${name}」创建成功`);
        setNewDeptName('');
      } else {
        message.error(res.message || '创建失败');
      }
    } catch (e: any) {
      message.error(`创建失败: ${e.message}`);
    } finally {
      setDeptCreating(false);
    }
  };

  const EditableCell = ({ text, record, field }: { text: string; record: any; field: 'username' | 'name' }) => {
    const hoverKey = `${record.username}-${field}`;
    return (
      <span
        onMouseEnter={() => setHovered(hoverKey)}
        onMouseLeave={() => setHovered(null)}
        style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}
        onClick={() => handleEdit(record, field)}
      >
        {text}
        {hovered === hoverKey && (
          <EditOutlined style={{ marginLeft: 6, color: '#1890ff', fontSize: 12 }} />
        )}
      </span>
    );
  };

  const columns = [
    {
      title: '用户名',
      dataIndex: 'username',
      key: 'username',
      render: (text: string, record: any) => <EditableCell text={text} record={record} field="username" />,
    },
    {
      title: '姓名',
      dataIndex: 'name',
      key: 'name',
      render: (text: string, record: any) => <EditableCell text={text} record={record} field="name" />,
    },
    {
      title: '角色',
      dataIndex: 'role',
      key: 'role',
      render: (role: string, record: any) => {
        const color = role === 'superadmin' ? 'purple' : role === 'admin' ? 'red' : role === 'leader' ? 'gold' : 'blue';
        return (
          <span
            style={{ cursor: 'pointer' }}
            onClick={() => handleEditRole(record)}
          >
            <Tag color={color}>{ROLE_LABELS[role as UserRole] || role}</Tag>
            <EditOutlined style={{ marginLeft: 6, color: '#1890ff', fontSize: 12 }} />
          </span>
        );
      },
    },
    {
      title: '部门',
      dataIndex: 'dept',
      key: 'dept',
      render: (dept: string, record: any) => (
        <span style={{ cursor: 'pointer' }} onClick={() => handleEditDept(record)}>
          {dept || '-'}
          <EditOutlined style={{ marginLeft: 6, color: '#1890ff', fontSize: 12 }} />
        </span>
      ),
    },
    {
      title: '密码',
      dataIndex: 'passwordPlain',
      key: 'passwordPlain',
      render: (plain: string | null, record: any) => {
        if (!plain) {
          return <span style={{ color: '#999', fontSize: 12 }}>未知</span>;
        }
        const visible = visiblePwds.has(record.username);
        return (
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontFamily: visible ? 'monospace' : 'inherit' }}>
              {visible ? plain : '******'}
            </span>
            <Button
              type="text"
              size="small"
              icon={visible ? <EyeOutlined /> : <EyeInvisibleOutlined />}
              onClick={() => togglePwdVisible(record.username)}
              title={visible ? '隐藏密码' : '显示密码'}
            />
          </span>
        );
      },
    },
    {
      title: '状态',
      dataIndex: 'status',
      key: 'status',
      render: (status: number) => (
        <Tag color={status === 1 ? 'green' : 'default'}>
          {status === 1 ? '正常' : '禁用'}
        </Tag>
      ),
    },
    {
      title: '操作',
      key: 'action',
      render: (_: any, record: any) => (
        <Space>
          <Button
            size="small"
            icon={<LockOutlined />}
            onClick={() => {
              setResetTarget(record.username);
              setResetOpen(true);
            }}
          >
            重置密码
          </Button>
          <Popconfirm
            title="确认删除"
            description={`确定删除用户 "${record.name}" 吗？`}
            onConfirm={() => handleDelete(record.username)}
            okText="删除"
            cancelText="取消"
            okButtonProps={{ danger: true }}
          >
            <Button size="small" danger icon={<DeleteOutlined />}>
              删除
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  return (
    <>
      <Modal
        title="账号管理"
        open={open}
        onCancel={onClose}
        width={960}
        footer={null}
      >
        <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between' }}>
          <Button icon={<TeamOutlined />} onClick={() => setDeptMgmtOpen(true)}>
            科室管理
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
            新增账号
          </Button>
        </div>
        <Table
          columns={columns}
          dataSource={users}
          rowKey="username"
          loading={loading}
          size="small"
          pagination={false}
        />
      </Modal>

      {/* 新增用户 */}
      <Modal
        title="新增账号"
        open={createOpen}
        onCancel={() => { setCreateOpen(false); form.resetFields(); }}
        onOk={() => form.submit()}
        okText="创建"
        cancelText="取消"
      >
        <Form form={form} layout="vertical" onFinish={handleCreate}>
          <Form.Item name="username" label="用户名" rules={[{ required: true, message: '请输入用户名' }]}>
            <Input placeholder="如：306852" />
          </Form.Item>
          <Form.Item name="password" label="初始密码" rules={[{ required: true, message: '请输入初始密码' }]}>
            <Input.Password placeholder="请输入初始密码" />
          </Form.Item>
          <Form.Item name="name" label="姓名" rules={[{ required: true, message: '请输入姓名' }]}>
            <Input placeholder="如：张三" />
          </Form.Item>
          <Form.Item name="role" label="角色" initialValue="user" rules={[{ required: true }]}>
            <Select
              options={[
                { label: '普通用户', value: 'user' },
                { label: '总经理室', value: 'leader' },
                { label: '管理员', value: 'admin' },
              ]}
            />
          </Form.Item>
          <Form.Item name="dept" label="部门" initialValue={deptList[0]}>
            <Select
              showSearch
              optionFilterProp="label"
              options={deptList.map(d => ({ label: d, value: d }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 重置密码 */}
      <Modal
        title={`重置密码 - ${resetTarget}`}
        open={resetOpen}
        onCancel={() => { setResetOpen(false); resetForm.resetFields(); }}
        onOk={() => resetForm.submit()}
        okText="重置"
        cancelText="取消"
      >
        <Form form={resetForm} layout="vertical" onFinish={handleResetPassword}>
          <Form.Item
            name="newPassword"
            label="新密码"
            rules={[{ required: true, min: 4, message: '密码至少4位' }]}
          >
            <Input.Password placeholder="请输入新密码" />
          </Form.Item>
        </Form>
      </Modal>

      {/* 编辑用户名/姓名 */}
      <Modal
        title={editField === 'username' ? `修改用户名 - ${editTarget?.name}` : `修改姓名 - ${editTarget?.name}`}
        open={editOpen}
        onCancel={() => { setEditOpen(false); editForm.resetFields(); }}
        onOk={() => editForm.submit()}
        okText="保存"
        cancelText="取消"
      >
        <Form form={editForm} layout="vertical" onFinish={handleUpdate}>
          <Form.Item
            name="value"
            label={editField === 'username' ? '新用户名' : '新姓名'}
            rules={[{ required: true, message: `请输入${editField === 'username' ? '用户名' : '姓名'}` }]}
          >
            <Input placeholder={`请输入${editField === 'username' ? '新用户名' : '新姓名'}`} />
          </Form.Item>
        </Form>
      </Modal>

      {/* 编辑角色 */}
      <Modal
        title={`修改角色 - ${roleTarget?.name}`}
        open={roleOpen}
        onCancel={() => { setRoleOpen(false); roleForm.resetFields(); }}
        onOk={() => roleForm.submit()}
        okText="保存"
        cancelText="取消"
      >
        <Form form={roleForm} layout="vertical" onFinish={handleUpdateRole}>
          <Form.Item
            name="role"
            label="角色"
            rules={[{ required: true, message: '请选择角色' }]}
          >
            <Select
              options={[
                { label: '普通用户', value: 'user' },
                { label: '总经理室', value: 'leader' },
                { label: '管理员', value: 'admin' },
              ]}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 改派科室 */}
      <Modal
        title={`改派科室 - ${deptEditTarget?.name}`}
        open={deptEditOpen}
        onCancel={() => { setDeptEditOpen(false); deptForm.resetFields(); }}
        onOk={() => deptForm.submit()}
        okText="保存"
        cancelText="取消"
      >
        <Form form={deptForm} layout="vertical" onFinish={handleUpdateDept}>
          <Form.Item
            name="dept"
            label="科室"
            rules={[{ required: true, message: '请选择科室' }]}
          >
            <Select
              showSearch
              optionFilterProp="label"
              options={deptList.map(d => ({ label: d, value: d }))}
            />
          </Form.Item>
        </Form>
      </Modal>

      {/* 科室管理 */}
      <Modal
        title="科室管理"
        open={deptMgmtOpen}
        onCancel={() => setDeptMgmtOpen(false)}
        footer={null}
        width={520}
      >
        <Space.Compact style={{ width: '100%', marginBottom: 16 }}>
          <Input
            placeholder="输入新科室名称，如：运维管理部"
            value={newDeptName}
            onChange={e => setNewDeptName(e.target.value)}
            onPressEnter={handleCreateDept}
            maxLength={30}
          />
          <Button type="primary" icon={<PlusOutlined />} loading={deptCreating} onClick={handleCreateDept}>
            新增科室
          </Button>
        </Space.Compact>
        <Table
          dataSource={deptItems}
          rowKey="name"
          size="small"
          pagination={false}
          columns={[
            { title: '科室名称', dataIndex: 'name', key: 'name' },
            {
              title: '创建时间',
              dataIndex: 'createdAt',
              key: 'createdAt',
              render: (v?: string) => (v ? v.slice(0, 10) : '-'),
            },
          ]}
        />
        <div style={{ marginTop: 8, fontSize: 12, color: '#999' }}>
          新科室会立即出现在周报科室栏与「新增账号」的部门下拉中；暂不支持删除/改名（避免历史周报数据成为孤儿）。
        </div>
      </Modal>
    </>
  );
};

export default UserManagement;
