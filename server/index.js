// Absensi SMGO — server Express dengan login Discord
require("dotenv").config({ path: require("path").join(__dirname, "..", ".env") });
const express = require("express");
const cookieSession = require("cookie-session");
const crypto = require("crypto");
const path = require("path");
const ExcelJS = require("exceljs");
const { DateTime } = require("luxon");
const { db, getSettings, saveSettings } = require("./db");

const {
  PORT = 3000,
  BASE_URL = `http://localhost:${PORT}`,
  DISCORD_CLIENT_ID,
  DISCORD_CLIENT_SECRET,
  DISCORD_GUILD_ID = "",
  ADMIN_DISCORD_IDS = "",
  SESSION_SECRET,
  TZ_ZONE = "Asia/Jakarta",
  NODE_ENV = "development",
  DEV_LOGIN = "0",
} = process.env;

const PROD = NODE_ENV === "production";
if (!SESSION_SECRET || SESSION_SECRET.length < 16) {
  console.error("SESSION_SECRET wajib diisi (minimal 16 karakter) di file .env");
  process.exit(1);
}
const devLoginEnabled = !PROD && DEV_LOGIN === "1";
if (!devLoginEnabled && (!DISCORD_CLIENT_ID || !DISCORD_CLIENT_SECRET)) {
  console.error("DISCORD_CLIENT_ID dan DISCORD_CLIENT_SECRET wajib diisi di file .env");
  process.exit(1);
}
const ENV_ADMINS = new Set(ADMIN_DISCORD_IDS.split(",").map(s => s.trim()).filter(Boolean));
const REDIRECT_URI = `${BASE_URL.replace(/\/$/, "")}/auth/discord/callback`;

const app = express();
app.set("trust proxy", 1);
app.disable("x-powered-by");
app.use(express.json({ limit: "100kb" }));
app.use(cookieSession({
  name: "smgo_sess",
  keys: [SESSION_SECRET],
  maxAge: 30 * 24 * 60 * 60 * 1000,
  sameSite: "lax",
  httpOnly: true,
  secure: PROD,
}));
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Referrer-Policy", "same-origin");
  res.setHeader("X-Frame-Options", "DENY");
  next();
});

/* ---------------- helpers ---------------- */
const nowIso = () => new Date().toISOString();
const UNITS = { menit: 1, jam: 60 };
function roleOf(settings, id) {
  return settings.roles.find(r => r.id === id) || null;
}
function rateText(r) { return r ? `$${r.amount} / ${r.every} ${r.unit}` : "-"; }
function minutesBetween(a, b) {
  return Math.max(0, Math.round((new Date(b) - new Date(a)) / 60000));
}
function calcPay(settings, minutes, roleId) {
  const r = roleOf(settings, roleId);
  if (!r) return 0;
  const block = (Number(r.every) || 1) * (UNITS[r.unit] || 60);
  const n = settings.rounding === "proporsional" ? minutes / block : Math.floor(minutes / block);
  return Math.round(n * (Number(r.amount) || 0) * 100) / 100;
}
const toLocal = iso => iso ? DateTime.fromISO(iso, { zone: "utc" }).setZone(TZ_ZONE).toFormat("yyyy-LL-dd'T'HH:mm") : "";
function fromLocal(s) {
  if (!s || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(s)) return null;
  const dt = DateTime.fromISO(s, { zone: TZ_ZONE });
  return dt.isValid ? dt.toUTC().toISO() : null;
}
function dayRange(from, to) {
  const re = /^\d{4}-\d{2}-\d{2}$/;
  if (!re.test(from) || !re.test(to)) return null;
  const a = DateTime.fromISO(from, { zone: TZ_ZONE }).startOf("day");
  const b = DateTime.fromISO(to, { zone: TZ_ZONE }).endOf("day");
  if (!a.isValid || !b.isValid || b < a) return null;
  return [a.toUTC().toISO(), b.toUTC().toISO()];
}
// Pengajuan cuti hanya bisa disetujui oleh role Manager atau CEO
const APPROVER_ROLES = new Set(["manager", "ceo"]);
const todayLocal = () => DateTime.now().setZone(TZ_ZONE).toISODate();
// Tindakan kepegawaian. Resign, SP 3 & PHK, dan SP 3 & PTDH mengakhiri hubungan kerja
// mulai tanggal berlakunya (boleh dijadwalkan ke depan). SP 1 & SP 2 hanya peringatan.
const ACTION_TYPES = { resign: "Resign", sp1: "SP 1", sp2: "SP 2", sp3_phk: "SP 3 & PHK", sp3_ptdh: "SP 3 & PTDH" };
const ENDING_TYPES = new Set(["resign", "sp3_phk", "sp3_ptdh"]);
const isResigned = u => !!u && !!u.resigned_at && u.resigned_at <= todayLocal(); // = sudah berhenti bekerja
const endLabel = u => (u && u.resigned_at ? ACTION_TYPES[u.end_type] || "Resign" : null);
function employmentStatus(u) {
  if (!u || !u.resigned_at) return "Aktif";
  return (u.resigned_at <= todayLocal() ? "" : "Akan ") + endLabel(u);
}
// Persetujuan cuti & status resign hanya oleh role Manager atau CEO yang masih aktif bekerja
const canApprove = u => !!u && !!u.active && APPROVER_ROLES.has(u.role) && !isResigned(u);
const LEAVE_TYPES = { tahunan: "Cuti Tahunan", sakit: "Sakit", pribadi: "Izin Pribadi", lainnya: "Lainnya" };
const LEAVE_STATUS = { pending: "Menunggu persetujuan", approved: "Disetujui", rejected: "Ditolak", cancelled: "Dibatalkan" };
function daysInclusive(a, b) {
  return Math.round(DateTime.fromISO(b).diff(DateTime.fromISO(a), "days").days) + 1;
}
function overlapDays(a, b, from, to) {
  const s = a > from ? a : from, e = b < to ? b : to;
  return e < s ? 0 : daysInclusive(s, e);
}
const isDate = v => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && DateTime.fromISO(v).isValid;

