import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { db } from '../db/index.js';
import * as schema from '../db/schema/index.js';

export const auth = betterAuth({
    database: drizzleAdapter(db, {
        provider: 'pg',
        schema: {
            ...schema,
        },
    }),
    emailAndPassword: {
        enabled: true,
    },
    user: {
        additionalFields: {
            role: {
                type: 'string',
                required: false,
                defaultValue: 'student',
                input: true,
            },
            departmentId: {
                type: 'number',
                required: false,
                input: true,
            },
            imageCldPubId: {
                type: 'string',
                required: false,
                input: true,
            },
        },
    },
    trustedOrigins: (() => {
        const envOrigins = (process.env.FRONTEND_URL || '').split(',').map(o => o.trim()).filter(Boolean);
        if (process.env.NODE_ENV !== 'production') {
            // include common dev ports to avoid origin rejections when Vite changes port
            envOrigins.push('http://localhost:5173', 'http://localhost:5174');
        }
        return envOrigins;
    })(),
    baseURL: process.env.BACKEND_URL || 'http://localhost:8000',
});
