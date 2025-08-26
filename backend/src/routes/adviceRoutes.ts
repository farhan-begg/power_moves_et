// routes/adviceRoutes.ts
import { Router, Response } from "express";
import mongoose from "mongoose";
import { protect, AuthRequest } from "../middleware/authMiddleware";
import Groq from "groq-sdk";

const router = Router();

// ---------- Types sent from the client ----------
type MetricsPayload = {
  currency?: string;
  netWorth?: number;
  assets?: number;
  debts?: number;
  investable?: number;
  emergencyFundMonths?: number;
  expenseMonthlyAvg?: number;
  incomeMonthlyAvg?: number;
  savingsRatePct?: number;
  debtBreakdown?: Array<{ name: string; ratePct?: number; balance: number }>;
  holdings?: Array<{ symbol: string; name?: string; value: number; pct?: number }>;
  goals?: Array<{ label: string; horizon: "short" | "medium" | "long"; target?: number }>;
  riskTolerance?: "conservative" | "balanced" | "growth" | "aggressive";
  notes?: string;
};

function getUserIdOr401(req: AuthRequest, res: Response) {
  const raw = (req.user ?? "").toString();
  if (!raw || !mongoose.isValidObjectId(raw)) {
    res.status(401).json({ error: "Unauthorized (missing/invalid user id)" });
    return null;
  }
  return new mongoose.Types.ObjectId(raw);
}

// Groq client (SDK)
const groqKey = process.env.GROQ_API_KEY || "";
const groq = new Groq({ apiKey: groqKey });

router.post("/", protect, async (req: AuthRequest, res: Response) => {
  try {
    const userId = getUserIdOr401(req, res);
    if (!userId) return;

    if (!groqKey) {
      return res.status(500).json({ error: "Server missing GROQ_API_KEY" });
    }

    const metrics = (req.body || {}) as MetricsPayload;

    // Guardrails: need at least net worth or assets/debts
    if (typeof metrics.netWorth !== "number" && typeof metrics.assets !== "number") {
      return res.status(400).json({ error: "Provide at least netWorth or assets/debts." });
    }

    const currency = metrics.currency || "USD";
    const sys =
      "You are a helpful financial planning assistant. Provide educational, general guidance only—NOT financial, investment, tax, or legal advice. Keep the tone practical and concise. Use bullet points. When recommending allocations, use ranges (e.g., 20–30%) and explain tradeoffs. Consider liquidity needs, emergency funds, debt payoff order, savings rate, and diversification. Reference values in the user's currency. If data is missing, state an assumption briefly rather than invent precise numbers.";

    const u = [
      `User metrics (currency: ${currency}):`,
      `- Net worth: ${formatN(metrics.netWorth)}; Assets: ${formatN(metrics.assets)}; Debts: ${formatN(metrics.debts)}`,
      `- Investable (cash/brokerage): ${formatN(metrics.investable)}`,
      `- Income/mo: ${formatN(metrics.incomeMonthlyAvg)}; Expense/mo: ${formatN(metrics.expenseMonthlyAvg)}; Savings rate: ${fmtPct(metrics.savingsRatePct)}`,
      `- Emergency fund: ~${metrics.emergencyFundMonths ?? "?"} months`,
      `- Debts: ${metrics.debtBreakdown?.map(d => `${d.name} (${fmtPct(d.ratePct)} APR): ${formatN(d.balance)}`).join("; ") || "n/a"}`,
      `- Holdings: ${
        metrics.holdings?.slice(0, 10)
          .map(h => `${h.symbol || h.name}: ${formatN(h.value)}${h.pct != null ? ` (${fmtPct(h.pct)})` : ""}`)
          .join("; ") || "n/a"
      }`,
      `- Goals: ${
        metrics.goals?.map(g => `${g.label} (${g.horizon})${g.target ? ` target ${formatN(g.target)}` : ""}`).join("; ") || "n/a"
      }`,
      `- Risk: ${metrics.riskTolerance || "balanced"}`,
      metrics.notes ? `- Notes: ${metrics.notes}` : "",
      "",
      "Please provide:",
      "1) A quick status (liquidity, risk, concentration, runway).",
      "2) Action plan (next 30/90/365 days) with bullets.",
      "3) Savings & budgeting levers (specific, ranked by impact).",
      "4) Debt strategy (if any) using avalanche/snowball and why.",
      "5) High-level target allocation ranges aligned to risk tolerance.",
      "6) Rebalancing cadence and rules of thumb.",
      "7) Key risks/what to monitor.",
      "Keep it under ~350 words. One-line disclaimer max.",
    ].join("\n");

    // Call Groq (OpenAI-compatible chat completions via SDK)
    const completion = await groq.chat.completions.create({
      model: "llama3-70b-8192", // alternatives: "llama3-8b-8192", "mixtral-8x7b-32768"
      temperature: 0.5,
      messages: [
        { role: "system", content: sys },
        { role: "user", content: u },
      ],
    });

    // ✅ Groq SDK returns choices[].message.content (no `text` field on types)
    const content =
      (completion.choices?.[0]?.message?.content ?? "").toString().trim() ||
      "No advice generated.";

    res.json({ advice: content });
  } catch (e: any) {
    console.error("❌ [POST /api/advice] Groq error:", e?.response?.data || e?.message || e);
    res.status(502).json({ error: "AI provider error", detail: "Please retry shortly." });
  }
});

// ---------- helpers ----------
function formatN(n?: number) {
  if (typeof n !== "number" || !isFinite(n)) return "n/a";
  return new Intl.NumberFormat(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(n);
}
function fmtPct(p?: number) {
  if (typeof p !== "number" || !isFinite(p)) return "n/a";
  return `${p.toFixed(1)}%`;
}

export default router;
