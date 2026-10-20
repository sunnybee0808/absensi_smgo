import React, { useEffect, useRef, useState } from "react";
import { api } from "../api.js";
import { dateOnly, fmtDur, money } from "../utils.jsx";
import ShiftTable from "./ShiftTable.jsx";
import { fmtRange, StatusPill } from "./CutiView.jsx";

const PERIODS = [
  { id: "today", label: "Hari ini" },
  { id: "week", label: "Minggu ini" },
  { id: "month", label: "Bulan ini" },
  { id: "lastmonth", label: "Bulan lalu" },
  { id: "custom", label: "Pilih tanggal" },
];

function rangeFor(p) {
  const now = new Date(); let a, b;
  if (p === "today") a = b = now;
  else if (p === "week") { const dow = (now.getDay() + 6) % 7; a = new Date(now); a.setDate(now.getDate() - dow); b = new Date(a); b.setDate(a.getDate() + 6); }
  else if (p === "month") { a = new Date(now.getFullYear(), now.getMonth(), 1); b = new Date(now.getFullYear(), now.getMonth() + 1, 0); }
  else if (p === "lastmonth") { a = new Date(now.getFullYear(), now.getMonth() - 1, 1); b = new Date(now.getFullYear(), now.getMonth(), 0); }
  return a ? [dateOnly(a), dateOnly(b)] : null;
}

