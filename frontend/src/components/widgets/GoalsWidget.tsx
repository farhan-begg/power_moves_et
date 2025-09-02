// src/components/widgets/GoalsWidget.tsx
import React, { useMemo, useState } from "react";
import { useSelector } from "react-redux";
import type { RootState } from "../../app/store";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  fetchGoals,
  createGoal,
  updateGoal,
  deleteGoal,
  addGoalContribution,
  recalcGoal,
  rolloverGoal,
  type Goal,
} from "../../api/goals";
import {
  ArrowPathIcon,
  PlusIcon,
  PencilSquareIcon,
  TrashIcon,
  XMarkIcon,
  CheckIcon,
} from "@heroicons/react/24/outline";

const money = (n: number, c = "USD") => {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency: c, maximumFractionDigits: 2 }).format(n);
  } catch {
    return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
};

export default function GoalsWidget({ className = "" }: { className?: string }) {
  const token =
    useSelector((s: RootState) => s.auth.token) ??
    (typeof window !== "undefined" ? localStorage.getItem("token") : "") ??
    "";

  const qc = useQueryClient();

  /* -------------------- Queries -------------------- */
  const { data: goals = [], isLoading, error } = useQuery({
    queryKey: ["goals", "list"],
    queryFn: () => fetchGoals(token),
    enabled: !!token,
    staleTime: 60_000,
  });

  /* -------------------- Mutations -------------------- */
  const mCreate = useMutation({
    mutationFn: (body: Parameters<typeof createGoal>[1]) => createGoal(token, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["goals"] }),
  });
  const mPatch = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<Goal> }) => updateGoal(token, id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["goals"] }),
  });
  const mDelete = useMutation({
    mutationFn: (id: string) => deleteGoal(token, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["goals"] }),
  });
  const mAddContrib = useMutation({
    mutationFn: ({ id, amount }: { id: string; amount: number }) =>
      addGoalContribution(token, id, { amount, source: "manual" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["goals"] }),
  });
  const mRecalc = useMutation({
    mutationFn: (id: string) => recalcGoal(token, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["goals"] }),
  });
  const mRollover = useMutation({
    mutationFn: (id: string) => rolloverGoal(token, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["goals"] }),
  });

  /* -------------------- Quick Create -------------------- */
  const [form, setForm] = useState({ name: "", type: "savings", targetAmount: "", currency: "USD" });
  const onCreate = async () => {
    if (!form.name || !form.targetAmount) return;
    const amt = Number(form.targetAmount);
    if (!isFinite(amt) || amt <= 0) return;
    await mCreate.mutateAsync({
      name: form.name.trim(),
      type: form.type as Goal["type"],
      targetAmount: amt,
      currency: (form.currency || "USD").toUpperCase(),
    });
    setForm({ name: "", type: "savings", targetAmount: "", currency: "USD" });
  };

  /* -------------------- Inline edit -------------------- */
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTarget, setEditTarget] = useState<string>("");

  /* -------------------- Custom contrib -------------------- */
  const [customAmt, setCustomAmt] = useState<Record<string, string>>({});
  const commitCustom = async (g: Goal) => {
    const raw = customAmt[g._id] ?? "";
    const val = Number(raw);
    if (!isFinite(val) || val <= 0) return;
    await mAddContrib.mutateAsync({ id: g._id, amount: val });
    setCustomAmt((s) => ({ ...s, [g._id]: "" }));
  };

  /* -------------------- Totals -------------------- */
  const totals = useMemo(() => {
    const actives = goals.filter((g) => g.status === "active" && g.type !== "spending_limit");
    const saved = actives.reduce((s, g) => s + (g.currentAmount || 0), 0);
    const remaining = actives.reduce((s, g) => s + Math.max(0, (g.targetAmount || 0) - (g.currentAmount || 0)), 0);
    return { saved, remaining, currency: actives[0]?.currency || "USD" };
  }, [goals]);

  const overallPositive = (totals.saved || 0) >= (totals.remaining || 0);

  return (
    <Card className={[className, isLoading ? "opacity-[0.88]" : "opacity-100"].join(" ")}>
      <Glow positive={overallPositive} />

      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-white/90">Goals</h3>
        <div className="flex items-center gap-2">
          {isLoading && <ArrowPathIcon className="h-4 w-4 animate-spin text-white/70" />}
          <Btn kind="ghost" onClick={() => qc.invalidateQueries({ queryKey: ["goals"] })}>
            <ArrowPathIcon className="h-4 w-4" /> Refresh
          </Btn>
        </div>
      </div>

      {error && <div className="mt-3 text-sm text-rose-300">Failed to load goals</div>}

      {/* Quick Create (glass) */}
      <FormCard title="Create goal">
        <div className="grid gap-3 md:grid-cols-6">
          <Field className="md:col-span-2">
            <Label>Name</Label>
            <Input
              placeholder="Emergency Fund"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </Field>

          <Field>
            <Label>Type</Label>
            <Select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
            >
              <option value="savings">Savings</option>
              <option value="emergency_fund">Emergency Fund</option>
              <option value="spending_limit">Spending Limit</option>
              <option value="debt_paydown">Debt Paydown</option>
              <option value="investment">Investment</option>
              <option value="custom">Custom</option>
            </Select>
          </Field>

          <Field>
            <Label>Target</Label>
            <Input
              inputMode="decimal"
              placeholder="0.00"
              value={form.targetAmount}
              onChange={(e) => setForm({ ...form, targetAmount: e.target.value })}
              onBlur={() =>
                setForm((f) => {
                  if (!f.targetAmount) return f;
                  const n = Number(f.targetAmount);
                  return isFinite(n) && n > 0 ? { ...f, targetAmount: n.toFixed(2) } : f;
                })
              }
              prefix="$"
              aria-invalid={
                form.targetAmount !== "" &&
                (!isFinite(Number(form.targetAmount)) || Number(form.targetAmount) <= 0)
                  ? true
                  : undefined
              }
            />
          </Field>

          <Field>
            <Label>Currency</Label>
            <Input
              placeholder="USD"
              value={form.currency}
              onChange={(e) => setForm({ ...form, currency: e.target.value })}
            />
          </Field>

          <div className="flex items-end">
            <Btn
              onClick={onCreate}
              disabled={
                mCreate.isPending ||
                !form.name ||
                !form.targetAmount ||
                !isFinite(Number(form.targetAmount)) ||
                Number(form.targetAmount) <= 0
              }
            >
              <PlusIcon className="h-4 w-4" /> Add
            </Btn>
          </div>
        </div>
      </FormCard>

      {/* List */}
      <div className="mt-3 space-y-3">
        {goals.map((g) => {
          const pct = Math.min(100, Math.max(0, (g.currentAmount / Math.max(1, g.targetAmount)) * 100));
          const isEditing = editingId === g._id;

          return (
            <div key={g._id} className="rounded-xl border border-white/10 bg-white/5 p-3 ring-1 ring-white/10">
              {/* Header */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <div className="font-medium text-white truncate">{g.name}</div>
                    <span
                      className={[
                        "rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ring-1",
                        g.status === "completed"
                          ? "bg-emerald-400/10 text-emerald-200 ring-emerald-400/20"
                          : g.status === "paused"
                          ? "bg-amber-400/10 text-amber-200 ring-amber-400/20"
                          : "bg-white/10 text-white/70 ring-white/15",
                      ].join(" ")}
                    >
                      {g.status}
                    </span>
                  </div>
                  <div className="text-[11px] text-white/60 mt-0.5">
                    {g.type.replace(/_/g, " ")} • {g.currency}
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {!isEditing ? (
                    <>
                      <IconBtn
                        title="Edit target"
                        onClick={() => {
                          setEditingId(g._id);
                          setEditTarget(String(g.targetAmount ?? ""));
                        }}
                      >
                        <PencilSquareIcon className="h-4 w-4" />
                      </IconBtn>
                      <IconBtn title="Recalculate" onClick={() => mRecalc.mutate(g._id)}>
                        <ArrowPathIcon className="h-4 w-4" />
                      </IconBtn>
                      <IconBtn title="Delete" onClick={() => mDelete.mutate(g._id)}>
                        <TrashIcon className="h-4 w-4" />
                      </IconBtn>
                    </>
                  ) : (
                    <>
                      <input
                        className="w-28 rounded-md bg-white/10 px-2 py-1 text-xs text-white ring-1 ring-white/15 focus:outline-none focus:ring-2 focus:ring-white/25"
                        value={editTarget}
                        onChange={(e) => setEditTarget(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            const val = Number(editTarget);
                            if (isFinite(val) && val > 0) {
                              mPatch.mutate({ id: g._id, patch: { targetAmount: val } });
                              setEditingId(null);
                            }
                          }
                        }}
                      />
                      <IconBtn
                        title="Save"
                        onClick={() => {
                          const val = Number(editTarget);
                          if (isFinite(val) && val > 0) {
                            mPatch.mutate({ id: g._id, patch: { targetAmount: val } });
                            setEditingId(null);
                          }
                        }}
                      >
                        <CheckIcon className="h-4 w-4" />
                      </IconBtn>
                      <IconBtn title="Cancel" onClick={() => setEditingId(null)}>
                        <XMarkIcon className="h-4 w-4" />
                      </IconBtn>
                    </>
                  )}
                </div>
              </div>

              {/* Progress */}
              <div className="mt-2">
                <div className="h-2 w-full rounded-full bg-white/10">
                  <div className="h-2 rounded-full bg-emerald-400/70" style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-1 text-[11px] text-white/70">
                  {money(g.currentAmount, g.currency)} / {money(g.targetAmount, g.currency)} ({Math.round(pct)}%)
                </div>
              </div>

              {/* Quick actions */}
              {g.type !== "spending_limit" && g.status !== "completed" && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <Btn onClick={() => mAddContrib.mutate({ id: g._id, amount: 100 })}>+100</Btn>
                  <Btn onClick={() => mAddContrib.mutate({ id: g._id, amount: 500 })}>+500</Btn>

                  {/* Custom amount */}
                  <div className="flex items-center gap-2">
                    <Input
                      prefix="$"
                      inputMode="decimal"
                      placeholder="0.00"
                      value={customAmt[g._id] ?? ""}
                      onChange={(e) => setCustomAmt((s) => ({ ...s, [g._id]: e.target.value }))}
                      onBlur={() =>
                        setCustomAmt((s) => {
                          const v = s[g._id];
                          if (!v) return s;
                          const n = Number(v);
                          return isFinite(n) && n > 0 ? { ...s, [g._id]: n.toFixed(2) } : s;
                        })
                      }
                      onKeyDown={(e) => {
                        if (e.key === "Enter") commitCustom(g);
                      }}
                      aria-invalid={
                        customAmt[g._id] &&
                        (!isFinite(Number(customAmt[g._id])) || Number(customAmt[g._id]) <= 0)
                          ? true
                          : undefined
                      }
                      className="w-28"
                    />
                    <Btn
                      onClick={() => commitCustom(g)}
                      disabled={
                        mAddContrib.isPending ||
                        !customAmt[g._id] ||
                        !isFinite(Number(customAmt[g._id])) ||
                        Number(customAmt[g._id]) <= 0
                      }
                    >
                      Add
                    </Btn>
                  </div>
                </div>
              )}

              {/* Spending limit helpers */}
              {g.type === "spending_limit" && (
                <div className="mt-2 text-sm flex flex-wrap items-center gap-2 text-white/80">
                  <span>
                    Spent: <b className="text-white">{money(g.currentAmount, g.currency)}</b>
                  </span>
                  <span>•</span>
                  <span>
                    Remaining:{" "}
                    <b className="text-white">
                      {money(Math.max(0, g.targetAmount - g.currentAmount), g.currency)}
                    </b>
                  </span>
                  <Btn kind="ghost" className="ml-auto" onClick={() => mRollover.mutate(g._id)}>
                    Rollover
                  </Btn>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Totals */}
      <div className="mt-4 grid grid-cols-2 gap-3">
        <Pill label="Saved (active)" value={money(totals.saved, totals.currency)} kind="positive" />
        <Pill label="Remaining to targets" value={money(totals.remaining, totals.currency)} kind="neutral" />
      </div>
    </Card>
  );
}

/* ===================== Glass micro-components ===================== */
function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={[
        "relative overflow-hidden rounded-2xl border border-white/10 bg-white/5 backdrop-blur-md p-5 ring-1 ring-white/10 shadow-xl",
        "transition-shadow hover:shadow-2xl",
        className,
      ].join(" ")}
    >
      {children}
    </div>
  );
}

function Glow({ positive }: { positive: boolean }) {
  return (
    <div
      className="pointer-events-none absolute -top-16 -right-16 h-48 w-48 rounded-full blur-3xl opacity-20"
      style={{
        background: positive
          ? "radial-gradient(60% 60% at 50% 50%, rgba(16,185,129,.35), transparent)"
          : "radial-gradient(60% 60% at 50% 50%, rgba(59,130,246,.35), transparent)",
      }}
    />
  );
}

function Pill({
  label,
  value,
  kind,
}: {
  label: string;
  value: string;
  kind: "positive" | "neutral";
}) {
  const styles =
    kind === "positive"
      ? "bg-emerald-400/10 text-emerald-200 ring-emerald-400/20"
      : "bg-white/10 text-white/80 ring-white/15";
  return (
    <div
      className={[
        "flex items-center justify-between rounded-xl px-3 py-2 ring-1",
        "shadow-inner shadow-black/5",
        styles,
      ].join(" ")}
    >
      <span className="text-xs text-white/70">{label}</span>
      <span className="font-mono tabular-nums text-sm text-white">{value}</span>
    </div>
  );
}

function Btn({
  children,
  onClick,
  className = "",
  disabled,
  kind = "solid",
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
  disabled?: boolean;
  kind?: "solid" | "ghost";
}) {
  const cls =
    kind === "solid"
      ? "bg-white/10 hover:bg-white/15 focus:ring-white/20"
      : "bg-transparent hover:bg-white/10 focus:ring-white/20";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={[
        "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-xs text-white focus:outline-none focus:ring-2",
        cls,
        disabled ? "opacity-50 cursor-not-allowed" : "",
        className,
      ].join(" ")}
    >
      {children}
    </button>
  );
}

