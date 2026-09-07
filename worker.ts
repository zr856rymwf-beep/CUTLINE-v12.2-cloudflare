type D1RunResult = { meta?: { last_row_id?: number | string } }
type D1AllResult<T> = { results?: T[] }
type D1Statement = {
  bind: (...values: unknown[]) => D1Statement
  first: <T = Record<string, unknown>>() => Promise<T | null>
  all: <T = Record<string, unknown>>() => Promise<D1AllResult<T>>
  run: () => Promise<D1RunResult>
}
type D1Database = {
  prepare: (query: string) => D1Statement
  exec: (query: string) => Promise<unknown>
}

type AssetsBinding = { fetch: (request: Request) => Promise<Response> }

type Env = {
  ASSETS?: AssetsBinding
  DB?: D1Database
  RESEND_API_KEY?: string
  PASSWORD_RESET_FROM?: string
  PASSWORD_RESET_BASE_URL?: string
}

type PagesContext = {
  request: Request
  env: Env
  params: Record<string, string | string[] | undefined>
}

const cookieName = 'cutline_session'
const sessionDurationMs = 1000 * 60 * 60 * 24 * 30
const passwordResetDurationMs = 1000 * 60 * 30
const passwordResetCooldownMs = 1000 * 60
const passwordIterations = 210_000

let schemaReady = false

const schemaSql = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  email TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);

CREATE TABLE IF NOT EXISTS password_reset_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS password_reset_tokens_user_id_idx ON password_reset_tokens(user_id);

CREATE TABLE IF NOT EXISTS plans (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL UNIQUE,
  current_weight REAL NOT NULL,
  target_weight REAL NOT NULL,
  fight_date TEXT NOT NULL,
  weigh_in_type TEXT NOT NULL DEFAULT 'same_day',
  water_cut_kg REAL NOT NULL DEFAULT 0,
  fight_mode INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS profiles (
  user_id TEXT PRIMARY KEY,
  height_cm REAL NOT NULL,
  age INTEGER NOT NULL,
  sex TEXT NOT NULL,
  activity_level TEXT NOT NULL DEFAULT 'moderate',
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS weight_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  weight REAL NOT NULL,
  recorded_on TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, recorded_on)
);

CREATE TABLE IF NOT EXISTS feedback (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  category TEXT NOT NULL,
  message TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS feedback_user_created_idx ON feedback(user_id, created_at);

CREATE TABLE IF NOT EXISTS meal_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  eaten_on TEXT NOT NULL,
  meal_type TEXT NOT NULL DEFAULT 'snack',
  name TEXT NOT NULL,
  calories REAL NOT NULL,
  protein REAL NOT NULL DEFAULT 0,
  fat REAL NOT NULL DEFAULT 0,
  carbs REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS meal_entries_user_date_idx ON meal_entries(user_id, eaten_on);

CREATE TABLE IF NOT EXISTS exercise_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  exercised_on TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '運動',
  calories REAL NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS exercise_entries_user_date_idx ON exercise_entries(user_id, exercised_on);

CREATE TABLE IF NOT EXISTS condition_entries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  recorded_on TEXT NOT NULL,
  sleep_hours REAL NOT NULL,
  fatigue INTEGER NOT NULL,
  hunger INTEGER NOT NULL,
  training_intensity INTEGER NOT NULL,
  body_condition INTEGER NOT NULL,
  resting_heart_rate INTEGER,
  note TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, recorded_on)
);

CREATE TABLE IF NOT EXISTS meal_templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  meal_type TEXT NOT NULL DEFAULT 'snack',
  name TEXT NOT NULL,
  calories REAL NOT NULL,
  protein REAL NOT NULL DEFAULT 0,
  fat REAL NOT NULL DEFAULT 0,
  carbs REAL NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS meal_templates_user_created_idx ON meal_templates(user_id, created_at);
`

function json(data: unknown, status = 200, extraHeaders?: HeadersInit) {
  const headers = new Headers(extraHeaders)
  headers.set('Content-Type', 'application/json; charset=utf-8')
  headers.set('Cache-Control', 'no-store')
  headers.set('X-Content-Type-Options', 'nosniff')
  return new Response(JSON.stringify(data), { status, headers })
}

function noContent(extraHeaders?: HeadersInit) {
  const headers = new Headers(extraHeaders)
  headers.set('Cache-Control', 'no-store')
  return new Response(null, { status: 204, headers })
}

function normalizeUsername(value: unknown) {
  return typeof value === 'string' ? value.trim().toLocaleLowerCase('ja-JP') : ''
}

function normalizeEmail(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

function isValidEmail(value: string) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

function isValidIsoDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const parsed = new Date(`${value}T00:00:00Z`)
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
}

function todayIso() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function previousDayIso(value: string) {
  const parsed = new Date(`${value}T00:00:00Z`)
  parsed.setUTCDate(parsed.getUTCDate() - 1)
  return parsed.toISOString().slice(0, 10)
}

function isSameOrigin(request: Request) {
  const origin = request.headers.get('origin')
  return !origin || origin === new URL(request.url).origin
}

function getCookie(request: Request, name: string) {
  const cookie = request.headers.get('cookie') || ''
  for (const part of cookie.split(';')) {
    const [key, ...rest] = part.trim().split('=')
    if (key === name) return decodeURIComponent(rest.join('='))
  }
  return null
}

function sessionCookie(token: string) {
  const maxAge = Math.floor(sessionDurationMs / 1000)
  return `${cookieName}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`
}

function expiredSessionCookie() {
  return `${cookieName}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
}

