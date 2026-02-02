import express from 'express';
import { db } from '../db/index.js';
import { and, desc, eq, getTableColumns, ilike, or, sql } from 'drizzle-orm';
import { subjects, classes, departments, enrollments } from '../db/schema/app.js';
import { user } from '../db/schema/auth.js';

import { getDashboardStats } from '../services/stats.js';

const router = express.Router();

router.get('/stats', async (req, res) => {
  try {
    const stats = await getDashboardStats();
    res.status(200).json({ data: stats });
  } catch (e) {
    console.error(`Get /classes/stats error: ${e}`);
    res.status(500).json({ error: 'Failed to get stats' });
  }
});

router.post('/', async (req, res) => {
  try {
    const [createdClass] = await db
      .insert(classes)
      .values({
        ...req.body,
        inviteCode: Math.random().toString(36).substring(2, 9),
        schedules: [],
      })
      .returning({ id: classes.id });

    if (!createdClass) throw Error;

    res.status(201).json({ data: createdClass });
  } catch (e) {
    console.error(`Post /classes error: ${e}`);
    res.status(500).json({ error: e });
  }
});

router.get('/', async (req, res) => {
  try {
    const { search, subject, teacher, page = 1, limit = 10 } = req.query;
    const normalizeParam = (v: unknown): string | undefined =>
      Array.isArray(v) ? v[0] : typeof v === 'string' ? v : undefined;
    const searchTerm = normalizeParam(search);
    const subjectTerm = normalizeParam(subject);
    const teacherTerm = normalizeParam(teacher);
    const pageParam = normalizeParam(page) ?? '1';
    const limitParam = normalizeParam(limit) ?? '10';
    const MAX_LIMIT = 100;
    const currentPage = Math.max(1, Number.parseInt(pageParam, 10) || 1);
    const limitPerPage = Math.min(
      MAX_LIMIT,
      Math.max(1, Number.parseInt(limitParam, 10) || 10)
    );
    const offset = (currentPage - 1) * limitPerPage;
    const filterConditions = [];

    if (searchTerm) {
      filterConditions.push(
        or(
          ilike(classes.name, `%${searchTerm}%`),
          ilike(classes.inviteCode, `%${searchTerm}%`)
        )
      );
    }

    if (subjectTerm) {
      const subjectId = Number.parseInt(subjectTerm, 10);
      if (!Number.isNaN(subjectId)) {
        filterConditions.push(eq(classes.subjectId, subjectId));
      }
    }

    if (teacherTerm) {
      filterConditions.push(eq(classes.teacherId, teacherTerm));
    }

    const whereClause =
      filterConditions.length > 0 ? and(...filterConditions) : undefined;

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(classes)
      .leftJoin(subjects, eq(classes.subjectId, subjects.id))
      .leftJoin(user, eq(classes.teacherId, user.id))
      .where(whereClause);

    const totalCount = countResult[0]?.count ?? 0;

    const classesList = await db
      .select({
        ...getTableColumns(classes),
        subject: { ...getTableColumns(subjects) },
        teacher: { ...getTableColumns(user) },
      })
      .from(classes)
      .leftJoin(subjects, eq(classes.subjectId, subjects.id))
      .leftJoin(user, eq(classes.teacherId, user.id))
      .where(whereClause)
      .orderBy(desc(classes.createdAt))
      .limit(limitPerPage)
      .offset(offset);

    res.status(200).json({
      data: classesList,
      pagination: {
        page: currentPage,
        limit: limitPerPage,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitPerPage),
      },
    });
  } catch (e) {
    console.error(`Get /classes error: ${e}`);
    res.status(500).json({ error: 'Failed to get classes' });
  }
});

router.get('/:id', async (req, res) => {
  const classId = Number(req.params.id);

  if (!Number.isFinite(classId))
    return res.status(400).json({ error: 'No class found' });

  const [classDetails] = await db
    .select({
      ...getTableColumns(classes),
      subject: { ...getTableColumns(subjects) },
      department: { ...getTableColumns(departments) },
      teacher: { ...getTableColumns(user) },
    })
    .from(classes)
    .leftJoin(subjects, eq(classes.subjectId, subjects.id))
    .leftJoin(user, eq(classes.teacherId, user.id))
    .leftJoin(departments, eq(subjects.departmentId, departments.id))
    .where(eq(classes.id, classId))
    .limit(1);

  if (!classDetails) return res.status(404).json({ error: 'No class found' });

  res.status(200).json({ data: classDetails });
});

// Update class
router.patch('/:id', async (req, res) => {
  try {
    const classId = Number(req.params.id);
    if (!Number.isFinite(classId))
      return res.status(400).json({ error: 'Invalid ID' });

    const [updatedClass] = await db
      .update(classes)
      .set(req.body)
      .where(eq(classes.id, classId))
      .returning();

    if (!updatedClass) return res.status(404).json({ error: 'Class not found' });

    res.status(200).json({ data: updatedClass });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update class' });
  }
});

// Delete class
router.delete('/:id', async (req, res) => {
  try {
    const classId = Number(req.params.id);
    if (!Number.isFinite(classId))
      return res.status(400).json({ error: 'Invalid ID' });

    const [deletedClass] = await db
      .delete(classes)
      .where(eq(classes.id, classId))
      .returning();

    if (!deletedClass) return res.status(404).json({ error: 'Class not found' });

    res.status(200).json({ data: deletedClass });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete class' });
  }
});

export default router;
