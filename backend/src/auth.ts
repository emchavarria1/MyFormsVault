import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from "./config.js";

export type JwtPayload = {
  userId: string;
  email: string;
};

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function comparePassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export function signToken(payload: JwtPayload) {
  return jwt.sign(payload, config.jwtSecret, { expiresIn: "30d" });
}

export function verifyToken(token: string) {
  return jwt.verify(token, config.jwtSecret) as JwtPayload;
}
