import { Router, type Response } from "express";
import { isValidObjectId } from "mongoose";
import type { AuthRequest } from "../middleware/authMiddleware";
import { protect } from "../middleware/authMiddleware";
import {
  createGoal,
  listGoals,
  getGoal,
  updateGoal,
  deleteGoal,
  addContribution,
  removeContribution,
  recalculate,
  rollover,
} from "../services/goalsService";

const router = Router();

/* Create */
router.post("/", protect, (req: AuthRequest, res: Response) => createGoal(req, res));

/* List (optional filters: ?type=&status=) */
router.get("/", protect, (req: AuthRequest, res: Response) => listGoals(req, res));

/* Get one */
router.get("/:id", protect, (req: AuthRequest, res: Response) => getGoal(req, res));

/* Update (partial) */
router.patch("/:id", protect, (req: AuthRequest, res: Response) => updateGoal(req, res));

/* Delete */
router.delete("/:id", protect, (req: AuthRequest, res: Response) => deleteGoal(req, res));

/* Contributions */
router.post("/:id/contributions", protect, (req: AuthRequest, res: Response) => addContribution(req, res));
router.delete("/:id/contributions/:contribId", protect, (req: AuthRequest, res: Response) => removeContribution(req, res));

/* Utilities */
router.post("/:id/recalculate", protect, (req: AuthRequest, res: Response) => recalculate(req, res));
router.post("/:id/rollover", protect, (req: AuthRequest, res: Response) => rollover(req, res));

export default router;
