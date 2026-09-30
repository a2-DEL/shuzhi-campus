import { UserRole } from '@/types'

export type DemoAccountGroupId =
  | 'platform'
  | 'academic'
  | 'logistics'
  | 'dormitory'
  | 'student'

export interface DemoAccount {
  identifier: string
  name: string
  role: UserRole
  department: string
  groupId: DemoAccountGroupId
}

export interface DemoAccountGroup {
  id: DemoAccountGroupId
  label: string
  description: string
}

export const DEMO_ACCOUNT_GROUPS: readonly DemoAccountGroup[] = [
  {
    id: 'platform',
    label: '\u5e73\u53f0\u6cbb\u7406',
    description: '\u5168\u5c40\u914d\u7f6e\u3001\u6743\u9650\u4e0e\u8fd0\u8425\u76d1\u7ba1',
  },
  {
    id: 'academic',
    label: '\u9662\u7cfb\u4e0e\u6559\u5b66',
    description: '\u9662\u7cfb\u3001\u8f85\u5bfc\u5458\u3001\u6559\u5e08\u4e0e\u536b\u751f\u7ba1\u7406',
  },
  {
    id: 'logistics',
    label: '\u540e\u52e4\u4e0e\u7ef4\u4fee',
    description: '\u540e\u52e4\u7ba1\u7406\u3001\u5de5\u5355\u8c03\u5ea6\u4e0e\u73b0\u573a\u6267\u884c',
  },
  {
    id: 'dormitory',
    label: '\u5bbf\u820d\u6cbb\u7406',
    description: '\u5bbf\u7ba1\u4e2d\u5fc3\u4e0e\u697c\u5b87\u65e5\u5e38\u6267\u884c',
  },
  {
    id: 'student',
    label: '\u5b66\u751f\u670d\u52a1',
    description: '\u666e\u901a\u5b66\u751f\u4e0e\u73ed\u7ea7\u534f\u540c\u89d2\u8272',
  },
] as const

export const DEMO_ACCOUNTS: readonly DemoAccount[] = [
  {
    identifier: 'admin',
    name: '\u73b0\u6559\u4e2d\u5fc3\u7ba1\u7406\u5458',
    role: UserRole.SUPER_ADMIN,
    department: '\u73b0\u4ee3\u6559\u80b2\u6280\u672f\u4e2d\u5fc3',
    groupId: 'platform',
  },
  {
    identifier: 'dept',
    name: '\u9662\u7cfb\u7ba1\u7406\u5458',
    role: UserRole.DEPT_ADMIN,
    department: '\u8ba1\u7b97\u673a\u5b66\u9662',
    groupId: 'academic',
  },
  {
    identifier: 'hygiene_manager',
    name: '\u9662\u7cfb\u536b\u751f\u8d1f\u8d23\u4eba',
    role: UserRole.DEPT_HYGIENE_MANAGER,
    department: '\u8ba1\u7b97\u673a\u5b66\u9662',
    groupId: 'academic',
  },
  {
    identifier: 'hygiene',
    name: '\u9662\u7cfb\u536b\u751f\u7ba1\u7406\u5458',
    role: UserRole.DEPT_HYGIENE_ADMIN,
    department: '\u8ba1\u7b97\u673a\u5b66\u9662',
    groupId: 'academic',
  },
  {
    identifier: 'counselor',
    name: '\u8f85\u5bfc\u5458',
    role: UserRole.COUNSELOR,
    department: '\u8ba1\u7b97\u673a\u5b66\u9662',
    groupId: 'academic',
  },
  {
    identifier: 'teacher',
    name: '\u4efb\u8bfe\u6559\u5e08',
    role: UserRole.TEACHER,
    department: '\u8ba1\u7b97\u673a\u5b66\u9662',
    groupId: 'academic',
  },
  {
    identifier: 'logistics',
    name: '\u540e\u52e4\u8d1f\u8d23\u4eba',
    role: UserRole.LOGISTICS_MANAGER,
    department: '\u540e\u52e4\u57fa\u5efa\u5904',
    groupId: 'logistics',
  },
  {
    identifier: 'logistics_admin',
    name: '\u540e\u52e4\u7ba1\u7406\u5458',
    role: UserRole.LOGISTICS_ADMIN,
    department: '\u540e\u52e4\u57fa\u5efa\u5904',
    groupId: 'logistics',
  },
  {
    identifier: 'repairman',
    name: '\u7ef4\u4fee\u5e08\u5085',
    role: UserRole.REPAIRMAN,
    department: '\u540e\u52e4\u57fa\u5efa\u5904',
    groupId: 'logistics',
  },
  {
    identifier: 'dorm',
    name: '\u5bbf\u7ba1\u4e2d\u5fc3\u8d1f\u8d23\u4eba',
    role: UserRole.DORM_MANAGER,
    department: '\u5bbf\u820d\u7ba1\u7406\u4e2d\u5fc3',
    groupId: 'dormitory',
  },
  {
    identifier: 'dorm_keeper',
    name: '\u5bbf\u7ba1\u5458',
    role: UserRole.DORM_KEEPER,
    department: '\u5bbf\u820d\u7ba1\u7406\u4e2d\u5fc3',
    groupId: 'dormitory',
  },
  {
    identifier: 'student',
    name: '\u5b66\u751f',
    role: UserRole.STUDENT,
    department: '\u8ba1\u7b97\u673a\u5b66\u9662',
    groupId: 'student',
  },
  {
    identifier: 'committee',
    name: '\u73ed\u59d4',
    role: UserRole.CLASS_COMMITTEE,
    department: '\u8ba1\u7b97\u673a\u5b66\u9662',
    groupId: 'student',
  },
  {
    identifier: 'ai_ops',
    name: 'AI系统运维管理员',
    role: UserRole.AI_OPS_ADMIN,
    department: '智能中枢运维中心',
    groupId: 'platform',
  },
] as const
