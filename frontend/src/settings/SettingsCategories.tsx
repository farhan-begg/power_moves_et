import React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSelector } from "react-redux";
import { RootState } from "../app/store";
import {
  listCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  type Category,
} from "../api/categories";

export default function SettingsCategories() {
  const token = useSelector((s: RootState) => s.auth.token)!;
  const qc = useQueryClient();

  const listQ = useQuery({
    queryKey: ["categories"],
    queryFn: () => listCategories(token),
    staleTime: 60_000,
  });

  const createM = useMutation({
    mutationFn: (body: { name: string; icon?: string; color?: string }) =>
      createCategory(token, body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["categories"] }),
  });

  const updateM = useMutation({
    mutationFn: (vars: { id: string; body: Partial<Pick<Category, "name" | "icon" | "color">> }) =>
      updateCategory(token, vars.id, vars.body),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["categories"] }),
  });

  const deleteM = useMutation({
    mutationFn: (vars: { id: string; reassignTo?: string }) =>
      deleteCategory(token, vars.id, vars.reassignTo),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["categories"] }),
  });

  const [newName, setNewName] = React.useState("");

  if (listQ.isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-800 p-6 text-white/80">
        <div className="mx-auto max-w-4xl rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-md ring-1 ring-white/10 shadow-xl">
          Loading…
        </div>
      </div>
    );
  }
  if (listQ.isError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-800 p-6 text-rose-300">
        <div className="mx-auto max-w-4xl rounded-2xl border border-rose-400/20 bg-rose-500/10 p-6 backdrop-blur-md ring-1 ring-rose-400/20 shadow-xl">
          Failed to load categories.
        </div>
      </div>
    );
  }

  const cats: Category[] = listQ.data ?? [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-950 via-gray-900 to-gray-800 p-6 text-white">
      {/* Outer glass card */}
      <div className="relative mx-auto max-w-4xl rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur-xl ring-1 ring-white/10 shadow-2xl">
        {/* Glow accent */}
        <div
          className="pointer-events-none absolute h-56 w-56 -translate-y-20 translate-x-20 rounded-full blur-3xl opacity-20"
          style={{
            background:
              "radial-gradient(60% 60% at 50% 50%, rgba(99,102,241,.35), transparent)",
          }}
        />

        <header className="mb-5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-semibold text-white/90">Categories</h1>
            <p className="text-xs text-white/50">
              Create, rename or delete categories used for your transactions.
            </p>
          </div>
        </header>

        {/* Add new category panel */}
        <section className="mb-6 rounded-2xl border border-white/10 bg-black/20 p-4 ring-1 ring-white/10 backdrop-blur-md">
          <h2 className="mb-3 text-sm font-medium text-white/80">Add category</h2>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              className="w-full rounded-lg bg-black/30 px-3 py-2 text-sm text-white ring-1 ring-white/10 placeholder-white/40 focus:outline-none focus:ring-2 focus:ring-indigo-400"
              placeholder="e.g., Groceries"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
            />
            <button
              onClick={() => newName.trim() && createM.mutate({ name: newName.trim() })}
              disabled={createM.isPending || !newName.trim()}
              className="inline-flex items-center justify-center rounded-lg px-3 py-2 text-sm text-white bg-indigo-500/20 ring-1 ring-indigo-400/30 hover:bg-indigo-500/30 focus:outline-none focus:ring-2 focus:ring-indigo-400 disabled:opacity-50"
            >
              {createM.isPending ? "Adding…" : "Add"}
            </button>
          </div>
        </section>

        {/* Categories list */}
        <section className="space-y-2">
          {cats.length === 0 ? (
            <div className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white/60 ring-1 ring-white/10">
              No categories yet. Add your first above.
            </div>
          ) : (
            <ul className="space-y-2">
              {cats.map((c) => (
                <li
                  key={c._id}
                  className="flex items-center justify-between rounded-xl border border-white/10 bg-black/30 p-3 ring-1 ring-white/10 shadow-inner shadow-black/40 backdrop-blur-md"
                >
                  <div className="min-w-0 flex items-center gap-3">
                    <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-black/40 ring-1 ring-white/10">
                      <span className="text-lg">{c.icon || "💳"}</span>
                    </span>
                    <div className="truncate">
                      <div className="truncate text-sm font-medium text-white">{c.name}</div>
                      <div className="text-[11px] text-white/50">
                        ID: <span className="text-white/70">{c._id}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      className="text-xs px-2 py-1 rounded-lg bg-white/10 ring-1 ring-white/10 hover:bg-white/15 focus:outline-none focus:ring-2 focus:ring-white/20 disabled:opacity-50"
                      disabled={updateM.isPending}
                      onClick={() => {
                        const name = prompt("Rename category", c.name);
                        if (name && name.trim()) {
                          updateM.mutate({ id: c._id, body: { name: name.trim() } });
                        }
                      }}
                    >
                      Rename
                    </button>
                    <button
                      className="text-xs px-2 py-1 rounded-lg bg-rose-500/20 ring-1 ring-rose-400/30 hover:bg-rose-500/30 focus:outline-none focus:ring-2 focus:ring-rose-400/40 disabled:opacity-50"
                      disabled={deleteM.isPending}
                      onClick={() => {
                        const reassignTo = prompt(
                          "Optional: reassign transactions to categoryId (leave empty to clear)"
                        );
                        deleteM.mutate({ id: c._id, reassignTo: reassignTo || undefined });
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
