import { pgTable, serial, timestamp, index, varchar, integer, jsonb, foreignKey, text, unique, uuid } from "drizzle-orm/pg-core"
import { sql } from "drizzle-orm"

// Define gen_random_uuid as a SQL function
const gen_random_uuid = () => sql`gen_random_uuid()`


export const healthCheck = pgTable("health_check", {
	id: serial().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
});

export const classrooms = pgTable("classrooms", {
	id: varchar({ length: 36 }).default(gen_random_uuid()).primaryKey().notNull(),
	campus: varchar({ length: 20 }).notNull(),
	building: varchar({ length: 50 }).notNull(),
	floor: integer().notNull(),
	roomNumber: varchar("room_number", { length: 20 }).notNull(),
	fullName: varchar("full_name", { length: 50 }).notNull(),
	capacity: integer().default(60).notNull(),
	status: varchar({ length: 20 }).default('available').notNull(),
	facilities: jsonb(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("classrooms_campus_idx").using("btree", table.campus.asc().nullsLast().op("text_ops")),
	index("classrooms_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
]);

export const dormitories = pgTable("dormitories", {
	id: varchar({ length: 36 }).default(gen_random_uuid()).primaryKey().notNull(),
	buildingName: varchar("building_name", { length: 50 }).notNull(),
	totalRooms: integer("total_rooms").notNull(),
	occupiedRooms: integer("occupied_rooms").default(0).notNull(),
	managerId: varchar("manager_id", { length: 36 }),
	status: varchar({ length: 20 }).default('normal').notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	foreignKey({
			columns: [table.managerId],
			foreignColumns: [users.id],
			name: "dormitories_manager_id_users_id_fk"
		}),
]);

export const dormInspections = pgTable("dorm_inspections", {
	id: varchar({ length: 36 }).default(gen_random_uuid()).primaryKey().notNull(),
	dormitoryId: varchar("dormitory_id", { length: 36 }).notNull(),
	roomNumber: varchar("room_number", { length: 20 }).notNull(),
	inspectorId: varchar("inspector_id", { length: 36 }).notNull(),
	inspectionDate: varchar("inspection_date", { length: 20 }).notNull(),
	score: integer().notNull(),
	issues: jsonb(),
	images: jsonb(),
	notes: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("dorm_inspections_date_idx").using("btree", table.inspectionDate.asc().nullsLast().op("text_ops")),
	index("dorm_inspections_dormitory_id_idx").using("btree", table.dormitoryId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.dormitoryId],
			foreignColumns: [dormitories.id],
			name: "dorm_inspections_dormitory_id_dormitories_id_fk"
		}),
	foreignKey({
			columns: [table.inspectorId],
			foreignColumns: [users.id],
			name: "dorm_inspections_inspector_id_users_id_fk"
		}),
]);

