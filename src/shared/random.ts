import { customAlphabet } from "nanoid";

export const generateAlphaNum = customAlphabet("0123456789abcdef", 8);
export const generateToken = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 24);
