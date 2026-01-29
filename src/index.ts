import AgentAPI from 'apminsight';
import express, { NextFunction, Request, Response } from 'express';
import subjectsRouter from './routes/subjects';
import usersRouter from './routes/users';
import cors from 'cors';
import { authMiddleware } from './middleware/auth';
import securityMiddleware from './middleware/security';

AgentAPI.config();

const app = express();
const PORT = 8000;

const FRONTEND_URL = process.env.FRONTEND_URL;
if (!FRONTEND_URL) {
  throw new Error('FRONTEND_URL is not defined');
}

app.use(
  cors({
    origin: FRONTEND_URL,
    methods: ['GET', 'POST', 'PUT', 'DELETE'],
    credentials: true,
  }),
);

app.use(express.json());

app.use((req: Request, res: Response, next: NextFunction) => {
  authMiddleware(req, res, next);
});
app.use(securityMiddleware);

app.use('/api/subjects', subjectsRouter);
app.use('/api/users', usersRouter);

app.get('/', (req, res) => {
  res.send('Hello from the classroom backend!');
});

app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
