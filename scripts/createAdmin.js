import "dotenv/config";
import bcrypt from "bcrypt";
import { createUser, getUserByEmail } from "../db/queries/users.js";

async function createAdmin() {
  const email = process.env.ADMIN_EMAIL || "admin@example.com";
  const plainPassword = process.env.ADMIN_PASSWORD || "admin123";

  const existing = await getUserByEmail(email);

  if (existing) {
    console.log(`A user with email ${email} already exists.`);
    process.exit(1);
  }

  const passwordHash = await bcrypt.hash(plainPassword, 10);

  await createUser({ email, passwordHash, role: "admin" });

  console.log("Admin user created.");
  console.log("Email:", email);
  console.log("Password:", plainPassword);

  process.exit();
}

createAdmin().catch((err) => {
  console.error("Error creating admin:", err);
  process.exit(1);
});
