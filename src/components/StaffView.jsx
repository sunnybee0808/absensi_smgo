import React, { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import { useToast } from "../toast.js";
import { Avatar, BULAN, HARI } from "../utils.jsx";

const ACTIONS = [
  { id: "resign", label: "Resign", ending: true, hint: "Contoh: Mengundurkan diri karena pindah kota" },
  { id: "sp1", label: "SP 1", ending: false, hint: "Contoh: Terlambat 3 kali dalam sebulan tanpa keterangan" },
  { id: "sp2", label: "SP 2", ending: false, hint: "Contoh: Masih terlambat setelah menerima SP 1" },
  { id: "sp3_phk", label: "SP 3 & PHK", ending: true, hint: "Contoh: Pelanggaran berulang setelah SP 2, diberhentikan dengan hormat" },
  { id: "sp3_ptdh", label: "SP 3 & PTDH", ending: true, hint: "Contoh: Pelanggaran berat, diberhentikan tidak dengan hormat" },
];

function fmtDay(s) {
  const d = new Date(s + "T00:00");
  return `${HARI[d.getDay()]}, ${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;
}

/* Status kepegawaian: Aktif bekerja / Akan Resign / Resign / SP 3 & PHK / SP 3 & PTDH */
export function EmploymentPill({ resignedAt, resigned, endLabel }) {
  if (!resignedAt) return <span className="pill on">Aktif bekerja</span>;
  return resigned
    ? <span className="pill no">{endLabel} · {fmtDay(resignedAt)}</span>
    : <span className="pill wait">Akan {endLabel} · {fmtDay(resignedAt)}</span>;
}

function ActionForm({ person, today, onCancel, onDone }) {
  const toast = useToast();
  const [type, setType] = useState(person.resignedAt ? "sp1" : "resign");
  const [date, setDate] = useState(today);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const def = ACTIONS.find(a => a.id === type);

  async function submit(e) {
    e.preventDefault(); setErr(""); setBusy(true);
    try {
      await api(`/api/staff/${person.id}/actions`, { method: "POST", body: { type, date, reason } });
      toast(`${def.label} untuk ${person.fullName} dicatat`);
      onDone();
    } catch (ex) { setErr(ex.message); setBusy(false); }
  }

  return (
    <form className="action-form" onSubmit={submit}>
      <label className="f">Tindakan
        <select value={type} onChange={e => setType(e.target.value)}>
          {ACTIONS.map(a => (
            <option key={a.id} value={a.id} disabled={a.ending && !!person.resignedAt}>
              {a.label}{a.ending && person.resignedAt ? " (sudah berhenti)" : ""}
            </option>
          ))}
        </select>
      </label>
      <label className="f">Tanggal berlaku<input type="date" required value={date} onChange={e => setDate(e.target.value)} /></label>
      <label className="f span2">Alasan
        <textarea rows={3} required minLength={3} maxLength={500} value={reason} onChange={e => setReason(e.target.value)}
          placeholder={def.hint} />
      </label>
      <p className={"note span2" + (def.ending ? " note-danger" : "")}>
        {def.ending
          ? `${def.label} mengakhiri hubungan kerja. Mulai tanggal berlaku, ${person.fullName} tidak bisa On Duty atau mengajukan cuti, dan namanya hilang dari Papan Tugas.`
          : `${def.label} adalah surat peringatan. ${person.fullName} tetap bisa bekerja seperti biasa.`}
      </p>
      {err && <p className="err span2">{err}</p>}
      <div className="row span2" style={{ justifyContent: "flex-end" }}>
        <button type="button" className="btn ghost" onClick={onCancel}>Batal</button>
        <button type="submit" className={"btn " + (def.ending ? "danger-solid" : "primary")} disabled={busy}>Simpan {def.label}</button>
      </div>
    </form>
  );
}

function History({ actions, canEdit, isMe, onChanged }) {
  const toast = useToast();
  const [armed, setArmed] = useState(null);
  useEffect(() => { if (armed == null) return; const t = setTimeout(() => setArmed(null), 3000); return () => clearTimeout(t); }, [armed]);

  async function cancel(a) {
    if (armed !== a.id) { setArmed(a.id); return; }
    try { await api(`/api/staff/actions/${a.id}/cancel`, { method: "POST" }); toast(`${a.typeLabel} dibatalkan`); onChanged(); }
    catch (e) { toast(e.message); }
  }

  if (!actions.length) return <p className="sub" style={{ margin: 0 }}>Belum ada catatan tindakan.</p>;
  return (
    <ul className="action-history">
      {actions.map(a => (
        <li key={a.id} className={a.cancelled ? "is-cancelled" : ""}>
          <div className="ah-head">
            <span className={"chip " + (a.ending ? "end" : "warn")}>{a.typeLabel}</span>
            <span className="mono">{fmtDay(a.date)}</span>
            {a.cancelled && <span className="pill off">Dibatalkan</span>}
            {canEdit && !isMe && !a.cancelled && (
              <button className={"btn ghost danger" + (armed === a.id ? " armed" : "")} onClick={() => cancel(a)}>
                {armed === a.id ? "Yakin batalkan?" : "Batalkan"}
              </button>
            )}
          </div>
          <p className="ah-reason">{a.reason}</p>
          <span className="sub">
            Dicatat oleh {a.createdBy || "—"}, {a.createdAt.replace("T", " ")}
            {a.cancelled && ` · Dibatalkan oleh ${a.cancelledBy || "—"}, ${a.cancelledAt.replace("T", " ")}`}
          </span>
        </li>
      ))}
    </ul>
  );
}

function PersonRow({ p, canEdit, isMe, today, open, setOpen, onChanged }) {
  const formOpen = open?.id === p.id && open.mode === "form";
  const histOpen = open?.id === p.id && open.mode === "history";
  const activeCount = p.actions.filter(a => !a.cancelled).length;

  return (
    <div className={"staff-row" + (p.resigned ? " is-resigned" : "")}>
      <div className="staff-main">
        <Avatar url={p.avatar} name={p.fullName} />
        <div className="staff-info">
          <span className="name">{p.fullName}{isMe && <span className="sub"> (Anda)</span>}</span>
          <span className="meta">
            <span className="chip">{p.roleLabel || "Belum ada role"}</span>
            <EmploymentPill resignedAt={p.resignedAt} resigned={p.resigned} endLabel={p.endLabel} />
            {p.sp && <span className="pill wait">{p.sp}</span>}
          </span>
        </div>
        <div className="staff-act row">
          <button className="btn ghost" aria-expanded={histOpen} onClick={() => setOpen(histOpen ? null : { id: p.id, mode: "history" })}>
            Riwayat ({activeCount})
          </button>
          {canEdit && !isMe && !formOpen && (
            <button className="btn" onClick={() => setOpen({ id: p.id, mode: "form" })}>Catat tindakan</button>
          )}
          {canEdit && isMe && <span className="sub">Status sendiri diubah Manager/CEO lain</span>}
        </div>
      </div>
      {formOpen && <ActionForm person={p} today={today} onCancel={() => setOpen(null)} onDone={() => { setOpen({ id: p.id, mode: "history" }); onChanged(); }} />}
      {histOpen && <History actions={p.actions} canEdit={canEdit} isMe={isMe} onChanged={onChanged} />}
    </div>
  );
}

const FILTERS = [
  ["semua", "Semua", () => true],
  ["aktif", "Aktif bekerja", p => !p.resignedAt],
  ["sp", "Ada SP", p => !!p.sp],
  ["berhenti", "Berhenti", p => !!p.resignedAt],
];

export default function StaffView({ onChanged }) {
  const [data, setData] = useState(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("semua");
  const [open, setOpen] = useState(null);

  const load = useCallback(async () => {
    try { setData(await api("/api/staff")); } catch { /* abaikan */ }
  }, []);
  useEffect(() => { load(); }, [load]);
  const changed = () => { load(); onChanged(); };

  if (!data) return null;
  const query = q.trim().toLowerCase();
  const fn = FILTERS.find(f => f[0] === filter)[2];
  const list = data.staff.filter(p => (!query || p.fullName.toLowerCase().includes(query)) && fn(p));

  return (
    <div className="stack">
      <section className="panel">
        <div className="panel-head">
          <div>
            <h2>Status Karyawan</h2>
            <p className="sub">{data.canEdit
              ? "Catat Resign, SP 1, SP 2, SP 3 & PHK, atau SP 3 & PTDH beserta alasannya."
              : "Anda hanya bisa melihat. Status karyawan hanya bisa diubah oleh Manager atau CEO."}</p>
          </div>
          <input type="search" placeholder="Cari nama…" style={{ maxWidth: 200 }} value={q} onChange={e => setQ(e.target.value)} aria-label="Cari nama" />
        </div>
        <div className="seg">
          {FILTERS.map(([id, label, f]) => (
            <button key={id} aria-pressed={filter === id} onClick={() => setFilter(id)}>
              {label} <span className="mono">({data.staff.filter(f).length})</span>
            </button>
          ))}
        </div>
        {!list.length ? <div className="empty">Tidak ada karyawan yang cocok.</div> : (
          <div className="staff-list">
            {list.map(p => (
              <PersonRow key={p.id} p={p} canEdit={data.canEdit} isMe={p.id === data.myId} today={data.today}
                open={open} setOpen={setOpen} onChanged={changed} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