export default function LaporanView({ me, users, loadUsers }) {
  const isAdmin = !!me.isAdmin;
  const [period, setPeriod] = useState("month");
  const [[from, to], setRange] = useState(() => rangeFor("month"));
  const [userId, setUserId] = useState("");
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const fromRef = useRef(null);
  const seq = useRef(0);

  useEffect(() => { if (isAdmin) loadUsers(); }, [isAdmin, loadUsers]);

  const query = (() => {
    const q = new URLSearchParams({ from, to });
    if (isAdmin && userId) q.set("userId", userId);
    return q.toString();
  })();

  useEffect(() => {
    if (!from || !to) return;
    if (to < from) { setError("Tanggal akhir harus sama atau setelah tanggal awal."); setData(null); return; }
    const my = ++seq.current;
    api("/api/shifts?" + query)
      .then(d => { if (my === seq.current) { setData(d); setError(""); } })
      .catch(e => { if (my === seq.current) { setError(e.message); setData(null); } });
  }, [query, from, to]);

  function pickPeriod(p) {
    setPeriod(p);
    const r = rangeFor(p);
    if (r) setRange(r); else setTimeout(() => fromRef.current?.focus(), 0);
  }
  function pickDate(which, v) {
    setPeriod("custom");
    setRange(which === "from" ? [v, to] : [from, v]);
  }

  const shifts = data?.shifts || [];
  const summary = data?.summary || [];
  const todayStr = dateOnly(new Date());
  const leaves = data?.leaves || [];
  const tLeave = summary.reduce((a, g) => a + (g.leaveDays || 0), 0);
  const tMin = summary.reduce((a, g) => a + g.minutes, 0);
  const tPay = summary.reduce((a, g) => a + g.pay, 0);
  const open = shifts.filter(s => s.minutes == null).length;
  const canExport = shifts.length > 0 || leaves.length > 0;

  return (
    <div className="stack">
      <section className="panel">
        <div><h2>Periode</h2><p className="sub">Pilih periode, lalu unduh sebagai file Excel (.xlsx).</p></div>
        <div className="seg">
          {PERIODS.map(p => (
            <button key={p.id} aria-pressed={period === p.id} onClick={() => pickPeriod(p.id)}>{p.label}</button>
          ))}
        </div>
        <div className="row">
          <label className="f">Dari tanggal<input ref={fromRef} type="date" value={from} onChange={e => pickDate("from", e.target.value)} /></label>
          <label className="f">Sampai tanggal<input type="date" value={to} onChange={e => pickDate("to", e.target.value)} /></label>
          {isAdmin && (
            <label className="f">Karyawan
              <select value={userId} onChange={e => setUserId(e.target.value)}>
                <option value="">Semua karyawan</option>
                {users.filter(u => u.fullName).sort((a, b) => a.fullName.localeCompare(b.fullName)).map(u => (
                  <option key={u.id} value={u.id}>{u.fullName}</option>
                ))}
              </select>
            </label>
          )}
          <a className="btn primary" href={canExport ? "/api/export?" + query : undefined}
            aria-disabled={!canExport} style={canExport ? undefined : { opacity: 0.45, pointerEvents: "none" }}>
            Unduh Excel
          </a>
        </div>
        <div className="stats">
          <div className="stat"><span>Shift</span><b>{shifts.length}</b></div>
          <div className="stat"><span>Total jam kerja</span><b>{fmtDur(tMin)}</b></div>
          <div className="stat hl"><span>Total upah</span><b>{money(tPay)}</b></div>
          <div className="stat"><span>Masih aktif</span><b>{open}</b></div>
          <div className="stat"><span>Hari cuti disetujui</span><b>{tLeave}</b></div>
        </div>
      </section>

      <section className="panel">
        <h2>Rekap per Karyawan</h2>
        {error ? <div className="empty">{error}</div> : !summary.length ? <div className="empty">Tidak ada catatan pada periode ini.</div> : (
          <>
            <div className="tbl-wrap">
              <table>
                <thead><tr><th>Full Name</th><th>Role</th><th>Tarif</th><th className="num">Shift</th><th className="num">Total jam</th><th className="num">Total upah</th><th className="num">Hari cuti</th></tr></thead>
                <tbody>
                  {summary.map(g => (
                    <tr key={g.userId}>
                      <td>{g.fullName}{g.resignedAt && <> <span className={"pill " + (g.resignedAt <= todayStr ? "no" : "wait")}>{g.status} {g.resignedAt}</span></>}</td>
                      <td><span className="chip">{g.roleLabel}</span></td>
                      <td className="mono" style={{ color: "var(--ink-3)" }}>{g.rate}</td>
                      <td className="num">{g.shifts}{g.open > 0 && <> <span className="pill on">{g.open} aktif</span></>}</td>
                      <td className="num">{fmtDur(g.minutes)}</td>
                      <td className="num">{money(g.pay)}</td>
                      <td className="num">{g.leaveDays || 0}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot><tr><td colSpan={3}>Total</td><td className="num">{shifts.length}</td><td className="num">{fmtDur(tMin)}</td><td className="num">{money(tPay)}</td><td className="num">{tLeave}</td></tr></tfoot>
              </table>
            </div>
            {open > 0 && <p className="note">Shift yang masih aktif belum dihitung upahnya sampai Off Duty.</p>}
          </>
        )}
      </section>

      <section className="panel">
        <div><h2>Cuti dalam Periode</h2><p className="sub">Hari cuti di rekap hanya menghitung yang disetujui dan jatuh di dalam periode.</p></div>
        {!leaves.length ? <div className="empty">Tidak ada pengajuan cuti pada periode ini.</div> : (
          <div className="tbl-wrap">
            <table>
              <thead><tr><th>Full Name</th><th>Jenis</th><th>Tanggal</th><th className="num">Hari di periode</th><th>Alasan</th><th>Status</th><th>Oleh</th></tr></thead>
              <tbody>
                {leaves.map(l => (
                  <tr key={l.id}>
                    <td>{l.fullName}</td><td><span className="chip">{l.typeLabel}</span></td>
                    <td>{fmtRange(l.start, l.end)}</td><td className="num">{l.daysInPeriod}</td>
                    <td className="wrap-cell">{l.reason}</td><td><StatusPill l={l} /></td><td>{l.reviewer || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="panel">
        <h2>Rincian Shift</h2>
        {shifts.length > 0 && <ShiftTable shifts={shifts} />}
      </section>
    </div>
  );
}
