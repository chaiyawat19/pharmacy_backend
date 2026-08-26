import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSubscriptionPaidAt1787050000000 implements MigrationInterface {
    name = 'AddSubscriptionPaidAt1787050000000'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "subscriptions" ADD COLUMN IF NOT EXISTS "paid_at" TIMESTAMP`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "subscriptions" DROP COLUMN IF EXISTS "paid_at"`);
    }
}
