# Adnani Connected Backend v3.0

Production-ready backend — 15 requirements implemented.

## Deploy to Railway (5 min)

```bash
# 1. Upload this folder to GitHub
# 2. Connect Railway to GitHub repo
# 3. Set environment variables (see .env.example)
# 4. Railway auto-deploys on every push
```

## Environment Variables (Railway Dashboard)

| Variable | Value |
|---|---|
| `MONGO_URI` | Your MongoDB Atlas URL |
| `JWT_SECRET` | 64-char random hex |
| `FIELD_ENCRYPTION_KEY` | 64-char random hex |
| `NODE_ENV` | `production` |
| `ALLOWED_ORIGINS` | Your frontend URLs (comma-separated) |
| `ADMIN_PHONES` | `9415061063,9839060377` |

## API Reference

### Auth
```
GET  /api/auth/terms          — Terms with legal disclaimer
POST /api/auth/register       — Register with phone + strong password
POST /api/auth/login          — Login (+ optional MFA token)
POST /api/auth/accept-terms   — Log consent (required before writes)
POST /api/auth/logout         — Logout current session
POST /api/auth/logout-all     — Logout all devices
GET  /api/auth/sessions       — List active sessions
POST /api/auth/2fa/setup      — Get QR for Google Authenticator
POST /api/auth/2fa/verify     — Activate 2FA
GET  /api/auth/status         — Check approval/terms status
```

### Users
```
GET  /api/users               — All approved members
GET  /api/users/pending       — Pending approvals
POST /api/users/:id/approve   — Approve member
GET  /api/users/me            — My profile
PUT  /api/users/profile       — Update profile
PUT  /api/users/change-password — Change password
```

### Location (city-based only, no raw coordinates)
```
GET  /api/location/cities     — All cities with member counts
GET  /api/location/city/:city — Members in a city
```

### Chat (WebSocket: ws://your-app.railway.app/ws?token=JWT)
```
POST /api/chat                — Send message (REST fallback)
GET  /api/chat/conversation/:userId — Get conversation
```

### Groups
```
POST /api/groups              — Create group
POST /api/groups/:id/add      — Add members (admin)
POST /api/groups/:id/exit     — Leave group
POST /api/groups/:id/lock     — Lock/unlock (admin only)
DELETE /api/groups/:id/messages — Clear chat (admin)
GET  /api/groups/:id/members  — Member list
```

### Rishta
```
GET  /api/rishta              — Browse listings
POST /api/rishta              — Create listing
DELETE /api/rishta/:id        — Delete listing
```

### Business
```
GET  /api/business            — Browse directory
POST /api/business            — Add listing
DELETE /api/business/:id      — Remove listing
```

### Quran & Azan (cached proxy)
```
GET  /api/quran/surah/:num    — Surah text (Arabic + English, 24h cache)
GET  /api/quran/prayer-times  — Prayer times (?lat=&lon=)
```

### Compliance & Rights
```
GET  /api/compliance/consent-log  — My consent history
GET  /api/compliance/export       — Export all my data (GDPR portability)
POST /api/compliance/account/delete — Delete my account (Right to Erasure)
                                      Body: { "confirm": "DELETE_MY_ACCOUNT" }
```

### Admin (Admin role + MFA required)
```
GET  /api/admin/stats         — Dashboard stats
GET  /api/admin/users         — All users
POST /api/admin/users/:id/approve — Approve user
POST /api/admin/users/:id/block   — Block user
GET  /api/admin/audit         — Audit trail

# MFA Setup
POST /api/admin/mfa/setup     — Get QR code
POST /api/admin/mfa/activate  — Activate MFA

# Purge (Admin + MFA + Dual Approval + Delay)
POST /api/admin/purge/request — Request purge (creates pending job)
POST /api/admin/purge/approve — Second admin approves
POST /api/admin/purge/cancel  — Cancel before execution
GET  /api/admin/purge/jobs    — View pending jobs
```

## Purge Flow (5-layer protection)

```
Admin 1: POST /purge/request  → creates job (status: awaiting_approval)
           Header: X-MFA-Token: 123456
           Body: { reason: "...", delay_minutes: 30 }

Admin 2: POST /purge/approve  → job status: approved
           Header: X-MFA-Token: 654321
           Body: { job_id: "..." }

After 30 min: Scheduler auto-executes → status: completed

Any Admin: POST /purge/cancel → cancels before execution
```

## WebSocket Chat

```javascript
const ws = new WebSocket('wss://your-app.railway.app/ws?token=' + JWT);

// Send message
ws.send(JSON.stringify({ type: 'message', to: 'userId', text: 'Assalamu Alaikum' }));

// Typing indicator
ws.send(JSON.stringify({ type: 'typing', to: 'userId' }));

// Mark read
ws.send(JSON.stringify({ type: 'read', message_id: 'msgId' }));
```

## Security Model

```
Request → HTTPS (TLS 1.3) → Rate Limit → Helmet Headers
       → JWT Auth → Consent Check → Role Check
       → MFA Check (admin routes) → Business Logic
       → AES-256 field encryption → MongoDB Atlas
```

## 15 Requirements Status

| # | Requirement | Status |
|---|---|---|
| 1 | Data Minimization | ✅ Rishta/Business — mandatory fields only |
| 2 | Consent Enforcement | ✅ pre('save') hook + IP + device logging |
| 3 | Legal Disclaimer | ✅ GET /api/auth/terms — versioned |
| 4 | TLS 1.3 + AES-256 | ✅ Railway TLS + field encryption |
| 5 | Admin Purge | ✅ MFA + Dual Approval + 30min delay + audit |
| 6 | User Erasure | ✅ Recursive deletion — GDPR Art. 17 |
| 7 | Auth (no mandatory OTP) | ✅ Password + optional 2FA + session tracking |
| 8 | Modular Architecture | ✅ 11 separate modules |
| 9 | City-only Location | ✅ No raw coordinates stored |
| 10 | Chat + Groups | ✅ WebSocket + rate limiting + block/report |
| 11 | Quran/Azan Proxy | ✅ Cached backend proxy |
| 12 | Notifications | ✅ WebSocket push + deep link support |
| 13 | Security | ✅ JWT + validation + XSS + injection protection |
| 14 | Backup & Recovery | ✅ Audit logs + purge backup counts |
| 15 | Audit Logging | ✅ All admin/auth/deletion actions logged |
