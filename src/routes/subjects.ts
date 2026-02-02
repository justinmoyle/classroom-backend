import express from 'express';
import { and, desc, eq, getTableColumns, ilike, or, sql } from 'drizzle-orm';
import { departments, subjects, classes, enrollments } from '../db/schema/index.js';
import { user } from '../db/schema/auth.js';
import { db } from '../db/index.js';

const router = express.Router();

//Get all subjects with optional search, filtering and pagination
router.get('/', async (req, res) => {
  try {
    const { search, department, page = 1, limit = 10 } = req.query;

    const normalizeParam = (v: unknown): string | undefined =>
      Array.isArray(v) ? v[0] : typeof v === 'string' ? v : undefined;

    const searchTerm = normalizeParam(search);
    const departmentTerm = normalizeParam(department);
    const pageParam = normalizeParam(page) ?? '1';
    const limitParam = normalizeParam(limit) ?? '10';
    const MAX_LIMIT = 100;
    const currentPage = Math.max(1, Number.parseInt(pageParam, 10) || 1);
    const limitPerPage = Math.min(
      MAX_LIMIT,
      Math.max(1, Number.parseInt(limitParam, 10) || 10),
    );

    const offset = (currentPage - 1) * limitPerPage;

    const filterConditions = [];

    // If a search query exists, filter by search name or subject code
    if (searchTerm) {
      filterConditions.push(
        or(
          ilike(subjects.name, `%${searchTerm}%`),
          ilike(subjects.code, `%${searchTerm}%`),
        ),
      );
    }

    // If a department query exists, filter by department ID
    if (departmentTerm) {
      const departmentId = Number.parseInt(departmentTerm, 10);
      if (!Number.isNaN(departmentId)) {
        filterConditions.push(eq(subjects.departmentId, departmentId));
      }
    }

    // Combine all filters using AND if any exist
    const whereClause =
      filterConditions.length > 0 ? and(...filterConditions) : undefined;

    const countResult = await db
      .select({
        count: sql<number>`count(*)`,
      })
      .from(subjects)
      .leftJoin(departments, eq(subjects.departmentId, departments.id))
      .where(whereClause);

    const totalCount = countResult[0]?.count ?? 0;

    const subjectsList = await db
      .select({
        ...getTableColumns(subjects),
        department: { ...getTableColumns(departments) },
      })
      .from(subjects)
      .leftJoin(departments, eq(subjects.departmentId, departments.id))
      .where(whereClause)
      .orderBy(desc(subjects.createdAt))
      .limit(limitPerPage)
      .offset(offset);

    res.status(200).json({
      data: subjectsList,
      pagination: {
        page: currentPage,
        limit: limitPerPage,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitPerPage),
      },
    });
  } catch (e) {
    console.error(`Get /subjects error: ${e}`);
    res.status(500).json({ error: 'Failed to get subjects' });
  }
});

// Get one subject
router.get('/:id', async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

    const [subject] = await db
      .select({
        ...getTableColumns(subjects),
        department: { ...getTableColumns(departments) },
      })
      .from(subjects)
      .leftJoin(departments, eq(subjects.departmentId, departments.id))
      .where(eq(subjects.id, id))
      .limit(1);

    if (!subject) return res.status(404).json({ error: 'Subject not found' });

    const [totals] = await db
      .select({
        classes: sql<number>`count(${classes.id})`,
      })
      .from(classes)
      .where(eq(classes.subjectId, id));

    res.status(200).json({
      data: {
        subject,
        totals: {
          classes: Number(totals?.classes ?? 0),
        },
      },
    });
  } catch (e) {
    res.status(500).json({ error: 'Failed to get subject' });
  }
});

