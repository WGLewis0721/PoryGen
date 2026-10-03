import { createSheetsStore } from "./_lib/google-sheets.mjs";
import { createWaitlistHandler } from "./_lib/waitlist.mjs";

export const config = { api: { bodyParser: false } };

// All server-side only; see docs/WAITLIST_API.md for setup.
const env = process.env;
const configured = env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_PRIVATE_KEY && env.WAITLIST_SPREADSHEET_ID;

const store = configured
  ? createSheetsStore({
      clientEmail: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      privateKey: env.GOOGLE_PRIVATE_KEY,
      spreadsheetId: env.WAITLIST_SPREADSHEET_ID,
      tab: env.WAITLIST_SHEET_TAB || "", // empty = first tab
    })
  : null;

const allowedOrigins = String(env.WAITLIST_ALLOWED_ORIGINS ?? "").split(",").map(origin => origin.trim()).filter(Boolean);

export default createWaitlistHandler({ store, allowedOrigins });
