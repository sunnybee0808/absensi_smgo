import React, { useRef, useState } from "react";
import { api } from "../api.js";
import { useToast } from "../toast.js";
import { Avatar, Elapsed, fmtTime, rateText, roleOf } from "../utils.jsx";
import ShiftTable from "./ShiftTable.jsx";

function MyCard({ me, settings, board, onChanged }) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const mine = board.find(p => p.isMe);
  const role = roleOf(settings, me.role);

  async function duty(kind) {
    setBusy(true);
    try {
      await api(kind === "on" ? "/api/duty/on" : "/api/duty/off", { method: "POST" });
      toast(kind === "on" ? "Selamat bekerja. On duty tercatat." : "Off duty tercatat. Terima kasih.");
    } catch (e) { toast(e.message); }
    setBusy(false);
    onChanged();
  }

  if (me.resigned) {
    return (
      <div className="mycard is-resigned"><div className="state"><span className="pill no">{me.endLabel}</span><b>Status Anda: {me.endLabel}</b>
        <span className="sub">Berlaku sejak {me.resignedAt}. Anda tidak bisa On Duty lagi. Riwayat absensi tetap bisa dilihat.</span></div></div>
    );
  }
  if (!me.role || !role) {
    return (
      <div className="mycard"><div className="state"><b>Menunggu role</b>
        <span className="sub">Admin belum menentukan role Anda. Setelah ditentukan, tombol On Duty muncul di sini.</span></div></div>
    );
  }
  if (mine && mine.open) {
    return (
      <div className="mycard is-on">
        <div className="state">
          <span className="pill on">On duty sejak {fmtTime(mine.open.on)}</span>
          <Elapsed className="timer" since={mine.open.onIso} long />
          <span className="sub">{role.label} · {rateText(role)}</span>
        </div>
        <button className="btn off big" disabled={busy} onClick={() => duty("off")}>Off Duty</button>
      </div>
    );
  }
  return (
    <div className="mycard">
      <div className="state">
        <span className="pill off">Off duty</span><b>Siap mulai?</b>
        <span className="sub">{role.label} · {rateText(role)}</span>
      </div>
      <button className="btn on big" disabled={busy} onClick={() => duty("on")}>On Duty</button>
    </div>
  );
}

function Board({ board }) {
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();
  const list = board
    .filter(p => p.role && (!query || p.fullName.toLowerCase().includes(query)))
    .sort((a, b) => (!!b.open - !!a.open) || a.fullName.localeCompare(b.fullName));
  return (
    <section className="panel">
      <div className="panel-head">
        <div><h2>Papan Tugas</h2><p className="sub">Siapa yang sedang on duty.</p></div>
        <input type="search" placeholder="Cari nama…" style={{ maxWidth: 200 }} value={q} onChange={e => setQ(e.target.value)} aria-label="Cari nama" />
      </div>
      <div className="board">
        {!list.length ? (
          <div className="empty">
            {query ? "Tidak ada nama yang cocok." : <><b>Belum ada karyawan</b>Karyawan muncul setelah login dan diberi role oleh admin.</>}
          </div>
        ) : list.map(p => (
          <div className="duty" key={p.id}>
            <Avatar url={p.avatar} name={p.fullName} />
            <div className="who">
              <span className="name">{p.fullName}{p.isMe && <> <span className="sub">(Anda)</span></>}</span>
              <span className="meta"><span className="chip">{p.roleLabel || "—"}</span></span>
            </div>
            {p.open ? (
              <span className="meta"><span className="pill on">sejak {fmtTime(p.open.on)}</span><Elapsed className="mono" since={p.open.onIso} /></span>
            ) : <span className="pill off">Off duty</span>}
          </div>
        ))}
      </div>
    </section>
  );
}

