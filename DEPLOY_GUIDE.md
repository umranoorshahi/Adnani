# Biradari Server v2 — Deploy Guide
## Step by step — कोई error नहीं होगा

---

## STEP 1 — MongoDB Atlas (Free Database)

1. https://mongodb.com/atlas खोलें → Sign up (Google से)
2. "Build a Database" → M0 FREE → AWS → Mumbai (ap-south-1)
3. Username: `biradari`  Password: `biradari2024`
4. Network Access → "Add IP Address" → "Allow from Anywhere" (0.0.0.0/0)
5. "Connect" → "Drivers" → Connection string copy करें:

```
mongodb+srv://biradari:biradari2024@cluster0.XXXXX.mongodb.net/biradari?retryWrites=true&w=majority
```

---

## STEP 2 — GitHub पर Upload

### 2.1 — New Repository बनाएं
- github.com → "+" → New repository
- Name: `biradari-server`
- Public ✅
- "Create repository"

### 2.2 — Files Upload करें
"uploading an existing file" पर click करें

**इन files को EXACTLY इस folder structure में upload करें:**

```
biradari-server/          ← Root (GitHub repo)
├── server.js
├── package.json
├── Procfile
├── railway.json
├── .gitignore
├── .env.example          ← .env नहीं! (secret है)
├── config/
│   └── db.js
├── middleware/
│   ├── auth.js
│   └── upload.js
├── models/
│   ├── User.js
│   ├── Message.js
│   └── Post.js
├── controllers/
│   ├── authController.js
│   ├── userController.js
│   ├── messageController.js
│   └── postController.js
├── routes/
│   ├── auth.js
│   ├── users.js
│   ├── messages.js
│   └── posts.js
├── socket/
│   └── socketHandler.js
└── uploads/
    └── .gitkeep
```

### 2.3 — Commit करें
"Commit changes" → Done ✅

---

## STEP 3 — Railway Deploy

1. railway.app → "Login with GitHub"
2. "New Project" → "Deploy from GitHub repo"
3. `biradari-server` select करें
4. Deploy शुरू होगा (पहले fail होगा — ठीक है)

### 3.1 — Environment Variables Add करें
"Variables" tab → "Add Variable" — एक-एक करके:

| Variable | Value |
|----------|-------|
| `MONGO_URI` | `mongodb+srv://biradari:biradari2024@cluster0.XXXXX.mongodb.net/biradari?retryWrites=true&w=majority` |
| `JWT_SECRET` | `biradari_adnani_secret_2024_change_this` |
| `NODE_ENV` | `production` |
| `PORT` | `5000` |

### 3.2 — Redeploy
Variables add करने के बाद → "Deploy" button → फिर deploy होगा

### 3.3 — Domain Generate करें
"Settings" → "Domains" → "Generate Domain"

URL मिलेगा:
```
https://biradari-server-xxxx.up.railway.app
```

### 3.4 — Test करें
Browser में खोलें → यह दिखे:
```json
{
  "status": "✅ Biradari Server is Running",
  "version": "2.0.0"
}
```

---

## STEP 4 — App को Server से Connect करें

Railway URL मिलने के बाद Claude को बताएं।
Claude Adnani app को server से connect कर देगा।

---

## API Endpoints

| Method | URL | Description |
|--------|-----|-------------|
| POST | `/api/auth/send-otp` | OTP request |
| POST | `/api/auth/verify-otp` | OTP verify → JWT token |
| PUT | `/api/auth/setup-profile` | Profile setup |
| GET | `/api/auth/me` | Current user |
| GET | `/api/users` | All members |
| GET | `/api/users/:id` | One user |
| PUT | `/api/users/profile` | Update profile |
| GET | `/api/users/pending` | Pending (admin) |
| PUT | `/api/users/:id/approve` | Approve/reject (admin) |
| GET | `/api/messages/conversations` | All chats |
| POST | `/api/messages/send` | Send message |
| GET | `/api/messages/:userId` | Chat history |
| DELETE | `/api/messages/:id` | Delete message |
| PUT | `/api/messages/:id` | Edit message |
| GET | `/api/posts` | Feed |
| POST | `/api/posts` | Create post |
| POST | `/api/posts/:id/like` | Like/unlike |
| POST | `/api/posts/:id/comment` | Add comment |
| DELETE | `/api/posts/:id/comment/:cid` | Delete comment |
| DELETE | `/api/posts/:id` | Delete post |
| GET | `/api/posts/user/:userId` | User's posts |

## Socket.IO Events

| Client → Server | Description |
|-----------------|-------------|
| `typing` | Typing started |
| `stopTyping` | Typing stopped |
| `markSeen` | Messages seen |
| `markDelivered` | Messages delivered |

| Server → Client | Description |
|-----------------|-------------|
| `newMessage` | New message received |
| `msgDelivered` | Message delivered |
| `msgsSeen` | Messages seen |
| `msgsDelivered` | Messages delivered |
| `msgDeleted` | Message deleted |
| `msgEdited` | Message edited |
| `userTyping` | Typing indicator |
| `userOnline` | User came online |
| `userOffline` | User went offline |
| `onlineUsers` | Initial online list |
| `newPost` | New post in feed |
| `postLiked` | Post liked/unliked |
| `newComment` | New comment |
| `postDeleted` | Post deleted |
| `accountStatus` | Account approved/blocked |

---

## Admin Login
Phone: `9415061063` — Haji Mahmood Ahmad (auto approved)
Phone: `9839060377` — Sri Md. Irfan (auto approved)
OTP: `123456` (fixed for testing)
