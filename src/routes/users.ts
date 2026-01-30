import express from 'express';
import { and, desc, eq, getTableColumns, ilike, or, sql } from 'drizzle-orm';
import { departments, user } from '../db/schema/index.js';
import { db } from '../db/index.js';

const router = express.Router();

// Get all users with optional search, filtering and pagination
router.get('/', async (req, res) => {
  try {
    const { search, role, page = 1, limit = 10 } = req.query;

    const normalizeParam = (v: unknown): string | undefined =>
      Array.isArray(v) ? v[0] : typeof v === 'string' ? v : undefined;

    const searchTerm = normalizeParam(search);
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

    // If a search query exists, filter by name or email
    if (searchTerm) {
      filterConditions.push(
        or(
          ilike(user.name, `%${searchTerm}%`),
          ilike(user.email, `%${searchTerm}%`),
        ),
      );
    }

    // If a role query exists, filter by role (exact match)
    if (roleTerm) {
      filterConditions.push(eq(user.role, roleTerm as any));
    }

    // Combine all filters using AND if any exist
    const whereClause =
      filterConditions.length > 0 ? and(...filterConditions) : undefined;

    const countResult = await db
      .select({
        count: sql<number>`count(*)`,
      })
      .from(user)
      .where(whereClause);

    const totalCount = countResult[0]?.count ?? 0;

    const usersList = await db
      .select({
        ...getTableColumns(user),
        department: { ...getTableColumns(departments) },
      })
      .from(user)
      .leftJoin(departments, eq(user.departmentId, departments.id))
      .where(whereClause)
      .orderBy(desc(user.createdAt))
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
