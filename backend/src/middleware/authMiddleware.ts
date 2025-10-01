import { Request, Response, NextFunction } from "express";
import jwt, { JwtPayload as DefaultJwtPayload } from "jsonwebtoken";
import dotenv from "dotenv";

dotenv.config();

if (!process.env.JWT_SECRET) {
  throw new Error("❌ JWT_SECRET is not defined in environment variables");
}

const JWT_SECRET = process.env.JWT_SECRET as string;

/**
 * Authenticated Request type
 * - Keeps Express' built-in body/params/query
 * - Adds optional `user` property
 */
export interface AuthRequest<
  P = any,
  ResBody = any,
  ReqBody = any,
  ReqQuery = any
> extends Request<P, ResBody, ReqBody, ReqQuery> {
  user?: string;
}

interface JwtPayload extends DefaultJwtPayload {
  id: string;
}

export const protect = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Not authorized, no token" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    req.user = decoded.id;
    next();
  } catch (err: any) {
    return res.status(401).json({ error: "Token invalid", details: err.message });
  }
};

// For Server-Sent Events
export const protectSse = (req: AuthRequest, res: Response, next: NextFunction) => {
  const token = (req.query.token as string) || "";
  if (!token) return res.status(401).json({ error: "Not authorized, no token" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    req.user = decoded.id;
    next();
  } catch (err: any) {
    return res.status(401).json({ error: "Token invalid", details: err.message });
  }
};
