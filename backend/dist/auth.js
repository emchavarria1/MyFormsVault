import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { config } from "./config.js";
export async function hashPassword(password) {
    return bcrypt.hash(password, 10);
}
export async function comparePassword(password, hash) {
    return bcrypt.compare(password, hash);
}
export function signToken(payload) {
    return jwt.sign(payload, config.jwtSecret, { expiresIn: "30d" });
}
export function verifyToken(token) {
    return jwt.verify(token, config.jwtSecret);
}
