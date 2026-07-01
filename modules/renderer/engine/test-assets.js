const Resolver = require("./asset-resolver");

const r = new Resolver();

console.log(r.verifyClient());

console.log(r.resolveItem(64587));
