# Adnani Connected — Backend v2.0

## 6 Legal Requirements Implemented

| # | Requirement | Implementation |
|---|---|---|
| 1 | **Data Minimization** | Rishta & Business schemas — mandatory fields only. No bank details, full address, or unnecessary PII collected. Contact info stored admin-only with `select: false`. |
| 2 | **Consent Logging** | `pre('save')` hook blocks ALL data writes if `terms_accepted !== true`. Every consent event logged with IP + User-Agent + timestamp in `consent_log[]`. |
| 3 | **Legal Disclaimer** | T&C served from `/api/auth/terms`. Injected clause: *"Content on this app is NOT admissible as legal evidence in any court."* |
| 4 | **SSL/TLS 1.3 + AES-256** | Railway enforces TLS 1.3 termination. Field-level AES-256-CBC encryption for sensitive data (MFA secrets, contact info). HSTS + security headers via Helmet. |
| 5 | **Admin MFA Purge** | `POST /api/admin/purge/all` requires Admin role + TOTP MFA token in `X-MFA-Token` header + body `{ confirm: "DELETE_ALL_DATA" }`. Cascading delete of all collections. |
| 6 | **Right to Erasure** | `POST /api/account/delete` — user triggers recursive deletion of profile, messages, posts, comments, rishta, business listings. GDPR Art. 17 compliant. |

---

## Quick Deploy to Railway

```bash
# 1. Install Railway CLI
npm install -g @railway/cli

# 2. Login
railway login

# 3. Create project
railway init

# 4. Add MongoDB
railway add mongodb

# 5. Set environment variables
railway variables set JWT_SECRET=$(node -e "console.log(require('crypto').randomBytes(64).toString('hex'))")
railway variables set FIELD_ENCRYPTION_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
railway variables set NODE_ENV=production
railway variables set ALLOWED_ORIGINS=https://your-netlify-app.netlify.app

# 6. Deploy
railway up
```

---

## API Reference

### Auth Endpoints
```
POST /api/auth/send-otp         — Send OTP to phone number
POST /api/auth/verify-otp       — Verify OTP, get JWT token
POST /api/auth/accept-terms     — Accept T&C (REQUIRED before any write)
POST /api/auth/profile          — Save name + city
GET  /api/auth/status           — Check approval status
GET  /api/auth/terms            — Get T&C text with legal disclaimer
```

### User Endpoints (requires auth + approval)
```
GET  /api/users                 — List all approved members
GET  /api/users/pending         — List pending members
POST /api/users/:id/approve     — Approve a member (any approved member)
```

### Content Endpoints (requires auth + approval + consent)
```
GET  /api/posts                 — Get community feed
POST /api/posts                 — Create post
POST /api/posts/:id/like        — Like/unlike post
POST /api/posts/:id/comment     — Comment on post
DELETE /api/posts/:id           — Delete post (owner or admin)

POST /api/messages              — Send message
GET  /api/messages/conversation/:userId — Get conversation

GET  /api/rishta                — Get rishta listings
POST /api/rishta                — Create rishta listing
DELETE /api/rishta/:id          — Delete listing

GET  /api/business              — Get business directory
POST /api/business              — Add business
DELETE /api/business/:id        — Delete business
```

### Account Endpoints (Right to Erasure)
```
GET  /api/account/me            — Get my profile
PUT  /api/account/profile       — Update profile
GET  /api/account/consent-log   — View my consent history
GET  /api/account/export        — Export all my data (GDPR portability)
POST /api/account/delete        — DELETE MY ACCOUNT (recursive erasure)
                                  Body: { "confirm": "DELETE_MY_ACCOUNT" }
```

### Admin Endpoints (Admin role required)
```
GET  /api/admin/stats           — Dashboard statistics
GET  /api/admin/users           — All users
POST /api/admin/users/:id/approve — Approve user
POST /api/admin/users/:id/block   — Block user
DELETE /api/admin/posts/:id     — Delete any post (moderation)

# MFA Setup (required before purge)
POST /api/admin/mfa/setup       — Get QR code for Google Authenticator
POST /api/admin/mfa/verify      — Activate MFA with 6-digit code

# PURGE (Admin MFA required)
# Header: X-MFA-Token: <6-digit TOTP>
POST /api/admin/purge/all       — DELETE ALL data (confirm: "DELETE_ALL_DATA")
POST /api/admin/purge/user/:id  — Delete single user + all their data
```

---

## Security Architecture

```
Request Flow:
Browser/App
    ↓ HTTPS (TLS 1.3) — Railway terminates SSL
Express Server
    ↓ Helmet (HSTS, CSP, X-Frame-Options)
    ↓ Rate Limiting (200/15min general, 10/15min auth)
    ↓ MongoDB Sanitize (NoSQL injection prevention)
    ↓ JWT Verification
    ↓ Consent Guard (terms_accepted check)
    ↓ Role/MFA Check (admin routes)
    ↓ Business Logic
    ↓ AES-256 Field Encryption (sensitive fields)
MongoDB Atlas (TLS + at-rest encryption)
```

---

## Admin Purge Flow (Requirement 5)

```bash
# Step 1: Setup MFA (one-time)
curl -X POST https://your-backend.railway.app/api/admin/mfa/setup \
  -H "Authorization: Bearer <admin-jwt>"
# → Returns QR code → Scan with Google Authenticator

# Step 2: Verify MFA
curl -X POST https://your-backend.railway.app/api/admin/mfa/verify \
  -H "Authorization: Bearer <admin-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"token": "123456"}'

# Step 3: Execute Purge (⚠️ IRREVERSIBLE)
curl -X POST https://your-backend.railway.app/api/admin/purge/all \
  -H "Authorization: Bearer <admin-jwt>" \
  -H "X-MFA-Token: 123456" \
  -H "Content-Type: application/json" \
  -d '{"confirm": "DELETE_ALL_DATA"}'
```

---

## User Erasure Flow (Requirement 6)

```bash
# User deletes own account
curl -X POST https://your-backend.railway.app/api/account/delete \
  -H "Authorization: Bearer <user-jwt>" \
  -H "Content-Type: application/json" \
  -d '{"confirm": "DELETE_MY_ACCOUNT", "reason": "No longer needed"}'

# Response includes deletion summary:
# { messages: 47, posts: 12, comments: 8, rishta: 1, businesses: 0 }
```

---

## Frontend Integration

Update `SERVER` constant in `index-1.html`:
```javascript
const SERVER = 'https://your-project.railway.app';
```

Frontend automatically calls:
- `POST /api/auth/accept-terms` — after T&C checkbox
- `POST /api/auth/send-otp` — on phone submit
- `POST /api/auth/verify-otp` — on OTP submit
- All content APIs with `Authorization: Bearer <token>` header
