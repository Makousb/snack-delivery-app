import "dotenv/config";
import bcrypt from "bcrypt";
import { createUser } from "../db/queries/users.js";

async function createAdmin() {
  const email = "admin@example.com";
  const plainPassword = "admin123";

  const hashedPassword = await bcrypt.hash(plainPassword, 10);

  await createUser(email, hashedPassword);

  console.log("✅ Admin user created");
  console.log("Email:", email);
  console.log("Password:", plainPassword);

  process.exit();
}

createAdmin().catch(err => {
  console.error("❌ Error creating admin:", err);
  process.exit(1);
});
