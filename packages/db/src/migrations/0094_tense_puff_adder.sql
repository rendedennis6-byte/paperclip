ALTER TABLE "budget_policies" ALTER COLUMN "warn_percent" SET DEFAULT 60;--> statement-breakpoint
ALTER TABLE "agents" ADD COLUMN IF NOT EXISTS "cost_class" text DEFAULT 'metered' NOT NULL;--> statement-breakpoint
ALTER TABLE "budget_policies" ADD COLUMN IF NOT EXISTS "warn_high_percent" integer DEFAULT 85 NOT NULL;--> statement-breakpoint
ALTER TABLE "budget_policies" ADD COLUMN IF NOT EXISTS "warn_recovery_percent" integer DEFAULT 55 NOT NULL;--> statement-breakpoint
ALTER TABLE "budget_policies" ADD COLUMN IF NOT EXISTS "warn_high_recovery_percent" integer DEFAULT 75 NOT NULL;--> statement-breakpoint
UPDATE "agents" SET "cost_class" = 'critical' WHERE "role" IN ('ceo', 'cto');--> statement-breakpoint
UPDATE "agents" SET "cost_class" = 'free' WHERE "adapter_type" = 'process' AND "cost_class" = 'metered';
