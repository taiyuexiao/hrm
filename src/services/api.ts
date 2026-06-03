const API_BASE_URL = 'http://localhost:8081/api';

const mockData = {
  dashboardMetrics: {
    employeeTotal: { value: 240, suffix: '人', label: '员工总人数' },
    outsourceRatio: { value: 1.8, prefix: '1:', suffix: '', label: '行员外包比' },
    inflowOutflow: { inflow: 10, outflow: 2, suffix: '人', label: '当月流入/流出' },
    trainingCompletion: { value: 90, suffix: '%', label: '培训完成率' },
    workReportingRatio: { value: 50, suffix: '%', label: '自研行员比例' },
    avgCodeLines: { value: 12000, suffix: '行', label: '人均月代码提交量' }
  },
  employeeDetailList: [
    { employeeId: 'E001', name: '张伟', department: '数据开发部', position: '数据开发工程师', avgWorkHours: 9.5, overtimeHours: 25 },
    { employeeId: 'E002', name: '李娜', department: '数据平台部', position: '数据建模工程师', avgWorkHours: 8.5, overtimeHours: 15 },
    { employeeId: 'E003', name: '王芳', department: '智能应用一部', position: '智能研发岗', avgWorkHours: 10.2, overtimeHours: 30 },
    { employeeId: 'E004', name: '刘强', department: '信息管理部', position: '产品经理', avgWorkHours: 8.0, overtimeHours: 10 },
    { employeeId: 'E005', name: '陈静', department: '机构服务团队', position: '产品经理', avgWorkHours: 7.5, overtimeHours: 5 },
    { employeeId: 'E006', name: '赵军', department: '数据开发部', position: '数据开发工程师', avgWorkHours: 11.0, overtimeHours: 45 },
    { employeeId: 'E007', name: '孙丽', department: '智能平台部', position: 'AI算法工程师', avgWorkHours: 10.5, overtimeHours: 35 },
    { employeeId: 'E008', name: '周杰', department: '智能应用二部', position: '智能研发岗', avgWorkHours: 9.8, overtimeHours: 28 },
    { employeeId: 'E009', name: '吴婷', department: '数据统计部', position: '数据分析师', avgWorkHours: 8.2, overtimeHours: 12 },
    { employeeId: 'E010', name: '郑浩', department: '研发管理部', position: '项目经理', avgWorkHours: 9.0, overtimeHours: 20 }
  ],
  inflowList: [
    { employeeId: 'E011', name: '李明', department: '数据开发部', position: '数据开发工程师', entryDate: '2025-07-01', entrySource: '校园招聘' },
    { employeeId: 'E012', name: '王红', department: '智能应用一部', position: '智能研发岗', entryDate: '2025-07-03', entrySource: '社会招聘' },
    { employeeId: 'E013', name: '张华', department: '数据平台部', position: '架构师', entryDate: '2025-07-05', entrySource: '内部调动' },
    { employeeId: 'E014', name: '刘芳', department: '智能平台部', position: 'AI算法工程师', entryDate: '2025-07-08', entrySource: '校园招聘' },
    { employeeId: 'E015', name: '陈刚', department: '数据治理部', position: '数据安全', entryDate: '2025-07-10', entrySource: '社会招聘' }
  ],
  outflowList: [
    { employeeId: 'E016', name: '赵磊', department: '信息管理部', position: '产品经理', transferDate: '2025-07-15', transferType: '主动离职', destination: '其他公司' },
    { employeeId: 'E017', name: '孙静', department: '综合管理部', position: '行政经理', transferDate: '2025-07-20', transferType: '内部调动', destination: '分公司' }
  ],
  incompleteTrainingList: [
    { employeeId: 'E001', name: '张伟', trainingName: '数据安全培训', status: '未完成', deadline: '2025-07-31' },
    { employeeId: 'E003', name: '王芳', trainingName: '敏捷开发实战', status: '未完成', deadline: '2025-07-31' },
    { employeeId: 'E006', name: '赵军', trainingName: '代码规范培训', status: '未完成', deadline: '2025-07-31' },
    { employeeId: 'E008', name: '周杰', trainingName: '数据安全培训', status: '未完成', deadline: '2025-07-31' },
    { employeeId: 'E010', name: '郑浩', trainingName: '项目管理培训', status: '未完成', deadline: '2025-07-31' }
  ],
  workReportingList: [
    { employeeId: 'E001', name: '张伟', submitTime: '2025-07-15 09:23:15', linesAdded: 256, linesDeleted: 32, codeType: 'Python', commitMessage: '优化数据处理模块' },
    { employeeId: 'E001', name: '张伟', submitTime: '2025-07-15 14:45:32', linesAdded: 128, linesDeleted: 15, codeType: 'Java', commitMessage: '修复API接口bug' },
    { employeeId: 'E002', name: '李娜', submitTime: '2025-07-15 10:12:08', linesAdded: 512, linesDeleted: 45, codeType: 'Java', commitMessage: '重构用户认证逻辑' },
    { employeeId: 'E002', name: '李娜', submitTime: '2025-07-15 16:30:22', linesAdded: 89, linesDeleted: 12, codeType: 'SQL', commitMessage: '优化数据库查询' },
    { employeeId: 'E003', name: '王芳', submitTime: '2025-07-15 11:05:44', linesAdded: 345, linesDeleted: 28, codeType: 'Python', commitMessage: '添加机器学习模型' },
    { employeeId: 'E003', name: '王芳', submitTime: '2025-07-15 17:22:10', linesAdded: 167, linesDeleted: 20, codeType: 'Go', commitMessage: '更新前端组件' },
    { employeeId: 'E004', name: '刘强', submitTime: '2025-07-15 09:45:30', linesAdded: 420, linesDeleted: 55, codeType: 'Go', commitMessage: '微服务架构改造' },
    { employeeId: 'E005', name: '陈静', submitTime: '2025-07-15 13:15:48', linesAdded: 234, linesDeleted: 18, codeType: 'Python', commitMessage: '前端性能优化' },
    { employeeId: 'E006', name: '赵军', submitTime: '2025-07-15 10:30:12', linesAdded: 378, linesDeleted: 42, codeType: 'Java', commitMessage: '数据管道重构' },
    { employeeId: 'E007', name: '孙丽', submitTime: '2025-07-15 14:08:35', linesAdded: 156, linesDeleted: 22, codeType: 'Java', commitMessage: '单元测试补充' }
  ],
  overtimeDetailList: [
    { employeeId: 'E001', name: '张伟', department: '数据开发部', overtimeHours: 25, overtimeDate: '2025-07' },
    { employeeId: 'E002', name: '李娜', department: '数据平台部', overtimeHours: 15, overtimeDate: '2025-07' },
    { employeeId: 'E003', name: '王芳', department: '智能应用一部', overtimeHours: 30, overtimeDate: '2025-07' },
    { employeeId: 'E004', name: '刘强', department: '信息管理部', overtimeHours: 10, overtimeDate: '2025-07' },
    { employeeId: 'E006', name: '赵军', department: '数据开发部', overtimeHours: 45, overtimeDate: '2025-07' },
    { employeeId: 'E007', name: '孙丽', department: '智能平台部', overtimeHours: 35, overtimeDate: '2025-07' },
    { employeeId: 'E008', name: '周杰', department: '智能应用二部', overtimeHours: 28, overtimeDate: '2025-07' },
    { employeeId: 'E010', name: '郑浩', department: '研发管理部', overtimeHours: 20, overtimeDate: '2025-07' }
  ],
  employeeStructure: {
    departments: ['信息管理部', '信息统计部', '数据开发部', '数据平台部', '数据治理部', '综合管理部', '研发管理部', '智能平台部', '智能应用一部', '智能应用二部', '机构服务团队'],
    values: [30, 30, 50, 25, 10, 10, 8, 12, 18, 20, 10],
    colors: ['#5470c6', '#91cc75', '#fac858', '#ee6666', '#73c0de', '#3ba272', '#fc8452', '#9a60b4', '#ea7ccc', '#48b8d0', '#f5d76e']
  },
  employeeTurnover: {
    months: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
    join: [2, 1, 10, 2, 8, 1, 60, 2, 1, 2, 1, 2],
    leave: [1, 0, 3, 5, 4, 1, 0, 1, 0, 1, 0, 1]
  },
  ageStructure: {
    ageGroups: ['22-25岁', '26-30岁', '31-35岁', '36-40岁', '40岁以上'],
    values: [28, 75, 65, 38, 17]
  },
  costTrend: {
    months: ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'],
    salary: [420, 425, 430, 435, 440, 445, 450, 455, 460, 465, 470, 480],
    bonus: [80, 85, 90, 95, 100, 105, 110, 115, 120, 125, 130, 140],
    training: [18, 20, 22, 25, 28, 30, 32, 35, 38, 40, 42, 45]
  },
  pyramidStructure: {
    levels: ['15级\n(基层)', '14级\n(基层)', '13级\n(基层)', '11-12级\n(中层)', '10级及以上\n(高管)'],
    values: [70, 50, 30, 35, 15],
    colors: ['#1a5276', '#2874a6', '#3498db', '#5dade2', '#85c1e9']
  },
  saturation: {
    departments: ['信息管理部', '信息统计部', '数据开发部', '数据平台部', '数据治理部', '综合管理部', '研发管理部', '智能平台部', '智能应用一部', '智能应用二部', '机构服务团队'],
    avgWorkHours: [7.5, 7.2, 9.8, 9.5, 7.0, 6.5, 8.0, 10.2, 10.5, 10.8, 7.8],
    overtimeHours: [1.2, 0.8, 3.5, 3.2, 0.5, 0.3, 2.0, 4.5, 4.8, 5.2, 1.5],
    attendanceRate: [98.5, 99.2, 97.8, 98.0, 99.5, 99.8, 98.5, 97.2, 96.8, 96.5, 98.8]
  },
  learningTraining: {
    departments: ['信息管理部', '信息统计部', '数据开发部', '数据平台部', '数据治理部', '综合管理部', '研发管理部', '智能平台部', '智能应用一部', '智能应用二部', '机构服务团队'],
   主动培训次数: [5, 4, 8, 7, 3, 4, 6, 9, 8, 7, 4],
    参与培训次数: [15, 12, 18, 16, 10, 11, 14, 19, 17, 18, 13]
  },
  riskWarning: {
    riskData: [
      { name: '张伟', department: '数据开发部', position: '高级工程师', riskType: '倦怠风险', riskLevel: '高', reason: '连续3个月日均工时超过12小时', date: '2026-03-15', status: '待处理', handler: '' },
      { name: '李娜', department: '数据平台部', position: '工程师', riskType: '离职风险', riskLevel: '中', reason: '绩效连续B+但1年未晋升', date: '2026-03-14', status: '处理中', handler: '王经理' },
      { name: '王芳', department: '智能应用一部', position: '产品经理', riskType: '绩效风险', riskLevel: '中', reason: '近2年绩效为B-及以下次数: 2', date: '2026-03-13', status: '待处理', handler: '' },
      { name: '刘强', department: '信息管理部', position: '运营主管', riskType: '发展停滞', riskLevel: '低', reason: '6个月无培训记录', date: '2026-03-12', status: '已处理', handler: '赵总' },
      { name: '陈静', department: '机构服务团队', position: '市场经理', riskType: '履职风险', riskLevel: '低', reason: '本月迟到3次', date: '2026-03-10', status: '待处理', handler: '' }
    ]
  },
  employees: generateEmployees(223)
};

