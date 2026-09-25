import { seedDatabase } from "../server/seed";
import { pool } from "../server/db";

// Demo data only: refuse to run against production unless explicitly forced.
if (process.env.NODE_ENV === "production" && process.env.ALLOW_DEMO_SEED !== "1") {
  console.error("Refusing to seed demo data into production. Set ALLOW_DEMO_SEED=1 to override.");
  process.exit(1);
}

seedDatabase()
  .then(() => pool.end())
  .catch(async (err) => {
    console.error(err);
    await pool.end();
    process.exit(1);
  });
