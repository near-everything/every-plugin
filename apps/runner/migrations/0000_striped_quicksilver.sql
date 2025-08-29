CREATE TYPE "public"."workflow_status" AS ENUM('ACTIVE', 'INACTIVE', 'ARCHIVED');--> statement-breakpoint
CREATE TYPE "public"."workflow_run_status" AS ENUM('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'PARTIAL_SUCCESS', 'CANCELLED');--> statement-breakpoint
CREATE TYPE "public"."plugin_run_status" AS ENUM('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED', 'RETRYING');--> statement-breakpoint
CREATE TYPE "public"."plugin_run_type" AS ENUM('SOURCE', 'PIPELINE');--> statement-breakpoint
CREATE TABLE "account" (
	"id" text PRIMARY KEY NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" text NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp,
	"refresh_token_expires_at" timestamp,
	"scope" text,
	"password" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "jwks" (
	"id" text PRIMARY KEY NOT NULL,
	"public_key" text NOT NULL,
	"private_key" text NOT NULL,
	"created_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"id" text PRIMARY KEY NOT NULL,
	"expires_at" timestamp NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" text NOT NULL,
	"impersonated_by" text,
	CONSTRAINT "session_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean NOT NULL,
	"image" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"is_anonymous" boolean,
	"role" text,
	"banned" boolean,
	"ban_reason" text,
	"ban_expires" timestamp,
	CONSTRAINT "user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification" (
	"id" text PRIMARY KEY NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp NOT NULL,
	"created_at" timestamp,
	"updated_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "workflow" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"name" varchar(255) NOT NULL,
	"created_by" text NOT NULL,
	"schedule" varchar(255),
	"source" jsonb NOT NULL,
	"pipeline" jsonb NOT NULL,
	"state" jsonb,
	"status" "workflow_status" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_run" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"workflow_id" varchar(255) NOT NULL,
	"triggered_by" text,
	"status" "workflow_run_status" DEFAULT 'PENDING' NOT NULL,
	"failure_reason" text,
	"items_processed" integer DEFAULT 0,
	"items_total" integer DEFAULT 0,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "source_item" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"external_id" varchar(255) NOT NULL,
	"data" jsonb NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "source_item_external_id_unique" UNIQUE("external_id")
);
--> statement-breakpoint
CREATE TABLE "plugin_run" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"workflow_run_id" varchar(255) NOT NULL,
	"source_item_id" varchar(255),
	"step_id" varchar(255) NOT NULL,
	"plugin_id" varchar(255) NOT NULL,
	"type" "plugin_run_type" DEFAULT 'PIPELINE' NOT NULL,
	"config" json,
	"input" json,
	"output" json,
	"error" json,
	"status" "plugin_run_status" DEFAULT 'PENDING' NOT NULL,
	"started_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"retry_count" varchar(10) DEFAULT '0'
);
--> statement-breakpoint
CREATE TABLE "workflows_to_source_items" (
	"workflow_id" varchar(255) NOT NULL,
	"source_item_id" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workflows_to_source_items_workflow_id_source_item_id_pk" PRIMARY KEY("workflow_id","source_item_id")
);
--> statement-breakpoint
CREATE TABLE "workflow_runs_to_source_items" (
	"workflow_run_id" varchar(255) NOT NULL,
	"source_item_id" varchar(255) NOT NULL,
	"processed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workflow_runs_to_source_items_workflow_run_id_source_item_id_pk" PRIMARY KEY("workflow_run_id","source_item_id")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow" ADD CONSTRAINT "workflow_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_run" ADD CONSTRAINT "workflow_run_workflow_id_workflow_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_run" ADD CONSTRAINT "workflow_run_triggered_by_user_id_fk" FOREIGN KEY ("triggered_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plugin_run" ADD CONSTRAINT "plugin_run_workflow_run_id_workflow_run_id_fk" FOREIGN KEY ("workflow_run_id") REFERENCES "public"."workflow_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plugin_run" ADD CONSTRAINT "plugin_run_source_item_id_source_item_id_fk" FOREIGN KEY ("source_item_id") REFERENCES "public"."source_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflows_to_source_items" ADD CONSTRAINT "workflows_to_source_items_workflow_id_workflow_id_fk" FOREIGN KEY ("workflow_id") REFERENCES "public"."workflow"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflows_to_source_items" ADD CONSTRAINT "workflows_to_source_items_source_item_id_source_item_id_fk" FOREIGN KEY ("source_item_id") REFERENCES "public"."source_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs_to_source_items" ADD CONSTRAINT "workflow_runs_to_source_items_workflow_run_id_workflow_run_id_fk" FOREIGN KEY ("workflow_run_id") REFERENCES "public"."workflow_run"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workflow_runs_to_source_items" ADD CONSTRAINT "workflow_runs_to_source_items_source_item_id_source_item_id_fk" FOREIGN KEY ("source_item_id") REFERENCES "public"."source_item"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workflow_run_workflow_idx" ON "workflow_run" USING btree ("workflow_id");--> statement-breakpoint
CREATE INDEX "workflow_run_status_idx" ON "workflow_run" USING btree ("status");--> statement-breakpoint
CREATE INDEX "workflow_run_started_at_idx" ON "workflow_run" USING btree ("started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "external_id_idx" ON "source_item" USING btree ("external_id");--> statement-breakpoint
CREATE INDEX "source_item_created_at_idx" ON "source_item" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "source_item_processed_at_idx" ON "source_item" USING btree ("processed_at");--> statement-breakpoint
CREATE INDEX "plugin_run_workflow_run_idx" ON "plugin_run" USING btree ("workflow_run_id");--> statement-breakpoint
CREATE INDEX "plugin_run_source_item_idx" ON "plugin_run" USING btree ("source_item_id");--> statement-breakpoint
CREATE INDEX "plugin_run_step_idx" ON "plugin_run" USING btree ("step_id");--> statement-breakpoint
CREATE INDEX "plugin_run_type_idx" ON "plugin_run" USING btree ("type");