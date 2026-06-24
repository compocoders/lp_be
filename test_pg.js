import pg from 'pg';
const { Client } = pg;

const client = new Client({
  connectionString: 'postgresql://neondb_owner:npg_M2HBlTthYSp7@ep-lingering-shape-aokbfipj.c-2.ap-southeast-1.aws.neon.tech/neondb?sslmode=verify-full'
});

async function run() {
  await client.connect();
  const res = await client.query(`SELECT * FROM "Classroom" LIMIT 1`);
  console.log("Classroom:", res.rows[0]);
  
  const cuRes = await client.query(`SELECT * FROM "classroomUser" WHERE "classroomId" = '3a82c334-ca0e-4e2c-8e3e-fc2b69da4a4b'`);
  console.log("Classroom Users:", cuRes.rows);
  
  await client.end();
}
run();
