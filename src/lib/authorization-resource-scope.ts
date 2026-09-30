import { getActiveAssignmentsForPermissions } from '@/lib/authorization'
import type { User, UserRoleAssignment } from '@/types'

export type BusinessScopeDomain =
  | 'repair'
  | 'notification'
  | 'classroom'
  | 'lost_found'
  | 'hygiene'
  | 'dormitory'
  | 'dorm_safety'
  | 'visitor'
  | 'energy'
  | 'material'
  | 'duty'

export interface SqlScopeFilter {
  clause: string
  values: unknown[]
}

interface ScopeBuilderContext {
  alias: string
  nextParameter: number
  schoolId: string
  user: User
  values: unknown[]
}

type ScopeExpressionFactory = (scope: UserRoleAssignment, context: ScopeBuilderContext, parameter: string) => string[]

function uuidParameter(context: ScopeBuilderContext, scope: UserRoleAssignment): string | null {
  if (!scope.scope_id) return null
  const parameter = `$${context.nextParameter + context.values.length}::uuid`
  context.values.push(scope.scope_id)
  return parameter
}

function textParameter(context: ScopeBuilderContext, value: string): string {
  const parameter = `$${context.nextParameter + context.values.length}`
  context.values.push(value)
  return parameter
}

function organizationPredicate(alias: string, parameter: string): string {
  return `(${alias}.organization_id=${parameter} OR EXISTS (SELECT 1 FROM organization_closure scope_org WHERE scope_org.school_id=${alias}.school_id AND scope_org.ancestor_id=${parameter} AND scope_org.descendant_id=${alias}.organization_id))`
}

function buildingOrganizationPredicate(alias: string, buildingExpression: string, parameter: string): string {
  return `EXISTS (SELECT 1 FROM buildings scope_building WHERE scope_building.school_id=${alias}.school_id AND scope_building.id=${buildingExpression} AND (${organizationPredicate('scope_building', parameter)}))`
}

function buildingCampusPredicate(alias: string, buildingExpression: string, parameter: string): string {
  return `EXISTS (SELECT 1 FROM buildings scope_building WHERE scope_building.school_id=${alias}.school_id AND scope_building.id=${buildingExpression} AND scope_building.campus_id=${parameter})`
}

function recipientScopePredicate(
  scope: UserRoleAssignment,
  context: ScopeBuilderContext,
  parameter: string,
): string[] {
  const alias = context.alias
  const assignmentPredicate = scope.scope_type === 'organization'
    ? `(scope_user.primary_organization_id=${parameter} OR EXISTS (SELECT 1 FROM organization_closure scope_recipient_org WHERE scope_recipient_org.school_id=scope_user.school_id AND scope_recipient_org.ancestor_id=${parameter} AND scope_recipient_org.descendant_id=scope_user.primary_organization_id))`
    : scope.scope_type === 'campus'
      ? `scope_user.primary_campus_id=${parameter}`
      : scope.scope_type === 'class'
        ? `EXISTS (SELECT 1 FROM user_role_assignments scope_class_assignment WHERE scope_class_assignment.user_id=scope_user.id AND scope_class_assignment.school_id=scope_user.school_id AND scope_class_assignment.scope_type='class' AND scope_class_assignment.scope_id=${parameter} AND scope_class_assignment.status='active')`
        : scope.scope_type === 'building'
          ? `EXISTS (SELECT 1 FROM user_role_assignments scope_building_assignment WHERE scope_building_assignment.user_id=scope_user.id AND scope_building_assignment.school_id=scope_user.school_id AND scope_building_assignment.scope_type='building' AND scope_building_assignment.scope_id=${parameter} AND scope_building_assignment.status='active')`
          : 'FALSE'
  return [`EXISTS (SELECT 1 FROM notification_deliveries scope_delivery JOIN users scope_user ON scope_user.id=scope_delivery.recipient_user_id AND scope_user.school_id=scope_delivery.school_id WHERE scope_delivery.school_id=${alias}.school_id AND scope_delivery.notification_id=${alias}.id AND (${assignmentPredicate}))`]
}

