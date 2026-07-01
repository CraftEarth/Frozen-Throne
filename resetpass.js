require("dotenv").config();
const mysql = require("mysql2/promise");
const crypto = require("crypto");

function sha1(...parts) {
  const h = crypto.createHash("sha1");
  for (const part of parts) h.update(part);
  return h.digest();
}

function modPow(base, exp, mod) {
  let result = 1n;
  base %= mod;
  while (exp > 0n) {
    if (exp & 1n) result = (result * base) % mod;
    exp >>= 1n;
    base = (base * base) % mod;
  }
  return result;
}

function bigIntToLeBuffer(num, len) {
  let hex = num.toString(16);
  if (hex.length % 2) hex = "0" + hex;
  let buf = Buffer.from(hex, "hex").reverse();
  if (buf.length < len) buf = Buffer.concat([buf, Buffer.alloc(len - buf.length)]);
  return buf.slice(0, len);
}

function makeSrp6(username, password) {
  username = username.toUpperCase();
  password = password.toUpperCase();

  const g = 7n;
  const N = BigInt("0x894B645E89E1535BBDAD5B8B290650530801B18EBFBF5E8FAB3C82872A3E9BB7");

  const salt = crypto.randomBytes(32);
  const inner = sha1(Buffer.from(`${username}:${password}`));
  const xHash = sha1(salt, inner);
  const x = BigInt("0x" + Buffer.from(xHash).reverse().toString("hex"));

  const verifierNum = modPow(g, x, N);
  const verifier = bigIntToLeBuffer(verifierNum, 32);

  return { salt, verifier };
}

async function main() {
  const username = process.argv[2]?.trim().toUpperCase();
  const password = process.argv[3]?.trim();

  if (!username || !password) {
    console.log("Usage: node resetpass.js USERNAME NEWPASSWORD");
    process.exit(1);
  }

  const { salt, verifier } = makeSrp6(username, password);

  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_AUTH,
  });

  const [result] = await conn.execute(
    "UPDATE account SET salt=?, verifier=? WHERE username=?",
    [salt, verifier, username]
  );

  await conn.end();

  if (result.affectedRows === 0) {
    console.log("No account found.");
  } else {
    console.log(`Password reset for ${username}`);
  }
}

main().catch(console.error);