function randomHex(bytes: number) {
  const data = new Uint8Array(bytes)
  crypto.getRandomValues(data)
  return Array.from(data, (value) => value.toString(16).padStart(2, '0')).join('')
}

function bytesToHex(data: ArrayBuffer | Uint8Array) {
  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data)
  return Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
}

function hexToBytes(hex: string) {
  if (hex.length % 2 !== 0 || !/^[a-f0-9]+$/i.test(hex)) return null
  const bytes = new Uint8Array(hex.length / 2)
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(hex.slice(index * 2, index * 2 + 2), 16)
  }
  return bytes
}

async function sha256Hex(value: string) {
  const encoded = new TextEncoder().encode(value)
  return bytesToHex(await crypto.subtle.digest('SHA-256', encoded))
}

async function hashPassword(password: string) {
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: passwordIterations },
    keyMaterial,
    256,
  )
  return `pbkdf2$${passwordIterations}$${bytesToHex(salt)}$${bytesToHex(bits)}`
}

async function verifyPassword(password: string, encoded: string) {
  const parts = encoded.split('$')
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false
  const iterations = Number(parts[1])
  const salt = hexToBytes(parts[2])
  const stored = hexToBytes(parts[3])
  if (!Number.isInteger(iterations) || iterations < 100_000 || !salt || !stored || stored.length !== 32) return false

  const keyMaterial = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits'])
  const bits = new Uint8Array(await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    keyMaterial,
    stored.length * 8,
  ))
  let difference = 0
  for (let index = 0; index < stored.length; index += 1) difference |= stored[index] ^ bits[index]
  return difference === 0
}

async function ensureSchema(db: D1Database) {
  if (schemaReady) return
  await db.exec(schemaSql)
  schemaReady = true
}

