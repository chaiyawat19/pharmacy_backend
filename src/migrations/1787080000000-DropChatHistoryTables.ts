import { MigrationInterface, QueryRunner } from "typeorm";

/**
 * เลิกเก็บประวัติการสนทนาแชตบอต — ลบตาราง chat_messages และ chat_sessions
 * คง chat_quotas และ chatbot_documents ไว้ตามเดิม
 */
export class DropChatHistoryTables1787080000000 implements MigrationInterface {
    name = 'DropChatHistoryTables1787080000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        // messages อ้าง FK ไป sessions — ลบก่อน
        await queryRunner.query(`DROP TABLE IF EXISTS "chat_messages" CASCADE`);
        await queryRunner.query(`DROP TABLE IF EXISTS "chat_sessions" CASCADE`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        // Schema เดิมแบบย่อ — ใช้เฉพาะกรณี rollback ฉุกเฉิน
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "chat_sessions" (
                "chat_session_id" SERIAL PRIMARY KEY,
                "title" text,
                "user_id" integer,
                "created_at" TIMESTAMP NOT NULL DEFAULT now()
            )
        `);
        await queryRunner.query(`
            CREATE TABLE IF NOT EXISTS "chat_messages" (
                "message_id" SERIAL PRIMARY KEY,
                "sender_type" varchar NOT NULL,
                "message_text" text NOT NULL,
                "chat_session_id" integer,
                "sent_at" TIMESTAMP NOT NULL DEFAULT now()
            )
        `);
    }
}
