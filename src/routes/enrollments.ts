import express from 'express';
import { and, desc, eq, getTableColumns, ilike, or, sql } from 'drizzle-orm';
import { enrollments, classes } from '../db/schema/app.js';
import { user } from '../db/schema/auth.js';
import { db } from '../db/index.js';

const router = express.Router();

// Get enrollments for a specific class
router.get('/', async (req, res) => {
  try {
    const { classId, page = 1, limit = 100 } = req.query;

    const normalizeParam = (v: unknown): string | undefined =>
      Array.isArray(v) ? v[0] : typeof v === 'string' ? v : undefined;

    const classIdTerm = normalizeParam(classId);
    const pageParam = normalizeParam(page) ?? '1';
    const limitParam = normalizeParam(limit) ?? '100';
    const currentPage = Math.max(1, Number.parseInt(pageParam, 10) || 1);
    const limitPerPage = Math.min(
      1000,
      Math.max(1, Number.parseInt(limitParam, 10) || 100),
    );

    const offset = (currentPage - 1) * limitPerPage;

    const filterConditions = [];

    if (classIdTerm) {
      filterConditions.push(eq(enrollments.classId, Number.parseInt(classIdTerm, 10)));
    }

    const whereClause =
      filterConditions.length > 0 ? and(...filterConditions) : undefined;

    const countResult = await db
      .select({
        count: sql<number>`count(*)`,
      })
      .from(enrollments)
      .where(whereClause);

    const totalCount = countResult[0]?.count ?? 0;

    const enrollmentsList = await db
      .select({
        ...getTableColumns(enrollments),
        student: { ...getTableColumns(user) },
      })
      .from(enrollments)
      .leftJoin(user, eq(enrollments.studentId, user.id))
      .where(whereClause)
      .orderBy(desc(enrollments.createdAt))
      .limit(limitPerPage)
      .offset(offset);

    res.status(200).json({
      data: enrollmentsList,
      pagination: {
        page: currentPage,
        limit: limitPerPage,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitPerPage),
      },
    });
  } catch (e) {
    console.error(`Get /enrollments error: ${e}`);
    res.status(500).json({ error: 'Failed to get enrollments' });
  }
});

// Enroll a student in a class
router.post('/', async (req, res) => {
  try {
    const { studentId, classId } = req.body;

    // Check capacity
    const [targetClass] = await db
      .select()
      .from(classes)
      .where(eq(classes.id, classId))
      .limit(1);

    if (!targetClass) return res.status(404).json({ error: 'Class not found' });

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(enrollments)
      .where(eq(enrollments.classId, classId));

    const count = countResult[0]?.count ?? 0;

    if (count >= targetClass.capacity) {
      return res.status(400).json({ error: 'Class is full' });
    }

    const [newEnrollment] = await db
      .insert(enrollments)
      .values({ studentId, classId })
      .returning();

    res.status(201).json({ data: newEnrollment });
  } catch (e) {
    if ((e as any).code === '23505') {
      return res.status(400).json({ error: 'Student already enrolled in this class' });
    }
    res.status(500).json({ error: 'Failed to enroll student' });
  }
});

// Unenroll a student (Delete enrollment)
router.delete('/:id', async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

    const [deletedEnrollment] = await db
      .delete(enrollments)
      .where(eq(enrollments.id, id))
      .returning();

    if (!deletedEnrollment) return res.status(404).json({ error: 'Enrollment not found' });

    res.status(200).json({ data: deletedEnrollment });
  } catch (e) {
    res.status(500).json({ error: 'Failed to unenroll student' });
  }
});

export default router;
