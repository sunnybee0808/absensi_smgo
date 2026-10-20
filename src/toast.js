import { createContext, useContext } from "react";

// Notifikasi singkat di bawah layar; disediakan oleh App.jsx
export const ToastContext = createContext(() => {});
export const useToast = () => useContext(ToastContext);
