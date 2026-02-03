-- Expand description columns to text to allow long descriptions
ALTER TABLE "departments" ALTER COLUMN "description" TYPE text;
--> statement-breakpoint
ALTER TABLE "subjects" ALTER COLUMN "description" TYPE text;
--> statement-breakpoint
