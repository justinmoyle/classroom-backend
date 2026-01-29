import { index, integer, jsonb, pgEnum, pgTable, text, timestamp, unique, varchar } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';
import { user } from './auth';

export const classStatusEnum = pgEnum('class_status', [
  'active',
  'inactive',
  'archived',
]);

const timestamps = {
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
};

export const departments = pgTable('departments', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  code: varchar('code', { length: 50 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  description: varchar('description', { length: 255 }),
  ...timestamps,
});

export const subjects = pgTable('subjects', {
  id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
  departmentId: integer('department_id')
    .notNull()
    .references(() => departments.id, { onDelete: 'restrict' }),
  name: varchar('name', { length: 255 }).notNull(),
  code: varchar('code', { length: 50 }).notNull().unique(),
  description: varchar('description', { length: 255 }),
  ...timestamps,
});

export const classes = pgTable(
  'classes',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    subjectId: integer('subject_id')
      .notNull()
      .references(() => subjects.id, { onDelete: 'cascade' }),
    teacherId: text('teacher_id')
      .notNull()
      .references(() => user.id, { onDelete: 'restrict' }),
    inviteCode: varchar('invite_code', { length: 50 }).notNull().unique(),
    name: varchar('name', { length: 255 }).notNull(),
    bannerCldPubId: text('banner_cld_pub_id'),
    bannerUrl: text('banner_url'),
    description: text('description'),
    capacity: integer('capacity').default(50).notNull(),
    status: classStatusEnum('status').default('active').notNull(),
    schedules: jsonb('schedules').$type<any[]>().default([]).notNull(),
    ...timestamps,
  },
  (table) => ({
    subjectIdx: index('classes_subject_id_idx').on(table.subjectId),
    teacherIdx: index('classes_teacher_id_idx').on(table.teacherId),
  }),
);

export const enrollments = pgTable(
  'enrollments',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    studentId: text('student_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    classId: integer('class_id')
      .notNull()
      .references(() => classes.id, { onDelete: 'cascade' }),
    ...timestamps,
  },
  (table) => ({
    studentIdx: index('enrollments_student_id_idx').on(table.studentId),
    classIdx: index('enrollments_class_id_idx').on(table.classId),
    studentClassUnq: unique('enrollments_student_id_class_id_unq').on(
      table.studentId,
      table.classId,
    ),
  }),
);

export const departmentRelations = relations(departments, ({ many }) => ({
  subjects: many(subjects),
  users: many(user),
}));

export const subjectRelations = relations(subjects, ({ one, many }) => ({
  department: one(departments, {
    fields: [subjects.departmentId],
    references: [departments.id],
  }),
  classes: many(classes),
}));

export const userRelations = relations(user, ({ one, many }) => ({
  department: one(departments, {
    fields: [user.departmentId],
    references: [departments.id],
  }),
  classes: many(classes),
  enrollments: many(enrollments),
}));

export const classRelations = relations(classes, ({ one, many }) => ({
  subject: one(subjects, {
    fields: [classes.subjectId],
    references: [subjects.id],
  }),
  teacher: one(user, {
    fields: [classes.teacherId],
    references: [user.id],
  }),
  enrollments: many(enrollments),
}));

export const enrollmentRelations = relations(enrollments, ({ one }) => ({
  student: one(user, {
    fields: [enrollments.studentId],
    references: [user.id],
  }),
  class: one(classes, {
    fields: [enrollments.classId],
    references: [classes.id],
  }),
}));

export type Department = typeof departments.$inferSelect;
export type NewDepartment = typeof departments.$inferInsert;

export type Subject = typeof subjects.$inferSelect;
export type NewSubject = typeof subjects.$inferInsert;

export type User = typeof user.$inferSelect;
export type NewUser = typeof user.$inferInsert;

export type Class = typeof classes.$inferSelect;
export type NewClass = typeof classes.$inferInsert;

export type Enrollment = typeof enrollments.$inferSelect;
export type NewEnrollment = typeof enrollments.$inferInsert;
