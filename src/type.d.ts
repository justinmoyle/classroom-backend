import {user} from './db/schema';

declare global {
    namespace Express {
        interface Request {
            user?: typeof user.$inferSelect;
        }
    }
}

export type UserRoles = 'admin' | 'teacher' | 'student';

export type RateLimitRole = UserRoles | 'guest';
