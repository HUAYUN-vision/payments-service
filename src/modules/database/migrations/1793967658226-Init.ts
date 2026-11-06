import { MigrationInterface, QueryRunner } from 'typeorm';

export class Init1793967658226 implements MigrationInterface {
  name = 'Init1793967658226';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE "invoices" ("id" uuid NOT NULL DEFAULT gen_random_uuid(), "project" character varying(64) NOT NULL, "provider" character varying(16) NOT NULL, "status" character varying(16) NOT NULL DEFAULT 'pending', "amount" numeric(14,2) NOT NULL, "currency" character varying(3) NOT NULL, "description" character varying(128), "external_id" character varying(64), "payment_url" text, "callback_url" text NOT NULL, "metadata" jsonb, "paid_at" TIMESTAMP WITH TIME ZONE, "canceled_at" TIMESTAMP WITH TIME ZONE, "callback_status" character varying(16) NOT NULL DEFAULT 'none', "callback_attempts" integer NOT NULL DEFAULT '0', "next_callback_at" TIMESTAMP WITH TIME ZONE, "callback_delivered_at" TIMESTAMP WITH TIME ZONE, "callback_last_error" text, "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_668cef7c22a427fd822cc1be3ce" PRIMARY KEY ("id"))`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_be43e9c5d2937efa6d1056634a" ON "invoices"  ("next_callback_at") WHERE "callback_status" = 'pending'`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_38183e26127f0f956e62a41529" ON "invoices"  ("provider", "external_id") WHERE "external_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_67d800471406a50229455c998c" ON "invoices"  ("project", "created_at") `,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "public"."IDX_67d800471406a50229455c998c"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_38183e26127f0f956e62a41529"`);
    await queryRunner.query(`DROP INDEX "public"."IDX_be43e9c5d2937efa6d1056634a"`);
    await queryRunner.query(`DROP TABLE "invoices"`);
  }
}