function isAdmin(u) { return !!u && (ENV_ADMINS.has(u.discord_id) || u.is_admin === 1); }
function publicUser(u) {
  return {
    id: u.id, discordId: u.discord_id, username: u.username, avatar: u.avatar,
    fullName: u.full_name, role: u.role, active: !!u.active,
    isAdmin: isAdmin(u), envAdmin: ENV_ADMINS.has(u.discord_id), canApprove: canApprove(u),
    resignedAt: u.resigned_at || null, resigned: isResigned(u), endType: u.resigned_at ? u.end_type || "resign" : null, endLabel: endLabel(u),
  };
}
function cleanName(s) {
  const n = String(s || "").replace(/\s+/g, " ").trim();
  if (n.length < 3 || n.length > 60) return null;
  if (!/^[\p{L}][\p{L}\p{M} .'\-]*$/u.test(n)) return null;
  return n;
}
function enrich(rows, settings) {
  return rows.map(s => {
    const minutes = s.off_at ? minutesBetween(s.on_at, s.off_at) : null;
    const r = roleOf(settings, s.role);
    return {
      id: s.id, userId: s.user_id, fullName: s.full_name || s.username, username: s.username,
      role: s.role, roleLabel: r ? r.label : s.role, rate: rateText(r),
      on: toLocal(s.on_at), off: toLocal(s.off_at),
      minutes, pay: minutes == null ? null : calcPay(settings, minutes, s.role),
      source: s.source,
    };
  });
}
const SHIFT_SELECT = `SELECT s.*, u.full_name, u.username FROM shifts s JOIN users u ON u.id = s.user_id`;

/* ---------------- auth middleware ---------------- */
function loadUser(req) {
  if (!req.session || !req.session.uid) return null;
  const u = db.prepare("SELECT * FROM users WHERE id = ?").get(req.session.uid);
  if (!u || !u.active) { req.session = null; return null; }
  return u;
}
function requireUser(req, res, next) {
  const u = loadUser(req);
  if (!u) return res.status(401).json({ error: "Silakan login dengan Discord." });
  req.user = u; next();
}
function requireName(req, res, next) {
  if (!req.user.full_name) return res.status(403).json({ error: "Isi Full Name terlebih dahulu." });
  next();
}
function requireAdmin(req, res, next) {
  if (!isAdmin(req.user)) return res.status(403).json({ error: "Hanya admin yang dapat melakukan ini." });
  next();
}
// Perlindungan CSRF sederhana untuk request yang mengubah data
app.use("/api", (req, res, next) => {
  if (req.method !== "GET" && req.get("X-Requested-With") !== "smgo") {
    return res.status(403).json({ error: "Permintaan ditolak." });
  }
  next();
});

/* ---------------- Discord OAuth ---------------- */
app.get("/auth/discord", (req, res) => {
  const state = crypto.randomBytes(16).toString("hex");
  req.session.oauthState = state;
  const scope = DISCORD_GUILD_ID ? "identify guilds" : "identify";
  const q = new URLSearchParams({
    client_id: DISCORD_CLIENT_ID, redirect_uri: REDIRECT_URI, response_type: "code",
    scope, state, prompt: "none",
  });
  res.redirect(`https://discord.com/oauth2/authorize?${q}`);
});

app.get("/auth/discord/callback", async (req, res) => {
  const fail = code => res.redirect(`/?login_error=${code}`);
  try {
    const { code, state, error } = req.query;
    if (error) return fail("dibatalkan");
    if (!code || !state || state !== req.session.oauthState) return fail("state");
    req.session.oauthState = null;

    const tokenRes = await fetch("https://discord.com/api/oauth2/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: DISCORD_CLIENT_ID, client_secret: DISCORD_CLIENT_SECRET,
        grant_type: "authorization_code", code, redirect_uri: REDIRECT_URI,
      }),
    });
    if (!tokenRes.ok) return fail("token");
    const token = await tokenRes.json();
    const auth = { Authorization: `Bearer ${token.access_token}` };

    const meRes = await fetch("https://discord.com/api/users/@me", { headers: auth });
    if (!meRes.ok) return fail("profil");
    const me = await meRes.json();

    if (DISCORD_GUILD_ID) {
      const gRes = await fetch("https://discord.com/api/users/@me/guilds", { headers: auth });
      const guilds = gRes.ok ? await gRes.json() : [];
      if (!Array.isArray(guilds) || !guilds.some(g => g.id === DISCORD_GUILD_ID)) return fail("bukan_anggota");
    }

    const uid = upsertDiscordUser({
      id: me.id,
      username: me.global_name || me.username,
      avatar: me.avatar ? `https://cdn.discordapp.com/avatars/${me.id}/${me.avatar}.png?size=64` : null,
    });
    if (!uid) return fail("nonaktif");
    req.session.uid = uid;
    res.redirect("/");
  } catch (e) {
    console.error("OAuth error:", e);
    fail("server");
  }
});

function upsertDiscordUser({ id, username, avatar }) {
  const existing = db.prepare("SELECT * FROM users WHERE discord_id = ?").get(id);
  if (existing) {
    if (!existing.active) return null;
    db.prepare("UPDATE users SET username = ?, avatar = ?, last_login = ? WHERE id = ?")
      .run(username, avatar, nowIso(), existing.id);
    return existing.id;
  }
  const r = db.prepare("INSERT INTO users(discord_id, username, avatar, created_at, last_login) VALUES(?,?,?,?,?)")
    .run(id, username, avatar, nowIso(), nowIso());
  return r.lastInsertRowid;
}

