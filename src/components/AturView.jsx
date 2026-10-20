import React, { useEffect, useState } from "react";
import { api } from "../api.js";
import { useToast } from "../toast.js";
import { Avatar, money, UNITS } from "../utils.jsx";

function RatesEditor({ settings, onSaved }) {
  const toast = useToast();
  const [draft, setDraft] = useState(() => structuredClone(settings));
  useEffect(() => { setDraft(structuredClone(settings)); }, [settings]);

  const setRole = (id, field, value) =>
    setDraft(d => ({ ...d, roles: d.roles.map(r => (r.id === id ? { ...r, [field]: value } : r)) }));

  const first = draft.roles[0];
  const block = Math.max(1, Number(first.every) || 1) * UNITS[first.unit];
  const amt = Number(first.amount) || 0;
  const m = 135;

  async function save() {
    try {
      const s = await api("/api/settings", {
        method: "PUT",
        body: {
          rounding: draft.rounding,
          roles: draft.roles.map(r => ({ id: r.id, amount: Number(r.amount) || 0, every: Number(r.every) || 1, unit: r.unit })),
        },
      });
      toast("Tarif disimpan");
      onSaved(s);
    } catch (e) { toast(e.message); }
  }

  return (
    <section className="panel">
      <div><h2>Tarif per Role</h2><p className="sub">Contoh: $3 setiap 30 menit, atau $8 setiap 1 jam.</p></div>
      <div>
        {draft.roles.map(r => (
          <div className="rate-row" key={r.id}>
            <span className="lbl">{r.label}</span>
            <label className="money"><input type="number" min="0" step="0.01" value={r.amount} aria-label={`Dollar untuk ${r.label}`} onChange={e => setRole(r.id, "amount", e.target.value)} /></label>
            <span className="per">setiap</span>
            <input type="number" min="1" step="1" value={r.every} aria-label={`Jumlah waktu ${r.label}`} onChange={e => setRole(r.id, "every", e.target.value)} />
            <select value={r.unit} aria-label={`Satuan waktu ${r.label}`} onChange={e => setRole(r.id, "unit", e.target.value)}>
              <option value="menit">menit</option><option value="jam">jam</option>
            </select>
          </div>
        ))}
      </div>
      <label className="f" style={{ maxWidth: 380 }}>Cara menghitung
        <select value={draft.rounding} onChange={e => setDraft(d => ({ ...d, rounding: e.target.value }))}>
          <option value="blok">Hanya blok waktu penuh (sisa diabaikan)</option>
          <option value="proporsional">Proporsional per menit</option>
        </select>
      </label>
      <p className="note">
        Contoh {first.label}, kerja 2j 15m: blok penuh = {money(Math.floor(m / block) * amt)}, proporsional = {money((m / block) * amt)}.
      </p>
      <div className="row" style={{ justifyContent: "flex-end" }}>
        <button className="btn primary" type="button" onClick={save}>Simpan tarif</button>
      </div>
    </section>
  );
}

function UserRow({ u, me, settings, onUpdate }) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(u.fullName || "");

  return (
    <tr style={u.active ? undefined : { opacity: 0.55 }}>
      <td>
        <div className="person">
          <Avatar url={u.avatar} name={u.fullName || u.username} />
          <div>
            {renaming ? (
              <form className="row" onSubmit={async e => { e.preventDefault(); if (await onUpdate(u.id, { fullName: name }, "Nama diubah")) setRenaming(false); }}>
                <input value={name} maxLength={60} aria-label="Full Name baru" style={{ minWidth: 160 }} autoFocus onChange={e => setName(e.target.value)} />
                <button className="btn brand" type="submit">Simpan</button>
                <button className="btn ghost" type="button" onClick={() => { setRenaming(false); setName(u.fullName || ""); }}>Batal</button>
              </form>
            ) : (
              <>
                {u.fullName ? u.fullName : <span className="chip warn">Belum isi Full Name</span>}
                {u.isAdmin && <> <span className="chip admin">Admin</span></>}
                {u.resignedAt && <> <span className={"pill " + (u.resigned ? "no" : "wait")}>{u.resigned ? u.endLabel : "Akan " + u.endLabel} {u.resignedAt}</span></>}
                <small>Discord: {u.username}</small>
              </>
            )}
          </div>
        </div>
      </td>
      <td>
        <select value={u.role || ""} aria-label="Role" onChange={e => onUpdate(u.id, { role: e.target.value }, "Disimpan")}>
          <option value="">— Pilih role —</option>
          {settings.roles.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
        {!u.role && u.fullName && <><br /><span className="chip warn">Perlu role</span></>}
      </td>
      <td>
        <label className="switch">
          <input type="checkbox" checked={u.isAdmin} disabled={u.envAdmin || u.id === me.id}
            onChange={e => onUpdate(u.id, { isAdmin: e.target.checked }, "Disimpan")} /> Admin
        </label><br />
        <label className="switch">
          <input type="checkbox" checked={u.active} disabled={u.id === me.id}
            onChange={e => onUpdate(u.id, { active: e.target.checked }, "Disimpan")} /> Aktif
        </label>
      </td>
      <td className="act">{u.fullName && !renaming && <button className="btn ghost" onClick={() => setRenaming(true)}>Ubah nama</button>}</td>
    </tr>
  );
}

export default function AturView({ me, settings, users, loadUsers, onSettingsSaved, onUsersChanged }) {
  const toast = useToast();
  useEffect(() => { loadUsers(); }, [loadUsers]);

  async function updateUser(id, body, okMsg) {
    let ok = false;
    try { await api("/api/users/" + id, { method: "PUT", body }); toast(okMsg); ok = true; }
    catch (e) { toast(e.message); }
    await loadUsers();
    if (ok) onUsersChanged(id);
    return ok;
  }

  return (
    <div className="grid2">
      <RatesEditor settings={settings} onSaved={onSettingsSaved} />
      <section className="panel">
        <div><h2>Karyawan</h2><p className="sub">Karyawan muncul di sini setelah login dengan Discord dan mengisi Full Name. Tentukan role-nya agar bisa absen.</p></div>
        {!users.length ? (
          <div className="empty"><b>Belum ada karyawan</b>Bagikan link aplikasi ini ke karyawan. Mereka muncul di sini setelah login dengan Discord.</div>
        ) : (
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Karyawan</th><th>Role</th><th>Akses</th><th></th></tr></thead>
              <tbody>
                {users.map(u => <UserRow key={u.id} u={u} me={me} settings={settings} onUpdate={updateUser} />)}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
