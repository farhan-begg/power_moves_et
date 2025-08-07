const jwt = require("jsonwebtoken");

const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjY4OTE3ODU2ODA0MjQ2MmZlZGVlYjNiYSIsImlhdCI6MTc1NDUyOTE3MywiZXhwIjoxNzU0NjE1NTczfQ.-_F2P10FgTk8EOe693UuyVPmeQrOq4ezcCvI4rjv1E4";

// Replace this with your actual JWT_SECRET from your .env file
const secret = "superSecretRandomKey12345!@#$%9876";

try {
  const decoded = jwt.verify(token, secret);
  console.log("✅ Token is valid:");
  console.log(decoded);
} catch (err) {
  console.error("❌ Token verification failed:", err.message);
}
