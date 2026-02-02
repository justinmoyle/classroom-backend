import { and, desc, eq, getTableColumns, ilike, or, sql } from 'drizzle-orm';
import { departments, subjects, classes, enrollments } from '../db/schema/app.js';
import { user } from '../db/schema/auth.js';
import { db } from '../db/index.js';

export async function getDashboardStats() {
  const enrollmentTrends = await db.select({
    count: sql<number>`count(*)::int`,
    date: sql<string>`DATE(created_at)`
  }).from(enrollments).groupBy(sql`DATE(created_at)` as any).orderBy(sql`DATE(created_at)` as any);

  const classesByDept = await db
    .select({
      departmentName: sql<string>`COALESCE(${departments.name}, 'No Department')`,
      count: sql<number>`count(*)::int`
    })
    .from(classes)
    .leftJoin(subjects, eq(classes.subjectId, subjects.id))
    .leftJoin(departments, eq(subjects.departmentId, departments.id))
    .groupBy(departments.name);

  const userDistribution = await db
    .select({
      role: user.role,
      count: sql<number>`count(*)::int`
    })
    .from(user)
    .groupBy(user.role);

  const capacityStatus = await db
    .select({
      className: classes.name,
      capacity: classes.capacity,
      enrolled: sql<number>`(select count(*)::int from enrollments where class_id = ${classes.id})`
    })
    .from(classes)
    .limit(10);

  const metrics = {
    totalStudents: Number((await db.select({ count: sql<number>`count(*)::int` }).from(user).where(eq(user.role, 'student')))[0]?.count ?? 0),
    totalTeachers: Number((await db.select({ count: sql<number>`count(*)::int` }).from(user).where(eq(user.role, 'teacher')))[0]?.count ?? 0),
    totalClasses: Number((await db.select({ count: sql<number>`count(*)::int` }).from(classes))[0]?.count ?? 0),
    totalEnrollments: Number((await db.select({ count: sql<number>`count(*)::int` }).from(enrollments))[0]?.count ?? 0),
  };

  return {
    enrollmentTrends,
    classesByDept,
    userDistribution,
    capacityStatus,
    metrics
  };
}
