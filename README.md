# Ledger — Shop Billing & Challan App (Browser-only edition)

A black-and-white shop billing app built with React, TypeScript, and Vite. It supports local sign-up/login, shop settings, products, customers, draft and finalized bills/challans, A4 PDF downloads, document search, and WhatsApp click-to-chat.

## Important: no Supabase or server is needed

This edition stores all records in the browser's `localStorage`. You do **not** need a Supabase account, database, SQL setup, API keys, `.env` file, or backend server.

**Limitations of browser-only storage:**
- Data stays in the particular browser and device where it was entered. It does not sync across devices or browsers.
- Clearing browser/site data, using a private window, or losing the device can remove the records. Export/backup functionality is not included in this version, so keep separate records of important business information.
- The in-browser sign-in is only a convenience lock, not secure cloud authentication. Someone with access to the browser/device or developer tools may be able to access the stored data. Do not use this version for sensitive or legally critical records that require stronger access controls and backups.
- Password reset email cannot work without a backend; the reset screen explains this.
- Browser storage is not suitable for multiple staff/devices using a shared central database.

If you later need cloud synchronization, secure user accounts, robust database access policies, and backups, use a backend such as Supabase instead of this browser-only edition.

## What's included

- Owner name, shop name, email and password setup; sign-in and sign-out.
- Shop profile settings.
- Product catalogue with add, edit, search and delete.
- Customer directory with add, edit, search and delete.
- Bill and challan creation with multiple products, quantities, rate overrides, discount, optional tax and notes.
- Empty bill/challan drafts, draft editing and finalized-document read-only behavior in the app.
- Separate browser-local document sequences (`Bill-0001`, `Challan-0001`, etc.).
- Snapshot data for shop, customer and item names/rates used on saved documents.
- PDF generation in the browser, and WhatsApp click-to-chat with a prepared message. Download the PDF and attach it manually; WhatsApp links cannot automatically attach local files.
- Vercel configuration for the Vite single-page app.

## Upload to GitHub

1. Download and extract the ZIP.
2. Create an empty repository on GitHub.
3. Upload the **contents of this extracted folder**—not the ZIP file. `package.json`, `index.html`, `src/`, and `vite.config.ts` must be in the repository root.
4. Commit the files. Do not upload `node_modules` or `dist`.

## Deploy on Vercel

1. Open Vercel and choose **Add New → Project**.
2. Import the GitHub repository.
3. Use these settings:
   - Framework preset: **Vite**
   - Root directory: `./`
   - Build command: `npm run build`
   - Output directory: `dist`
   - Install command: `npm install`
4. No environment variables are required for this browser-only version.
5. Click **Deploy**.

## Use the app

1. Open the deployed website and select **Create an account**.
2. Enter owner name, shop name, email and a password of at least 8 characters.
3. Add products and customers, then create bills or challans.
4. Save a draft to continue editing later, or finalize the document to lock it in the app UI.
5. Open Bills History to preview, download PDF, or open WhatsApp with a prepared message.
6. Keep using the same browser and device. Clearing that browser's site data may remove the records.

## Local development (optional)

```bash
npm install
npm run dev
npm run build
npm run preview
```

## Project layout

```text
shop-billing-app/
├── index.html
├── package.json
├── vite.config.ts
├── tsconfig.json
├── tsconfig.app.json
├── tsconfig.node.json
├── vercel.json
├── src/
│   ├── main.tsx
│   ├── App.tsx
│   ├── index.css
│   ├── components/
│   │   ├── AuthScreen.tsx
│   │   └── DocumentEditor.tsx
│   ├── lib/
│   │   ├── localStore.ts
│   │   ├── format.ts
│   │   └── pdf.ts
│   └── types/
│       └── index.ts
└── README.md
```
