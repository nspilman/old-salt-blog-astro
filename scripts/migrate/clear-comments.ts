import { drizzle } from 'drizzle-orm/libsql';
import { createClient } from '@libsql/client';
import { config } from 'dotenv';
import { sql } from 'drizzle-orm';

config();

const client = createClient({
	url: process.env.TURSO_DATABASE_URL!,
	authToken: process.env.TURSO_AUTH_TOKEN,
});
const db = drizzle(client);

async function clearComments() {
	await db.run(sql`DELETE FROM comments`);
	console.log('Comments table cleared');
}

clearComments();
