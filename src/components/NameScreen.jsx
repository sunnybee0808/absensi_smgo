import React, { useState } from "react";
import { api, logout } from "../api.js";

export default function NameScreen({ me, onSaved }) {
  const [name, setName] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault();
    setErr("");
    const n = name.replace(/\s+/g, " ").trim();
    if (n.length < 3) { setErr("Full Name minimal 3 karakter."); return; }
    setBusy(true);
    try { await api("/api/me/name", { method: "POST", body: { fullName: n } }); onSaved(); }
    catch (ex) { setErr(ex.message); setBusy(false); }
  }

  return (
    <div className="gate">
      <div className="gate-card">
        <img className="logo" src="/logo.png" alt="SMGO Taxi Service" width="640" height="328" />
        <h1>Isi Full Name</h1>
        <p>Halo <b>{me.username}</b>. Sebelum mulai, tulis nama lengkap Anda sendiri. Nama ini dipakai di laporan dan slip upah.</p>
        <form className="col" onSubmit={submit}>
          <label className="f">Full Name
            <input id="fullName" autoFocus autoComplete="name" required minLength={3} maxLength={60}
              placeholder="Contoh: Budi Santoso" value={name} onChange={e => setName(e.target.value)} />
          </label>
          <p className="hint">Tulis sesuai KTP. Setelah disimpan, hanya admin yang dapat mengubahnya.</p>
          {err && <p className="err">{err}</p>}
          <button className="btn brand big" type="submit" disabled={busy}>Simpan dan lanjut</button>
          <button className="btn ghost" type="button" onClick={logout}>Keluar</button>
        </form>
      </div>
    </div>
  );
}
