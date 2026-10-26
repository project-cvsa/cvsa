-- Desired network-runtime state is configuration, not time-series data.
CREATE TABLE "network_runtime_config" (
	"id" VARCHAR(64) NOT NULL DEFAULT 'default',
	"revision" INTEGER NOT NULL DEFAULT 1,
	"config" JSONB NOT NULL,
	"updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

	CONSTRAINT "network_runtime_config_pkey" PRIMARY KEY ("id")
);
