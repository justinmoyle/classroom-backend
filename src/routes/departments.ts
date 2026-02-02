import express from 'express';
import { and, desc, eq, getTableColumns, ilike, or, sql } from 'drizzle-orm';
import { departments, subjects, classes, enrollments } from '../db/schema/index.js';
import { user } from '../db/schema/auth.js';
import { db } from '../db/index.js';

const router = express.Router();

// Get all departments with optional search and pagination
router.get('/', async (req, res) => {
  try {
    const { search, page = 1, limit = 10 } = req.query;

    const normalizeParam = (v: unknown): string | undefined =>
      Array.isArray(v) ? v[0] : typeof v === 'string' ? v : undefined;

    const searchTerm = normalizeParam(search);
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

    if (searchTerm) {
      filterConditions.push(
        or(
          ilike(departments.name, `%${searchTerm}%`),
          ilike(departments.code, `%${searchTerm}%`),
        ),
      );
    }

    const whereClause =
      filterConditions.length > 0 ? and(...filterConditions) : undefined;

    const countResult = await db
      .select({
        count: sql<number>`count(*)`,
      })
      .from(departments)
      .where(whereClause);

    const totalCount = countResult[0]?.count ?? 0;

    const departmentsList = await db
      .select({
        ...getTableColumns(departments),
      })
      .from(departments)
      .where(whereClause)
      .orderBy(desc(departments.createdAt))
      .limit(limitPerPage)
      .offset(offset);

    res.status(200).json({
      data: departmentsList,
      pagination: {
        page: currentPage,
        limit: limitPerPage,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limitPerPage),
      },
    });
  } catch (e) {
    console.error(`Get /departments error: ${e}`);
    res.status(500).json({ error: 'Failed to get departments' });
  }
});

