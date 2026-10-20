import React, { useCallback, useEffect, useState } from "react";
import { api, logout } from "../api.js";
import { Avatar, BULAN, HARI, pad, roleOf, useNow } from "../utils.jsx";
import AbsenView from "./AbsenView.jsx";
import LaporanView from "./LaporanView.jsx";
import AturView from "./AturView.jsx";
import CutiView from "./CutiView.jsx";
import StaffView from "./StaffView.jsx";

const TABS = [
  { id: "absen", label: "Absensi" },
  { id: "cuti", label: "Cuti" },
  { id: "laporan", label: "Laporan & Excel" },
  { id: "staff", label: "Status Karyawan", staff: true },
  { id: "atur", label: "Tarif & Karyawan", admin: true },
];

function Clock() {
  const d = new Date(useNow());
  return (
    <div className="clock">
      <b>{pad(d.getHours())}:{pad(d.getMinutes())}:{pad(d.getSeconds())}</b>
      <span>{HARI[d.getDay()]}, {d.getDate()} {BULAN[d.getMonth()]} {d.getFullYear()}</span>
    </div>
  );
}

function initialTab(me) {
  let t = "absen";
  try { t = localStorage.getItem("smgo-tab") || "absen"; } catch { /* storage diblokir */ }
  const def = TABS.find(x => x.id === t);
  if (!def || (def.admin && !me.isAdmin) || (def.staff && !(me.canApprove || me.isAdmin))) t = "absen";
  return t;
}

export default function MainApp({ me, settings, tz, reloadMe, setSettings }) {
  const isAdmin = !!me.isAdmin;
  const [tab, setTabState] = useState(() => initialTab(me));
  const [board, setBoard] = useState([]);
  const [recent, setRecent] = useState([]);
  const [users, setUsers] = useState([]);
  const [pendingLeaves, setPendingLeaves] = useState(0);
  const canSeeInbox = !!me.canApprove;
  const canSeeStaff = !!(me.canApprove || me.isAdmin);
  const allowed = t => (!t.admin || isAdmin) && (!t.staff || canSeeStaff);

  const setTab = t => {
    const def = TABS.find(x => x.id === t);
    if (!def || !allowed(def)) t = "absen";
    setTabState(t);
    try { localStorage.setItem("smgo-tab", t); } catch { /* storage diblokir */ }
  };

  const loadBoard = useCallback(async () => {
    try { const d = await api("/api/board"); setBoard(d.people); } catch { /* ditampilkan via toast di aksi */ }
  }, []);
  const loadRecent = useCallback(async () => {
    try { const d = await api("/api/shifts/recent"); setRecent(d.shifts); } catch { /* abaikan */ }
  }, []);
  const loadUsers = useCallback(async () => {
    if (!isAdmin) return [];
    try { const d = await api("/api/users"); setUsers(d.users); return d.users; } catch { return []; }
  }, [isAdmin]);

  // Jumlah cuti menunggu persetujuan (untuk Manager/CEO), tidak termasuk pengajuan sendiri
  const loadPending = useCallback(async () => {
    if (!canSeeInbox) return;
    try { const d = await api("/api/leaves/inbox"); setPendingLeaves(d.pending.filter(l => l.userId !== d.myId).length); } catch { /* abaikan */ }
  }, [canSeeInbox]);

  useEffect(() => { loadBoard(); loadRecent(); loadUsers(); loadPending(); }, [loadBoard, loadRecent, loadUsers, loadPending]);
  useEffect(() => {
    if (!canSeeInbox) return;
    const t = setInterval(() => { if (document.visibilityState === "visible") loadPending(); }, 60000);
    return () => clearInterval(t);
  }, [canSeeInbox, loadPending]);

  // Segarkan papan & catatan tiap 20 detik saat tab Absensi terlihat
  useEffect(() => {
    if (tab !== "absen") return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") { loadBoard(); loadRecent(); }
    }, 20000);
    return () => clearInterval(t);
  }, [tab, loadBoard, loadRecent]);

  const refreshAbsen = () => { loadBoard(); loadRecent(); };

  return (
    <div className="wrap">
      <header className="top">
        <div className="brand">
          <img src="/logo.png" alt="SMGO Taxi Service" width="640" height="328" />
          <div><h1>Absensi <span>SMGO</span></h1><p className="sub">Zona waktu {tz}</p></div>
        </div>
        <div className="top-right">
          <Clock />
          <div className="me">
            <Avatar url={me.avatar} name={me.fullName} />
            <span className="who"><b>{me.fullName}</b><small>{(roleOf(settings, me.role)?.label || "Belum ada role") + (isAdmin ? " · Admin" : "") + (me.resigned ? " · " + me.endLabel : "")}</small></span>
            <button className="btn ghost" onClick={logout}>Keluar</button>
          </div>
        </div>
      </header>

      <nav className="tabs" role="tablist">
        {TABS.filter(allowed).map(t => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
            {t.label}{t.id === "cuti" && pendingLeaves > 0 && <span className="badge" aria-label={`${pendingLeaves} menunggu persetujuan`}>{pendingLeaves}</span>}
          </button>
        ))}
      </nav>

      {tab === "absen" && (
        <AbsenView me={me} settings={settings} board={board} recent={recent} users={users} onChanged={refreshAbsen} />
      )}
      {tab === "cuti" && <CutiView me={me} onInboxChanged={loadPending} />}
      {tab === "staff" && canSeeStaff && <StaffView onChanged={() => { loadBoard(); loadUsers(); }} />}
      {tab === "laporan" && <LaporanView me={me} users={users} loadUsers={loadUsers} />}
      {tab === "atur" && isAdmin && (
        <AturView
          me={me}
          settings={settings}
          users={users}
          loadUsers={loadUsers}
          onSettingsSaved={s => { setSettings(s); loadRecent(); }}
          onUsersChanged={changedId => { loadBoard(); loadRecent(); if (changedId === me.id) reloadMe(); }}
        />
      )}
    </div>
  );
}