export const dutySchedules = pgTable("duty_schedules", {
	id: varchar({ length: 36 }).default(gen_random_uuid()).primaryKey().notNull(),
	dutyDate: varchar("duty_date", { length: 20 }).notNull(),
	className: varchar("class_name", { length: 100 }).notNull(),
	location: varchar({ length: 200 }).notNull(),
	students: jsonb().notNull(),
	dutyType: varchar("duty_type", { length: 50 }).default('cleaning').notNull(),
	status: varchar({ length: 20 }).default('pending').notNull(),
	notes: text(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("duty_schedules_class_name_idx").using("btree", table.className.asc().nullsLast().op("text_ops")),
	index("duty_schedules_date_idx").using("btree", table.dutyDate.asc().nullsLast().op("text_ops")),
]);

export const lostFound = pgTable("lost_found", {
	id: varchar({ length: 36 }).default(gen_random_uuid()).primaryKey().notNull(),
	type: varchar({ length: 20 }).notNull(),
	itemType: varchar("item_type", { length: 50 }).notNull(),
	itemName: varchar("item_name", { length: 200 }).notNull(),
	description: text(),
	location: varchar({ length: 200 }),
	images: jsonb(),
	reporterId: varchar("reporter_id", { length: 36 }).notNull(),
	status: varchar({ length: 20 }).default('open').notNull(),
	claimerId: varchar("claimer_id", { length: 36 }),
	claimedAt: timestamp("claimed_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("lost_found_item_type_idx").using("btree", table.itemType.asc().nullsLast().op("text_ops")),
	index("lost_found_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("lost_found_type_idx").using("btree", table.type.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.reporterId],
			foreignColumns: [users.id],
			name: "lost_found_reporter_id_users_id_fk"
		}),
	foreignKey({
			columns: [table.claimerId],
			foreignColumns: [users.id],
			name: "lost_found_claimer_id_users_id_fk"
		}),
]);

export const materials = pgTable("materials", {
	id: varchar({ length: 36 }).default(gen_random_uuid()).primaryKey().notNull(),
	name: varchar({ length: 200 }).notNull(),
	category: varchar({ length: 100 }).notNull(),
	quantity: integer().default(0).notNull(),
	unit: varchar({ length: 20 }).notNull(),
	threshold: integer().default(10).notNull(),
	status: varchar({ length: 20 }).default('normal').notNull(),
	location: varchar({ length: 200 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("materials_category_idx").using("btree", table.category.asc().nullsLast().op("text_ops")),
	index("materials_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
]);

export const notifications = pgTable("notifications", {
	id: varchar({ length: 36 }).default(gen_random_uuid()).primaryKey().notNull(),
	title: varchar({ length: 200 }).notNull(),
	content: text().notNull(),
	type: varchar({ length: 20 }).notNull(),
	publisherId: varchar("publisher_id", { length: 36 }).notNull(),
	targetRoles: jsonb("target_roles"),
	targetDepartments: jsonb("target_departments"),
	publishAt: timestamp("publish_at", { withTimezone: true, mode: 'string' }),
	expireAt: timestamp("expire_at", { withTimezone: true, mode: 'string' }),
	status: varchar({ length: 20 }).default('draft').notNull(),
	views: integer().default(0).notNull(),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("notifications_publish_at_idx").using("btree", table.publishAt.asc().nullsLast().op("timestamptz_ops")),
	index("notifications_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
	index("notifications_type_idx").using("btree", table.type.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.publisherId],
			foreignColumns: [users.id],
			name: "notifications_publisher_id_users_id_fk"
		}),
]);

export const repairOrders = pgTable("repair_orders", {
	id: varchar({ length: 36 }).default(gen_random_uuid()).primaryKey().notNull(),
	title: varchar({ length: 200 }).notNull(),
	damageType: varchar("damage_type", { length: 100 }).notNull(),
	location: varchar({ length: 200 }).notNull(),
	description: text(),
	images: jsonb(),
	reporterId: varchar("reporter_id", { length: 36 }).notNull(),
	assigneeId: varchar("assignee_id", { length: 36 }),
	status: varchar({ length: 20 }).default('pending').notNull(),
	priority: varchar({ length: 20 }).default('normal'),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("repair_orders_assignee_id_idx").using("btree", table.assigneeId.asc().nullsLast().op("text_ops")),
	index("repair_orders_damage_type_idx").using("btree", table.damageType.asc().nullsLast().op("text_ops")),
	index("repair_orders_reporter_id_idx").using("btree", table.reporterId.asc().nullsLast().op("text_ops")),
	index("repair_orders_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.reporterId],
			foreignColumns: [users.id],
			name: "repair_orders_reporter_id_users_id_fk"
		}),
	foreignKey({
			columns: [table.assigneeId],
			foreignColumns: [users.id],
			name: "repair_orders_assignee_id_users_id_fk"
		}),
]);

export const systemSettings = pgTable("system_settings", {
	id: varchar({ length: 36 }).default(gen_random_uuid()).primaryKey().notNull(),
	settingKey: varchar("setting_key", { length: 100 }).notNull(),
	settingValue: text("setting_value").notNull(),
	description: varchar({ length: 500 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("system_settings_key_idx").using("btree", table.settingKey.asc().nullsLast().op("text_ops")),
	unique("system_settings_setting_key_unique").on(table.settingKey),
]);

export const users = pgTable("users", {
	id: varchar({ length: 36 }).default(gen_random_uuid()).primaryKey().notNull(),
	userId: varchar("user_id", { length: 50 }).notNull(),
	name: varchar({ length: 128 }).notNull(),
	passwordHash: varchar("password_hash", { length: 255 }).notNull(),
	role: varchar({ length: 50 }).default('student').notNull(),
	department: varchar({ length: 100 }),
	className: varchar("class_name", { length: 100 }),
	phone: varchar({ length: 20 }),
	email: varchar({ length: 255 }),
	avatar: varchar({ length: 500 }),
	status: varchar({ length: 20 }).default('active').notNull(),
	wechatOpenid: varchar("wechat_openid", { length: 100 }),
	lastLoginAt: timestamp("last_login_at", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("users_department_idx").using("btree", table.department.asc().nullsLast().op("text_ops")),
	index("users_role_idx").using("btree", table.role.asc().nullsLast().op("text_ops")),
	index("users_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	index("users_wechat_openid_idx").using("btree", table.wechatOpenid.asc().nullsLast().op("text_ops")),
	unique("users_user_id_unique").on(table.userId),
]);

export const classroomBookings = pgTable("classroom_bookings", {
	id: varchar({ length: 36 }).default(gen_random_uuid()).primaryKey().notNull(),
	classroomId: varchar("classroom_id", { length: 36 }).notNull(),
	applicantId: varchar("applicant_id", { length: 36 }).notNull(),
	bookingDate: varchar("booking_date", { length: 20 }).notNull(),
	timeSlot: varchar("time_slot", { length: 50 }).notNull(),
	purpose: text().notNull(),
	status: varchar({ length: 20 }).default('pending').notNull(),
	reviewerId: varchar("reviewer_id", { length: 36 }),
	reviewNote: text("review_note"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("classroom_bookings_applicant_id_idx").using("btree", table.applicantId.asc().nullsLast().op("text_ops")),
	index("classroom_bookings_classroom_id_idx").using("btree", table.classroomId.asc().nullsLast().op("text_ops")),
	index("classroom_bookings_date_idx").using("btree", table.bookingDate.asc().nullsLast().op("text_ops")),
	index("classroom_bookings_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.classroomId],
			foreignColumns: [classrooms.id],
			name: "classroom_bookings_classroom_id_classrooms_id_fk"
		}),
	foreignKey({
			columns: [table.applicantId],
			foreignColumns: [users.id],
			name: "classroom_bookings_applicant_id_users_id_fk"
		}),
	foreignKey({
			columns: [table.reviewerId],
			foreignColumns: [users.id],
			name: "classroom_bookings_reviewer_id_users_id_fk"
		}),
]);

export const visitors = pgTable("visitors", {
	id: varchar({ length: 36 }).default(gen_random_uuid()).primaryKey().notNull(),
	dormitoryId: varchar("dormitory_id", { length: 36 }).notNull(),
	roomNumber: varchar("room_number", { length: 20 }).notNull(),
	visitorName: varchar("visitor_name", { length: 100 }).notNull(),
	visitorPhone: varchar("visitor_phone", { length: 20 }),
	purpose: varchar({ length: 200 }).notNull(),
	visitTime: timestamp("visit_time", { withTimezone: true, mode: 'string' }).notNull(),
	leaveTime: timestamp("leave_time", { withTimezone: true, mode: 'string' }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("visitors_dormitory_id_idx").using("btree", table.dormitoryId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.dormitoryId],
			foreignColumns: [dormitories.id],
			name: "visitors_dormitory_id_dormitories_id_fk"
		}),
]);

export const materialRequests = pgTable("material_requests", {
	id: varchar({ length: 36 }).default(gen_random_uuid()).primaryKey().notNull(),
	materialId: varchar("material_id", { length: 36 }).notNull(),
	quantity: integer().notNull(),
	requesterId: varchar("requester_id", { length: 36 }).notNull(),
	reason: text().notNull(),
	status: varchar({ length: 20 }).default('pending').notNull(),
	reviewerId: varchar("reviewer_id", { length: 36 }),
	reviewNote: text("review_note"),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }),
}, (table) => [
	index("material_requests_material_id_idx").using("btree", table.materialId.asc().nullsLast().op("text_ops")),
	index("material_requests_requester_id_idx").using("btree", table.requesterId.asc().nullsLast().op("text_ops")),
	index("material_requests_status_idx").using("btree", table.status.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.materialId],
			foreignColumns: [materials.id],
			name: "material_requests_material_id_materials_id_fk"
		}),
	foreignKey({
			columns: [table.requesterId],
			foreignColumns: [users.id],
			name: "material_requests_requester_id_users_id_fk"
		}),
	foreignKey({
			columns: [table.reviewerId],
			foreignColumns: [users.id],
			name: "material_requests_reviewer_id_users_id_fk"
		}),
]);

export const operationLogs = pgTable("operation_logs", {
	id: varchar({ length: 36 }).default(gen_random_uuid()).primaryKey().notNull(),
	userId: varchar("user_id", { length: 36 }),
	action: varchar({ length: 100 }).notNull(),
	targetType: varchar("target_type", { length: 50 }),
	targetId: varchar("target_id", { length: 36 }),
	details: jsonb(),
	ipAddress: varchar("ip_address", { length: 50 }),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow().notNull(),
}, (table) => [
	index("operation_logs_action_idx").using("btree", table.action.asc().nullsLast().op("text_ops")),
	index("operation_logs_created_at_idx").using("btree", table.createdAt.asc().nullsLast().op("timestamptz_ops")),
	index("operation_logs_user_id_idx").using("btree", table.userId.asc().nullsLast().op("text_ops")),
	foreignKey({
			columns: [table.userId],
			foreignColumns: [users.id],
			name: "operation_logs_user_id_users_id_fk"
		}),
]);

export const repairs = pgTable("repairs", {
	id: uuid().defaultRandom().primaryKey().notNull(),
	title: varchar({ length: 200 }).notNull(),
	damageType: varchar("damage_type", { length: 50 }),
	location: varchar({ length: 200 }).notNull(),
	description: text(),
	images: text().array(),
	status: varchar({ length: 20 }).default('pending'),
	reporterId: uuid("reporter_id").notNull(),
	assigneeId: uuid("assignee_id"),
	priority: varchar({ length: 20 }).default('normal'),
	createdAt: timestamp("created_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	updatedAt: timestamp("updated_at", { withTimezone: true, mode: 'string' }).defaultNow(),
	completedAt: timestamp("completed_at", { withTimezone: true, mode: 'string' }),
});
