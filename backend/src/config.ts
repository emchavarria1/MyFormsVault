import dotenv from "dotenv";

dotenv.config();

const port = Number.parseInt(process.env.PORT ?? "8787", 10);

if (!process.env.JWT_SECRET) {
  // Local dev fallback only.
  console.warn("[config] JWT_SECRET not set. Using insecure default for local development.");
}

export const config = {
  port: Number.isFinite(port) ? port : 8787,
  jwtSecret: process.env.JWT_SECRET ?? "dev-only-secret",
};