// Login uji coba lokal tanpa Discord (hanya jika DEV_LOGIN=1 dan bukan production)
if (devLoginEnabled) {
  console.warn("⚠  DEV_LOGIN aktif: /auth/dev?id=123&name=Tes bisa login tanpa Discord. Jangan dipakai di server publik.");
  app.get("/auth/dev", (req, res) => {
    const id = String(req.query.id || "dev1").replace(/[^\w]/g, "").slice(0, 30) || "dev1";
    const uid = upsertDiscordUser({ id, username: String(req.query.name || id).slice(0, 40), avatar: null });
    if (!uid) return res.redirect("/?login_error=nonaktif");
    req.session.uid = uid; res.redirect("/");
  });
}

app.post("/api/logout", (req, res) => { req.session = null; res.json({ ok: true }); });

/* ---------------- API: akun ---------------- */
app.get("/api/me", (req, res) => {
  const u = loadUser(req);
  if (!u) return res.json({ user: null, devLogin: devLoginEnabled });
  res.json({ user: publicUser(u), settings: getSettings(), tz: TZ_ZONE, now: toLocal(nowIso()) });
});

app.post("/api/me/name", requireUser, (req, res) => {
  if (req.user.full_name && !isAdmin(req.user)) {
    return res.status(403).json({ error: "Full Name sudah diisi. Minta admin untuk mengubahnya." });
  }
  const name = cleanName(req.body.fullName);
  if (!name) return res.status(400).json({ error: "Full Name 3–60 karakter, hanya huruf, spasi, titik, apostrof, atau tanda hubung." });
  db.prepare("UPDATE users SET full_name = ? WHERE id = ?").run(name, req.user.id);
  res.json({ ok: true, fullName: name });
});

/* ---------------- API: papan tugas ---------------- */
app.get("/api/board", requireUser, requireName, (req, res) => {
  const settings = getSettings();
  const users = db.prepare("SELECT * FROM users WHERE active = 1 AND full_name IS NOT NULL ORDER BY full_name COLLATE NOCASE").all()
    .filter(u => !isResigned(u));
  const open = db.prepare("SELECT * FROM shifts WHERE off_at IS NULL").all();
  const byUser = new Map(open.map(s => [s.user_id, s]));
  res.json({
    now: toLocal(nowIso()),
    people: users.map(u => {
      const s = byUser.get(u.id); const r = roleOf(settings, u.role);
      return {
        id: u.id, fullName: u.full_name, avatar: u.avatar, role: u.role, roleLabel: r ? r.label : null,
        open: s ? { id: s.id, on: toLocal(s.on_at), onIso: s.on_at } : null,
        isMe: u.id === req.user.id,
      };
    }),
  });
});

app.post("/api/duty/on", requireUser, requireName, (req, res) => {
  const u = req.user;
  if (isResigned(u)) return res.status(403).json({ error: `Status Anda ${endLabel(u)} sejak ${u.resigned_at}. Tidak bisa On Duty.` });
  if (!u.role || !roleOf(getSettings(), u.role)) return res.status(400).json({ error: "Role Anda belum ditentukan admin. Hubungi admin." });
  try {
    db.prepare("INSERT INTO shifts(user_id, role, on_at, source, updated_at) VALUES(?,?,?,?,?)")
      .run(u.id, u.role, nowIso(), "tombol", nowIso());
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) return res.status(409).json({ error: "Anda sudah on duty." });
    throw e;
  }
  res.json({ ok: true });
});

app.post("/api/duty/off", requireUser, requireName, (req, res) => {
  const r = db.prepare("UPDATE shifts SET off_at = ?, updated_at = ? WHERE user_id = ? AND off_at IS NULL")
    .run(nowIso(), nowIso(), req.user.id);
  if (!r.changes) return res.status(409).json({ error: "Anda sedang tidak on duty." });
  res.json({ ok: true });
});

/* ---------------- API: catatan shift ---------------- */
app.get("/api/shifts/recent", requireUser, requireName, (req, res) => {
  const settings = getSettings();
  const admin = isAdmin(req.user);
  const rows = admin
    ? db.prepare(`${SHIFT_SELECT} ORDER BY s.on_at DESC LIMIT 100`).all()
    : db.prepare(`${SHIFT_SELECT} WHERE s.user_id = ? ORDER BY s.on_at DESC LIMIT 100`).all(req.user.id);
  res.json({ shifts: enrich(rows, settings) });
});

function rangeRows(req) {
  const range = dayRange(String(req.query.from || ""), String(req.query.to || ""));
  if (!range) return null;
  let userId = req.query.userId ? Number(req.query.userId) : null;
  if (!isAdmin(req.user)) userId = req.user.id;
  const rows = userId
    ? db.prepare(`${SHIFT_SELECT} WHERE s.on_at BETWEEN ? AND ? AND s.user_id = ? ORDER BY s.on_at`).all(range[0], range[1], userId)
    : db.prepare(`${SHIFT_SELECT} WHERE s.on_at BETWEEN ? AND ? ORDER BY s.on_at`).all(range[0], range[1]);
  return rows;
}
const LEAVE_SELECT = `SELECT l.*, u.full_name, u.username, u.role AS user_role, r.full_name AS reviewer_name
  FROM leaves l JOIN users u ON u.id = l.user_id LEFT JOIN users r ON r.id = l.reviewer_id`;
