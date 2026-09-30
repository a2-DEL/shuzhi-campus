/** Disabled legacy detail views never fetch retired Supabase CRUD endpoints. */
export function legacyDetailMigrationMessage(): string | null {
  return '功能迁移中：该详情页尚未接入 PostgreSQL 领域接口，暂不提供查看或修改。请返回业务列表使用已开放的功能。'
}
