import React, { useCallback, useEffect, useRef, useState } from "react";
import { ToastContext } from "./toast.js";
import { getMe, setUnauthorizedHandler } from "./api.js";
import { NowProvider } from "./utils.jsx";
import LoginScreen from "./components/LoginScreen.jsx";
import NameScreen from "./components/NameScreen.jsx";
import MainApp from "./components/MainApp.jsx";

export default function App() {
  const [state, setState] = useState({ loading: true, me: null, settings: null, tz: "", devLogin: false, error: "" });
  const [toastMsg, setToastMsg] = useState("");
  const toastTimer = useRef(null);

  const toast = useCallback(msg => {
    setToastMsg(msg);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(""), 2800);
  }, []);

  const boot = useCallback(async () => {
    try {
      const d = await getMe();
      setState({ loading: false, me: d.user, settings: d.settings || null, tz: d.tz || "", devLogin: !!d.devLogin, error: "" });
    } catch (e) {
      setState(s => ({ ...s, loading: false, me: null, error: e.message }));
    }
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => setState(s => ({ ...s, me: null })));
    boot();
  }, [boot]);

  let screen;
  if (state.loading) screen = null;
  else if (!state.me) screen = <LoginScreen devLogin={state.devLogin} connError={state.error} />;
  else if (!state.me.fullName) screen = <NameScreen me={state.me} onSaved={boot} />;
  else screen = (
    <MainApp
      me={state.me}
      settings={state.settings}
      tz={state.tz}
      reloadMe={boot}
      setSettings={settings => setState(s => ({ ...s, settings }))}
    />
  );

  return (
    <ToastContext.Provider value={toast}>
      <NowProvider>
        {screen}
        {toastMsg && <div className="toast" role="status">{toastMsg}</div>}
      </NowProvider>
    </ToastContext.Provider>
  );
}