function enrichLeaves(rows, settings, from, to) {
  return rows.map(l => {
    const r = roleOf(settings, l.user_role);
    return {
      id: l.id, userId: l.user_id, fullName: l.full_name || l.username,
      role: l.user_role, roleLabel: r ? r.label : "-", rate: rateText(r),
      type: l.type, typeLabel: LEAVE_TYPES[l.type] || l.type,
      start: l.start_date, end: l.end_date, days: daysInclusive(l.start_date, l.end_date),
      daysInPeriod: from && to ? overlapDays(l.start_date, l.end_date, from, to) : null,
      reason: l.reason, status: l.status, statusLabel: LEAVE_STATUS[l.status] || l.status,
      reviewer: l.reviewer_name || null, reviewNote: l.review_note || "",
      reviewedAt: toLocal(l.reviewed_at), createdAt: toLocal(l.created_at),
    };
  });
}
// Cuti (selain yang dibatalkan) yang beririsan dengan periode
function leavesInRange(req, from, to) {
  let userId = req.query.userId ? Number(req.query.userId) : null;
  if (!isAdmin(req.user)) userId = req.user.id; // sama seperti laporan shift
  const base = `${LEAVE_SELECT} WHERE l.status != 'cancelled' AND l.start_date <= ? AND l.end_date >= ?`;
  const rows = userId
    ? db.prepare(`${base} AND l.user_id = ? ORDER BY l.start_date`).all(to, from, userId)
    : db.prepare(`${base} ORDER BY l.start_date`).all(to, from);
  return enrichLeaves(rows, getSettings(), from, to);
}

function summarize(shifts, leaves = []) {
  const by = new Map();
  const blank = x => ({ userId: x.userId, fullName: x.fullName, role: x.role, roleLabel: x.roleLabel, rate: x.rate, shifts: 0, minutes: 0, pay: 0, open: 0, leaveDays: 0 });
  for (const l of leaves) {
    if (l.status !== "approved") continue;
    if (!by.has(l.userId)) by.set(l.userId, blank(l));
    by.get(l.userId).leaveDays += l.daysInPeriod || 0;
  }
  for (const s of shifts) {
    if (!by.has(s.userId)) by.set(s.userId, blank(s));
    const g = by.get(s.userId); g.shifts++;
    if (s.minutes == null) g.open++; else { g.minutes += s.minutes; g.pay = Math.round((g.pay + s.pay) * 100) / 100; }
    g.role = s.role; g.roleLabel = s.roleLabel; g.rate = s.rate;
  }
  const getU = db.prepare("SELECT resigned_at, end_type FROM users WHERE id = ?");
  for (const g of by.values()) {
    const u = getU.get(g.userId) || {};
    g.resignedAt = u.resigned_at || null; g.endLabel = endLabel(u); g.status = employmentStatus(u);
  }
  return [...by.values()].sort((a, b) => a.fullName.localeCompare(b.fullName));
}

app.get("/api/shifts", requireUser, requireName, (req, res) => {
  const rows = rangeRows(req);
  if (!rows) return res.status(400).json({ error: "Periode tidak valid." });
  const shifts = enrich(rows, getSettings());
  const leaves = leavesInRange(req, String(req.query.from), String(req.query.to));
  res.json({ shifts, leaves, summary: summarize(shifts, leaves) });
});

function readShiftBody(body, existing) {
  const userId = Number(body.userId);
  const u = db.prepare("SELECT * FROM users WHERE id = ?").get(userId);
  if (!u || !u.full_name) return { error: "Karyawan tidak ditemukan." };
  const on = fromLocal(body.on);
  if (!on) return { error: "Isi jam On Duty dengan benar." };
  const off = body.off ? fromLocal(body.off) : null;
  if (body.off && !off) return { error: "Format jam Off Duty tidak valid." };
  if (off && off <= on) return { error: "Jam Off Duty harus setelah jam On Duty." };
  const role = existing && existing.user_id === userId ? existing.role : u.role;
  if (!role) return { error: `${u.full_name} belum punya role. Atur dulu di Tarif & Karyawan.` };
  return { userId, on, off, role };
}

app.post("/api/shifts", requireUser, requireAdmin, (req, res) => {
  const v = readShiftBody(req.body);
  if (v.error) return res.status(400).json({ error: v.error });
  try {
    db.prepare("INSERT INTO shifts(user_id, role, on_at, off_at, source, edited_by, updated_at) VALUES(?,?,?,?,?,?,?)")
      .run(v.userId, v.role, v.on, v.off, "manual", req.user.id, nowIso());
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) return res.status(409).json({ error: "Karyawan ini masih on duty. Isi jam Off Duty." });
    throw e;
  }
  res.json({ ok: true });
});

app.put("/api/shifts/:id", requireUser, requireAdmin, (req, res) => {
  const existing = db.prepare("SELECT * FROM shifts WHERE id = ?").get(Number(req.params.id));
  if (!existing) return res.status(404).json({ error: "Catatan tidak ditemukan." });
  const v = readShiftBody(req.body, existing);
  if (v.error) return res.status(400).json({ error: v.error });
  try {
    db.prepare("UPDATE shifts SET user_id = ?, role = ?, on_at = ?, off_at = ?, source = 'manual', edited_by = ?, updated_at = ? WHERE id = ?")
      .run(v.userId, v.role, v.on, v.off, req.user.id, nowIso(), existing.id);
  } catch (e) {
    if (String(e.message).includes("UNIQUE")) return res.status(409).json({ error: "Karyawan ini sudah punya shift aktif." });
    throw e;
  }
  res.json({ ok: true });
});

app.delete("/api/shifts/:id", requireUser, requireAdmin, (req, res) => {
  db.prepare("DELETE FROM shifts WHERE id = ?").run(Number(req.params.id));
  res.json({ ok: true });
});

/* ---------------- API: tarif & karyawan (admin) ---------------- */
app.get("/api/settings", requireUser, (req, res) => res.json(getSettings()));

app.put("/api/settings", requireUser, requireAdmin, (req, res) => {
  const cur = getSettings();
  const body = req.body || {};
  const roles = cur.roles.map(r => {
    const n = (body.roles || []).find(x => x && x.id === r.id) || r;
    return {
      id: r.id, label: r.label,
      amount: Math.max(0, Math.round((Number(n.amount) || 0) * 100) / 100),
      every: Math.max(1, Math.min(10000, Math.round(Number(n.every) || 1))),
      unit: n.unit === "menit" ? "menit" : "jam",
    };
  });
  const s = { rounding: body.rounding === "proporsional" ? "proporsional" : "blok", roles };
  saveSettings(s);
  res.json(s);
});

