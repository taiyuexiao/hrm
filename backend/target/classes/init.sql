-- 创建数据库
CREATE DATABASE IF NOT EXISTS hr_system CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 使用数据库
USE hr_system;

-- 创建用户表
CREATE TABLE IF NOT EXISTS user (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    username VARCHAR(50) NOT NULL UNIQUE,
    password VARCHAR(100) NOT NULL,
    name VARCHAR(50) NOT NULL,
    role VARCHAR(20) NOT NULL,
    dept VARCHAR(50),
    status INT DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 创建员工表
CREATE TABLE IF NOT EXISTS employee (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(50) NOT NULL,
    gender VARCHAR(10) NOT NULL,
    age INT NOT NULL,
    department VARCHAR(50) NOT NULL,
    position VARCHAR(50) NOT NULL,
    level VARCHAR(20) NOT NULL,
    join_date DATE NOT NULL,
    education VARCHAR(50) NOT NULL,
    school VARCHAR(100) NOT NULL,
    team VARCHAR(50) NOT NULL,
    risk_level VARCHAR(20) NOT NULL,
    career_intent VARCHAR(100) NOT NULL,
    mobility VARCHAR(20) NOT NULL,
    potential VARCHAR(20) NOT NULL,
    cultural_fit JSON,
    skills JSON,
    projects JSON,
    performance JSON,
    certificates JSON,
    awards JSON,
    training JSON,
    collaboration JSON,
    development_suggestions JSON,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 创建绩效表
CREATE TABLE IF NOT EXISTS performance (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    employee_id BIGINT NOT NULL,
    employee_name VARCHAR(50) NOT NULL,
    department VARCHAR(50) NOT NULL,
    position VARCHAR(50) NOT NULL,
    period VARCHAR(20) NOT NULL,
    rating VARCHAR(10) NOT NULL,
    salary DOUBLE NOT NULL,
    bonus DOUBLE NOT NULL,
    total DOUBLE NOT NULL,
    seniority VARCHAR(20) NOT NULL,
    category VARCHAR(50) NOT NULL,
    suggestion VARCHAR(200) NOT NULL,
    base_bonus DOUBLE NOT NULL,
    attendance DOUBLE NOT NULL,
    `change` DOUBLE NOT NULL,
    other DOUBLE NOT NULL,
    final_bonus DOUBLE NOT NULL,
    quarterly_goal VARCHAR(200) NOT NULL,
    weight DOUBLE NOT NULL,
    okr VARCHAR(200) NOT NULL,
    okr_weight DOUBLE NOT NULL,
    result VARCHAR(10) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (employee_id) REFERENCES employee(id)
);

-- 创建预警规则表
CREATE TABLE IF NOT EXISTS alert_rule (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    type VARCHAR(50) NOT NULL,
    `condition` VARCHAR(100) NOT NULL,
    threshold VARCHAR(100) NOT NULL,
    enabled BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 插入初始数据
-- 插入用户数据（1个管理员 + 15个部门账号）
INSERT INTO user (username, password, name, role, dept, status) VALUES
('306852', '$2b$12$iPKMD69pnUL.AzBwipzUruSOuwj6fEcfbVeMBL2wkbFrWrcZzPASO', '于浩瀚', 'admin', '总经理室', 1),
('314043', '$2b$12$iPKMD69pnUL.AzBwipzUruSOuwj6fEcfbVeMBL2wkbFrWrcZzPASO', '宋晓迪', 'admin', '总经理室', 1),
('301953', '$2b$12$iPKMD69pnUL.AzBwipzUruSOuwj6fEcfbVeMBL2wkbFrWrcZzPASO', '徐启鹏', 'admin', '总经理室', 1),
('306776', '$2b$12$iPKMD69pnUL.AzBwipzUruSOuwj6fEcfbVeMBL2wkbFrWrcZzPASO', '卢易', 'admin', '总经理室', 1),
('303439', '$2b$12$iPKMD69pnUL.AzBwipzUruSOuwj6fEcfbVeMBL2wkbFrWrcZzPASO', '管理员', 'admin', '系统管理员', 1),
('33528', '$2b$12$iPKMD69pnUL.AzBwipzUruSOuwj6fEcfbVeMBL2wkbFrWrcZzPASO', '管理员', 'admin', '系统管理员', 1),
('xmgl', '$2b$12$QYaV16L1yCF1ss9i4Qqs7Ocw/MRNM.UN4TRUw4fJXv7ENGFQacX.i', '项目管理', 'user', '项目管理', 1),
('xqgl', '$2b$12$QYaV16L1yCF1ss9i4Qqs7Ocw/MRNM.UN4TRUw4fJXv7ENGFQacX.i', '需求管理', 'user', '需求管理', 1),
('jggl', '$2b$12$QYaV16L1yCF1ss9i4Qqs7Ocw/MRNM.UN4TRUw4fJXv7ENGFQacX.i', '架构管理', 'user', '架构管理', 1),
('319915', '$2b$12$QYaV16L1yCF1ss9i4Qqs7Ocw/MRNM.UN4TRUw4fJXv7ENGFQacX.i', '马胤', 'user', '综合管理部', 1),
('306253', '$2b$12$QYaV16L1yCF1ss9i4Qqs7Ocw/MRNM.UN4TRUw4fJXv7ENGFQacX.i', '杨萍', 'user', '数据测试部', 1),
('305249', '$2b$12$QYaV16L1yCF1ss9i4Qqs7Ocw/MRNM.UN4TRUw4fJXv7ENGFQacX.i', '单曙兵', 'user', '数据治理部', 1),
('302390', '$2b$12$QYaV16L1yCF1ss9i4Qqs7Ocw/MRNM.UN4TRUw4fJXv7ENGFQacX.i', '李焕彰', 'user', '信息管理部', 1),
('305069', '$2b$12$QYaV16L1yCF1ss9i4Qqs7Ocw/MRNM.UN4TRUw4fJXv7ENGFQacX.i', '舒宝龙', 'user', '机构服务团队', 1),
('306844', '$2b$12$QYaV16L1yCF1ss9i4Qqs7Ocw/MRNM.UN4TRUw4fJXv7ENGFQacX.i', '吴证', 'user', '数据平台部', 1),
('303028', '$2b$12$QYaV16L1yCF1ss9i4Qqs7Ocw/MRNM.UN4TRUw4fJXv7ENGFQacX.i', '白迪', 'user', '数据平台部', 1),
('319914', '$2b$12$QYaV16L1yCF1ss9i4Qqs7Ocw/MRNM.UN4TRUw4fJXv7ENGFQacX.i', '顾恺', 'user', '数据开发部', 1),
('302330', '$2b$12$QYaV16L1yCF1ss9i4Qqs7Ocw/MRNM.UN4TRUw4fJXv7ENGFQacX.i', '杨青', 'user', '数据开发部', 1),
('300523', '$2b$12$QYaV16L1yCF1ss9i4Qqs7Ocw/MRNM.UN4TRUw4fJXv7ENGFQacX.i', '贺文军', 'user', '信息统计部', 1),
('304105', '$2b$12$QYaV16L1yCF1ss9i4Qqs7Ocw/MRNM.UN4TRUw4fJXv7ENGFQacX.i', '刘异', 'user', '研发管理部', 1),
('307298', '$2b$12$QYaV16L1yCF1ss9i4Qqs7Ocw/MRNM.UN4TRUw4fJXv7ENGFQacX.i', '胡申民', 'user', '智能平台部', 1),
('302577', '$2b$12$QYaV16L1yCF1ss9i4Qqs7Ocw/MRNM.UN4TRUw4fJXv7ENGFQacX.i', '杨晓彦', 'user', '智能应用一部', 1),
('305393', '$2b$12$QYaV16L1yCF1ss9i4Qqs7Ocw/MRNM.UN4TRUw4fJXv7ENGFQacX.i', '陈嘉琳', 'user', '智能应用二部', 1);

-- 插入预警规则数据
INSERT INTO alert_rule (type, `condition`, threshold, enabled) VALUES
('履职风险', '考勤异常', '连续3天迟到', TRUE),
('履职风险', '绩效持续下滑', '连续2个季度绩效下降', TRUE),
('倦怠风险', '长期报工过载', '连续4周报工超过100%', TRUE),
('倦怠风险', '协作频率骤降', '邮件/协作工具活跃度下降50%', TRUE),
('流失风险', '外部活跃度', '招聘网站行为', FALSE),
('流失风险', '荣誉后无正向反馈', '获得荣誉后3个月无晋升或奖励', TRUE),
('发展停滞风险', '长期无培训记录', '6个月无培训', TRUE),
('发展停滞风险', '知识贡献中断', '3个月无知识分享', TRUE);
