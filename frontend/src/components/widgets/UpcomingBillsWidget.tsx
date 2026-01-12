// src/components/widgets/UpcomingBillsWidget.tsx
import React from "react";
import { useSelector } from "react-redux";
import type { RootState } from "../../app/store";
import {
  useRecurringOverview,
  useRunDetection,
  useMatchBillPaid,
  type Bill,
  type Paycheck,
} from "../../hooks/recurringHooks";
import { selectSelectedAccountId } from "../../app/selectors";
import { ALL_ACCOUNTS_ID } from "../../features/filters/globalAccountFilterSlice";

const glass =
  "relative rounded-2xl p-5 bg-[var(--widget-bg)] border border-[var(--widget-border)] shadow-xl ring-1 ring-[var(--widget-ring)]";

const PAGE_SIZE = 2;

/* ====================== Utilities ====================== */

const money = (n?: number | null, c = "USD") =>
  Intl.NumberFormat(undefined, {
    style: "currency",
    currency: c,
    maximumFractionDigits: 2,
  }).format(n ?? 0);

const toYmd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate()
  ).padStart(2, "0")}`;

const toGCalDate = (d: Date) =>
  `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(
    d.getDate()
  ).padStart(2, "0")}`;

const addDays = (d: Date, n: number) => {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
};

/** Build a Google Calendar template URL (all-day) */
function buildGCalUrl(b: Bill) {
  const title = encodeURIComponent(b.name);
  const currency = (b as any).currency ?? "USD";
  const amountStr =
    typeof b.amount === "number" ? ` (${money(b.amount, currency)})` : "";
  const details = encodeURIComponent(
    `Bill${amountStr}${(b as any).merchant ? ` • ${String((b as any).merchant)}` : ""}`
  );

  const start = b.dueDate ? new Date(b.dueDate) : new Date();
  const end = addDays(start, 1);

  const dates = `${toGCalDate(start)}/${toGCalDate(end)}`; // all-day range (end exclusive)

  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dates}&details=${details}`;
}