async function createSession(db: D1Database, userId: string) {
  const token = randomHex(32)
  const tokenHash = await sha256Hex(token)
  const expiresAt = Date.now() + sessionDurationMs
  await db.prepare('INSERT INTO sessions (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
    .bind(crypto.randomUUID(), userId, tokenHash, expiresAt, Date.now())
    .run()
  return { token, expiresAt }
}

async function currentUser(db: D1Database, request: Request) {
  const token = getCookie(request, cookieName)
  if (!token) return null
  const tokenHash = await sha256Hex(token)
  const match = await db.prepare(`
    SELECT users.id, users.username, users.email, sessions.expires_at AS expiresAt
    FROM sessions
    INNER JOIN users ON sessions.user_id = users.id
    WHERE sessions.token_hash = ?
    LIMIT 1
  `).bind(tokenHash).first<{ id: string; username: string; email: string | null; expiresAt: number }>()

  if (!match) return null
  if (Number(match.expiresAt) < Date.now()) {
    await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(tokenHash).run()
    return null
  }
  return match
}

async function dashboard(db: D1Database, userId: string) {
  const planRow = await db.prepare(`
    SELECT id, user_id AS userId, current_weight AS currentWeight, target_weight AS targetWeight,
           fight_date AS fightDate, weigh_in_type AS weighInType, water_cut_kg AS waterCutKg,
           fight_mode AS fightMode, updated_at AS updatedAt
    FROM plans WHERE user_id = ? LIMIT 1
  `).bind(userId).first<Record<string, unknown>>()

  const profile = await db.prepare(`
    SELECT user_id AS userId, height_cm AS heightCm, age, sex, activity_level AS activityLevel, updated_at AS updatedAt
    FROM profiles WHERE user_id = ? LIMIT 1
  `).bind(userId).first<Record<string, unknown>>()

  const records = (await db.prepare(`
    SELECT id, weight, recorded_on AS recordedOn, note, created_at AS createdAt
    FROM weight_entries WHERE user_id = ? ORDER BY recorded_on DESC, id DESC LIMIT 90
  `).bind(userId).all<Record<string, unknown>>()).results ?? []

  const meals = (await db.prepare(`
    SELECT id, eaten_on AS eatenOn, meal_type AS mealType, name, calories, protein, fat, carbs, created_at AS createdAt
    FROM meal_entries WHERE user_id = ? ORDER BY eaten_on DESC, id DESC LIMIT 180
  `).bind(userId).all<Record<string, unknown>>()).results ?? []

  const exercises = (await db.prepare(`
    SELECT id, exercised_on AS exercisedOn, name, calories, source, created_at AS createdAt
    FROM exercise_entries WHERE user_id = ? ORDER BY exercised_on DESC, id DESC LIMIT 180
  `).bind(userId).all<Record<string, unknown>>()).results ?? []

  const conditions = (await db.prepare(`
    SELECT id, recorded_on AS recordedOn, sleep_hours AS sleepHours, fatigue, hunger,
           training_intensity AS trainingIntensity, body_condition AS bodyCondition,
           resting_heart_rate AS restingHeartRate, note, created_at AS createdAt
    FROM condition_entries WHERE user_id = ? ORDER BY recorded_on DESC, id DESC LIMIT 90
  `).bind(userId).all<Record<string, unknown>>()).results ?? []

  const templates = (await db.prepare(`
    SELECT id, meal_type AS mealType, name, calories, protein, fat, carbs, created_at AS createdAt
    FROM meal_templates WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 50
  `).bind(userId).all<Record<string, unknown>>()).results ?? []

  const plan = planRow ? { ...planRow, fightMode: Boolean(planRow.fightMode) } : null
  return { plan, profile: profile ?? null, records, meals, exercises, conditions, templates }
}

function publicSiteOrigin(request: Request, env: Env) {
  const configured = env.PASSWORD_RESET_BASE_URL?.trim()
  if (configured) {
    try {
      return new URL(configured).origin
    } catch {
      console.error('PASSWORD_RESET_BASE_URL is invalid')
    }
  }
  return new URL(request.url).origin
}

async function sendPasswordResetEmail(env: Env, email: string, resetUrl: string) {
  const apiKey = env.RESEND_API_KEY?.trim()
  const from = env.PASSWORD_RESET_FROM?.trim()
  if (!apiKey || !from) throw new Error('EMAIL_NOT_CONFIGURED')

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'CUTLINE/1.2 Cloudflare',
    },
    body: JSON.stringify({
      from,
      to: [email],
      subject: 'CUTLINE パスワード再設定',
      text: `CUTLINEのパスワード再設定リクエストを受け付けました。\n\n30分以内に以下のリンクから新しいパスワードを設定してください。\n${resetUrl}\n\nこの操作に心当たりがない場合は、このメールを無視してください。`,
      html: `<p>CUTLINEのパスワード再設定リクエストを受け付けました。</p><p>30分以内に以下のボタンから新しいパスワードを設定してください。</p><p><a href="${resetUrl}" style="display:inline-block;padding:12px 18px;background:#b9e62e;color:#11150d;text-decoration:none;font-weight:800;border-radius:8px">パスワードを再設定</a></p><p style="font-size:12px;color:#666">この操作に心当たりがない場合は、このメールを無視してください。</p>`,
    }),
  })

  if (!response.ok) {
    console.error('Resend password reset failed', response.status, await response.text())
    throw new Error('EMAIL_SEND_FAILED')
  }
}

function routePath(context: PagesContext) {
  const value = context.params.path
  if (Array.isArray(value)) return `/${value.join('/')}`
  if (typeof value === 'string' && value) return `/${value}`
  return '/session'
}

