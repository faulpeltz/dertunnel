// Token create cli script
import { hashToken } from "./shared/hash";
import { generateToken } from "./shared/random";

const newToken = generateToken();
hashToken(newToken).then(hashed => {
    console.info(`TOKEN: ${newToken}\nHASH: ${hashed}`);
}).catch(err => console.error(err));