/** Trigger an .ics download (all-day event) */
function downloadIcs(b: Bill) {
  const uid = `${b._id}@powermoves`;
  const start = b.dueDate ? new Date(b.dueDate) : new Date();
  const end = addDays(start, 1);
  const dt = (d: Date) =>
    `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(
      d.getUTCDate()
    ).padStart(2, "0")}T000000Z`;

  // All-day: use VALUE=DATE lines
  const ymd = (d: Date) =>
    `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(
      d.getUTCDate()
    ).padStart(2, "0")}`;

  const currency = (b as any).currency ?? "USD";
  const amountStr = typeof b.amount === "number" ? ` (${money(b.amount, currency)})` : "";
  const desc = `Bill${amountStr}${(b as any).merchant ? ` • ${String((b as any).merchant)}` : ""}`;

  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Powermoves//Recurring Bills//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dt(new Date())}`,
    `SUMMARY:${escapeIcsText(b.name)}`,
    `DESCRIPTION:${escapeIcsText(desc)}`,
    `DTSTART;VALUE=DATE:${ymd(start)}`,
    `DTEND;VALUE=DATE:${ymd(end)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");

  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${sanitizeFilename(b.name)}.ics`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function escapeIcsText(s: string) {
  return s.replace(/\\|;|,|\n/g, (m) => {
    if (m === "\\") return "\\\\";
    if (m === ";") return "\\;";
    if (m === ",") return "\\,";
    if (m === "\n") return "\\n";
    return m;
  });
}
function sanitizeFilename(s: string) {
  return s.replace(/[^\w\-]+/g, "_").slice(0, 60);
}

/* ====================== Small UI bits ====================== */

const StatusChip: React.FC<{ status: Bill["status"] }> = ({ status }) => {
  const base =
    "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ring-1";
  if (status === "due")
    return (
      <span className={`${base} bg-amber-400/10 text-amber-200 ring-amber-400/30`}>
        ● Due
      </span>
    );
  if (status === "predicted")
    return (
      <span className={`${base} bg-cyan-400/10 text-cyan-200 ring-cyan-400/30`}>
        ● Predicted
      </span>
    );
  if (status === "paid")
    return (
      <span className={`${base} bg-emerald-400/10 text-emerald-200 ring-emerald-400/30`}>
        ● Paid
      </span>
    );
  return (
    <span className={`${base} bg-zinc-400/10 text-zinc-200 ring-zinc-400/30`}>
      ● Skipped
    </span>
  );
};

const SkeletonRow = () => (
  <li className="flex items-center justify-between rounded-lg border border-[var(--widget-border)] bg-[var(--btn-bg)] px-3 py-2 animate-pulse">
    <div className="min-w-0 flex-1">
      <div className="h-3 w-40 rounded bg-[var(--widget-border)]" />
      <div className="mt-2 h-2 w-60 rounded bg-[var(--widget-border)]" />
    </div>
    <div className="ml-3 h-6 w-24 rounded bg-[var(--widget-border)]" />
  </li>
);

/* ====================== Mini Calendar ====================== */

type DayCell = {
  date: Date;
  inMonth: boolean;
  ymd: string;
  hasBill: boolean;
  hasPay: boolean;
};

function buildMonthGrid(anchor: Date, bills: Bill[], pays: Paycheck[]): DayCell[] {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();

  const first = new Date(year, month, 1);
  const start = new Date(first);
  const startWeekday = start.getDay(); // 0 Sun .. 6 Sat
  start.setDate(start.getDate() - startWeekday);

  const cells: DayCell[] = [];
  const billSet = new Set(bills.map((b) => (b.dueDate ? toYmd(new Date(b.dueDate)) : "")));
  const paySet = new Set(pays.map((p) => toYmd(new Date(p.date))));

  for (let i = 0; i < 42; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const ymd = toYmd(d);
    cells.push({
      date: d,
      inMonth: d.getMonth() === month,
      ymd,
      hasBill: billSet.has(ymd),
      hasPay: paySet.has(ymd),
    });
  }
  return cells;
}

const Calendar: React.FC<{
  monthAnchor: Date;
  bills: Bill[];
  pays: Paycheck[];
  selectedYmd: string;
  onSelect: (ymd: string) => void;
  onChangeMonth: (delta: number) => void;
}> = ({ monthAnchor, bills, pays, selectedYmd, onSelect, onChangeMonth }) => {
  const grid = React.useMemo(
    () => buildMonthGrid(monthAnchor, bills, pays),
    [monthAnchor, bills, pays]
  );

  const monthName = monthAnchor.toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

  const weekdays = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="rounded-xl border border-[var(--widget-border)] bg-[var(--btn-bg)] p-3 mb-4">
      <div className="mb-2 flex items-center justify-between">
        <button
          onClick={() => onChangeMonth(-1)}
          className="rounded-md border border-[var(--widget-border)] bg-[var(--btn-bg)] px-2 py-1 text-[var(--text-secondary)] hover:bg-[var(--btn-hover)] ring-1 ring-[var(--widget-ring)]"
          aria-label="Previous month"
        >
          ‹
        </button>
        <div className="text-sm font-medium text-[var(--text-primary)]">{monthName}</div>
        <button
          onClick={() => onChangeMonth(1)}
          className="rounded-md border border-[var(--widget-border)] bg-[var(--btn-bg)] px-2 py-1 text-[var(--text-secondary)] hover:bg-[var(--btn-hover)] ring-1 ring-[var(--widget-ring)]"
          aria-label="Next month"
        >
          ›
        </button>
      </div>

      <div className="grid grid-cols-7 gap-1 text-[10px] text-[var(--text-muted)] mb-1">
        {weekdays.map((w) => (
          <div key={w} className="text-center">
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {grid.map((c) => {
          const day = c.date.getDate();
          const isSel = c.ymd === selectedYmd;
          return (
            <button
              key={c.ymd}
              onClick={() => onSelect(c.ymd)}
              className={[
                "h-9 rounded-lg border text-xs flex flex-col items-center justify-center transition-colors",
                c.inMonth ? "border-[var(--widget-border)] text-[var(--text-primary)]" : "border-transparent text-[var(--text-muted)]",
                isSel ? "bg-[var(--btn-hover)] ring-1 ring-[var(--widget-ring)]" : "bg-[var(--btn-bg)] hover:bg-[var(--btn-hover)]",
              ].join(" ")}
              title={c.ymd}
            >
              <span className="leading-none">{day}</span>
              <span className="mt-0.5 flex gap-0.5">
                {c.hasBill && <span className="h-1.5 w-1.5 rounded-full bg-amber-400" />}
                {c.hasPay && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />}
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-2 flex items-center gap-3 text-[10px] text-[var(--text-muted)]">
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-amber-400 inline-block" /> Bill
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-2 w-2 rounded-full bg-emerald-400 inline-block" /> Paycheck
        </span>
      </div>
    </div>
  );
};

/* ====================== Main Widget ====================== */

export default function UpcomingBillsWidget() {
  const token = useSelector((s: RootState) => s.auth.token);
  const overviewQ = useRecurringOverview();
  const runDetect = useRunDetection();
  const matchPaid = useMatchBillPaid();

  const bills: Bill[] = overviewQ.data?.bills ?? [];
  const paychecks: Paycheck[] = overviewQ.data?.recentPaychecks ?? [];

  // ✅ single, shared selector to keep account context consistent across widgets
  const selectedAccountId = useSelector(selectSelectedAccountId);

  // Focus month/day for the calendar
  const [monthAnchor, setMonthAnchor] = React.useState(() => {
    const firstDue = bills.find((b) => b.dueDate)?.dueDate;
    return firstDue ? new Date(firstDue) : new Date();
  });
  const [selectedYmd, setSelectedYmd] = React.useState(() => toYmd(new Date()));

  // Re-anchor calendar when the first upcoming bill’s month changes
  React.useEffect(() => {
    const firstDue = bills.find((b) => b.dueDate)?.dueDate;
    if (firstDue) {
      const d = new Date(firstDue);
      if (d.getMonth() !== monthAnchor.getMonth() || d.getFullYear() !== monthAnchor.getFullYear()) {
        setMonthAnchor(d);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [bills]);

  const changeMonth = (delta: number) => {
    const x = new Date(monthAnchor);
    x.setMonth(x.getMonth() + delta);
    setMonthAnchor(x);
  };

  // upcoming (predicted/due) only
  const upcoming = React.useMemo(
    () =>
      bills
        .filter((b) => b.status === "predicted" || b.status === "due")
        .sort((a, b) => {
          const da = a.dueDate ? +new Date(a.dueDate) : Number.MAX_SAFE_INTEGER;
          const db = b.dueDate ? +new Date(b.dueDate) : Number.MAX_SAFE_INTEGER;
          return da - db;
        }),
    [bills]
  );

  // selected-day slices
  const billsOnDay = React.useMemo(
    () =>
      upcoming.filter(
        (b) => b.dueDate && toYmd(new Date(b.dueDate)) === selectedYmd
      ),
    [upcoming, selectedYmd]
  );
  const paysOnDay = React.useMemo(
    () => paychecks.filter((p) => toYmd(new Date(p.date)) === selectedYmd),
    [paychecks, selectedYmd]
  );

  // pagers (global lists)
  const [billPage, setBillPage] = React.useState(1);
  const billPages = Math.max(1, Math.ceil(upcoming.length / PAGE_SIZE));
  const billSlice = React.useMemo(
    () => upcoming.slice((billPage - 1) * PAGE_SIZE, billPage * PAGE_SIZE),
    [upcoming, billPage]
  );
  React.useEffect(() => {
    if (billPage > billPages) setBillPage(billPages);
  }, [billPage, billPages]);

  const [payPage, setPayPage] = React.useState(1);
  const payPages = Math.max(1, Math.ceil(paychecks.length / PAGE_SIZE));
  const paySlice = React.useMemo(
    () => paychecks.slice((payPage - 1) * PAGE_SIZE, payPage * PAGE_SIZE),
    [paychecks, payPage]
  );
  React.useEffect(() => {
    if (payPage > payPages) setPayPage(payPages);
  }, [payPage, payPages]);

  const now = new Date();
  const isDueSoon = (iso?: string) => {
    if (!iso) return false;
    const d = new Date(iso);
    const diffDays = Math.round((+d - +now) / 86400000);
    return diffDays <= 7 && diffDays >= 0;
  };

  const onMarkPaidViaTx = async (b: Bill) => {
    const txId = window.prompt(
      `Enter the transaction ID that paid "${b.name}" (${money(
        b.amount ?? undefined,
        (b as any).currency ?? "USD"
      )}):`
    );
    if (!txId || !txId.trim()) return;

    try {
      await matchPaid.mutateAsync({
        txId: txId.trim(),
        amount: b.amount ?? undefined,
        seriesId: b.seriesId ?? undefined,
        name: b.name,
        merchant: (b as any).merchant ?? undefined,
       accountId:
  selectedAccountId && selectedAccountId !== ALL_ACCOUNTS_ID
    ? selectedAccountId
    : undefined,
      });
      window.alert("Marked as paid and synced with Recent Transactions.");
    } catch (e: any) {
      window.alert(e?.message || "Failed to mark paid");
    }
  };

  const horizonTotal = React.useMemo(
    () =>
      upcoming.reduce((sum, b) => sum + (typeof b.amount === "number" ? b.amount : 0), 0),
    [upcoming]
  );

  return (
    <div className={glass}>
      {/* Header */}
      <div className="mb-3 flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-[var(--text-primary)]">Upcoming Bills & Paychecks</h3>
          <div className="text-xs text-[var(--text-muted)]">
            Add to calendar, detect recurring, and mark payments
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => overviewQ.refetch()}
            className="text-xs rounded-lg bg-[var(--btn-bg)] px-2.5 py-1.5 md:px-2 md:py-1 text-[var(--text-primary)] ring-1 ring-[var(--widget-ring)] hover:bg-[var(--btn-hover)]"
          >
            Refresh
          </button>
          <button
            onClick={() => runDetect.mutate(180)}
            disabled={!token || runDetect.isPending}
            className="text-xs rounded-lg bg-[var(--positive-bg-soft)] px-2.5 py-1.5 md:px-2 md:py-1 text-[var(--positive)] ring-1 ring-[var(--positive-ring)] hover:bg-[var(--positive-bg-soft)]/80 disabled:opacity-50"
            title="Run detection and persist matches"
          >
            {runDetect.isPending ? "Detecting…" : "Detect & Apply"}
          </button>
        </div>
      </div>

      {/* Error / Loading */}
      {overviewQ.isError && (
        <div className="mb-3 rounded-lg border border-[var(--negative)]/30 bg-[var(--negative-bg-soft)] p-3 text-[var(--negative)]">
          <div className="text-sm font-medium">Failed to load overview</div>
          <div className="mt-1 text-xs opacity-80">
            {(overviewQ.error as any)?.message || "Unknown error"}
          </div>
          <div className="mt-2">
            <button
              onClick={() => overviewQ.refetch()}
              className="text-xs rounded-md bg-[var(--btn-bg)] px-2.5 py-1.5 md:px-2 md:py-1 text-[var(--text-primary)] ring-1 ring-[var(--widget-ring)] hover:bg-[var(--btn-hover)]"
            >
              Retry
            </button>
          </div>
        </div>
      )}
      {overviewQ.isLoading && (
        <ul className="space-y-2">
          {Array.from({ length: PAGE_SIZE }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </ul>
      )}

      {/* Content */}
      {!overviewQ.isLoading && !overviewQ.isError && (
        <>
          {/* Totals ribbon */}
          <div className="mb-4 rounded-xl border border-[var(--widget-border)] bg-[var(--btn-bg)] p-3">
            <div className="flex items-center justify-between">
              <div className="text-xs text-[var(--text-secondary)]">Total due (horizon)</div>
              <div className="font-mono tabular-nums text-[var(--text-primary)]">
                {money(horizonTotal)}
              </div>
            </div>
          </div>

          {/* Calendar */}
          <Calendar
            monthAnchor={monthAnchor}
            bills={bills}
            pays={paychecks}
            selectedYmd={selectedYmd}
            onSelect={(ymd) => setSelectedYmd(ymd)}
            onChangeMonth={changeMonth}
          />

          {/* Selected day summary */}
          <div className="mb-4 rounded-lg border border-[var(--widget-border)] bg-[var(--btn-bg)] p-3">
            <div className="text-xs text-[var(--text-secondary)] mb-1">
              {new Date(selectedYmd).toLocaleDateString()} —{" "}
              <span className="text-[var(--text-primary)]">
                {billsOnDay.length} bill{billsOnDay.length === 1 ? "" : "s"},{" "}
                {paysOnDay.length} paycheck{paysOnDay.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="flex flex-wrap gap-2">
              {billsOnDay.map((b) => (
                <span
                  key={`sel-${b._id}`}
                  className="inline-flex items-center gap-2 rounded-full bg-[var(--btn-bg)] px-3 py-1 text-xs ring-1 ring-[var(--widget-ring)]"
                >
                  <span className="text-[var(--text-primary)]">{b.name}</span>
                  <StatusChip status={b.status} />
                </span>
              ))}
              {paysOnDay.map((p) => (
                <span
                  key={`selp-${p._id}`}
                  className="inline-flex items-center gap-2 rounded-full bg-[var(--btn-bg)] px-3 py-1 text-xs ring-1 ring-[var(--widget-ring)]"
                >
                  <span className="text-[var(--positive)]">{p.employerName || "Paycheck"}</span>
                  <span className="font-mono text-[var(--text-primary)]">{money(p.amount)}</span>
                </span>
              ))}
              {billsOnDay.length === 0 && paysOnDay.length === 0 && (
                <span className="text-[var(--text-muted)] text-xs">No items on this day.</span>
              )}
            </div>
          </div>

          {/* Bills (paginated) */}
          <div className="mb-4">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs uppercase tracking-wide text-[var(--text-muted)]">Bills</div>
              <div className="text-[11px] text-[var(--text-muted)]">
                {upcoming.length} total
              </div>
            </div>

            <ul className="space-y-2">
              {upcoming.length === 0 && (
                <li className="text-[var(--text-secondary)] text-sm">
                  No upcoming bills in the current horizon.
                </li>
              )}

              {billSlice.map((b) => {
                const currency = (b as any).currency ?? "USD";
                const soon = isDueSoon(b.dueDate);
                return (
                  <li
                    key={b._id}
                    className={[
                      "flex items-center justify-between rounded-lg border px-3 py-2",
                      "bg-[var(--btn-bg)] border-[var(--widget-border)] hover:bg-[var(--btn-hover)] transition-colors",
                      soon ? "ring-1 ring-amber-400/30" : "ring-1 ring-[var(--widget-ring)]",
                    ].join(" ")}
                    title={
                      b.dueDate
                        ? `Due ${new Date(b.dueDate).toLocaleDateString()}`
                        : "No due date"
                    }
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <div className="truncate text-sm text-[var(--text-primary)]">{b.name}</div>
                        <StatusChip status={b.status} />
                        {soon && (
                          <span className="text-[10px] rounded-full bg-amber-400/10 px-1.5 py-0.5 text-amber-400 ring-1 ring-amber-400/20">
                            Due soon
                          </span>
                        )}
                      </div>

                      <div className="mt-0.5 text-xs text-[var(--text-muted)]">
                        {currency} • {b.status}
                        {b.dueDate
                          ? ` • due ${new Date(b.dueDate).toLocaleDateString()}`
                          : ""}
                        {(b as any).merchant ? ` • ${String((b as any).merchant)}` : ""}
                      </div>
                    </div>

                    <div className="ml-3 flex items-center gap-2 shrink-0">
                      <div className="font-mono tabular-nums text-sm text-[var(--text-primary)]">
                        {money(b.amount ?? undefined, currency)}
                      </div>

                      {/* Add to Calendar */}
                      <a
                        href={buildGCalUrl(b)}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs rounded-lg bg-[var(--btn-bg)] px-2 py-1 text-[var(--text-primary)] ring-1 ring-[var(--widget-ring)] hover:bg-[var(--btn-hover)]"
                        title="Add to Google Calendar"
                      >
                        Add to Google
                      </a>
                      <button
                        onClick={() => downloadIcs(b)}
                        className="text-xs rounded-lg bg-[var(--btn-bg)] px-2 py-1 text-[var(--text-primary)] ring-1 ring-[var(--widget-ring)] hover:bg-[var(--btn-hover)]"
                        title="Download .ics"
                      >
                        .ics
                      </button>

                      {/* Match & mark paid */}
                      <button
                        onClick={() => onMarkPaidViaTx(b)}
                        disabled={matchPaid.isPending}
                        className="text-xs rounded-lg bg-[var(--btn-bg)] px-2.5 py-1.5 md:px-2 md:py-1 text-[var(--text-primary)] ring-1 ring-[var(--widget-ring)] hover:bg-[var(--btn-hover)] disabled:opacity-50"
                      >
                        {matchPaid.isPending ? "Saving…" : "Match Tx"}
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* Bills pager */}
            {upcoming.length > PAGE_SIZE && (
              <div className="mt-3 flex items-center justify-between text-xs text-[var(--text-secondary)]">
                <div>
                  Page <span className="text-[var(--text-primary)]">{billPage}</span> /{" "}
                  <span className="text-[var(--text-primary)]">{billPages}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setBillPage((p) => Math.max(1, p - 1))}
                    disabled={billPage <= 1}
                    className="rounded-md border border-[var(--widget-border)] bg-[var(--btn-bg)] px-2 py-1 text-[var(--text-primary)] hover:bg-[var(--btn-hover)] ring-1 ring-[var(--widget-ring)] disabled:opacity-40"
                  >
                    Prev
                  </button>
                  <button
                    onClick={() => setBillPage((p) => Math.min(billPages, p + 1))}
                    disabled={billPage >= billPages}
                    className="rounded-md border border-[var(--widget-border)] bg-[var(--btn-bg)] px-2 py-1 text-[var(--text-primary)] hover:bg-[var(--btn-hover)] ring-1 ring-[var(--widget-ring)] disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Paychecks (paginated) */}
          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-xs uppercase tracking-wide text-[var(--text-muted)]">
                Recent Paychecks
              </div>
              <div className="text-[11px] text-[var(--text-muted)]">
                {paychecks.length} total
              </div>
            </div>

            <ul className="space-y-2">
              {paySlice.length === 0 && (
                <li className="text-[var(--text-secondary)] text-sm">
                  No recent paychecks detected.
                </li>
              )}

              {paySlice.map((p) => (
                <li
                  key={p._id}
                  className="flex items-center justify-between rounded-lg border border-[var(--widget-border)] bg-[var(--btn-bg)] px-3 py-2 hover:bg-[var(--btn-hover)] transition-colors ring-1 ring-[var(--widget-ring)]"
                >
                  <div className="min-w-0">
                    <div className="truncate text-sm text-[var(--text-primary)]">
                      {p.employerName || "Paycheck"}
                    </div>
                    <div className="mt-0.5 text-xs text-[var(--text-muted)]">
                      {new Date(p.date).toLocaleDateString()}
                    </div>
                  </div>
                  <div className="font-mono tabular-nums text-sm text-[var(--positive)]">
                    {money(p.amount)}
                  </div>
                </li>
              ))}
            </ul>

            {/* Paychecks pager */}
            {paychecks.length > PAGE_SIZE && (
              <div className="mt-3 flex items-center justify-between text-xs text-[var(--text-secondary)]">
                <div>
                  Page <span className="text-[var(--text-primary)]">{payPage}</span> /{" "}
                  <span className="text-[var(--text-primary)]">{payPages}</span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setPayPage((p) => Math.max(1, p - 1))}
                    disabled={payPage <= 1}
                    className="rounded-md border border-[var(--widget-border)] bg-[var(--btn-bg)] px-2 py-1 text-[var(--text-primary)] hover:bg-[var(--btn-hover)] ring-1 ring-[var(--widget-ring)] disabled:opacity-40"
                  >
                    Prev
                  </button>
                  <button
                    onClick={() => setPayPage((p) => Math.min(payPages, p + 1))}
                    disabled={payPage >= payPages}
                    className="rounded-md border border-[var(--widget-border)] bg-[var(--btn-bg)] px-2 py-1 text-[var(--text-primary)] hover:bg-[var(--btn-hover)] ring-1 ring-[var(--widget-ring)] disabled:opacity-40"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
