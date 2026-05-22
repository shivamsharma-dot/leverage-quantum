# 🚀 Leverage Quantum — Complete Setup Guide
### For beginners. Step by step. No coding needed after this.

---

## What you'll do in this guide
1. Install the tools on your laptop (one time only)
2. Set up Google Login (5 min)
3. Set up Google Sheets access (5 min)
4. Run the app on your laptop
5. Put it online for free (Vercel)

---

## STEP 1 — Install Tools on Your Laptop

You need two free programs.

### Install Node.js
1. Go to: https://nodejs.org
2. Click the big green button **"LTS"** (recommended)
3. Download and install it like any normal app
4. To verify: open Terminal (Mac) or Command Prompt (Windows) and type:
   ```
   node --version
   ```
   You should see something like `v20.11.0` ✅

### Install Git
1. Go to: https://git-scm.com/downloads
2. Download and install for your OS
3. To verify:
   ```
   git --version
   ```

---

## STEP 2 — Set Up Google Login (Google Cloud Console)

This gives you the "sign in with Google" button, restricted to leverageedu.com only.

1. Go to: https://console.cloud.google.com
2. Sign in with **any** Google account (your personal one is fine)
3. Click **"Select a project"** at the top → **"New Project"**
4. Name it: `Leverage Quantum` → Click **Create**
5. Wait a moment, then make sure your new project is selected at the top

### Enable the API
6. In the left menu, click **"APIs & Services"** → **"OAuth consent screen"**
7. Choose **"External"** → Click **Create**
8. Fill in:
   - App name: `Leverage Quantum`
   - User support email: your email
   - Developer contact: your email
9. Click **Save and Continue** (skip the Scopes and Test Users pages, just click Continue)
10. Click **Back to Dashboard**

### Create Credentials
11. Click **"Credentials"** in the left menu
12. Click **"+ Create Credentials"** → **"OAuth client ID"**
13. Application type: **"Web application"**
14. Name: `Leverage Quantum Web`
15. Under **"Authorized JavaScript origins"** click **+ ADD URI**:
    - Add: `http://localhost:5173`
    - Add: `https://YOUR-APP-NAME.vercel.app` ← (you'll fill this after deploying)
16. Under **"Authorized redirect URIs"** click **+ ADD URI**:
    - Add: `http://localhost:5173`
17. Click **Create**
18. A popup shows your **Client ID** — it looks like:
    `123456789-abcdefgh.apps.googleusercontent.com`
19. **Copy this Client ID** — you'll need it in Step 4

---

## STEP 3 — Set Up Google Sheets API

This lets the app read your ROAS spreadsheet directly.

1. Go to: https://console.cloud.google.com (you should still be there)
2. Click **"APIs & Services"** → **"Library"**
3. Search for: `Google Sheets API`
4. Click it → Click **"Enable"**
5. Now go to **"APIs & Services"** → **"Credentials"**
6. Click **"+ Create Credentials"** → **"API Key"**
7. An API key is created — it looks like: `AIzaSyABC123...`
8. **Copy this API Key**
9. Click **"Edit API key"** (pencil icon)
10. Under "API restrictions", select **"Restrict key"**
11. From the dropdown, select **"Google Sheets API"**
12. Click **Save**

### Make your sheet accessible
13. Open your ROAS sheet: https://docs.google.com/spreadsheets/d/1aL-T6sYxsonmhiFHUdoMHfr-t9dDYWtQZ-84vcZPqFg
14. Click **Share** (top right)
15. Under "General access", change to **"Anyone with the link"** → **Viewer**
16. Click **Done**

---

## STEP 4 — Configure the App

1. Open the project folder you downloaded
2. Find the file named `.env.example`
3. Make a **copy** of it and rename the copy to exactly: `.env`
4. Open `.env` in any text editor (Notepad on Windows, TextEdit on Mac)
5. Replace the placeholder values:

```
VITE_GOOGLE_CLIENT_ID=PASTE_YOUR_CLIENT_ID_HERE
VITE_ROAS_SHEET_ID=1aL-T6sYxsonmhiFHUdoMHfr-t9dDYWtQZ-84vcZPqFg
VITE_SHEETS_API_KEY=PASTE_YOUR_API_KEY_HERE
```

6. Save the file

---

## STEP 5 — Run on Your Laptop

Open Terminal (Mac) or Command Prompt (Windows):

```bash
# Go into the project folder
cd leverage-quantum

# Install all packages (one time only, takes ~1 min)
npm install

# Start the app
npm run dev
```

You'll see:
```
  VITE v5.x  ready in 300ms
  ➜  Local:   http://localhost:5173/
```

Open your browser and go to: **http://localhost:5173**

🎉 Your app is running! Sign in with your leverageedu.com Google account.

---

## STEP 6 — Put it Online (Vercel — Free)

1. Go to: https://github.com and create a free account if you don't have one
2. Create a new repository called `leverage-quantum`
3. In Terminal, inside your project folder:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/leverage-quantum.git
   git push -u origin main
   ```
4. Go to: https://vercel.com and sign up (use your GitHub account)
5. Click **"New Project"**
6. Import your `leverage-quantum` repository
7. Before deploying, click **"Environment Variables"** and add:
   - `VITE_GOOGLE_CLIENT_ID` = your client ID
   - `VITE_ROAS_SHEET_ID` = `1aL-T6sYxsonmhiFHUdoMHfr-t9dDYWtQZ-84vcZPqFg`
   - `VITE_SHEETS_API_KEY` = your API key
8. Click **Deploy**
9. Vercel gives you a URL like: `leverage-quantum-xyz.vercel.app`

### Final step — update Google OAuth with your live URL
10. Go back to Google Cloud Console → Credentials → Edit your OAuth client
11. Add your Vercel URL to **Authorized JavaScript origins**:
    `https://leverage-quantum-xyz.vercel.app`
12. Click Save

✅ Your app is now live and shareable!

---

## Troubleshooting

**"Only leverageedu.com emails are allowed" when using Google login**
→ Make sure you're signing in with your `@leverageedu.com` Google Workspace account

**Charts show demo data instead of real data**
→ Check that your sheet is set to "Anyone with the link can view"
→ Check your `.env` file has the correct API key and Sheet ID

**White screen / errors in browser**
→ Open browser Developer Tools (F12) → Console tab → share the error message

---

## File Structure (for reference)
```
leverage-quantum/
├── src/
│   ├── pages/
│   │   ├── LoginPage.jsx        ← Login screen
│   │   ├── DashboardHome.jsx    ← Dashboard selector
│   │   └── ROASDashboard.jsx    ← ROAS analytics
│   ├── components/
│   │   └── Sidebar.jsx          ← Navigation
│   ├── hooks/
│   │   ├── useAuth.jsx          ← Login/logout logic
│   │   └── useSheetData.jsx     ← Google Sheets data
│   ├── App.jsx                  ← Routes
│   └── main.jsx                 ← Entry point
├── .env                         ← Your secret keys (never share)
├── vercel.json                  ← Deployment config
└── SETUP_GUIDE.md               ← This file
```
