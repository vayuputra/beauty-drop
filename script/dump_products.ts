
import { db } from "../server/db";
import { products } from "@shared/schema";
import { eq } from "drizzle-orm";

async function main() {
  console.log("Fetching India products...");
  const indiaProducts = await db.select().from(products).where(eq(products.country, 'IN'));
  
  console.log(`Found ${indiaProducts.length} products for India.`);
  
  for (const p of indiaProducts) {
    console.log(`[${p.id}] ${p.brand} - ${p.name}`);
    console.log(`    Image: ${p.imageUrl}`);
    console.log(`    Category: ${p.category}`);
    console.log("---");
  }
  
  process.exit(0);
}

main().catch(console.error);
