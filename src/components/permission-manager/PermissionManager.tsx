import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Table, Switch, Button, message, Tag, Space, Tooltip, Select } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';
import { getApiBaseUrl } from '../../config/app';
import { PERMISSIONS, PermissionCode, ROLE_LABELS, ROLE_DEFAULT_PERMISSIONS, UserRole } from '../weekly-report-v2/types';

interface UserPerm {
  id: number;
  username: string;
  name: string;
  dept: string;
  role: UserRole;
  permissions: string[];
}

const ROLE_OPTIONS: { label: string; value: UserRole }[] = [
  { label: '普通用户', value: 'user' },
  { label: '总经理室', value: 'leader' },
  { label: '管理员', value: 'admin' },
];

const PermissionManager: React.FC = () => {
  const [users, setUsers] = useState<UserPerm[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingUser, setSavingUser] = useState<string | null>(null);

  const token = localStorage.getItem('auth-token');
  const currentUsername = useMemo(() => {
    try {
      const raw = localStorage.getItem('auth-user');
      return raw ? JSON.parse(raw).username : '';
    } catch { return ''; }
  }, []);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${getApiBaseUrl()}/auth/users`, {
        headers: { Authorization: `Bearer ${token || ''}` },
      });
      const data = await res.json();
      if (data.success) {
        setUsers(data.users.map((u: any) => ({
          id: u.id,
          username: u.username,
          name: u.name,
          dept: u.dept,
          role: u.role as UserRole,
          permissions: u.permissions || [],
        })));
      } else {
        message.error(data.message || '加载失败');
      }
    } catch (e) {
      message.error('网络错误');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const updateUserState = (username: string, updater: (u: UserPerm) => UserPerm) => {
    setUsers(prev => prev.map(u => u.username === username ? updater(u) : u));
  };

  const savePermissions = async (username: string, newPerms: string[]) => {
    setSavingUser(username);
    try {
      const res = await fetch(`${getApiBaseUrl()}/auth/users/${username}/permissions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token || ''}`,
        },
        body: JSON.stringify({ permissions: newPerms }),
      });
      const data = await res.json();
      if (data.success) {
        updateUserState(username, u => ({ ...u, permissions: newPerms }));
      } else {
        message.error(data.message || '更新失败');
      }
    } catch (e) {
      message.error('网络错误');
    } finally {
      setSavingUser(null);
    }
  };

  const saveRole = async (username: string, newRole: UserRole) => {
    setSavingUser(username);
    try {
      const res = await fetch(`${getApiBaseUrl()}/auth/users/${username}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token || ''}`,
        },
        body: JSON.stringify({ role: newRole }),
      });
      const data = await res.json();
      if (data.success) {
        updateUserState(username, u => ({ ...u, role: newRole, permissions: data.permissions || u.permissions }));
        message.success('角色已更新');
      } else {
        message.error(data.message || '角色更新失败');
      }
    } catch (e) {
      message.error('网络错误');
    } finally {
      setSavingUser(null);
    }
  };

  const togglePermission = async (user: UserPerm, perm: PermissionCode, checked: boolean) => {
    const newPerms = checked
      ? Array.from(new Set([...user.permissions, perm]))
      : user.permissions.filter(p => p !== perm);
    await savePermissions(user.username, newPerms);
  };

  const isPermGrantedByRole = (role: UserRole, perm: PermissionCode): boolean => {
    return ROLE_DEFAULT_PERMISSIONS[role]?.includes(perm) ?? false;
  };

  const columns = [
    {
      title: '用户',
      key: 'user',
      fixed: 'left' as const,
      width: 200,
      render: (_: any, record: UserPerm) => (
        <div>
          <div style={{ fontWeight: 600 }}>{record.name}</div>
          <div style={{ fontSize: 12, color: '#888' }}>{record.username} · {record.dept}</div>
          <div style={{ marginTop: 4 }}>
            <Tag color={record.role === 'superadmin' ? 'purple' : record.role === 'admin' ? 'red' : record.role === 'leader' ? 'gold' : 'blue'}>
              {ROLE_LABELS[record.role]}
            </Tag>
          </div>
        </div>
      ),
    },
    {
      title: '角色',
      key: 'role',
      width: 160,
      render: (_: any, record: UserPerm) => {
        const disabled = record.username === '33528' || record.username === currentUsername;
        return (
          <Select
            value={record.role}
            options={ROLE_OPTIONS}
            disabled={disabled}
            loading={savingUser === record.username}
            style={{ width: 130 }}
            onChange={(value: UserRole) => saveRole(record.username, value)}
          />
        );
      },
    },
    {
      title: '角色默认能力',
      key: 'roleAbilities',
      width: 280,
      render: (_: any, record: UserPerm) => {
        const abilities: Record<UserRole, string[]> = {
          superadmin: ['全部权限'],
          admin: ['编辑任意周报', '新建/删除周期', '解锁/锁定', 'AI/日志/知识库', '评论管理'],
          leader: ['查看任意周报', '评论', 'AI分析', '行为日志', '知识库', '提交记录'],
          user: ['编辑/提交本部门本周周报', '评论'],
        };
        return (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
            {abilities[record.role]?.map(text => (
              <Tag key={text} color="default" style={{ margin: 0 }}>{text}</Tag>
            ))}
          </div>
        );
      },
    },
    {
      title: '特殊权限覆盖',
      key: 'overrides',
      render: (_: any, record: UserPerm) => (
        <Space size={16} wrap>
          {PERMISSIONS.map(perm => {
            const roleGranted = isPermGrantedByRole(record.role, perm.code);
            const userGranted = record.permissions.includes(perm.code);
            const checked = roleGranted || userGranted;
            return (
              <Tooltip key={perm.code} title={perm.desc}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Switch
                    size="small"
                    checked={checked}
                    disabled={roleGranted || record.username === '33528'}
                    loading={savingUser === record.username}
                    onChange={val => togglePermission(record, perm.code, val)}
                  />
                  <span style={{ fontSize: 13, color: roleGranted ? '#999' : '#333' }}>
                    {perm.name}
                    {roleGranted && (
                      <span style={{ color: '#999', marginLeft: 4 }}>(角色默认)</span>
                    )}
                  </span>
                </div>
              </Tooltip>
            );
          })}
        </Space>
      ),
    },
  ];

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0 }}>权限管理</h2>
          <p style={{ margin: '4px 0 0', color: '#888', fontSize: 13 }}>
            仅系统管理员（superadmin 角色）可操作。基础权限由角色自动赋予，此处只管理额外的特殊权限覆盖。
          </p>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={fetchUsers} loading={loading}>
            刷新
          </Button>
        </Space>
      </div>

      <Table
        dataSource={users}
        columns={columns}
        rowKey="username"
        loading={loading}
        pagination={false}
        scroll={{ x: 1000 }}
        size="small"
        bordered
      />

      <div style={{ marginTop: 16, padding: 12, background: '#f6ffed', borderRadius: 6, fontSize: 13 }}>
        <strong>权限说明：</strong>
        <ul style={{ margin: '8px 0 0', paddingLeft: 18, color: '#555' }}>
          <li><strong>当期截止后编辑</strong>：允许在当期周报截止时间后继续编辑/提交，但<strong>不能</strong>编辑历史周报；历史周报需单独开启「编辑历史周报」。</li>
          <li><strong>编辑历史周报</strong>：允许编辑已锁定的历史周次。</li>
          <li><strong>删除周报周期</strong>：允许删除当前周之后的未来周报周期。</li>
          <li><strong>解锁/锁定周报</strong>：允许对单篇周报执行管理员解锁或重新锁定。</li>
        </ul>
      </div>
    </div>
  );
};

export default PermissionManager;
