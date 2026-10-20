import React, { useEffect, useState } from "react";

const LOGIN_ERRORS = {
  dibatalkan: "Login dibatalkan.",
  state: "Sesi login kedaluwarsa. Coba lagi.",
  token: "Discord menolak login. Coba lagi.",
  profil: "Profil Discord tidak bisa dibaca. Coba lagi.",
  bukan_anggota: "Akun Discord Anda bukan anggota server SMGO. Minta undangan dari admin.",
  nonaktif: "Akun Anda dinonaktifkan. Hubungi admin.",
  server: "Server sedang bermasalah. Coba lagi sebentar.",
};

function DiscordIcon() {
  return (
    <svg width="22" height="17" viewBox="0 0 71 55" aria-hidden="true">
      <path fill="currentColor" d="M60.1 4.9A58.5 58.5 0 0 0 45.6.4a.2.2 0 0 0-.2.1 40.8 40.8 0 0 0-1.8 3.7 54 54 0 0 0-16.2 0A37.4 37.4 0 0 0 25.6.5a.2.2 0 0 0-.2-.1 58.4 58.4 0 0 0-14.5 4.5.2.2 0 0 0-.1.1C1.6 18.7-1 32.2.3 45.5v.1a58.8 58.8 0 0 0 17.7 9 .2.2 0 0 0 .3-.1 42 42 0 0 0 3.6-5.9.2.2 0 0 0-.1-.3 38.8 38.8 0 0 1-5.5-2.6.2.2 0 0 1 0-.4l1.1-.9a.2.2 0 0 1 .2 0 42 42 0 0 0 35.6 0 .2.2 0 0 1 .2 0l1.1.9a.2.2 0 0 1 0 .4 36.4 36.4 0 0 1-5.5 2.6.2.2 0 0 0-.1.3 47.2 47.2 0 0 0 3.6 5.9.2.2 0 0 0 .3.1 58.6 58.6 0 0 0 17.7-9v-.1c1.5-15.3-2.5-28.7-10.6-40.5ZM23.7 37.3c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2 6.5 3.3 6.4 7.2c0 4-2.8 7.2-6.4 7.2Zm23.6 0c-3.5 0-6.4-3.2-6.4-7.2s2.8-7.2 6.4-7.2 6.5 3.3 6.4 7.2c0 4-2.8 7.2-6.4 7.2Z" />
    </svg>
  );
}

export default function LoginScreen({ devLogin, connError }) {
  const [err, setErr] = useState(connError || "");
  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get("login_error");
    if (code) {
      setErr(LOGIN_ERRORS[code] || "Login gagal. Coba lagi.");
      window.history.replaceState(null, "", "/");
    }
  }, []);

  return (
    <div className="gate">
      <div className="gate-card">
        <img className="logo" src="/logo.png" alt="SMGO Taxi Service" width="640" height="328" />
        <h1>Absensi <span>SMGO</span></h1>
        <p>Masuk dengan akun Discord Anda untuk mencatat On Duty dan Off Duty.</p>
        <a className="btn discord" href="/auth/discord"><DiscordIcon /> Masuk dengan Discord</a>
        {err && <p className="err">{err}</p>}
        {devLogin && (
          <div>
            <p className="hint">Mode uji coba lokal aktif.</p>
            <form className="row" action="/auth/dev" method="get">
              <label className="f">ID uji<input name="id" defaultValue="dev1" /></label>
              <label className="f">Nama Discord uji<input name="name" defaultValue="tes.driver" /></label>
              <button className="btn" type="submit">Masuk uji</button>
            </form>
          </div>
        )}
      </div>
    </div>
  );
}
