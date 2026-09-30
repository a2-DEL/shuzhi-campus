import { relations } from "drizzle-orm/relations";
import { users, dormitories, dormInspections, lostFound, notifications, repairOrders, classrooms, classroomBookings, visitors, materials, materialRequests, operationLogs } from "./schema";

export const dormitoriesRelations = relations(dormitories, ({one, many}) => ({
	user: one(users, {
		fields: [dormitories.managerId],
		references: [users.id]
	}),
	dormInspections: many(dormInspections),
	visitors: many(visitors),
}));

export const usersRelations = relations(users, ({many}) => ({
	dormitories: many(dormitories),
	dormInspections: many(dormInspections),
	lostFounds_reporterId: many(lostFound, {
		relationName: "lostFound_reporterId_users_id"
	}),
	lostFounds_claimerId: many(lostFound, {
		relationName: "lostFound_claimerId_users_id"
	}),
	notifications: many(notifications),
	repairOrders_reporterId: many(repairOrders, {
		relationName: "repairOrders_reporterId_users_id"
	}),
	repairOrders_assigneeId: many(repairOrders, {
		relationName: "repairOrders_assigneeId_users_id"
	}),
	classroomBookings_applicantId: many(classroomBookings, {
		relationName: "classroomBookings_applicantId_users_id"
	}),
	classroomBookings_reviewerId: many(classroomBookings, {
		relationName: "classroomBookings_reviewerId_users_id"
	}),
	materialRequests_requesterId: many(materialRequests, {
		relationName: "materialRequests_requesterId_users_id"
	}),
	materialRequests_reviewerId: many(materialRequests, {
		relationName: "materialRequests_reviewerId_users_id"
	}),
	operationLogs: many(operationLogs),
}));

export const dormInspectionsRelations = relations(dormInspections, ({one}) => ({
	dormitory: one(dormitories, {
		fields: [dormInspections.dormitoryId],
		references: [dormitories.id]
	}),
	user: one(users, {
		fields: [dormInspections.inspectorId],
		references: [users.id]
	}),
}));

export const lostFoundRelations = relations(lostFound, ({one}) => ({
	user_reporterId: one(users, {
		fields: [lostFound.reporterId],
		references: [users.id],
		relationName: "lostFound_reporterId_users_id"
	}),
	user_claimerId: one(users, {
		fields: [lostFound.claimerId],
		references: [users.id],
		relationName: "lostFound_claimerId_users_id"
	}),
}));

export const notificationsRelations = relations(notifications, ({one}) => ({
	user: one(users, {
		fields: [notifications.publisherId],
		references: [users.id]
	}),
}));

export const repairOrdersRelations = relations(repairOrders, ({one}) => ({
	user_reporterId: one(users, {
		fields: [repairOrders.reporterId],
		references: [users.id],
		relationName: "repairOrders_reporterId_users_id"
	}),
	user_assigneeId: one(users, {
		fields: [repairOrders.assigneeId],
		references: [users.id],
		relationName: "repairOrders_assigneeId_users_id"
	}),
}));

export const classroomBookingsRelations = relations(classroomBookings, ({one}) => ({
	classroom: one(classrooms, {
		fields: [classroomBookings.classroomId],
		references: [classrooms.id]
	}),
	user_applicantId: one(users, {
		fields: [classroomBookings.applicantId],
		references: [users.id],
		relationName: "classroomBookings_applicantId_users_id"
	}),
	user_reviewerId: one(users, {
		fields: [classroomBookings.reviewerId],
		references: [users.id],
		relationName: "classroomBookings_reviewerId_users_id"
	}),
}));

export const classroomsRelations = relations(classrooms, ({many}) => ({
	classroomBookings: many(classroomBookings),
}));

export const visitorsRelations = relations(visitors, ({one}) => ({
	dormitory: one(dormitories, {
		fields: [visitors.dormitoryId],
		references: [dormitories.id]
	}),
}));

export const materialRequestsRelations = relations(materialRequests, ({one}) => ({
	material: one(materials, {
		fields: [materialRequests.materialId],
		references: [materials.id]
	}),
	user_requesterId: one(users, {
		fields: [materialRequests.requesterId],
		references: [users.id],
		relationName: "materialRequests_requesterId_users_id"
	}),
	user_reviewerId: one(users, {
		fields: [materialRequests.reviewerId],
		references: [users.id],
		relationName: "materialRequests_reviewerId_users_id"
	}),
}));

export const materialsRelations = relations(materials, ({many}) => ({
	materialRequests: many(materialRequests),
}));

export const operationLogsRelations = relations(operationLogs, ({one}) => ({
	user: one(users, {
		fields: [operationLogs.userId],
		references: [users.id]
	}),
}));