app.get("/api/users", requireUser, requireAdmin, (req, res) => {
  const rows = db.prepare("SELECT * FROM users ORDER BY active DESC, full_name IS NULL, full_name COLLATE NOCASE").all();
  res.json({ users: rows.map(publicUser) });
});

app.put("/api/users/:id", requireUser, requireAdmin, (req, res) => {
  const u = db.prepare("SELECT * FROM users WHERE id = ?").get(Number(req.params.id));
  if (!u) return res.status(404).json({ error: "Karyawan tidak ditemukan." });
  const b = req.body || {};
  const settings = getSettings();
  let { full_name, role, active, is_admin } = u;
  if ("fullName" in b) { const n = cleanName(b.fullName); if (!n) return res.status(400).json({ error: "Full Name tidak valid." }); full_name = n; }
  if ("role" in b) { if (b.role && !roleOf(settings, b.role)) return res.status(400).json({ error: "Role tidak dikenal." }); role = b.role || null; }
  if ("active" in b) {
    if (u.id === req.user.id && !b.active) return res.status(400).json({ error: "Anda tidak bisa menonaktifkan akun sendiri." });
    active = b.active ? 1 : 0;
  }
  if ("isAdmin" in b) {
    if (u.id === req.user.id && !b.isAdmin) return res.status(400).json({ error: "Anda tidak bisa mencabut admin dari akun sendiri." });
    is_admin = b.isAdmin ? 1 : 0;
  }
  db.prepare("UPDATE users SET full_name = ?, role = ?, active = ?, is_admin = ? WHERE id = ?").run(full_name, role, active, is_admin, u.id);
  if (!active) db.prepare("UPDATE shifts SET off_at = ?, updated_at = ? WHERE user_id = ? AND off_at IS NULL").run(nowIso(), nowIso(), u.id);
  res.json({ ok: true });
});

/* ---------------- API: status karyawan (tindakan kepegawaian) ---------------- */
const ACTION_SELECT = `SELECT a.*, u.full_name, u.username, u.role AS user_role, c.full_name AS created_by_name, x.full_name AS cancelled_by_name
  FROM staff_actions a JOIN users u ON u.id = a.user_id
  LEFT JOIN users c ON c.id = a.created_by LEFT JOIN users x ON x.id = a.cancelled_by`;
function enrichAction(a, settings) {
  const r = roleOf(settings, a.user_role);
  return {
    id: a.id, userId: a.user_id, fullName: a.full_name || a.username, roleLabel: r ? r.label : "-",
    type: a.type, typeLabel: ACTION_TYPES[a.type] || a.type, ending: ENDING_TYPES.has(a.type),
    reason: a.reason, date: a.effective_date,
    createdBy: a.created_by_name || null, createdAt: toLocal(a.created_at),
    cancelled: !!a.cancelled_at, cancelledBy: a.cancelled_by_name || null, cancelledAt: toLocal(a.cancelled_at),
  };
}
// SP tertinggi yang masih tercatat (tidak dibatalkan)
function currentSp(actions) {
  const order = ["sp1", "sp2"];
  let best = null;
  for (const a of actions) if (!a.cancelled && order.includes(a.type) && (!best || order.indexOf(a.type) > order.indexOf(best.type))) best = a;
  return best ? best.typeLabel : null;
}
// Hitung ulang status berakhir kerja dari riwayat (tindakan berakhir terbaru yang tidak dibatalkan)
function syncEmployment(userId) {
  const last = db.prepare(`SELECT * FROM staff_actions WHERE user_id = ? AND cancelled_at IS NULL AND type IN ('resign','sp3_phk','sp3_ptdh')
    ORDER BY id DESC LIMIT 1`).get(userId);
  if (last) {
    db.prepare("UPDATE users SET resigned_at = ?, end_type = ?, resign_note = ?, resigned_by = ?, resign_marked_at = ? WHERE id = ?")
      .run(last.effective_date, last.type, last.reason, last.created_by, last.created_at, userId);
  } else {
    db.prepare("UPDATE users SET resigned_at = NULL, end_type = NULL, resign_note = NULL, resigned_by = NULL, resign_marked_at = NULL WHERE id = ?").run(userId);
  }
}

app.get("/api/staff", requireUser, requireName, (req, res) => {
  if (!canApprove(req.user) && !isAdmin(req.user)) return res.status(403).json({ error: "Hanya Manager, CEO, atau admin." });
  const settings = getSettings();
  const users = db.prepare("SELECT * FROM users WHERE full_name IS NOT NULL ORDER BY (resigned_at IS NOT NULL), full_name COLLATE NOCASE").all();
  const actions = db.prepare(`${ACTION_SELECT} ORDER BY a.effective_date DESC, a.id DESC`).all().map(a => enrichAction(a, settings));
  const byUser = new Map();
  for (const a of actions) { if (!byUser.has(a.userId)) byUser.set(a.userId, []); byUser.get(a.userId).push(a); }
  res.json({
    canEdit: canApprove(req.user), myId: req.user.id, today: todayLocal(), types: ACTION_TYPES,
    staff: users.map(u => {
      const r = roleOf(settings, u.role); const list = byUser.get(u.id) || [];
      return {
        id: u.id, fullName: u.full_name, username: u.username, avatar: u.avatar, role: u.role, roleLabel: r ? r.label : null,
        active: !!u.active, resignedAt: u.resigned_at || null, resigned: isResigned(u),
        endType: u.resigned_at ? u.end_type || "resign" : null, endLabel: endLabel(u), status: employmentStatus(u),
        sp: currentSp(list), actions: list,
      };
    }),
  });
});