function IconBtn({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  title?: string;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className="inline-flex items-center justify-center rounded-md p-1.5 text-white/80 hover:text-white hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-white/20"
    >
      {children}
    </button>
  );
}

function FormCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-3 rounded-2xl border border-white/10 bg-white/5 p-4 ring-1 ring-white/10 shadow-lg">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-white/90">{title}</h4>
      </div>
      <Divider />
      {children}
    </div>
  );
}

function Field({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={["flex flex-col gap-1", className].join(" ")}>{children}</div>;
}
function Label({ children }: { children: React.ReactNode }) {
  return <label className="text-[11px] text-white/60">{children}</label>;
}
function Divider() {
  return <div className="my-3 h-px w-full bg-white/10" />;
}

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & { prefix?: string };
function Input({ prefix, className = "", ...props }: InputProps) {
  const ariaInvalid = (props as any)["aria-invalid"];
  if (prefix) {
    return (
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-xs text-white/50">
          {prefix}
        </span>
        <input
          {...props}
          className={[
            "w-full rounded-lg bg-white/10 pl-7 pr-3 py-2 text-sm text-white ring-1 ring-white/10 placeholder-white/40",
            "focus:outline-none focus:ring-white/20",
            ariaInvalid ? "ring-rose-400/40 focus:ring-rose-400/50" : "",
            className,
          ].join(" ")}
        />
      </div>
    );
  }
  return (
    <input
      {...props}
      className={[
        "w-full rounded-lg bg-white/10 px-3 py-2 text-sm text-white ring-1 ring-white/10 placeholder-white/40",
        "focus:outline-none focus:ring-white/20",
        ariaInvalid ? "ring-rose-400/40 focus:ring-rose-400/50" : "",
        className,
      ].join(" ")}
    />
  );
}

type SelectProps = React.SelectHTMLAttributes<HTMLSelectElement> & {
  error?: boolean | string;
  leftIcon?: React.ReactNode;
  rightIcon?: React.ReactNode;
  variantSize?: "sm" | "md" | "lg";
  isLoading?: boolean;
  children: React.ReactNode;
};
function Select({
  className = "",
  error,
  leftIcon,
  rightIcon,
  variantSize = "md",
  isLoading = false,
  disabled,
  children,
  ...props
}: SelectProps) {
  const sizeCls =
    variantSize === "sm"
      ? "py-1.5 text-[13px]"
      : variantSize === "lg"
      ? "py-2.5 text-[15px]"
      : "py-2 text-sm";
  const isErrored = typeof error === "string" ? true : !!error;
  const isDisabled = disabled || isLoading;

  return (
    <div className="relative">
      {leftIcon && (
        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-white/60">
          {leftIcon}
        </span>
      )}
      <select
        {...props}
        disabled={isDisabled}
        className={[
          "w-full rounded-lg bg-white/10 pr-8 text-white ring-1 ring-white/10",
          "placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-white/20",
          "appearance-none [color-scheme:dark] backdrop-blur-md",
          sizeCls,
          leftIcon ? "pl-8" : "px-3",
          isDisabled ? "opacity-60 cursor-not-allowed" : "",
          isErrored ? "ring-rose-400/40 focus:ring-rose-400/50" : "",
          className,
        ].join(" ")}
      >
        {isLoading ? <option className="bg-slate-900 text-white">Loading…</option> : children}
      </select>
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2">
        {rightIcon ?? (
          <svg viewBox="0 0 20 20" className="h-4 w-4 text-white/70">
            <path
              fill="currentColor"
              d="M5.6 7.6a1 1 0 0 1 1.4 0L10 10.6l3-3a1 1 0 1 1 1.4 1.4l-3.7 3.7a1 1 0 0 1-1.4 0L5.6 9a1 1 0 0 1 0-1.4Z"
            />
          </svg>
        )}
      </span>
    </div>
  );
}
