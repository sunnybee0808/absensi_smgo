import React from "react";
import { ConfirmButton, fmtDate, fmtDur, fmtTime, money } from "../utils.jsx";

function offText(s) {
  if (!s.off) return <span className="pill on">aktif</span>;
  const otherDay = s.off.slice(0, 10) !== s.on.slice(0, 10);
  return (otherDay ? s.off.slice(8, 10) + "/" + s.off.slice(5, 7) + " " : "") + fmtTime(s.off);
}

/* Tabel catatan shift; kolom aksi hanya muncul jika onEdit/onDelete diberikan */
export default function ShiftTable({ shifts, onEdit, onDelete }) {
  const withAct = !!(onEdit || onDelete);
  return (
    <div className="tbl-wrap">
      <table>
        <thead>
          <tr>
            <th>Tanggal</th><th>Full Name</th><th>Role</th>
            <th className="num">On</th><th className="num">Off</th><th className="num">Durasi</th><th className="num">Upah</th>
            {withAct && <th></th>}
          </tr>
        </thead>
        <tbody>
          {shifts.map(s => (
            <tr key={s.id}>
              <td>{fmtDate(s.on)}</td>
              <td>{s.fullName}</td>
              <td><span className="chip">{s.roleLabel}</span></td>
              <td className="num">{fmtTime(s.on)}</td>
              <td className="num">{offText(s)}</td>
              <td className="num">{s.minutes == null ? "—" : fmtDur(s.minutes)}</td>
              <td className="num">{s.pay == null ? "—" : money(s.pay)}</td>
              {withAct && (
                <td className="act">
                  <button className="btn ghost" onClick={() => onEdit(s)}>Edit</button>
                  <ConfirmButton onConfirm={() => onDelete(s)} />
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
