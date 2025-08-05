import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET || "secret";

// Extend Request type
export interface AuthRequest extends Request {
  user?: string;
}

interface JwtPayload {
  id: string;
}

export const protect = (req: AuthRequest, res: Response, next: NextFunction) => {
  // Get token from headers
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.warn("❌ No Authorization header provided");
    return res.status(401).json({ error: "Not authorized, no token" });
  }

  const token = authHeader.split(" ")[1];
  console.log("➡️ Incoming token:", token);

  try {
    // Verify token
    const decoded = jwt.verify(token, JWT_SECRET) as JwtPayload;
    console.log("✅ Decoded JWT:", decoded);

    // Attach user ID from token
    req.user = decoded.id;
    next();
  } catch (err: any) {
    console.error("❌ JWT verification failed:", err.message || err);
    return res.status(401).json({ error: "Token invalid" });
  }
};
