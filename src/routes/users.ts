import express, { Request, Response } from 'express';
import { and, desc, eq, getTableColumns, sql } from 'drizzle-orm';
import { departments, user } from '../db/schema';
import { db } from '../db';
import { adminOnly } from '../middleware/auth';

const router = express.Router();

// Get all users with optional filtering and pagination
router.get('/', adminOnly, async (req: Request, res: Response) => {
  try {
    const currentUser = req.user;
    const isAdmin = currentUser?.role === 'admin';

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
      filterConditions.push(eq(user.role, roleTerm as any));
    }

    const whereClause =
      filterConditions.length > 0 ? and(...filterConditions) : undefined;

    const countResult = await db
      .select({
        count: sql<string>`count(*)`,
      })
      .from(user)
      .where(whereClause);

    const totalCount = Number(countResult[0]?.count ?? 0);

    const usersList = await db
      .select({
        id: user.id,
        name: user.name,
        image: user.image,
        role: user.role,
        departmentId: user.departmentId,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        ...(isAdmin ? { email: user.email } : {}),
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