// Get one department
router.get('/:id', async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

    const [department] = await db
      .select()
      .from(departments)
      .where(eq(departments.id, id))
      .limit(1);

    if (!department) return res.status(404).json({ error: 'Department not found' });

    const [subjectCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(subjects)
      .where(eq(subjects.departmentId, id));

    const [classCount] = await db
      .select({ count: sql<number>`count(*)` })
      .from(classes)
      .innerJoin(subjects, eq(classes.subjectId, subjects.id))
      .where(eq(subjects.departmentId, id));

    const [studentCount] = await db
      .select({ count: sql<number>`count(distinct ${enrollments.studentId})` })
      .from(enrollments)
      .innerJoin(classes, eq(enrollments.classId, classes.id))
      .innerJoin(subjects, eq(classes.subjectId, subjects.id))
      .where(eq(subjects.departmentId, id));

    res.status(200).json({
      data: {
        department,
        totals: {
          subjects: Number(subjectCount?.count ?? 0),
          classes: Number(classCount?.count ?? 0),
          enrolledStudents: Number(studentCount?.count ?? 0),
        },
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to get department' });
  }
});

router.get('/:id/subjects', async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    const { page = 1, limit = 10 } = req.query;
    const currentPage = Math.max(1, Number.parseInt(page as string, 10) || 1);
    const limitPerPage = Math.min(100, Math.max(1, Number.parseInt(limit as string, 10) || 10));
    const offset = (currentPage - 1) * limitPerPage;

    const countResult = await db
      .select({ count: sql<number>`count(*)` })
      .from(subjects)
      .where(eq(subjects.departmentId, id));

    const subjectsList = await db
      .select()
      .from(subjects)
      .where(eq(subjects.departmentId, id))
      .limit(limitPerPage)
      .offset(offset);

    res.status(200).json({
      data: subjectsList,
      pagination: {
        page: currentPage,
        limit: limitPerPage,
        total: countResult[0]?.count ?? 0,
        totalPages: Math.ceil((countResult[0]?.count ?? 0) / limitPerPage),
      },
    });
  } catch (e) {
    res.status(500).json({ error: 'Failed to get department subjects' });
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
      .innerJoin(subjects, eq(classes.subjectId, subjects.id))
      .where(eq(subjects.departmentId, id));

    const classesList = await db
      .select({
        ...getTableColumns(classes),
        subject: { ...getTableColumns(subjects) },
        teacher: { ...getTableColumns(user) },
      })
      .from(classes)
      .innerJoin(subjects, eq(classes.subjectId, subjects.id))
      .leftJoin(user, eq(classes.teacherId, user.id))
      .where(eq(subjects.departmentId, id))
      .limit(limitPerPage)
      .offset(offset);

    res.status(200).json({
      data: classesList,
      pagination: {
        page: currentPage,
        limit: limitPerPage,
        total: countResult[0]?.count ?? 0,
        totalPages: Math.ceil((countResult[0]?.count ?? 0) / limitPerPage),
      },
    });
  } catch (e) {
    res.status(500).json({ error: 'Failed to get department classes' });
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
      if (roleFilter) role = roleFilter.value;
    }

    let countQuery;
    let usersQuery;

    if (role === 'student') {
      countQuery = db
        .select({ count: sql<number>`count(distinct ${user.id})` })
        .from(enrollments)
        .innerJoin(classes, eq(enrollments.classId, classes.id))
        .innerJoin(subjects, eq(classes.subjectId, subjects.id))
        .innerJoin(user, eq(enrollments.studentId, user.id))
        .where(eq(subjects.departmentId, id));

      usersQuery = db
        .selectDistinct({ ...getTableColumns(user) })
        .from(enrollments)
        .innerJoin(classes, eq(enrollments.classId, classes.id))
        .innerJoin(subjects, eq(classes.subjectId, subjects.id))
        .innerJoin(user, eq(enrollments.studentId, user.id))
        .where(eq(subjects.departmentId, id))
        .limit(limitPerPage)
        .offset(offset);
    } else if (role === 'teacher') {
      countQuery = db
        .select({ count: sql<number>`count(distinct ${user.id})` })
        .from(classes)
        .innerJoin(subjects, eq(classes.subjectId, subjects.id))
        .innerJoin(user, eq(classes.teacherId, user.id))
        .where(eq(subjects.departmentId, id));

      usersQuery = db
        .selectDistinct({ ...getTableColumns(user) })
        .from(classes)
        .innerJoin(subjects, eq(classes.subjectId, subjects.id))
        .innerJoin(user, eq(classes.teacherId, user.id))
        .where(eq(subjects.departmentId, id))
        .limit(limitPerPage)
        .offset(offset);
    } else {
      // Default fallback or general users
      countQuery = db
        .select({ count: sql<number>`count(*)` })
        .from(user)
        .where(eq(user.department, id.toString())); // Assuming department ID is stored as string in user table based on some projects

      usersQuery = db
        .select()
        .from(user)
        .where(eq(user.department, id.toString()))
        .limit(limitPerPage)
        .offset(offset);
    }

    const [totalResult] = await countQuery;
    const usersList = await usersQuery;

    res.status(200).json({
      data: usersList,
      pagination: {
        page: currentPage,
        limit: limitPerPage,
        total: Number(totalResult?.count ?? 0),
        totalPages: Math.ceil(Number(totalResult?.count ?? 0) / limitPerPage),
      },
    });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Failed to get department users' });
  }
});

// Create department
router.post('/', async (req, res) => {
  try {
    const [newDepartment] = await db
      .insert(departments)
      .values(req.body)
      .returning();

    res.status(201).json({ data: newDepartment });
  } catch (e) {
    res.status(500).json({ error: 'Failed to create department' });
  }
});

// Update department
router.patch('/:id', async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

    const [updatedDepartment] = await db
      .update(departments)
      .set(req.body)
      .where(eq(departments.id, id))
      .returning();

    if (!updatedDepartment) return res.status(404).json({ error: 'Department not found' });

    res.status(200).json({ data: updatedDepartment });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update department' });
  }
});

// Delete department
router.delete('/:id', async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    if (Number.isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

    const [deletedDepartment] = await db
      .delete(departments)
      .where(eq(departments.id, id))
      .returning();

    if (!deletedDepartment) return res.status(404).json({ error: 'Department not found' });

    res.status(200).json({ data: deletedDepartment });
  } catch (e) {
    // Check for foreign key constraint errors
    if ((e as any).code === '23503') {
      return res.status(400).json({ error: 'Cannot delete department with existing subjects or users' });
    }
    res.status(500).json({ error: 'Failed to delete department' });
  }
});

export default router;
