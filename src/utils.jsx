import React, { createContext, useContext, useEffect, useState } from "react";

export const pad = n => String(n).padStart(2, "0");
export const HARI = ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"];
export const BULAN = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
export const UNITS = { menit: 1, jam: 60 };

const parseLocal = s => (s ? new Date(s) : null);
export function fmtDate(s) {
  const d = parseLocal(s);
  return HARI[d.getDay()] + ", " + d.getDate() + " " + BULAN[d.getMonth()] + " " + d.getFullYear();
}
export const fmtTime = s => (s ? s.slice(11, 16) : "—");
export function fmtDur(m) {
  m = Math.max(0, Math.floor(m));
  return Math.floor(m / 60) + "j " + pad(m % 60) + "m";
}
export const money = v =>
  "$" + (Math.round(v * 100) / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const dateOnly = d => d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
export const roleOf = (settings, id) => (settings?.roles || []).find(r => r.id === id) || null;
export const rateText = r => (r ? `$${r.amount} / ${r.every} ${r.unit}` : "—");

/* Satu detak jam untuk seluruh aplikasi */
const NowContext = createContext(Date.now());
export function NowProvider({ children }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  return <NowContext.Provider value={now}>{children}</NowContext.Provider>;
}
export const useNow = () => useContext(NowContext);

/* Durasi berjalan sejak waktu ISO */
export function Elapsed({ since, long, className }) {
  const now = useNow();
  const sec = Math.max(0, Math.floor((now - new Date(since)) / 1000));
  const txt = long
    ? `${pad(Math.floor(sec / 3600))}:${pad(Math.floor(sec / 60) % 60)}:${pad(sec % 60)}`
    : fmtDur(sec / 60);
  return <span className={className}>{txt}</span>;
}

export function Avatar({ url, name }) {
  if (url) return <img className="avatar" src={url} alt="" width="32" height="32" loading="lazy" />;
  const ini = String(name || "?").split(" ").map(w => w[0]).slice(0, 2).join("").toUpperCase();
  return <span className="avatar fallback">{ini}</span>;
}

/* Tombol hapus dua langkah: klik pertama "Yakin?", klik kedua menjalankan */
export function ConfirmButton({ onConfirm, children = "Hapus", className = "btn ghost danger" }) {
  const [armed, setArmed] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3000);
    return () => clearTimeout(t);
  }, [armed]);
  return (
    <button
      type="button"
      className={className + (armed ? " armed" : "")}
      onClick={() => (armed ? (setArmed(false), onConfirm()) : setArmed(true))}
    >
      {armed ? "Yakin?" : children}
    </button>
  );
}
