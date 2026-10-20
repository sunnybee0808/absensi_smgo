import React, { useCallback, useEffect, useState } from "react";
import { api } from "../api.js";
import { useToast } from "../toast.js";
import { BULAN, HARI } from "../utils.jsx";

const TYPES = [
  { id: "tahunan", label: "Cuti Tahunan" },
  { id: "sakit", label: "Sakit" },
  { id: "pribadi", label: "Izin Pribadi" },
  { id: "lainnya", label: "Lainnya" },
];
const PILL = { pending: "wait", approved: "on", rejected: "no", cancelled: "off" };

function fmtDay(s) {
  const d = new Date(s + "T00:00");
  return `${HARI[d.getDay()]}, ${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;
}
export function fmtRange(a, b) { return a === b ? fmtDay(a) : `${fmtDay(a)} – ${fmtDay(b)}`; }
function daysBetween(a, b) {
  if (!a || !b || b < a) return 0;
  return Math.round((new Date(b + "T00:00") - new Date(a + "T00:00")) / 86400000) + 1;
}
export function StatusPill({ l }) { return <span className={"pill " + (PILL[l.status] || "off")}>{l.statusLabel}</span>; }
function Decision({ l }) {
  if (!l.reviewer) return <span className="sub">—</span>;
  return <span>{l.reviewer}{l.reviewNote && <small className="block-sub">“{l.reviewNote}”</small>}</span>;
}

function LeaveForm({ today, onSubmitted, me }) {
  const toast = useToast();
  const [type, setType] = useState("tahunan");
  const [start, setStart] = useState(today);
  const [end, setEnd] = useState(today);
  const [reason, setReason] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (today) { setStart(s => s || today); setEnd(e => e || today); } }, [today]);
  const days = daysBetween(start, end);
  if (me.resigned) {
    return (
      <section className="panel">
        <div><h2>Ajukan Cuti</h2></div>
        <div className="empty"><b>Tidak bisa mengajukan cuti</b>Status Anda {me.endLabel} sejak {me.resignedAt}.</div>
      </section>
    );
  }

  async function submit(e) {
    e.preventDefault(); setErr("");
    if (end < start) { setErr("Tanggal selesai harus sama atau setelah tanggal mulai."); return; }
    setBusy(true);
    try {
      await api("/api/leaves", { method: "POST", body: { type, start, end, reason } });
      toast("Pengajuan cuti terkirim. Menunggu persetujuan Manager atau CEO.");
      setReason(""); onSubmitted();
    } catch (ex) { setErr(ex.message); }
    setBusy(false);
  }

  return (
    <section className="panel">
      <div><h2>Ajukan Cuti</h2><p className="sub">Pengajuan perlu disetujui oleh Manager atau CEO.</p></div>
      <form className="col" onSubmit={submit}>
        <label className="f">Jenis
          <select value={type} onChange={e => setType(e.target.value)}>
            {TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </label>
        <div className="row">
          <label className="f">Mulai<input type="date" required value={start} onChange={e => { setStart(e.target.value); if (end < e.target.value) setEnd(e.target.value); }} /></label>
          <label className="f">Selesai<input type="date" required value={end} min={start} onChange={e => setEnd(e.target.value)} /></label>
        </div>
        <label className="f">Alasan
          <textarea rows={3} required minLength={3} maxLength={300} value={reason} onChange={e => setReason(e.target.value)}
            placeholder="Contoh: Acara keluarga di luar kota" />
        </label>
        <p className="note">Lama cuti: <b className="mono">{days} hari</b> (dihitung per hari kalender)</p>
        {err && <p className="err">{err}</p>}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn primary" type="submit" disabled={busy || days < 1}>Kirim pengajuan</button>
        </div>
      </form>
    </section>
  );
}

function MyLeaves({ leaves, onChanged }) {
  const toast = useToast();
  async function cancel(id) {
    try { await api(`/api/leaves/${id}/cancel`, { method: "POST" }); toast("Pengajuan dibatalkan"); onChanged(); }
    catch (e) { toast(e.message); }
  }
  return (
    <section className="panel span-all">
      <div><h2>Pengajuan Saya</h2><p className="sub">Status pengajuan cuti Anda.</p></div>
      {!leaves.length ? (
        <div className="empty"><b>Belum ada pengajuan</b>Pengajuan yang Anda kirim akan muncul di sini beserta statusnya.</div>
      ) : (
        <div className="tbl-wrap">
          <table>
            <thead><tr><th>Status</th><th>Jenis</th><th>Tanggal</th><th className="num">Hari</th><th>Alasan</th><th>Diputuskan oleh</th><th></th></tr></thead>
            <tbody>
              {leaves.map(l => (
                <tr key={l.id}>
                  <td><StatusPill l={l} /></td>
                  <td><span className="chip">{l.typeLabel}</span></td>
                  <td>{fmtRange(l.start, l.end)}</td>
                  <td className="num">{l.days}</td>
                  <td className="wrap-cell">{l.reason}</td>
                  <td><Decision l={l} /></td>
                  <td className="act">{l.status === "pending" && <button className="btn ghost danger" onClick={() => cancel(l.id)}>Batalkan</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function ApprovalCard({ l, canApprove, isMine, onDone }) {
  const toast = useToast();
  const [rejecting, setRejecting] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  async function decide(decision) {
    setBusy(true);
    try {
      await api(`/api/leaves/${l.id}/review`, { method: "POST", body: { decision, note } });
      toast(decision === "approved" ? `Cuti ${l.fullName} disetujui` : `Cuti ${l.fullName} ditolak`);
      onDone();
    } catch (e) { toast(e.message); setBusy(false); }
  }

  return (
    <div className="leave-card">
      <div className="leave-main">
        <div className="name">{l.fullName} <span className="chip">{l.roleLabel}</span></div>
        <div className="meta"><span className="chip warn">{l.typeLabel}</span><span>{fmtRange(l.start, l.end)}</span><b className="mono">{l.days} hari</b></div>
        <p className="leave-reason">{l.reason}</p>
        <span className="sub">Diajukan {l.createdAt.replace("T", " ")}</span>
      </div>
      <div className="leave-act">
        {isMine ? <span className="sub">Pengajuan Anda. Perlu disetujui Manager/CEO lain.</span>
          : !canApprove ? <span className="sub">Hanya Manager atau CEO yang bisa menyetujui.</span>
          : rejecting ? (
            <form className="col" onSubmit={e => { e.preventDefault(); decide("rejected"); }}>
              <label className="f">Alasan penolakan<textarea rows={2} required minLength={3} maxLength={300} autoFocus value={note} onChange={e => setNote(e.target.value)} /></label>
              <div className="row" style={{ justifyContent: "flex-end" }}>
                <button type="button" className="btn ghost" onClick={() => { setRejecting(false); setNote(""); }}>Batal</button>
                <button type="submit" className="btn danger-solid" disabled={busy}>Tolak cuti</button>
              </div>
            </form>
          ) : (
            <div className="row">
              <button className="btn" disabled={busy} onClick={() => setRejecting(true)}>Tolak</button>
              <button className="btn on" disabled={busy} onClick={() => decide("approved")}>Setujui</button>
            </div>
          )}
      </div>
    </div>
  );
}

export default function CutiView({ me, onInboxChanged }) {
  const showInbox = !!(me.canApprove || me.isAdmin);
  const [mine, setMine] = useState([]);
  const [today, setToday] = useState("");
  const [inbox, setInbox] = useState(null);

  const loadMine = useCallback(async () => {
    try { const d = await api("/api/leaves/mine"); setMine(d.leaves); setToday(d.today); } catch { /* abaikan */ }
  }, []);
  const loadInbox = useCallback(async () => {
    if (!showInbox) return;
    try { const d = await api("/api/leaves/inbox"); setInbox(d); } catch { /* abaikan */ }
  }, [showInbox]);

  useEffect(() => { loadMine(); loadInbox(); }, [loadMine, loadInbox]);
  const refresh = () => { loadMine(); loadInbox(); onInboxChanged(); };

  return (
    <div className="grid2">
      <LeaveForm today={today} onSubmitted={refresh} me={me} />

      {showInbox ? (
        <section className="panel">
          <div><h2>Perlu Persetujuan</h2>
            <p className="sub">{me.canApprove ? "Setujui atau tolak pengajuan cuti karyawan." : "Anda admin, tetapi persetujuan hanya oleh Manager atau CEO."}</p></div>
          {!inbox ? null : !inbox.pending.length ? (
            <div className="empty"><b>Tidak ada antrean</b>Semua pengajuan cuti sudah diproses.</div>
          ) : (
            <div className="leave-list">
              {inbox.pending.map(l => (
                <ApprovalCard key={l.id} l={l} canApprove={inbox.canApprove} isMine={l.userId === inbox.myId} onDone={refresh} />
              ))}
            </div>
          )}
        </section>
      ) : (
        <section className="panel">
          <div><h2>Cara Kerja</h2></div>
          <ol className="steps">
            <li>Isi jenis cuti, tanggal, dan alasan, lalu kirim.</li>
            <li>Manager atau CEO menyetujui atau menolak pengajuan Anda.</li>
            <li>Status terlihat di daftar Pengajuan Saya. Pengajuan yang masih menunggu bisa dibatalkan.</li>
            <li>Cuti yang disetujui tercatat di laporan dan file Excel.</li>
          </ol>
        </section>
      )}

      <MyLeaves leaves={mine} onChanged={refresh} />

      {showInbox && inbox && (
        <section className="panel span-all">
          <div><h2>Riwayat Keputusan</h2><p className="sub">100 keputusan cuti terakhir semua karyawan.</p></div>
          {!inbox.history.length ? <div className="empty">Belum ada cuti yang disetujui atau ditolak.</div> : (
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>Full Name</th><th>Jenis</th><th>Tanggal</th><th className="num">Hari</th><th>Status</th><th>Oleh</th><th>Waktu</th></tr></thead>
                <tbody>
                  {inbox.history.map(l => (
                    <tr key={l.id}>
                      <td>{l.fullName}</td><td><span className="chip">{l.typeLabel}</span></td>
                      <td>{fmtRange(l.start, l.end)}</td><td className="num">{l.days}</td>
                      <td><StatusPill l={l} /></td><td><Decision l={l} /></td>
                      <td className="mono">{l.reviewedAt.replace("T", " ")}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