app.post("/api/staff/:id/actions", requireUser, requireName, (req, res) => {
  if (!canApprove(req.user)) return res.status(403).json({ error: "Status karyawan hanya bisa diubah oleh Manager atau CEO." });
  const u = db.prepare("SELECT * FROM users WHERE id = ?").get(Number(req.params.id));
  if (!u || !u.full_name) return res.status(404).json({ error: "Karyawan tidak ditemukan." });
  if (u.id === req.user.id) return res.status(403).json({ error: "Anda tidak bisa mengubah status diri sendiri." });
  const { type, date } = req.body || {};
  const reason = String((req.body || {}).reason || "").replace(/\s+/g, " ").trim();
  if (!ACTION_TYPES[type]) return res.status(400).json({ error: "Pilih jenis tindakan." });
  if (!isDate(date)) return res.status(400).json({ error: "Isi tanggal berlaku." });
  if (reason.length < 3 || reason.length > 500) return res.status(400).json({ error: "Tulis alasan (3–500 karakter)." });
  const ending = ENDING_TYPES.has(type);
  if (ending && u.resigned_at) {
    return res.status(409).json({ error: `${u.full_name} sudah berstatus ${endLabel(u)} (${u.resigned_at}). Batalkan dulu jika ingin mengganti.` });
  }
  const t = db.transaction(() => {
    db.prepare("INSERT INTO staff_actions(user_id, type, reason, effective_date, created_by, created_at) VALUES(?,?,?,?,?,?)")
      .run(u.id, type, reason, date, req.user.id, nowIso());
    if (ending) {
      syncEmployment(u.id);
      // Batalkan cuti menunggu yang dimulai setelah tanggal berakhir kerja
      db.prepare("UPDATE leaves SET status = 'cancelled' WHERE user_id = ? AND status = 'pending' AND start_date > ?").run(u.id, date);
      // Jika sudah berlaku, tutup shift yang masih aktif
      if (date <= todayLocal()) db.prepare("UPDATE shifts SET off_at = ?, updated_at = ? WHERE user_id = ? AND off_at IS NULL").run(nowIso(), nowIso(), u.id);
    }
  });
  t();
  res.json({ ok: true });
});

app.post("/api/staff/actions/:actionId/cancel", requireUser, requireName, (req, res) => {
  if (!canApprove(req.user)) return res.status(403).json({ error: "Status karyawan hanya bisa diubah oleh Manager atau CEO." });
  const a = db.prepare("SELECT * FROM staff_actions WHERE id = ?").get(Number(req.params.actionId));
  if (!a) return res.status(404).json({ error: "Catatan tidak ditemukan." });
  if (a.user_id === req.user.id) return res.status(403).json({ error: "Anda tidak bisa mengubah status diri sendiri." });
  if (a.cancelled_at) return res.status(409).json({ error: "Catatan ini sudah dibatalkan." });
  const t = db.transaction(() => {
    db.prepare("UPDATE staff_actions SET cancelled_at = ?, cancelled_by = ? WHERE id = ?").run(nowIso(), req.user.id, a.id);
    if (ENDING_TYPES.has(a.type)) syncEmployment(a.user_id);
  });
  t();
  res.json({ ok: true });
});

/* ---------------- API: cuti ---------------- */
app.get("/api/leaves/mine", requireUser, requireName, (req, res) => {
  const rows = db.prepare(`${LEAVE_SELECT} WHERE l.user_id = ? ORDER BY l.start_date DESC, l.id DESC LIMIT 100`).all(req.user.id);
  res.json({ leaves: enrichLeaves(rows, getSettings()), types: LEAVE_TYPES, today: todayLocal() });
});

app.post("/api/leaves", requireUser, requireName, (req, res) => {
  const { type, start, end } = req.body || {};
  const reason = String((req.body || {}).reason || "").replace(/\s+/g, " ").trim();
  if (!LEAVE_TYPES[type]) return res.status(400).json({ error: "Pilih jenis cuti." });
  if (!isDate(start) || !isDate(end)) return res.status(400).json({ error: "Isi tanggal mulai dan selesai." });
  if (end < start) return res.status(400).json({ error: "Tanggal selesai harus sama atau setelah tanggal mulai." });
  if (daysInclusive(start, end) > 90) return res.status(400).json({ error: "Satu pengajuan maksimal 90 hari." });
  if (reason.length < 3 || reason.length > 300) return res.status(400).json({ error: "Tulis alasan cuti (3–300 karakter)." });
  const clash = db.prepare(`SELECT start_date, end_date FROM leaves WHERE user_id = ? AND status IN ('pending','approved')
    AND start_date <= ? AND end_date >= ? LIMIT 1`).get(req.user.id, end, start);
  if (isResigned(req.user)) return res.status(403).json({ error: `Status Anda ${endLabel(req.user)}. Tidak bisa mengajukan cuti.` });
  if (req.user.resigned_at && end > req.user.resigned_at) return res.status(400).json({ error: `Tanggal cuti melewati tanggal berakhir kerja Anda (${req.user.resigned_at}).` });
  if (clash) return res.status(409).json({ error: `Tanggal bertabrakan dengan pengajuan lain (${clash.start_date} s/d ${clash.end_date}).` });
  db.prepare("INSERT INTO leaves(user_id, type, start_date, end_date, reason, status, created_at) VALUES(?,?,?,?,?,'pending',?)")
    .run(req.user.id, type, start, end, reason, nowIso());
  res.json({ ok: true });
});

app.post("/api/leaves/:id/cancel", requireUser, requireName, (req, res) => {
  const r = db.prepare("UPDATE leaves SET status = 'cancelled' WHERE id = ? AND user_id = ? AND status = 'pending'")
    .run(Number(req.params.id), req.user.id);
  if (!r.changes) return res.status(409).json({ error: "Hanya pengajuan yang masih menunggu yang bisa dibatalkan." });
  res.json({ ok: true });
});

