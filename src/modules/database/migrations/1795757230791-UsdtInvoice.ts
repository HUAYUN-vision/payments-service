import { MigrationInterface, QueryRunner } from 'typeorm';

export class UsdtInvoice1795757230791 implements MigrationInterface {
  name = 'UsdtInvoice1795757230791';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "invoices" ALTER COLUMN "currency" TYPE character varying(16)`,
    );
    await queryRunner.query(`ALTER TABLE "invoices" ADD "network" character varying(16)`);
    await queryRunner.query(`ALTER TABLE "invoices" ADD "pay_address" character varying(128)`);
    await queryRunner.query(`ALTER TABLE "invoices" ADD "pay_amount" numeric(20,6)`);
    await queryRunner.query(`ALTER TABLE "invoices" ADD "memo" character varying(128)`);
    await queryRunner.query(`ALTER TABLE "invoices" ADD "tx_hash" character varying(128)`);
    await queryRunner.query(`ALTER TABLE "invoices" ADD "expires_at" TIMESTAMP WITH TIME ZONE`);
    // Один хвост суммы на pending-инвойс Ethereum/TRON. TON различается комментарием.
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_invoices_usdt_pending_pay_amount" ON "invoices" ("network", "pay_amount") WHERE "status" = 'pending' AND "network" IN ('ethereum', 'tron') AND "pay_amount" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE TABLE "usdt_cursors" ("network" character varying(16) NOT NULL, "cursor" character varying(128) NOT NULL, CONSTRAINT "PK_usdt_cursors" PRIMARY KEY ("network"))`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "usdt_cursors"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_invoices_usdt_pending_pay_amount"`);
    await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN "expires_at"`);
    await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN "tx_hash"`);
    await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN "memo"`);
    await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN "pay_amount"`);
    await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN "pay_address"`);
    await queryRunner.query(`ALTER TABLE "invoices" DROP COLUMN "network"`);
    await queryRunner.query(
      `ALTER TABLE "invoices" ALTER COLUMN "currency" TYPE character varying(3)`,
    );
  }
}
