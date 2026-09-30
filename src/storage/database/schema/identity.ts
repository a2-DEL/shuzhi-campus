import { sql } from 'drizzle-orm'
import {
  AnyPgColumn,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

export const ROLE_CODES = [
  'super_admin',
  'ai_ops_admin',
  'dept_admin',
  'dept_hygiene_manager',
  'dept_hygiene_admin',
  'counselor',
  'teacher',
  'logistics_manager',
  'logistics_admin',
  'repairman',
  'dorm_manager',
  'dorm_keeper',
  'student',
  'class_committee',
] as const

export const schools = pgTable('schools', {
  id: uuid('id').defaultRandom().primaryKey(),
  code: varchar('code', { length: 32 }).notNull().unique(),
  name: varchar('name', { length: 160 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  timezone: varchar('timezone', { length: 64 }).notNull().default('Asia/Shanghai'),
  settings: jsonb('settings').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
})

export const campuses = pgTable('campuses', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  code: varchar('code', { length: 32 }).notNull(),
  name: varchar('name', { length: 160 }).notNull(),
  address: text('address'),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (table) => [unique('campuses_school_code_unique').on(table.schoolId, table.code)])

export const organizations = pgTable('organizations', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'restrict' }),
  parentId: uuid('parent_id').references((): AnyPgColumn => organizations.id, { onDelete: 'restrict' }),
  code: varchar('code', { length: 64 }).notNull(),
  name: varchar('name', { length: 160 }).notNull(),
  type: varchar('type', { length: 32 }).notNull(),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (table) => [
  unique('organizations_school_code_unique').on(table.schoolId, table.code),
  index('organizations_parent_idx').on(table.parentId),
])

export const organizationClosure = pgTable('organization_closure', {
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'cascade' }),
  ancestorId: uuid('ancestor_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  descendantId: uuid('descendant_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  depth: integer('depth').notNull(),
}, (table) => [
  primaryKey({ columns: [table.ancestorId, table.descendantId] }),
  check('organization_closure_depth_check', sql`${table.depth} >= 0`),
])

export const academicClasses = pgTable('academic_classes', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'restrict' }),
  code: varchar('code', { length: 64 }).notNull(),
  name: varchar('name', { length: 160 }).notNull(),
  gradeYear: integer('grade_year'),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (table) => [unique('academic_classes_school_code_unique').on(table.schoolId, table.code)])

export const buildings = pgTable('buildings', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  campusId: uuid('campus_id').references(() => campuses.id, { onDelete: 'restrict' }),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'restrict' }),
  code: varchar('code', { length: 64 }).notNull(),
  name: varchar('name', { length: 160 }).notNull(),
  type: varchar('type', { length: 32 }).notNull().default('other'),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (table) => [unique('buildings_school_code_unique').on(table.schoolId, table.code)])

export const identityUsers = pgTable('users', {
  id: varchar('id', { length: 36 }).primaryKey(),
  userId: varchar('user_id', { length: 50 }).notNull().unique(),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  primaryOrganizationId: uuid('primary_organization_id').references(() => organizations.id, { onDelete: 'restrict' }),
  primaryCampusId: uuid('primary_campus_id').references(() => campuses.id, { onDelete: 'restrict' }),
  name: varchar('name', { length: 128 }).notNull(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  role: varchar('role', { length: 50 }).notNull().default('student'),
  department: varchar('department', { length: 100 }),
  className: varchar('class_name', { length: 100 }),
  phone: varchar('phone', { length: 20 }),
  email: varchar('email', { length: 255 }),
  avatar: varchar('avatar', { length: 500 }),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  authVersion: integer('auth_version').notNull().default(1),
  isDeleted: boolean('is_deleted').notNull().default(false),
  deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'string' }),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true, mode: 'string' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (table) => [
  index('users_school_idx').on(table.schoolId),
  index('users_primary_organization_idx').on(table.primaryOrganizationId),
])

export const externalIdentities = pgTable('external_identities', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  userId: varchar('user_id', { length: 36 }).notNull().references(() => identityUsers.id, { onDelete: 'cascade' }),
  provider: varchar('provider', { length: 32 }).notNull(),
  issuer: varchar('issuer', { length: 255 }).notNull().default(''),
  subject: varchar('subject', { length: 255 }).notNull(),
  profile: jsonb('profile').notNull().default({}),
  lastAuthenticatedAt: timestamp('last_authenticated_at', { withTimezone: true, mode: 'string' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (table) => [
  unique('external_identities_subject_unique').on(table.schoolId, table.provider, table.issuer, table.subject),
  unique('external_identities_user_provider_unique').on(table.userId, table.provider, table.issuer),
])

export const userRoleAssignments = pgTable('user_role_assignments', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  userId: varchar('user_id', { length: 36 }).notNull().references(() => identityUsers.id, { onDelete: 'cascade' }),
  role: varchar('role', { length: 50 }).notNull(),
  scopeType: varchar('scope_type', { length: 24 }).notNull(),
  scopeId: uuid('scope_id'),
  isPrimary: boolean('is_primary').notNull().default(false),
  status: varchar('status', { length: 20 }).notNull().default('active'),
  validFrom: timestamp('valid_from', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  validUntil: timestamp('valid_until', { withTimezone: true, mode: 'string' }),
  grantedBy: varchar('granted_by', { length: 36 }).references(() => identityUsers.id, { onDelete: 'set null' }),
  reason: text('reason'),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (table) => [
  index('user_role_assignments_school_role_idx').on(table.schoolId, table.role),
  index('user_role_assignments_scope_idx').on(table.schoolId, table.scopeType, table.scopeId),
  uniqueIndex('user_role_assignments_primary_active_idx').on(table.userId).where(sql`${table.isPrimary} AND ${table.status} = 'active'`),
])

export const roleDelegations = pgTable('role_delegations', {
  id: uuid('id').defaultRandom().primaryKey(),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  grantorUserId: varchar('grantor_user_id', { length: 36 }).notNull().references(() => identityUsers.id, { onDelete: 'restrict' }),
  granteeUserId: varchar('grantee_user_id', { length: 36 }).notNull().references(() => identityUsers.id, { onDelete: 'restrict' }),
  role: varchar('role', { length: 50 }).notNull(),
  scopeType: varchar('scope_type', { length: 24 }).notNull(),
  scopeId: uuid('scope_id').notNull(),
  status: varchar('status', { length: 20 }).notNull().default('pending'),
  startsAt: timestamp('starts_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
  approvedBy: varchar('approved_by', { length: 36 }).references(() => identityUsers.id, { onDelete: 'set null' }),
  reason: text('reason').notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'string' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (table) => [index('role_delegations_grantee_active_idx').on(table.granteeUserId, table.status, table.expiresAt)])

export const authSessions = pgTable('auth_sessions', {
  id: uuid('id').primaryKey(),
  schoolId: uuid('school_id').notNull().references(() => schools.id, { onDelete: 'restrict' }),
  userId: varchar('user_id', { length: 36 }).notNull().references(() => identityUsers.id, { onDelete: 'cascade' }),
  authVersion: integer('auth_version').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'string' }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'string' }),
  revokeReason: varchar('revoke_reason', { length: 160 }),
  ipHash: varchar('ip_hash', { length: 64 }),
  userAgentHash: varchar('user_agent_hash', { length: 64 }),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'string' }).notNull().defaultNow(),
}, (table) => [index('auth_sessions_user_active_idx').on(table.userId, table.expiresAt)])
