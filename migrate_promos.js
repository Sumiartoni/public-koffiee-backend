import db from './db.js';

async function migrate() {
    try {
        console.log("Running migrations...");
        try {
            await db.run("ALTER TABLE promotions ADD COLUMN category_id INTEGER REFERENCES categories(id)");
            console.log("Added category_id to promotions");
        } catch (e) {
            if (e.message.includes("duplicate column") || e.message.includes("already exists")) {
                console.log("promotions.category_id already exists");
            } else {
                console.warn("promotions migration warning:", e.message);
            }
        }

        try {
            await db.run("ALTER TABLE discounts ADD COLUMN category_id INTEGER REFERENCES categories(id)");
            console.log("Added category_id to discounts");
        } catch (e) {
            if (e.message.includes("duplicate column") || e.message.includes("already exists")) {
                console.log("discounts.category_id already exists");
            } else {
                console.warn("discounts migration warning:", e.message);
            }
        }
        console.log("Migrations check completed");
        process.exit(0);
    } catch (err) {
        console.error("Migration failed:", err);
        process.exit(1);
    }
}

migrate();