function generateEmployees(count: number) {
  const departments = ['信息管理部', '信息统计部', '数据开发部', '数据平台部', '数据治理部', '综合管理部', '研发管理部', '智能平台部', '智能应用一部', '智能应用二部', '机构服务团队'];
  const positions: { [key: string]: string[] } = {
    '信息管理部': ['信息主管', '信息专员', '数据分析师', '运维工程师'],
    '信息统计部': ['统计主管', '统计专员', '数据分析师', '建模工程师'],
    '数据开发部': ['开发主管', '高级开发工程师', '开发工程师', '数据工程师'],
    '数据平台部': ['平台主管', '架构师', '平台工程师', 'SRE工程师'],
    '数据治理部': ['治理主管', '治理专员', '数据质量工程师'],
    '综合管理部': ['综合主管', '行政专员', '文秘', '后勤专员'],
    '研发管理部': ['研发主管', '项目经理', 'PMO专员', '技术文档工程师'],
    '智能平台部': ['智能主管', '算法工程师', 'AI工程师', '机器学习工程师'],
    '智能应用一部': ['应用主管', '产品经理', '前端工程师', '后端工程师'],
    '智能应用二部': ['应用主管', '产品经理', '全栈工程师', '测试工程师'],
    '机构服务团队': ['服务主管', '服务专员', '客户经理', '支持工程师']
  };
  const performanceRatings = ['A+', 'A', 'A-', 'B+', 'B', 'B-'];

  const employees = [];
  for (let i = 1; i <= count; i++) {
    const dept = departments[Math.floor(Math.random() * departments.length)];
    const posList = positions[dept];
    const position = posList[Math.floor(Math.random() * posList.length)];
    const age = 22 + Math.floor(Math.random() * 20);
    const rand = Math.random();
    let gender;
    if (rand < 0.49) gender = '男';
    else if (rand < 0.49 + 0.52) gender = '女';
    else gender = Math.random() > 0.5 ? '男' : '女';
    const eduRand = Math.random();
    let edu;
    if (eduRand < 0.84) edu = '硕士';
    else if (eduRand < 0.99) edu = '本科';
    else edu = '博士';
    const eduIndex = ['本科', '硕士', '博士'].indexOf(edu);
    const performanceIdx = Math.floor(Math.random() * 6);
    const performance = performanceRatings[performanceIdx];
    const dailyHours = 6 + Math.random() * 5;
    const isTeamLeader = Math.random() > 0.85 ? 1 : 0;
    const isKeyMember = Math.random() > 0.75 ? 1 : 0;

    employees.push({
      id: i,
      employeeId: String(i),
      age,
      gender,
      education: edu,
      position,
      department: dept,
      industryAge: Math.round((1 + Math.random() * 15) * 10) / 10,
      companyAge: Math.round((0.5 + Math.random() * 8) * 10) / 10,
      performanceScoreAvg: Math.round((2.5 + Math.random() * 2) * 100) / 100,
      performanceBelowBCount: performanceIdx >= 4 ? Math.floor(Math.random() * 2) + 1 : 0,
      performanceAPlusCount: performanceIdx === 0 ? Math.floor(Math.random() * 3) + 1 : 0,
      performanceACount: performanceIdx <= 1 ? Math.floor(Math.random() * 3) : 0,
      sickLeaveDays: Math.floor(Math.random() * 5),
      personalLeaveDays: Math.floor(Math.random() * 3),
      ledProjectCount: Math.floor(Math.random() * 5),
      dailyWorkingHours: Math.round(dailyHours * 10) / 10,
      isTeamLeader,
      isKeyProjectMember: isKeyMember,
      agileRole: (dept === '数据开发部' || dept === '智能平台部') ? (Math.random() > 0.7 ? 'SM' : Math.random() > 0.5 ? 'PO' : '0') : '0',
      internalProjectAsPM: Math.floor(Math.random() * 3),
      externalProjectAsPM: Math.floor(Math.random() * 2),
      pmBusinessAnalysis: (dept === '智能应用一部' || dept === '智能应用二部') ? Math.floor(Math.random() * 4) : 0,
      pmProductDesign: (dept === '智能应用一部' || dept === '智能应用二部') ? Math.floor(Math.random() * 4) : 0,
      publicationsCount: eduIndex >= 2 ? Math.floor(Math.random() * 5) : 0,
      awardsCount: Math.floor(Math.random() * 4),
      highestAward: Math.random() > 0.7 ? ['优秀员工', '技术标兵', '创新奖'][Math.floor(Math.random() * 3)] : '',
      internalTrainingAsTrainer: Math.floor(Math.random() * 5),
      externalTrainingAsTrainer: Math.floor(Math.random() * 3),
      externalTrainingAsTrainee: Math.floor(Math.random() * 6),
      internalTrainingAsTrainee: Math.floor(Math.random() * 6),
      mentoredInternsCount: Math.floor(Math.random() * 4),
      mentoredNewGradCount: Math.floor(Math.random() * 5),
      internsConvertedCount: Math.floor(Math.random() * 3),
      newGradAConversionCount: Math.floor(Math.random() * 3),
      knowledgeBaseAccessCount: 10 + Math.floor(Math.random() * 25),
      certificateStatus: Math.random() > 0.5 ? '是' : '否',
      dataAnalysisToolSkill: 1 + Math.floor(Math.random() * 5),
      algorithmModelSkill: eduIndex >= 1 ? 1 + Math.floor(Math.random() * 5) : 0,
      marketingOperationSkill: (dept === '机构服务团队' || dept === '客户关系部') ? 1 + Math.floor(Math.random() * 5) : 0,
      sqlDevelopmentSkill: (dept === '数据开发部' || dept === '数据平台部') ? 1 + Math.floor(Math.random() * 5) : 0,
      dataModelDesignSkill: (dept === '数据开发部' || dept === '数据治理部') ? 1 + Math.floor(Math.random() * 5) : 0,
      businessUnderstandingSkill: 1 + Math.floor(Math.random() * 5),
      techArchitectureSkill: (dept === '智能平台部' || dept === '数据平台部') ? 1 + Math.floor(Math.random() * 5) : 0,
      applicationDevelopmentSkill: (dept === '智能应用一部' || dept === '智能应用二部') ? 1 + Math.floor(Math.random() * 5) : 0,
      mathModelingTheorySkill: (dept === '智能平台部' || eduIndex >= 1) ? 1 + Math.floor(Math.random() * 5) : 0,
      programmingImplementationSkill: (dept === '数据开发部' || dept === '智能平台部') ? 1 + Math.floor(Math.random() * 5) : 0,
      learningAbility: 1 + Math.floor(Math.random() * 5),
      innovationThinking: 1 + Math.floor(Math.random() * 5),
      taskDecompositionAbility: 1 + Math.floor(Math.random() * 5),
      leadership: isTeamLeader ? 3 + Math.floor(Math.random() * 3) : 1 + Math.floor(Math.random() * 3),
      teamwork: 1 + Math.floor(Math.random() * 5),
      supervisorRating: performance,
      peerRating: performanceRatings[Math.floor(Math.random() * 6)],
      subordinateRating: Math.random() > 0.3 ? performanceRatings[Math.floor(Math.random() * 4)] : '',
      specialty: Math.random() > 0.5 ? ['编程', '写作', '演讲', '项目管理', '数据分析', '算法设计', '架构设计'][Math.floor(Math.random() * 7)] : '无',
      hobby: Math.random() > 0.5 ? ['运动', '阅读', '音乐', '旅行', '摄影', '围棋', '书法'][Math.floor(Math.random() * 7)] : '无'
    });
  }
  return employees;
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  try {
    const token = localStorage.getItem('auth-token');
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...options.headers as Record<string, string>,
    };
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    const response = await fetch(`${API_BASE_URL}${url}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    console.warn(`API request failed, using mock data for ${url}:`, error);
    throw error;
  }
}

export const authApi = {
  login: (username: string, password: string) => {
    return request<{ success: boolean; token: string; user: any; message?: string }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  },
  changePassword: (username: string, oldPassword: string, newPassword: string) => {
    return request<{ success: boolean; message?: string }>('/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ username, oldPassword, newPassword }),
    });
  },
};

export const employeeApi = {
  getList: async () => {
    try {
      return await request<any[]>('/employee/list');
    } catch {
      return mockData.employees;
    }
  },
  getProfile: async (id: number) => {
    try {
      return await request<any>(`/employee/profile/${id}`);
    } catch {
      return mockData.employees.find((e: any) => e.id === id) || mockData.employees[0];
    }
  },
  getByDepartment: async (department: string) => {
    try {
      return await request<any[]>(`/employee/department/${department}`);
    } catch {
      return mockData.employees;
    }
  },
};

export const performanceApi = {
  getList: () => {
    return request<any[]>('/performance/list');
  },
  getByEmployeeId: (employeeId: number) => {
    return request<any[]>(`/performance/employee/${employeeId}`);
  },
  getByDepartment: (department: string) => {
    return request<any[]>(`/performance/department/${department}`);
  },
  getByPeriod: (period: string) => {
    return request<any[]>(`/performance/period/${period}`);
  },
  getAssessmentData: () => {
    return request<any[]>('/performance/assessment');
  },
  getMonitoringData: () => {
    return request<any[]>('/performance/monitoring');
  },
};

export const dataApi = {
  getEmployeeStructure: async () => {
    try {
      return await request<any>('/data/employee-structure');
    } catch {
      return mockData.employeeStructure;
    }
  },
  getEmployeeTurnover: async () => {
    try {
      return await request<any>('/data/employee-turnover');
    } catch {
      return mockData.employeeTurnover;
    }
  },
  getAgeStructure: async () => {
    try {
      return await request<any>('/data/age-structure');
    } catch {
      return mockData.ageStructure;
    }
  },
  getCostTrend: async () => {
    try {
      return await request<any>('/data/cost-trend');
    } catch {
      return mockData.costTrend;
    }
  },
  getPyramidStructure: async () => {
    try {
      return await request<any>('/data/pyramid-structure');
    } catch {
      return mockData.pyramidStructure;
    }
  },
  getDashboardMetrics: async () => {
    try {
      return await request<any>('/data/dashboard-metrics');
    } catch {
      return mockData.dashboardMetrics;
    }
  },
  getRiskWarning: async () => {
    try {
      return await request<any>('/data/risk-warning');
    } catch {
      return mockData.riskWarning;
    }
  },
  getSaturation: async () => {
    try {
      return await request<any>('/data/saturation');
    } catch {
      return mockData.saturation;
    }
  },
  getLearningTraining: async () => {
    try {
      return await request<any>('/data/learning-training');
    } catch {
      return mockData.learningTraining;
    }
  },
  getEmployeeDetailList: async () => {
    try {
      return await request<any[]>('/data/employee-detail-list');
    } catch {
      return mockData.employeeDetailList;
    }
  },
  getInflowList: async () => {
    try {
      return await request<any[]>('/data/inflow-list');
    } catch {
      return mockData.inflowList;
    }
  },
  getOutflowList: async () => {
    try {
      return await request<any[]>('/data/outflow-list');
    } catch {
      return mockData.outflowList;
    }
  },
  getIncompleteTrainingList: async () => {
    try {
      return await request<any[]>('/data/incomplete-training');
    } catch {
      return mockData.incompleteTrainingList;
    }
  },
  getWorkReportingList: async () => {
    try {
      return await request<any[]>('/data/work-reporting');
    } catch {
      return mockData.workReportingList;
    }
  },
  getOvertimeDetailList: async () => {
    try {
      return await request<any[]>('/data/overtime-detail');
    } catch {
      return mockData.overtimeDetailList;
    }
  },
};

export const alertApi = {
  getRules: () => {
    return request<any[]>('/alert/rules');
  },
  getRulesByType: (type: string) => {
    return request<any[]>(`/alert/rules/type/${type}`);
  },
  getRulesByEnabled: (enabled: boolean) => {
    return request<any[]>(`/alert/rules/enabled/${enabled}`);
  },
  getAlertList: () => {
    return request<any>('/alert/list');
  },
};