// Kotak persetujuan: Manager/CEO menyetujui; admin hanya bisa melihat
app.get("/api/leaves/inbox", requireUser, requireName, (req, res) => {
  if (!canApprove(req.user) && !isAdmin(req.user)) return res.status(403).json({ error: "Hanya Manager, CEO, atau admin." });
  const settings = getSettings();
  const pending = db.prepare(`${LEAVE_SELECT} WHERE l.status = 'pending' ORDER BY l.start_date, l.id`).all();
  const history = db.prepare(`${LEAVE_SELECT} WHERE l.status IN ('approved','rejected') ORDER BY l.reviewed_at DESC LIMIT 100`).all();
  res.json({ pending: enrichLeaves(pending, settings), history: enrichLeaves(history, settings), canApprove: canApprove(req.user), myId: req.user.id });
});

app.post("/api/leaves/:id/review", requireUser, requireName, (req, res) => {
  if (!canApprove(req.user)) return res.status(403).json({ error: "Cuti hanya bisa disetujui oleh Manager atau CEO." });
  const decision = (req.body || {}).decision;
  if (!["approved", "rejected"].includes(decision)) return res.status(400).json({ error: "Keputusan tidak valid." });
  const note = String((req.body || {}).note || "").replace(/\s+/g, " ").trim().slice(0, 300);
  const l = db.prepare("SELECT * FROM leaves WHERE id = ?").get(Number(req.params.id));
  if (!l) return res.status(404).json({ error: "Pengajuan tidak ditemukan." });
  if (l.user_id === req.user.id) return res.status(403).json({ error: "Anda tidak bisa menyetujui cuti sendiri." });
  if (l.status !== "pending") return res.status(409).json({ error: "Pengajuan ini sudah diproses." });
  if (decision === "rejected" && note.length < 3) return res.status(400).json({ error: "Tulis alasan penolakan." });
  db.prepare("UPDATE leaves SET status = ?, reviewer_id = ?, review_note = ?, reviewed_at = ? WHERE id = ? AND status = 'pending'")
    .run(decision, req.user.id, note || null, nowIso(), l.id);
  res.json({ ok: true });
});

