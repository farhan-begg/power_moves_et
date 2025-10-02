const axios = require("axios");
require("dotenv").config({ path: "../.env" }); // adjust path if needed

const PLAID_CLIENT_ID = process.env.PLAID_CLIENT_ID;
const PLAID_SECRET = process.env.PLAID_SECRET;
const PLAID_ENV = process.env.PLAID_ENV || "sandbox";

const BASE_URL =
  PLAID_ENV === "sandbox"
    ? "https://sandbox.plaid.com"
    : PLAID_ENV === "development"
    ? "https://development.plaid.com"
    : "https://production.plaid.com";

(async () => {
  try {
    // Step 1: Create a Production Link Token
    const linkTokenRes = await axios.post(`${BASE_URL}/link/token/create`, {
      client_id: PLAID_CLIENT_ID,
      secret: PLAID_SECRET,
      user: { client_user_id: "user123" }, // can use your real user IDs
      client_name: "PowerMoves Expense Tracker",
      products: ["auth", "transactions"],
      country_codes: ["US"],
      language: "en",
      webhook: "https://yourdomain.com/plaid/webhook" // strongly recommended
    });
    console.log("✅ Production link token:", linkTokenRes.data.link_token);

    // At this point: pass link_token to your frontend → open Plaid Link
    // User logs into their real bank, Plaid gives you a PUBLIC_TOKEN.
    // From there, you exchange it for ACCESS_TOKEN (same as sandbox).
  } catch (err) {
    console.error("❌ Error:", err.response?.data || err.message);
  }
})();