function ManualForm({ settings, users, editing, onCancel, onSaved, formRef }) {
  const toast = useToast();
  const [userId, setUserId] = useState("");
  const [on, setOn] = useState("");
  const [off, setOff] = useState("");
  const [err, setErr] = useState("");
  const [lastEditId, setLastEditId] = useState(null);

  // Isi form saat catatan dipilih untuk diedit
  if (editing && editing.id !== lastEditId) {
    setLastEditId(editing.id); setUserId(String(editing.userId)); setOn(editing.on); setOff(editing.off || ""); setErr("");
  } else if (!editing && lastEditId !== null) {
    setLastEditId(null); setOn(""); setOff(""); setErr("");
  }

  const list = users.filter(u => u.fullName && u.active).sort((a, b) => a.fullName.localeCompare(b.fullName));
  const selected = userId || (list[0] ? String(list[0].id) : "");

  async function submit(e) {
    e.preventDefault(); setErr("");
    if (off && off <= on) { setErr("Jam Off Duty harus setelah jam On Duty."); return; }
    try {
      await api(editing ? "/api/shifts/" + editing.id : "/api/shifts", {
        method: editing ? "PUT" : "POST", body: { userId: Number(selected), on, off },
      });
      toast(editing ? "Perubahan disimpan" : "Catatan disimpan");
      setOn(""); setOff("");
      onSaved();
    } catch (ex) { setErr(ex.message); }
  }

  return (
    <section className="panel" ref={formRef}>
      <div><h2>{editing ? "Edit Catatan" : "Catat Manual"}</h2><p className="sub">Khusus admin, untuk jam yang terlewat atau koreksi.</p></div>
      <form className="col" onSubmit={submit}>
        <label className="f">Full Name
          <select value={selected} onChange={e => setUserId(e.target.value)}>
            {list.length ? list.map(u => (
              <option key={u.id} value={u.id}>{u.fullName}{u.role ? " — " + (roleOf(settings, u.role)?.label || "") : " (belum ada role)"}</option>
            )) : <option value="">Belum ada karyawan</option>}
          </select>
        </label>
        <div className="row">
          <label className="f">Jam On Duty<input type="datetime-local" required value={on} onChange={e => setOn(e.target.value)} /></label>
          <label className="f">Jam Off Duty<input type="datetime-local" value={off} onChange={e => setOff(e.target.value)} /></label>
        </div>
        {err && <p className="err">{err}</p>}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          {editing && <button type="button" className="btn ghost" onClick={onCancel}>Batal edit</button>}
          <button type="submit" className="btn primary">{editing ? "Simpan perubahan" : "Simpan catatan"}</button>
        </div>
      </form>
    </section>
  );
}

export default function AbsenView({ me, settings, board, recent, users, onChanged }) {
  const toast = useToast();
  const isAdmin = !!me.isAdmin;
  const [editing, setEditing] = useState(null);
  const formRef = useRef(null);

  async function del(s) {
    try { await api("/api/shifts/" + s.id, { method: "DELETE" }); toast("Catatan dihapus"); onChanged(); }
    catch (e) { toast(e.message); }
  }
  function edit(s) {
    setEditing(s);
    setTimeout(() => formRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
  }

  return (
    <div className="grid2">
      <div className="stack">
        <section className="panel">
          <div><h2>Status Saya</h2><p className="sub">Jam dicatat otomatis oleh server saat tombol ditekan.</p></div>
          <MyCard me={me} settings={settings} board={board} onChanged={onChanged} />
        </section>
        <Board board={board} />
      </div>

      {isAdmin && (
        <ManualForm settings={settings} users={users} editing={editing} formRef={formRef}
          onCancel={() => setEditing(null)} onSaved={() => { setEditing(null); onChanged(); }} />
      )}

      <section className="panel span-all">
        <div><h2>Catatan Terbaru</h2><p className="sub">{isAdmin ? "100 catatan terakhir semua karyawan." : "100 catatan terakhir Anda."}</p></div>
        {!recent.length ? (
          <div className="empty"><b>Belum ada catatan</b>Catatan muncul setelah tombol On Duty ditekan.</div>
        ) : (
          <ShiftTable shifts={recent} onEdit={isAdmin ? edit : null} onDelete={isAdmin ? del : null} />
        )}
      </section>
    </div>
  );
}