/* ---------------- Ekspor Excel ---------------- */
app.get("/api/export", requireUser, requireName, async (req, res) => {
  const rows = rangeRows(req);
  if (!rows) return res.status(400).json({ error: "Periode tidak valid." });
  const settings = getSettings();
  const shifts = enrich(rows, settings);
  const from = String(req.query.from), to = String(req.query.to);
  const leaves = leavesInRange(req, from, to);
  const sum = summarize(shifts, leaves);

  const wb = new ExcelJS.Workbook();
  wb.creator = "Absensi SMGO";
  const head = { font: { bold: true, color: { argb: "FFFFFFFF" } }, fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FF13836A" } } };
  const usd = '"$"#,##0.00';
  const styleHeader = ws => ws.getRow(1).eachCell(c => { c.font = head.font; c.fill = head.fill; });

  // Tindakan kepegawaian (SP, resign, PHK, PTDH) hanya untuk Manager, CEO, dan admin
  const staffView = canApprove(req.user) || isAdmin(req.user);
  const settingsNow = getSettings();
  const allActions = staffView ? db.prepare(`${ACTION_SELECT} ORDER BY a.effective_date, a.id`).all().map(a => enrichAction(a, settingsNow)) : [];
  const spByUser = new Map();
  for (const uid of new Set(allActions.map(a => a.userId))) spByUser.set(uid, currentSp(allActions.filter(a => a.userId === uid)) || "");

  const r1 = wb.addWorksheet("Rekap");
  r1.columns = [
    { header: "Full Name", key: "n", width: 26 }, { header: "Role", key: "r", width: 16 },
    { header: "Tarif", key: "t", width: 18 }, { header: "Jumlah Shift", key: "s", width: 13 },
    { header: "Total Menit", key: "m", width: 12 }, { header: "Total Jam", key: "h", width: 11 },
    { header: "Total Upah (USD)", key: "p", width: 17, style: { numFmt: usd } },
    { header: "Hari Cuti (disetujui)", key: "c", width: 19 },
    { header: "Status Karyawan", key: "st", width: 20 }, { header: "Tanggal Berakhir Kerja", key: "rs", width: 21 },
    ...(staffView ? [{ header: "SP Tercatat", key: "sp", width: 12 }] : []),
  ];
  sum.forEach(g => r1.addRow({ n: g.fullName, r: g.roleLabel, t: g.rate, s: g.shifts, m: g.minutes, h: Math.round(g.minutes / 60 * 100) / 100, p: g.pay, c: g.leaveDays,
    st: g.status, rs: g.resignedAt || "", sp: spByUser.get(g.userId) || "" }));
  const tMin = sum.reduce((a, g) => a + g.minutes, 0), tPay = Math.round(sum.reduce((a, g) => a + g.pay, 0) * 100) / 100;
  const tLeave = sum.reduce((a, g) => a + g.leaveDays, 0);
  const tr = r1.addRow({ n: "TOTAL", s: shifts.length, m: tMin, h: Math.round(tMin / 60 * 100) / 100, p: tPay, c: tLeave });
  tr.font = { bold: true };
  r1.eachRow((row, i) => { if (i > 1 && row.getCell("st").value && row.getCell("st").value !== "Aktif") row.getCell("st").font = { bold: true, color: { argb: "FFB3261E" } }; });
  styleHeader(r1); r1.views = [{ state: "frozen", ySplit: 1 }];

  const r2 = wb.addWorksheet("Rincian");
  r2.columns = [
    { header: "Tanggal", key: "d", width: 12 }, { header: "Full Name", key: "n", width: 26 },
    { header: "Role", key: "r", width: 16 }, { header: "Tarif", key: "t", width: 18 },
    { header: "Jam On Duty", key: "on", width: 18 }, { header: "Jam Off Duty", key: "off", width: 18 },
    { header: "Durasi (menit)", key: "m", width: 14 }, { header: "Durasi (jam)", key: "h", width: 12 },
    { header: "Upah (USD)", key: "p", width: 13, style: { numFmt: usd } }, { header: "Sumber", key: "src", width: 10 },
  ];
  shifts.forEach(s => r2.addRow({
    d: s.on.slice(0, 10), n: s.fullName, r: s.roleLabel, t: s.rate,
    on: s.on.replace("T", " "), off: s.off ? s.off.replace("T", " ") : "Masih aktif",
    m: s.minutes ?? "", h: s.minutes == null ? "" : Math.round(s.minutes / 60 * 100) / 100,
    p: s.pay ?? "", src: s.source,
  }));
  styleHeader(r2); r2.views = [{ state: "frozen", ySplit: 1 }];
  r2.autoFilter = { from: "A1", to: "J1" };

  const rc = wb.addWorksheet("Cuti");
  rc.columns = [
    { header: "Full Name", key: "n", width: 26 }, { header: "Role", key: "r", width: 16 },
    { header: "Jenis", key: "t", width: 15 }, { header: "Mulai", key: "a", width: 12 }, { header: "Selesai", key: "b", width: 12 },
    { header: "Total Hari", key: "d", width: 11 }, { header: "Hari dalam Periode", key: "dp", width: 18 },
    { header: "Alasan", key: "why", width: 36 }, { header: "Status", key: "st", width: 22 },
    { header: "Disetujui/Ditolak oleh", key: "rv", width: 24 }, { header: "Waktu Keputusan", key: "rt", width: 18 },
    { header: "Catatan Penyetuju", key: "rn", width: 30 }, { header: "Diajukan", key: "ct", width: 18 },
  ];
  leaves.forEach(l => {
    const row = rc.addRow({
      n: l.fullName, r: l.roleLabel, t: l.typeLabel, a: l.start, b: l.end, d: l.days, dp: l.daysInPeriod,
      why: l.reason, st: l.statusLabel, rv: l.reviewer || "", rt: l.reviewedAt.replace("T", " "),
      rn: l.reviewNote, ct: l.createdAt.replace("T", " "),
    });
    const color = { approved: "FF0F7A5C", rejected: "FFB3261E", pending: "FFC9780A" }[l.status];
    if (color) row.getCell("st").font = { bold: true, color: { argb: color } };
  });
  if (!leaves.length) rc.addRow({ n: "Tidak ada pengajuan cuti pada periode ini." });
  styleHeader(rc); rc.views = [{ state: "frozen", ySplit: 1 }];
  if (leaves.length) rc.autoFilter = { from: "A1", to: "M1" };

  if (staffView) {
    const filterUser = req.query.userId ? Number(req.query.userId) : null;
    const inPeriod = allActions.filter(a => !a.cancelled && a.date >= from && a.date <= to && (!filterUser || a.userId === filterUser));
    const rs = wb.addWorksheet("Status Karyawan");
    rs.columns = [
      { header: "Full Name", key: "n", width: 26 }, { header: "Role", key: "r", width: 16 },
      { header: "Tindakan", key: "t", width: 14 }, { header: "Tanggal Berlaku", key: "d", width: 15 },
      { header: "Alasan", key: "why", width: 48 }, { header: "Dicatat oleh", key: "by", width: 22 }, { header: "Waktu Dicatat", key: "at", width: 18 },
    ];
    inPeriod.forEach(a => {
      const row = rs.addRow({ n: a.fullName, r: a.roleLabel, t: a.typeLabel, d: a.date, why: a.reason, by: a.createdBy || "", at: a.createdAt.replace("T", " ") });
      row.getCell("t").font = { bold: true, color: { argb: a.ending ? "FFB3261E" : "FFC9780A" } };
      row.getCell("why").alignment = { wrapText: true, vertical: "top" };
    });
    if (!inPeriod.length) rs.addRow({ n: "Tidak ada tindakan kepegawaian pada periode ini." });
    styleHeader(rs); rs.views = [{ state: "frozen", ySplit: 1 }];
  }

  const r3 = wb.addWorksheet("Info");
  r3.columns = [{ width: 18 }, { width: 34 }];
  [["Laporan Absensi SMGO"], ["Periode", `${from} s/d ${to}`], ["Zona waktu", TZ_ZONE],
   ["Cara hitung", settings.rounding === "proporsional" ? "Proporsional per menit" : "Blok waktu penuh"],
   ["Hari cuti", "Dihitung per hari kalender, hanya cuti berstatus Disetujui"],
   ["Dibuat", toLocal(nowIso()).replace("T", " ")], ["Dibuat oleh", req.user.full_name], [], ["Role", "Tarif"],
   ...settings.roles.map(r => [r.label, rateText(r)])].forEach(row => r3.addRow(row));
  r3.getRow(1).font = { bold: true, size: 14 };

  const filename = `Absensi_SMGO_${from}_sd_${to}.xlsx`;
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  await wb.xlsx.write(res);
  res.end();
});

/* ---------------- static & errors ---------------- */
// Hasil build React (npm run build) disajikan dari folder dist/
const DIST = path.join(__dirname, "..", "dist");
app.use(express.static(DIST, { index: "index.html", maxAge: PROD ? "1h" : 0 }));
app.get(/^\/(?!api\/|auth\/).*/, (req, res, next) => {
  res.sendFile(path.join(DIST, "index.html"), err => {
    if (err) res.status(404).send("Frontend belum di-build. Jalankan: npm run build");
  });
});
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Terjadi kesalahan di server." });
});

app.listen(PORT, () => console.log(`Absensi SMGO berjalan di ${BASE_URL} (zona waktu ${TZ_ZONE})`));
