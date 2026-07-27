const localDatabaseUrl = "postgres://stopdown:stopdown@localhost:55432/stopdown";

if (process.env.DATABASE_URL === undefined || process.env.DATABASE_URL.trim() === "") {
  process.env.DATABASE_URL = localDatabaseUrl;
}

console.log(`Using DATABASE_URL=${process.env.DATABASE_URL}`);
console.log("Running migrations...");
await import("./migrate.js");

console.log("Checking database...");
await import("./check-db.js");

console.log("Running backend smoke...");
await import("./smoke-clob.js");
