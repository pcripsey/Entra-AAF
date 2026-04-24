import { Request, Response, NextFunction } from 'express';

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const sess = (req.session as unknown) as { authenticated?: boolean };
  if (sess.authenticated) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
}