router.get('/:id/classes', async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    const { page = 1, limit = 10 } = req.query;
    const currentPage = Math.max(1, Number.parseInt(page as string, 10) || 1);
    const limitPerPage = Math.min(100, Math.max(1, Number.parseInt(limit as string, 10) || 10));
    const offset = (currentPage - 1) * limitPerPage;

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(classes)
      .where(eq(classes.subjectId, id));

    const totalCount = countResult[0]?.count ?? 0;

    const classesList = await db
      .select({
        ...getTableColumns(classes),
        teacher: { ...getTableColumns(user) },
      })
      .from(classes)
      .leftJoin(user, eq(classes.teacherId, user.id))
      .where(eq(classes.subjectId, id))
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
    res.status(500).json({ error: 'Failed to get subject classes' });
  }
});

router.get('/:id/users', async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    const { page = 1, limit = 10, filters } = req.query;
    const currentPage = Math.max(1, Number.parseInt(page as string, 10) || 1);
    const limitPerPage = Math.min(100, Math.max(1, Number.parseInt(limit as string, 10) || 10));
    const offset = (currentPage - 1) * limitPerPage;

    let role: string | undefined;
    if (Array.isArray(filters)) {
      const roleFilter = filters.find((f: any) => f.field === 'role' && f.operator === 'eq');
      if (roleFilter && typeof roleFilter === 'object' && 'value' in roleFilter) {
        role = roleFilter.value as string;
      }
    }

    // Simplify the query logic for subject users (teachers and students)
    // For students: users enrolled in any class of this subject
    // For teachers: teachers of any class of this subject

    let usersQuery;
    let countQuery;

    if (role === 'student') {
      countQuery = db
        .select({ count: sql<number>`count(distinct ${user.id})` })
        .from(enrollments)
        .innerJoin(classes, eq(enrollments.classId, classes.id))
        .innerJoin(user, eq(enrollments.studentId, user.id))
        .where(eq(classes.subjectId, id));

      usersQuery = db
        .selectDistinct({
          ...getTableColumns(user),
        })
        .from(enrollments)
        .innerJoin(classes, eq(enrollments.classId, classes.id))
        .innerJoin(user, eq(enrollments.studentId, user.id))
        .where(eq(classes.subjectId, id))
        .limit(limitPerPage)
        .offset(offset);
    } else {
      // teacher or all
      const roleCondition = role ? eq(user.role, role as any) : undefined;

      countQuery = db
        .select({ count: sql<number>`count(distinct ${user.id})` })
        .from(classes)
        .innerJoin(user, eq(classes.teacherId, user.id))
        .where(and(eq(classes.subjectId, id), roleCondition));

      usersQuery = db
        .selectDistinct({
          ...getTableColumns(user),
        })
        .from(classes)
        .innerJoin(user, eq(classes.teacherId, user.id))
        .where(and(eq(classes.subjectId, id), roleCondition))
        .limit(limitPerPage)
        .offset(offset);
    }

    const [totalCountResult] = await countQuery;
    const totalCount = Number(totalCountResult?.count ?? 0);
    const usersList = await usersQuery;

    res.status(200).json({
      data: usersList,
      pagination: {
        page: currentPage,
        limit: limitPerPage,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitPerPage),
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to get subject users' });
  }
});

// Create subject
router.post('/', async (req, res) => {
  try {
    const [newSubject] = await db
      .insert(subjects)
      .values(req.body)
      .returning();

    res.status(201).json({ data: newSubject });
  } catch (e) {
    res.status(500).json({ error: 'Failed to create subject' });
  }
});

// Update subject
router.patch('/:id', async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

    const [updatedSubject] = await db
      .update(subjects)
      .set(req.body)
      .where(eq(subjects.id, id))
      .returning();

    if (!updatedSubject) return res.status(404).json({ error: 'Subject not found' });

    res.status(200).json({ data: updatedSubject });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update subject' });
  }
});

// Delete subject
router.delete('/:id', async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

    const [deletedSubject] = await db
      .delete(subjects)
      .where(eq(subjects.id, id))
      .returning();

    if (!deletedSubject) return res.status(404).json({ error: 'Subject not found' });

    res.status(200).json({ data: deletedSubject });
  } catch (e) {
    if ((e as any).code === '23503') {
      return res.status(400).json({ error: 'Cannot delete subject with existing classes' });
    }
    res.status(500).json({ error: 'Failed to delete subject' });
  }
});

export default router;