const domainFactories: Record<BusinessScopeDomain, Partial<Record<UserRoleAssignment['scope_type'], ScopeExpressionFactory>>> = {
  repair: {
    organization: (scope, context, parameter) => [organizationPredicate(context.alias, parameter)],
    campus: (scope, context, parameter) => [buildingCampusPredicate(context.alias, `${context.alias}.building_id`, parameter)],
    building: (scope, context, parameter) => [`${context.alias}.building_id=${parameter}`],
    class: (scope, context) => [`${context.alias}.reporter_id=${textParameter(context, context.user.id)}`],
    self: (scope, context) => [`${context.alias}.reporter_id=${textParameter(context, context.user.id)}`],
  },
  notification: {
    organization: recipientScopePredicate,
    campus: recipientScopePredicate,
    class: (scope, context) => [`EXISTS (SELECT 1 FROM notification_deliveries own_delivery WHERE own_delivery.school_id=${context.alias}.school_id AND own_delivery.notification_id=${context.alias}.id AND own_delivery.recipient_user_id=${textParameter(context, context.user.id)})`],
    building: recipientScopePredicate,
    self: (scope, context) => [`(${context.alias}.publisher_id=${textParameter(context, context.user.id)} OR EXISTS (SELECT 1 FROM notification_deliveries own_delivery WHERE own_delivery.school_id=${context.alias}.school_id AND own_delivery.notification_id=${context.alias}.id AND own_delivery.recipient_user_id=${textParameter(context, context.user.id)}))`],
  },
  classroom: {
    organization: (scope, context, parameter) => [organizationPredicate(context.alias, parameter)],
    campus: (scope, context, parameter) => [`${context.alias}.campus_id=${parameter}`],
    building: (scope, context, parameter) => [`${context.alias}.building_id=${parameter}`],
    class: (scope, context, parameter) => [`EXISTS (SELECT 1 FROM class_schedules scope_schedule WHERE scope_schedule.school_id=${context.alias}.school_id AND scope_schedule.classroom_id=${context.alias}.id AND scope_schedule.class_id=${parameter} AND scope_schedule.status='active')`],
    self: (scope, context) => [`EXISTS (SELECT 1 FROM classroom_bookings own_booking WHERE own_booking.school_id=${context.alias}.school_id AND own_booking.classroom_id=${context.alias}.id AND own_booking.applicant_id=${textParameter(context, context.user.id)})`],
  },
  lost_found: {
    organization: (scope, context, parameter) => [organizationPredicate(context.alias, parameter)],
    class: (scope, context) => [`(${context.alias}.reporter_id=${textParameter(context, context.user.id)} OR ${context.alias}.claimer_id=${textParameter(context, context.user.id)})`],
    self: (scope, context) => [`(${context.alias}.reporter_id=${textParameter(context, context.user.id)} OR ${context.alias}.claimer_id=${textParameter(context, context.user.id)})`],
  },
  hygiene: {
    organization: (scope, context, parameter) => [organizationPredicate('i', parameter)],
    campus: (scope, context, parameter) => [buildingCampusPredicate('i', 'i.building_id', parameter)],
    building: (scope, context, parameter) => [`i.building_id=${parameter}`],
    class: (scope, context, parameter) => [`i.class_id=${parameter}`],
    self: (scope, context) => [`(i.inspector_id=${textParameter(context, context.user.id)} OR ${context.alias}.assignee_id=${textParameter(context, context.user.id)})`],
  },
  dormitory: {
    organization: (scope, context, parameter) => [buildingOrganizationPredicate(context.alias, `${context.alias}.building_id`, parameter)],
    campus: (scope, context, parameter) => [`EXISTS (SELECT 1 FROM buildings scope_building WHERE scope_building.id=${context.alias}.building_id AND scope_building.campus_id=${parameter})`],
    building: (scope, context, parameter) => [`${context.alias}.building_id=${parameter}`],
    self: (scope, context) => [`${context.alias}.manager_id=${textParameter(context, context.user.id)}`],
  },
  dorm_safety: {
    organization: (scope, context, parameter) => [buildingOrganizationPredicate(context.alias, `${context.alias}.building_id`, parameter)],
    campus: (scope, context, parameter) => [`EXISTS (SELECT 1 FROM buildings scope_building WHERE scope_building.id=${context.alias}.building_id AND scope_building.campus_id=${parameter})`],
    building: (scope, context, parameter) => [`${context.alias}.building_id=${parameter}`],
    self: (scope, context) => [`${context.alias}.confirmed_by=${textParameter(context, context.user.id)}`],
  },
  visitor: {
    organization: (scope, context, parameter) => [buildingOrganizationPredicate(context.alias, `${context.alias}.building_id`, parameter)],
    campus: (scope, context, parameter) => [`EXISTS (SELECT 1 FROM buildings scope_building WHERE scope_building.id=${context.alias}.building_id AND scope_building.campus_id=${parameter})`],
    building: (scope, context, parameter) => [`${context.alias}.building_id=${parameter}`],
    self: (scope, context) => [`(${context.alias}.host_id=${textParameter(context, context.user.id)} OR ${context.alias}.applicant_id=${textParameter(context, context.user.id)})`],
  },
  energy: {
    organization: (scope, context, parameter) => [buildingOrganizationPredicate(context.alias, 'a.building_id', parameter)],
    campus: (scope, context, parameter) => [`EXISTS (SELECT 1 FROM buildings scope_building WHERE scope_building.id=a.building_id AND scope_building.campus_id=${parameter})`],
    building: (scope, context, parameter) => [`a.building_id=${parameter}`],
    self: (scope, context) => ['FALSE'],
  },
  material: {
    organization: (scope, context, parameter) => [organizationPredicate(context.alias, parameter)],
    self: (scope, context) => [`EXISTS (SELECT 1 FROM material_requests own_request WHERE own_request.school_id=${context.alias}.school_id AND own_request.material_id=${context.alias}.id AND own_request.requester_id=${textParameter(context, context.user.id)})`],
  },
  duty: {
    organization: (scope, context, parameter) => [organizationPredicate(context.alias, parameter)],
    class: (scope, context, parameter) => [`${context.alias}.class_id=${parameter}`],
    self: (scope, context) => [`${context.alias}.students @> to_jsonb(ARRAY[${textParameter(context, context.user.id)}]::text[])`],
  },
}

