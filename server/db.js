// Database SQLite: users, shifts, settings
const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

const file = process.env.DB_PATH || path.join(__dirname, "..", "data", "absensi.db");
fs.mkdirSync(path.dirname(file), { recursive: true });
const db = new Database(file);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  discord_id  TEXT NOT NULL UNIQUE,
  username    TEXT NOT NULL,
  avatar      TEXT,
  full_name   TEXT,
  role        TEXT,
  active      INTEGER NOT NULL DEFAULT 1,
  is_admin    INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL,
  last_login  TEXT
);
CREATE TABLE IF NOT EXISTS shifts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role        TEXT NOT NULL,
  on_at       TEXT NOT NULL,          -- ISO UTC
  off_at      TEXT,                   -- ISO UTC, NULL = masih on duty
  source      TEXT NOT NULL DEFAULT 'tombol', -- 'tombol' | 'manual'
  edited_by   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_shifts_on ON shifts(on_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_one_open_shift ON shifts(user_id) WHERE off_at IS NULL;
CREATE TABLE IF NOT EXISTS leaves (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type         TEXT NOT NULL,           -- tahunan | sakit | pribadi | lainnya
  start_date   TEXT NOT NULL,           -- YYYY-MM-DD (zona waktu TZ_ZONE)
  end_date     TEXT NOT NULL,           -- YYYY-MM-DD, inklusif
  reason       TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'pending', -- pending | approved | rejected | cancelled
  reviewer_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  review_note  TEXT,
  reviewed_at  TEXT,
  created_at   TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_leaves_dates ON leaves(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_leaves_status ON leaves(status);
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`);

// Migrasi: tambahkan kolom baru ke database lama tanpa menghapus data
function addColumn(table, col, def) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all().map(c => c.name);
  if (!cols.includes(col)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`);
}
addColumn("users", "is_admin", "INTEGER NOT NULL DEFAULT 0");
addColumn("users", "resigned_at", "TEXT");        // tanggal resign YYYY-MM-DD, NULL = masih bekerja
addColumn("users", "resign_note", "TEXT");
addColumn("users", "resigned_by", "INTEGER REFERENCES users(id) ON DELETE SET NULL");
addColumn("users", "resign_marked_at", "TEXT");
addColumn("users", "end_type", "TEXT");           // resign | sp3_phk | sp3_ptdh (jenis berakhirnya hubungan kerja)

// Riwayat tindakan kepegawaian: Resign, SP 1, SP 2, SP 3 & PHK, SP 3 & PTDH
db.exec(`
CREATE TABLE IF NOT EXISTS staff_actions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type            TEXT NOT NULL,          -- resign | sp1 | sp2 | sp3_phk | sp3_ptdh
  reason          TEXT NOT NULL,
  effective_date  TEXT NOT NULL,          -- YYYY-MM-DD
  created_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at      TEXT NOT NULL,
  cancelled_at    TEXT,
  cancelled_by    INTEGER REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_staff_actions_user ON staff_actions(user_id);
`);
// Pindahkan data resign versi sebelumnya ke riwayat tindakan
db.exec(`
UPDATE users SET end_type = 'resign' WHERE resigned_at IS NOT NULL AND end_type IS NULL;
INSERT INTO staff_actions(user_id, type, reason, effective_date, created_by, created_at)
  SELECT id, 'resign', COALESCE(resign_note, 'Resign'), resigned_at, resigned_by, COALESCE(resign_marked_at, created_at)
  FROM users u WHERE resigned_at IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM staff_actions a WHERE a.user_id = u.id AND a.type = 'resign' AND a.cancelled_at IS NULL);
`);

const DEFAULT_SETTINGS = {
  rounding: "blok",
  roles: [
    { id: "driver_junior", label: "Driver Junior", amount: 4, every: 1, unit: "jam" },
    { id: "driver_reguler", label: "Driver Reguler", amount: 5, every: 1, unit: "jam" },
    { id: "driver_senior", label: "Driver Senior", amount: 7, every: 1, unit: "jam" },
    { id: "manager", label: "Manager", amount: 12, every: 1, unit: "jam" },
    { id: "ceo", label: "CEO", amount: 25, every: 1, unit: "jam" },
  ],
};

function getSettings() {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'rates'").get();
  if (!row) return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
  try { return JSON.parse(row.value); } catch { return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)); }
}
function saveSettings(s) {
  db.prepare("INSERT INTO settings(key, value) VALUES('rates', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
    .run(JSON.stringify(s));
}

module.exports = { db, getSettings, saveSettings, DEFAULT_SETTINGS };
