import { NextFunction, Request, Response } from 'express';
import { db } from '../db/index.js';
import { session, user } from '../db/schema/index.js';
import { eq } from 'drizzle-orm';

export const authMiddleware = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }

  const token = authHeader.split(' ')[1];

  try {
    const sessionResult = await db
      .select()
      .from(session)
      .where(token ? eq(session.token, token) : undefined)
      .limit(1);

    const currentSession = sessionResult[0];

    if (!currentSession || currentSession.expiresAt < new Date()) {
      return res.status(401).json({ error: 'Unauthorized: Invalid or expired token' });
    }

    const userResult = await db
      .select()
      .from(user)
      .where(eq(user.id, currentSession.userId))
      .limit(1);

    const currentUser = userResult[0];

    if (!currentUser) {
      return res.status(401).json({ error: 'Unauthorized: User not found' });
    }

    req.user = currentUser;
    next();
  } catch (error) {
    console.error('Auth middleware error:', error);
    res.status(500).json({ error: 'Internal server error during authentication' });
  }
};

export const adminOnly = (req: Request, res: Response, next: NextFunction) => {
  if (!req.user) {
    return res.status(401).json({ error: 'Unauthorized: Authentication required' });
  }
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Forbidden: Admin access required' });
  }
  next();
};
