import { Request, Response, NextFunction } from "express";
import jwt, { JwtPayload as DefaultJwtPayload } from "jsonwebtoken";

import dotenv from "dotenv";
dotenv.config(); // 🟢 MUST be called before using process.env


if (!process.env.JWT_SECRET) {
  throw new Error("❌ JWT_SECRET is not defined in environment variables");
}

const JWT_SECRET = process.env.JWT_SECRET as string;

export interface AuthRequest extends Request {
  user?: string;
}

interface JwtPayload extends DefaultJwtPayload {
  id: string;
}

export const protect = (req: AuthRequest, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.warn("❌ No Authorization header provided");
    return res.status(401).json({ error: "Not authorized, no token" });
  }

  const token = authHeader.split(" ")[1];
  console.log("➡️ Incoming token:", token);

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;

    if (!decoded || typeof decoded !== "object" || !("id" in decoded)) {
      throw new Error("Invalid token payload structure");
    }

    console.log("✅ Decoded JWT:", decoded);
    req.user = decoded.id;
    next();
  } catch (err: any) {
    console.error("❌ JWT verification failed:", err.message);
    return res.status(401).json({ error: "Token invalid", details: err.message });
  }
};