/**
 * Builds the only SQL scope predicate accepted by the PG business read model.
 * Caller-supplied scope parameters are deliberately not accepted here; assignments are read from the session user.
 */
export function buildBusinessScopeFilter(
  user: User,
  domain: BusinessScopeDomain,
  alias: string,
  permissions: readonly string[],
  nextParameter = 2,
): SqlScopeFilter {
  const context: ScopeBuilderContext = { alias, nextParameter, schoolId: user.school_id ?? '', user, values: [] }
  const assignments = getActiveAssignmentsForPermissions(user, permissions)
  const expressions: string[] = []

  for (const assignment of assignments) {
    if (assignment.school_id !== user.school_id) continue
    if (assignment.scope_type === 'global' || (assignment.scope_type === 'school' && assignment.scope_id === user.school_id)) {
      return { clause: 'TRUE', values: [] }
    }
    const factory = domainFactories[domain][assignment.scope_type]
    if (!factory) continue
    const scopeIdIsUsed = assignment.scope_type !== 'self'
      && !(assignment.scope_type === 'class' && (domain === 'repair' || domain === 'notification' || domain === 'lost_found'))
    const parameter = scopeIdIsUsed ? uuidParameter(context, assignment) : null
    if (scopeIdIsUsed && !parameter) continue
    expressions.push(...factory(assignment, context, parameter ?? 'NULL'))
  }

  return { clause: expressions.length > 0 ? `(${expressions.join(' OR ')})` : 'FALSE', values: context.values }
}
