import { customAlphabet } from "nanoid";
const alphabet = "123456789ABCDEFGHJKMNPQRSTWXYZ";
const fn = customAlphabet(alphabet);
export const getRandomId = (length: number) => fn(length);