export const onRequest = async (context: PagesContext) => {
  const { request, env } = context
  const path = routePath(context)

  if (!env.DB) {
    return json({ error: 'Cloudflare D1の設定が未完了です。WorkerのD1 Bindingを「DB」という名前で接続してください。' }, 503)
  }
  const db = env.DB

  try {
    await ensureSchema(db)

    if (request.method !== 'GET' && !isSameOrigin(request)) {
      return json({ error: '不正な送信元からのリクエストです。' }, 403)
    }

    if (path === '/register' && request.method === 'POST') {
      const body = await request.json() as Record<string, unknown>
      const username = normalizeUsername(body.username)
      const email = normalizeEmail(body.email)
      const password = typeof body.password === 'string' ? body.password : ''
      if (username.length < 3 || username.length > 30) return json({ error: 'ユーザー名は3〜30文字で入力してください。' }, 400)
      if (!/^[\p{L}\p{N}_.-]+$/u.test(username)) return json({ error: 'ユーザー名に使用できない文字が含まれています。' }, 400)
      if (!isValidEmail(email)) return json({ error: 'メールアドレスを正しく入力してください。' }, 400)
      if (password.length < 8 || password.length > 128) return json({ error: 'パスワードは8〜128文字で入力してください。' }, 400)

      const existing = await db.prepare('SELECT id FROM users WHERE username = ? LIMIT 1').bind(username).first<{ id: string }>()
      if (existing) return json({ error: 'このユーザー名はすでに使われています。' }, 409)
      const existingEmail = await db.prepare('SELECT id FROM users WHERE email = ? LIMIT 1').bind(email).first<{ id: string }>()
      if (existingEmail) return json({ error: 'このメールアドレスはすでに登録されています。' }, 409)

      const id = crypto.randomUUID()
      const passwordHash = await hashPassword(password)
      await db.prepare('INSERT INTO users (id, username, email, password_hash, created_at) VALUES (?, ?, ?, ?, ?)')
        .bind(id, username, email, passwordHash, Date.now()).run()
      const session = await createSession(db, id)
      return json({ user: { id, username, email }, ...(await dashboard(db, id)) }, 201, { 'Set-Cookie': sessionCookie(session.token) })
    }

    if (path === '/login' && request.method === 'POST') {
      const body = await request.json() as Record<string, unknown>
      const username = normalizeUsername(body.username)
      const password = typeof body.password === 'string' ? body.password : ''
      const user = await db.prepare('SELECT id, username, email, password_hash AS passwordHash FROM users WHERE username = ? LIMIT 1')
        .bind(username).first<{ id: string; username: string; email: string | null; passwordHash: string }>()
      if (!user || !(await verifyPassword(password, user.passwordHash))) return json({ error: 'ユーザー名またはパスワードが違います。' }, 401)
      const session = await createSession(db, user.id)
      return json({ user: { id: user.id, username: user.username, email: user.email }, ...(await dashboard(db, user.id)) }, 200, { 'Set-Cookie': sessionCookie(session.token) })
    }

    if (path === '/forgot-password' && request.method === 'POST') {
      const body = await request.json() as Record<string, unknown>
      const email = normalizeEmail(body.email)
      if (!isValidEmail(email)) return json({ error: 'メールアドレスを正しく入力してください。' }, 400)
      if (!env.RESEND_API_KEY?.trim() || !env.PASSWORD_RESET_FROM?.trim()) {
        return json({ error: 'メール送信設定が未完了です。管理者に連絡してください。' }, 503)
      }

      const account = await db.prepare('SELECT id, email FROM users WHERE email = ? LIMIT 1').bind(email).first<{ id: string; email: string | null }>()
      if (account) {
        const latest = await db.prepare('SELECT created_at AS createdAt FROM password_reset_tokens WHERE user_id = ? ORDER BY created_at DESC LIMIT 1')
          .bind(account.id).first<{ createdAt: number }>()
        if (!latest || Date.now() - Number(latest.createdAt) >= passwordResetCooldownMs) {
          await db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').bind(account.id).run()
          const token = randomHex(32)
          const tokenHash = await sha256Hex(token)
          const expiresAt = Date.now() + passwordResetDurationMs
          await db.prepare('INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at, created_at) VALUES (?, ?, ?, ?, ?)')
            .bind(crypto.randomUUID(), account.id, tokenHash, expiresAt, Date.now()).run()
          const resetUrl = `${publicSiteOrigin(request, env)}/?reset=${encodeURIComponent(token)}`
          try {
            await sendPasswordResetEmail(env, email, resetUrl)
          } catch (error) {
            await db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').bind(account.id).run()
            throw error
          }
        }
      }
      return json({ message: '登録済みのメールアドレスであれば、再設定メールを送信しました。' })
    }

    if (path === '/reset-password' && request.method === 'POST') {
      const body = await request.json() as Record<string, unknown>
      const token = typeof body.token === 'string' ? body.token.trim() : ''
      const password = typeof body.password === 'string' ? body.password : ''
      if (!/^[a-f0-9]{64}$/i.test(token)) return json({ error: '再設定リンクが無効です。' }, 400)
      if (password.length < 8 || password.length > 128) return json({ error: 'パスワードは8〜128文字で入力してください。' }, 400)

      const tokenHash = await sha256Hex(token)
      const reset = await db.prepare('SELECT id, user_id AS userId, expires_at AS expiresAt FROM password_reset_tokens WHERE token_hash = ? LIMIT 1')
        .bind(tokenHash).first<{ id: string; userId: string; expiresAt: number }>()
      if (!reset || Number(reset.expiresAt) < Date.now()) {
        if (reset) await db.prepare('DELETE FROM password_reset_tokens WHERE id = ?').bind(reset.id).run()
        return json({ error: '再設定リンクの有効期限が切れているか、すでに使用されています。' }, 400)
      }

      await db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').bind(await hashPassword(password), reset.userId).run()
      await db.prepare('DELETE FROM password_reset_tokens WHERE user_id = ?').bind(reset.userId).run()
      await db.prepare('DELETE FROM sessions WHERE user_id = ?').bind(reset.userId).run()
      return json({ message: 'パスワードを変更しました。新しいパスワードでログインしてください。' }, 200, { 'Set-Cookie': expiredSessionCookie() })
    }

    if (path === '/logout' && request.method === 'POST') {
      const token = getCookie(request, cookieName)
      if (token) await db.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256Hex(token)).run()
      return noContent({ 'Set-Cookie': expiredSessionCookie() })
    }

    const user = await currentUser(db, request)
    if (!user) return json({ error: 'ログインが必要です。' }, 401, { 'Set-Cookie': expiredSessionCookie() })

    if (path === '/session' && request.method === 'GET') {
      return json({ user: { id: user.id, username: user.username, email: user.email }, ...(await dashboard(db, user.id)) })
    }

    if (path === '/account/email' && request.method === 'PUT') {
      const body = await request.json() as Record<string, unknown>
      const email = normalizeEmail(body.email)
      const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : ''
      if (!isValidEmail(email)) return json({ error: 'メールアドレスを正しく入力してください。' }, 400)

      const account = await db.prepare('SELECT id, username, email, password_hash AS passwordHash FROM users WHERE id = ? LIMIT 1')
        .bind(user.id).first<{ id: string; username: string; email: string | null; passwordHash: string }>()
      if (!account) return json({ error: 'アカウントが見つかりません。' }, 404)
      if (account.email && account.email !== email && !(await verifyPassword(currentPassword, account.passwordHash))) {
        return json({ error: 'メールアドレスを変更するには現在のパスワードを入力してください。' }, 401)
      }
      const duplicate = await db.prepare('SELECT id FROM users WHERE email = ? LIMIT 1').bind(email).first<{ id: string }>()
      if (duplicate && duplicate.id !== user.id) return json({ error: 'このメールアドレスはすでに登録されています。' }, 409)

      await db.prepare('UPDATE users SET email = ? WHERE id = ?').bind(email, user.id).run()
      return json({ user: { id: account.id, username: account.username, email } })
    }

    if (path === '/plan' && request.method === 'PUT') {
      const body = await request.json() as Record<string, unknown>
      const currentWeight = Number(body.currentWeight)
      const targetWeight = Number(body.targetWeight)
      const fightDate = typeof body.fightDate === 'string' ? body.fightDate : ''
      const weighInType = body.weighInType === 'day_before' ? 'day_before' : body.weighInType === 'same_day' || body.weighInType == null ? 'same_day' : ''
      const waterCutKg = body.waterCutKg == null ? 0 : Number(body.waterCutKg)
      const fightMode = body.fightMode === true
      const weighInDateIso = isValidIsoDate(fightDate) ? (weighInType === 'day_before' ? previousDayIso(fightDate) : fightDate) : ''
      if (!(currentWeight >= 30 && currentWeight <= 300) || !(targetWeight >= 30 && targetWeight <= 300) || targetWeight >= currentWeight || !isValidIsoDate(fightDate) || fightDate < todayIso() || !weighInType || !(waterCutKg >= 0 && waterCutKg <= 15) || weighInDateIso < todayIso()) {
        return json({ error: '体重・試合日・計量方法・水抜き予定を正しく入力してください。' }, 400)
      }

      await db.prepare(`
        INSERT INTO plans (user_id, current_weight, target_weight, fight_date, weigh_in_type, water_cut_kg, fight_mode, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          current_weight = excluded.current_weight,
          target_weight = excluded.target_weight,
          fight_date = excluded.fight_date,
          weigh_in_type = excluded.weigh_in_type,
          water_cut_kg = excluded.water_cut_kg,
          fight_mode = excluded.fight_mode,
          updated_at = excluded.updated_at
      `).bind(user.id, currentWeight, targetWeight, fightDate, weighInType, waterCutKg, fightMode ? 1 : 0, Date.now()).run()

      const plan = await db.prepare(`
        SELECT id, user_id AS userId, current_weight AS currentWeight, target_weight AS targetWeight,
               fight_date AS fightDate, weigh_in_type AS weighInType, water_cut_kg AS waterCutKg,
               fight_mode AS fightMode, updated_at AS updatedAt
        FROM plans WHERE user_id = ? LIMIT 1
      `).bind(user.id).first<Record<string, unknown>>()
      return json({ plan: plan ? { ...plan, fightMode: Boolean(plan.fightMode) } : null })
    }

    if (path === '/profile' && request.method === 'PUT') {
      const body = await request.json() as Record<string, unknown>
      const heightCm = Number(body.heightCm)
      const age = Number(body.age)
      const sex = typeof body.sex === 'string' ? body.sex : ''
      const activityLevel = typeof body.activityLevel === 'string' ? body.activityLevel : ''
      const activityLevels = ['sedentary', 'light', 'moderate', 'high', 'very_high']
      if (!(heightCm >= 120 && heightCm <= 230) || !Number.isInteger(age) || age < 16 || age > 90 || !['male', 'female'].includes(sex) || !activityLevels.includes(activityLevel)) {
        return json({ error: 'プロフィール情報を正しく入力してください。' }, 400)
      }

      await db.prepare(`
        INSERT INTO profiles (user_id, height_cm, age, sex, activity_level, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
          height_cm = excluded.height_cm,
          age = excluded.age,
          sex = excluded.sex,
          activity_level = excluded.activity_level,
          updated_at = excluded.updated_at
      `).bind(user.id, heightCm, age, sex, activityLevel, Date.now()).run()
      const profile = await db.prepare('SELECT user_id AS userId, height_cm AS heightCm, age, sex, activity_level AS activityLevel, updated_at AS updatedAt FROM profiles WHERE user_id = ? LIMIT 1')
        .bind(user.id).first<Record<string, unknown>>()
      return json({ profile })
    }

    if (path === '/meals' && request.method === 'POST') {
      const body = await request.json() as Record<string, unknown>
      const eatenOn = typeof body.eatenOn === 'string' ? body.eatenOn : ''
      const mealType = typeof body.mealType === 'string' ? body.mealType : 'snack'
      const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : ''
      const calories = Number(body.calories)
      const protein = Number(body.protein ?? 0)
      const fat = Number(body.fat ?? 0)
      const carbs = Number(body.carbs ?? 0)
      const macros = [protein, fat, carbs]
      if (!isValidIsoDate(eatenOn) || eatenOn > todayIso() || !['breakfast', 'lunch', 'dinner', 'snack'].includes(mealType) || name.length < 1 || !(calories >= 0 && calories <= 10000) || macros.some((value) => !(value >= 0 && value <= 1000))) {
        return json({ error: '食事内容と栄養値を正しく入力してください。' }, 400)
      }
      const createdAt = Date.now()
      const result = await db.prepare('INSERT INTO meal_entries (user_id, eaten_on, meal_type, name, calories, protein, fat, carbs, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(user.id, eatenOn, mealType, name, calories, protein, fat, carbs, createdAt).run()
      const id = Number(result.meta?.last_row_id)
      const meal = await db.prepare('SELECT id, eaten_on AS eatenOn, meal_type AS mealType, name, calories, protein, fat, carbs FROM meal_entries WHERE id = ? AND user_id = ? LIMIT 1')
        .bind(id, user.id).first<Record<string, unknown>>()
      return json({ meal }, 201)
    }

    if (path === '/exercises' && request.method === 'POST') {
      const body = await request.json() as Record<string, unknown>
      const exercisedOn = typeof body.exercisedOn === 'string' ? body.exercisedOn : ''
      const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : '運動'
      const calories = Number(body.calories)
      if (!isValidIsoDate(exercisedOn) || exercisedOn > todayIso() || name.length < 1 || !(calories > 0 && calories <= 10000)) {
        return json({ error: '運動内容と消費カロリーを正しく入力してください。' }, 400)
      }
      const result = await db.prepare('INSERT INTO exercise_entries (user_id, exercised_on, name, calories, source, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .bind(user.id, exercisedOn, name, calories, 'manual', Date.now()).run()
      const id = Number(result.meta?.last_row_id)
      const exercise = await db.prepare('SELECT id, exercised_on AS exercisedOn, name, calories, source FROM exercise_entries WHERE id = ? AND user_id = ? LIMIT 1')
        .bind(id, user.id).first<Record<string, unknown>>()
      return json({ exercise }, 201)
    }

    if (path === '/records' && request.method === 'POST') {
      const body = await request.json() as Record<string, unknown>
      const weight = Number(body.weight)
      const recordedOn = typeof body.recordedOn === 'string' ? body.recordedOn : ''
      const note = typeof body.note === 'string' ? body.note.trim().slice(0, 120) : ''
      if (!(weight >= 30 && weight <= 300) || !isValidIsoDate(recordedOn) || recordedOn > todayIso()) return json({ error: '体重と日付を正しく入力してください。' }, 400)
      const now = Date.now()
      await db.prepare(`
        INSERT INTO weight_entries (user_id, weight, recorded_on, note, created_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(user_id, recorded_on) DO UPDATE SET
          weight = excluded.weight,
          note = excluded.note,
          created_at = excluded.created_at
      `).bind(user.id, weight, recordedOn, note, now).run()
      await db.prepare('UPDATE plans SET current_weight = ?, updated_at = ? WHERE user_id = ?').bind(weight, now, user.id).run()
      const record = await db.prepare('SELECT id, weight, recorded_on AS recordedOn, note FROM weight_entries WHERE user_id = ? AND recorded_on = ? LIMIT 1')
        .bind(user.id, recordedOn).first<Record<string, unknown>>()
      return json({ record }, 201)
    }

    if (path === '/conditions' && request.method === 'POST') {
      const body = await request.json() as Record<string, unknown>
      const recordedOn = typeof body.recordedOn === 'string' ? body.recordedOn : ''
      const sleepHours = Number(body.sleepHours)
      const fatigue = Number(body.fatigue)
      const hunger = Number(body.hunger)
      const trainingIntensity = Number(body.trainingIntensity)
      const bodyCondition = Number(body.bodyCondition)
      const restingHeartRate = body.restingHeartRate === '' || body.restingHeartRate == null ? null : Number(body.restingHeartRate)
      const note = typeof body.note === 'string' ? body.note.trim().slice(0, 160) : ''
      const ratings = [fatigue, hunger, trainingIntensity, bodyCondition]
      if (!isValidIsoDate(recordedOn) || recordedOn > todayIso() || !(sleepHours >= 0 && sleepHours <= 16) || ratings.some((value) => !Number.isInteger(value) || value < 1 || value > 5) || (restingHeartRate !== null && (!Number.isInteger(restingHeartRate) || restingHeartRate < 30 || restingHeartRate > 220))) {
        return json({ error: 'コンディション内容を正しく入力してください。' }, 400)
      }
      const now = Date.now()
      await db.prepare(`
        INSERT INTO condition_entries (user_id, recorded_on, sleep_hours, fatigue, hunger, training_intensity, body_condition, resting_heart_rate, note, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, recorded_on) DO UPDATE SET
          sleep_hours = excluded.sleep_hours,
          fatigue = excluded.fatigue,
          hunger = excluded.hunger,
          training_intensity = excluded.training_intensity,
          body_condition = excluded.body_condition,
          resting_heart_rate = excluded.resting_heart_rate,
          note = excluded.note,
          created_at = excluded.created_at
      `).bind(user.id, recordedOn, sleepHours, fatigue, hunger, trainingIntensity, bodyCondition, restingHeartRate, note, now).run()
      const condition = await db.prepare(`
        SELECT id, recorded_on AS recordedOn, sleep_hours AS sleepHours, fatigue, hunger,
               training_intensity AS trainingIntensity, body_condition AS bodyCondition,
               resting_heart_rate AS restingHeartRate, note
        FROM condition_entries WHERE user_id = ? AND recorded_on = ? LIMIT 1
      `).bind(user.id, recordedOn).first<Record<string, unknown>>()
      return json({ condition }, 201)
    }

    if (path === '/templates' && request.method === 'POST') {
      const body = await request.json() as Record<string, unknown>
      const mealType = typeof body.mealType === 'string' ? body.mealType : 'snack'
      const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : ''
      const calories = Number(body.calories)
      const protein = Number(body.protein ?? 0)
      const fat = Number(body.fat ?? 0)
      const carbs = Number(body.carbs ?? 0)
      const macros = [protein, fat, carbs]
      if (!['breakfast', 'lunch', 'dinner', 'snack'].includes(mealType) || name.length < 1 || !(calories >= 0 && calories <= 10000) || macros.some((value) => !(value >= 0 && value <= 1000))) {
        return json({ error: 'テンプレート内容を正しく入力してください。' }, 400)
      }
      const result = await db.prepare('INSERT INTO meal_templates (user_id, meal_type, name, calories, protein, fat, carbs, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .bind(user.id, mealType, name, calories, protein, fat, carbs, Date.now()).run()
      const id = Number(result.meta?.last_row_id)
      const template = await db.prepare('SELECT id, meal_type AS mealType, name, calories, protein, fat, carbs FROM meal_templates WHERE id = ? AND user_id = ? LIMIT 1')
        .bind(id, user.id).first<Record<string, unknown>>()
      return json({ template }, 201)
    }

    if (path === '/feedback' && request.method === 'POST') {
      const body = await request.json() as Record<string, unknown>
      const category = typeof body.category === 'string' ? body.category : ''
      const message = typeof body.message === 'string' ? body.message.trim() : ''
      if (!['使いやすさ', '機能の要望', '不具合', 'その他'].includes(category)) return json({ error: '意見の種類を選択してください。' }, 400)
      if (message.length < 3 || message.length > 1000) return json({ error: '内容は3〜1000文字で入力してください。' }, 400)
      await db.prepare('INSERT INTO feedback (user_id, category, message, created_at) VALUES (?, ?, ?, ?)').bind(user.id, category, message, Date.now()).run()
      return json({ message: 'ご意見を受け付けました。ありがとうございます。' }, 201)
    }

    const conditionMatch = path.match(/^\/conditions\/(\d+)$/)
    if (conditionMatch && request.method === 'DELETE') {
      await db.prepare('DELETE FROM condition_entries WHERE id = ? AND user_id = ?').bind(Number(conditionMatch[1]), user.id).run()
      return noContent()
    }

    const templateMatch = path.match(/^\/templates\/(\d+)$/)
    if (templateMatch && request.method === 'DELETE') {
      await db.prepare('DELETE FROM meal_templates WHERE id = ? AND user_id = ?').bind(Number(templateMatch[1]), user.id).run()
      return noContent()
    }

    const mealMatch = path.match(/^\/meals\/(\d+)$/)
    if (mealMatch && request.method === 'PUT') {
      const body = await request.json() as Record<string, unknown>
      const eatenOn = typeof body.eatenOn === 'string' ? body.eatenOn : ''
      const mealType = typeof body.mealType === 'string' ? body.mealType : 'snack'
      const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : ''
      const calories = Number(body.calories)
      const protein = Number(body.protein ?? 0)
      const fat = Number(body.fat ?? 0)
      const carbs = Number(body.carbs ?? 0)
      const macros = [protein, fat, carbs]
      if (!isValidIsoDate(eatenOn) || eatenOn > todayIso() || !['breakfast', 'lunch', 'dinner', 'snack'].includes(mealType) || name.length < 1 || !(calories >= 0 && calories <= 10000) || macros.some((value) => !(value >= 0 && value <= 1000))) {
        return json({ error: '食事内容と栄養値を正しく入力してください。' }, 400)
      }
      await db.prepare('UPDATE meal_entries SET eaten_on = ?, meal_type = ?, name = ?, calories = ?, protein = ?, fat = ?, carbs = ? WHERE id = ? AND user_id = ?')
        .bind(eatenOn, mealType, name, calories, protein, fat, carbs, Number(mealMatch[1]), user.id).run()
      const meal = await db.prepare('SELECT id, eaten_on AS eatenOn, meal_type AS mealType, name, calories, protein, fat, carbs FROM meal_entries WHERE id = ? AND user_id = ? LIMIT 1')
        .bind(Number(mealMatch[1]), user.id).first<Record<string, unknown>>()
      if (!meal) return json({ error: '食事記録が見つかりません。' }, 404)
      return json({ meal })
    }

    if (mealMatch && request.method === 'DELETE') {
      await db.prepare('DELETE FROM meal_entries WHERE id = ? AND user_id = ?').bind(Number(mealMatch[1]), user.id).run()
      return noContent()
    }

    const exerciseMatch = path.match(/^\/exercises\/(\d+)$/)
    if (exerciseMatch && request.method === 'DELETE') {
      await db.prepare('DELETE FROM exercise_entries WHERE id = ? AND user_id = ?').bind(Number(exerciseMatch[1]), user.id).run()
      return noContent()
    }

    const recordMatch = path.match(/^\/records\/(\d+)$/)
    if (recordMatch && request.method === 'DELETE') {
      await db.prepare('DELETE FROM weight_entries WHERE id = ? AND user_id = ?').bind(Number(recordMatch[1]), user.id).run()
      return noContent()
    }

    return json({ error: 'ページが見つかりません。' }, 404)
  } catch (error) {
    console.error('CUTLINE API error', error)
    if (error instanceof Error && error.message === 'EMAIL_SEND_FAILED') {
      return json({ error: '再設定メールを送信できませんでした。メール送信設定を確認してください。' }, 502)
    }
    if (error instanceof Error && error.message === 'EMAIL_NOT_CONFIGURED') {
      return json({ error: 'メール送信設定が未完了です。管理者に連絡してください。' }, 503)
    }
    return json({ error: '処理を完了できませんでした。時間をおいて再度お試しください。' }, 500)
  }
}


function apiParamsFromPathname(pathname: string) {
  const prefix = '/api/cutline'
  if (!pathname.startsWith(prefix)) return undefined
  const rest = pathname.slice(prefix.length)
  const segments = rest.split('/').filter(Boolean)
  return segments.length ? segments : undefined
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname === '/api/cutline' || url.pathname.startsWith('/api/cutline/')) {
      return onRequest({
        request,
        env,
        params: { path: apiParamsFromPathname(url.pathname) },
      })
    }

    if (!env.ASSETS) {
      return new Response('Static assets binding is not configured.', { status: 503 })
    }
    return env.ASSETS.fetch(request)
  },
}
