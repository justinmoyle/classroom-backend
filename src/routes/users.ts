import express from 'express';
import { and, desc, eq, getTableColumns, sql } from 'drizzle-orm';
import { departments, users } from '../db/schema';
import { db } from '../db';

const router = express.Router();

// Get all users with optional filtering and pagination
router.get('/', async (req, res) => {
  try {
    const { role, page = 1, limit = 10 } = req.query;

    const normalizeParam = (v: unknown): string | undefined =>
      Array.isArray(v) ? v[0] : typeof v === 'string' ? v : undefined;

    const roleTerm = normalizeParam(role);
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

    if (roleTerm) {
      filterConditions.push(eq(users.role, roleTerm));
    }

    const whereClause =
      filterConditions.length > 0 ? and(...filterConditions) : undefined;

    const countResult = await db
      .select({
        count: sql<number>`count(*)`,
      })
      .from(users)
      .where(whereClause);

    const totalCount = countResult[0]?.count ?? 0;

    const usersList = await db
      .select({
        ...getTableColumns(users),
        department: { ...getTableColumns(departments) },
      })
      .from(users)
      .leftJoin(departments, eq(users.departmentId, departments.id))
      .where(whereClause)
      .orderBy(desc(users.createdAt))
      .limit(limitPerPage)
      .offset(offset);

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
    console.error(`Get /users error: ${e}`);
    res.status(500).json({ error: 'Failed to get users' });
  }
});

export default router;
