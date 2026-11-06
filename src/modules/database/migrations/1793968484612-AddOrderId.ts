import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddOrderId1793968484612 implements MigrationInterface {
  name = 'AddOrderId1793968484612';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "invoices" ADD "order_id" character varying(128)`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_20f15ef9bd957b0beeb1fbb557" ON "invoices"  ("project", "order_id") WHERE "order_id" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_20f15ef9bd957b0beeb1fbb557"`);
    await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN "order_id"`);
  }
}
