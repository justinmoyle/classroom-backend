ALTER TABLE "user" ADD COLUMN IF NOT EXISTS "department_id" integer;
--> statement-breakpoint
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_department_id_departments_id_fk') THEN
        ALTER TABLE "user" ADD CONSTRAINT "user_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;
    END IF;
END $$;
