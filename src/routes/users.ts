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

// Create user
router.post('/', async (req, res) => {
  try {
    const { email, name, role, departmentId, image } = req.body;
    const [newUser] = await db
      .insert(user)
      .values({
        id: crypto.randomUUID(),
        email,
        name,
        role,
        departmentId,
        imageCldPubId: image, // Assuming image is public ID for now or adjust as needed
      })
      .returning();

    res.status(201).json({ data: newUser });
  } catch (e) {
    if ((e as any).code === '23505') {
      return res.status(400).json({ error: 'User with this email already exists' });
    }
    res.status(500).json({ error: 'Failed to create user' });
  }
});

// Get one user
router.get('/:id', async (req, res) => {
  try {
    const [foundUser] = await db
      .select({
        ...getTableColumns(user),
        department: { ...getTableColumns(departments) },
      })
      .from(user)
      .leftJoin(departments, eq(user.departmentId, departments.id))
      .where(eq(user.id, req.params.id))
      .limit(1);

    if (!foundUser) return res.status(404).json({ error: 'User not found' });

    res.status(200).json({ data: foundUser });
  } catch (e) {
    res.status(500).json({ error: 'Failed to get user' });
  }
});

// Update user
router.patch('/:id', async (req, res) => {
  try {
    const [updatedUser] = await db
      .update(user)
      .set(req.body)
      .where(eq(user.id, req.params.id))
      .returning();

    if (!updatedUser) return res.status(404).json({ error: 'User not found' });

    res.status(200).json({ data: updatedUser });
  } catch (e) {
    res.status(500).json({ error: 'Failed to update user' });
  }
});

// Delete user
router.delete('/:id', async (req, res) => {
  try {
    const [deletedUser] = await db
      .delete(user)
      .where(eq(user.id, req.params.id))
      .returning();

    if (!deletedUser) return res.status(404).json({ error: 'User not found' });

    res.status(200).json({ data: deletedUser });
  } catch (e) {
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

export default router;
