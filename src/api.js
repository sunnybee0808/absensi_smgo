// Pemanggil API ke server Express. Header X-Requested-With dipakai server sebagai perlindungan CSRF.
let onUnauthorized = () => {};
export function setUnauthorizedHandler(fn) { onUnauthorized = fn; }

export async function api(path, opts = {}) {
  const res = await fetch(path, {
    method: opts.method || "GET",
    headers: { "Content-Type": "application/json", "X-Requested-With": "smgo" },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
    credentials: "same-origin",
  });
  let data = {};
  try { data = await res.json(); } catch { /* respons kosong */ }
  if (res.status === 401) { onUnauthorized(); throw new Error(data.error || "Silakan login."); }
  if (!res.ok) throw new Error(data.error || "Terjadi kesalahan.");
  return data;
}

export async function getMe() {
  const res = await fetch("/api/me", { credentials: "same-origin" });
  if (!res.ok) throw new Error("Tidak bisa terhubung ke server.");
  return res.json();
}

export async function logout() {
  await api("/api/logout", { method: "POST" }).catch(() => {});
  window.location.href = "/";
}
