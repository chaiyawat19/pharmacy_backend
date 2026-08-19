import { MigrationInterface, QueryRunner } from "typeorm";

export class AddSoftDeleteColumns1787047141182 implements MigrationInterface {
    name = 'AddSoftDeleteColumns1787047141182'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "news_article_categories" DROP CONSTRAINT "FK_7330e4bfcd04f3273d55964982b"`);
        await queryRunner.query(`ALTER TABLE "news_article_tags" DROP CONSTRAINT "FK_383faf8a00e2b1cba3bea71a98c"`);
        await queryRunner.query(`ALTER TABLE "news_article_tags" DROP CONSTRAINT "FK_dd06b099050a1e2b92d62ff7c4e"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_7330e4bfcd04f3273d55964982"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_47cfbc4823ba8727623e7c0116"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_383faf8a00e2b1cba3bea71a98"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_dd06b099050a1e2b92d62ff7c4"`);
        await queryRunner.query(`CREATE INDEX "IDX_7330e4bfcd04f3273d55964982" ON "news_article_categories" ("article_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_47cfbc4823ba8727623e7c0116" ON "news_article_categories" ("category_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_383faf8a00e2b1cba3bea71a98" ON "news_article_tags" ("article_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_dd06b099050a1e2b92d62ff7c4" ON "news_article_tags" ("tag_id") `);
        await queryRunner.query(`ALTER TABLE "news_article_categories" ADD CONSTRAINT "FK_7330e4bfcd04f3273d55964982b" FOREIGN KEY ("article_id") REFERENCES "news_articles"("article_id") ON DELETE CASCADE ON UPDATE NO ACTION`);
        await queryRunner.query(`ALTER TABLE "items" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "item_banks" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP WITH TIME ZONE`);
        await queryRunner.query(`ALTER TABLE "item_situations" ADD COLUMN IF NOT EXISTS "deleted_at" TIMESTAMP WITH TIME ZONE`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "news_article_tags" DROP CONSTRAINT "FK_dd06b099050a1e2b92d62ff7c4e"`);
        await queryRunner.query(`ALTER TABLE "news_article_tags" DROP CONSTRAINT "FK_383faf8a00e2b1cba3bea71a98c"`);
        await queryRunner.query(`ALTER TABLE "news_article_categories" DROP CONSTRAINT "FK_7330e4bfcd04f3273d55964982b"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_dd06b099050a1e2b92d62ff7c4"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_383faf8a00e2b1cba3bea71a98"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_47cfbc4823ba8727623e7c0116"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_7330e4bfcd04f3273d55964982"`);
        await queryRunner.query(`CREATE INDEX "IDX_dd06b099050a1e2b92d62ff7c4" ON "news_article_tags" ("tag_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_383faf8a00e2b1cba3bea71a98" ON "news_article_tags" ("article_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_47cfbc4823ba8727623e7c0116" ON "news_article_categories" ("category_id") `);
        await queryRunner.query(`CREATE INDEX "IDX_7330e4bfcd04f3273d55964982" ON "news_article_categories" ("article_id") `);
        await queryRunner.query(`ALTER TABLE "item_situations" DROP COLUMN "deleted_at"`);
        await queryRunner.query(`ALTER TABLE "item_banks" DROP COLUMN "deleted_at"`);
        await queryRunner.query(`ALTER TABLE "items" DROP COLUMN "deleted_at"`);
    }

}
