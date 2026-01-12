// server/services/plaidService.ts
import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";
import dotenv from "dotenv";

dotenv.config();

const env = process.env.PLAID_ENV || "sandbox";
if (!["sandbox", "development", "production"].includes(env)) {
  console.warn(`⚠️ Invalid PLAID_ENV "${env}", defaulting to sandbox`);
}

// Log current environment for debugging
console.log(`📦 Plaid Environment: ${env}`);
if (env === "sandbox") {
  console.log(`⚠️ Note: Some banks (like Bank of America) may have limited support in sandbox mode.`);
  console.log(`   Consider switching to "development" or "production" for full bank support.`);
}

if (!process.env.PLAID_CLIENT_ID || !process.env.PLAID_SECRET) {
  throw new Error("❌ Missing Plaid credentials in environment variables");
}

const config = new Configuration({
  basePath: PlaidEnvironments[env as keyof typeof PlaidEnvironments],
  baseOptions: {
    headers: {
      "PLAID-CLIENT-ID": process.env.PLAID_CLIENT_ID!,
      "PLAID-SECRET": process.env.PLAID_SECRET!,
    },
  },
});

// Create Plaid client
const plaidClient = new PlaidApi(config);

// ✅ Attach interceptors to log requests & responses
const axiosInstance = (plaidClient as any).axiosInstance;

if (axiosInstance) {
  axiosInstance.interceptors.request.use(
    (req: any) => {
      const { method, url, data } = req;
      console.log(`➡️ [Plaid API Request] ${method?.toUpperCase()} ${url}`);
      if (data) {
        try {
          const parsed = typeof data === "string" ? JSON.parse(data) : data;
          // Do not log secrets or tokens
          if (parsed.public_token) parsed.public_token = "***";
          if (parsed.access_token) parsed.access_token = "***";
          console.log("   Body:", parsed);
        } catch {
          console.log("   Raw data:", data);
        }
      }
      return req;
    },
    (err: any) => {
      console.error("❌ Plaid request error:", err.message);
      return Promise.reject(err);
    }
  );

  axiosInstance.interceptors.response.use(
    (res: any) => {
      console.log(
        `✅ [Plaid API Response] ${res.config.method?.toUpperCase()} ${res.config.url} → ${res.status}`
      );
      return res;
    },
    (err: any) => {
      if (err.response) {
        console.error(
          `❌ [Plaid API Error] ${err.config?.method?.toUpperCase()} ${err.config?.url} → ${err.response.status}`,
          err.response.data
        );
      } else {
        console.error("❌ Plaid API Network Error:", err.message);
      }
      return Promise.reject(err);
    }
  );
}

export default plaidClient;
