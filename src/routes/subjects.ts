import express from 'express';
import { and, desc, eq, getTableColumns, ilike, or, sql } from 'drizzle-orm';
import { departments, subjects } from '../db/schema';
import { db } from '../db';

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
      Math.max(1, Number.parseInt(limitParam, 10) || 10)
    );

    const offset = (currentPage - 1) * limitPerPage;

    const filterConditions = [];

    // If a search query exists, filter by search name or subject code
    if (searchTerm) {
      filterConditions.push(
        or(
          ilike(subjects.name, `%${searchTerm}%`),
          ilike(subjects.code, `%${searchTerm}%`)
        )
      );
    }

    // If a department query exists, filter by department name
    if (departmentTerm) {
      const deptPattern = `%${String(departmentTerm).replace(/[%_]/g, '\\$&')}%`;
      filterConditions.push(ilike(departments.name, deptPattern));
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

export default router;
