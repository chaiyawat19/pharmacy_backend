const { Client } = require('pg');
const client = new Client({
  host: 'localhost', port: 5432, user: 'postgres',
  password: 'Best0927073116', database: 'pharmacy_project'
});

async function seed() {
  try {
    await client.connect();
    console.log('--- Seeding notification_types ---');
    
    const types = [
      { id: 1, code: 'calendar', desc: 'กำหนดการ/ปฏิทิน', icon: 'Calendar' },
      { id: 2, code: 'news', desc: 'ข่าวสารประกาศ', icon: 'Newspaper' },
      { id: 3, code: 'exam_set', desc: 'ชุดข้อสอบใหม่', icon: 'BookOpen' },
      { id: 4, code: 'general', desc: 'การอัปเดตทั่วไป', icon: 'Info' }
    ];

    for (const type of types) {
      const query = `
        INSERT INTO notification_types (notification_type_id, type_code, description, icon_class)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (notification_type_id) 
        DO UPDATE SET type_code = EXCLUDED.type_code, description = EXCLUDED.description, icon_class = EXCLUDED.icon_class
      `;
      await client.query(query, [type.id, type.code, type.desc, type.icon]);
      console.log(`✅ Seeded: ${type.code}`);
    }

  } catch (err) {
    console.error('❌ Error:', err.message);
  } finally {
    await client.end();
  }
}

seed();
