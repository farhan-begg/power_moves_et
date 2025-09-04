export type Category = {
  _id: string;
  userId: string;
  name: string;
  icon?: string;
  color?: string;
  createdAt: string;
  updatedAt: string;
};

const base = "/api/categories";

export async function listCategories(token: string): Promise<Category[]> {
  const r = await fetch(base, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function createCategory(
  token: string,
  body: { name: string; icon?: string; color?: string }
): Promise<Category> {
  const r = await fetch(base, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function updateCategory(
  token: string,
  id: string,
  body: Partial<{ name: string; icon: string; color: string }>
): Promise<Category> {
  const r = await fetch(`${base}/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

export async function deleteCategory(
  token: string,
  id: string,
  reassignTo?: string
): Promise<{ ok: boolean }> {
  const url = new URL(`${base}/${id}`, window.location.origin);
  if (reassignTo) url.searchParams.set("reassignTo", reassignTo);

  const r = await fetch(url.toString(), {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}
