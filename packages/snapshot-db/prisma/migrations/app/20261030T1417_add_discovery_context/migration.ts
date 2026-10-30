#!/usr/bin/env -S bun
import type { Contract as Start } from '../../snapshots/1cb001ad7cdc68dacbfb4f9776f9b83d927ff7ac65048c883ef69dd906e3c89f/contract';
import startContract from '../../snapshots/1cb001ad7cdc68dacbfb4f9776f9b83d927ff7ac65048c883ef69dd906e3c89f/contract.json' with { type: 'json' };
import type { Contract as End } from '../../snapshots/98d1bc3ce7b738ac81eaade5fb0b4f00fec111c8af706c2ec569043275a4aaca/contract';
import endContract from '../../snapshots/98d1bc3ce7b738ac81eaade5fb0b4f00fec111c8af706c2ec569043275a4aaca/contract.json' with { type: 'json' };
import { Migration, MigrationCLI, col, rawSql } from '@prisma/orm-postgres/migration';

export default class M extends Migration<Start, End> {
  override readonly startContractJson = startContract;
  override readonly endContractJson = endContract;

  override get operations() {
    return [
      this.addColumn({
        schema: 'public',
        table: 'bilibili_video_metadata',
        column: col('discovery_context', 'json', { codecRef: { codecId: 'pg/json@1' } }),
      }),
      rawSql({
        id: 'backfill.public.bilibili_video_metadata.discovery_context',
        label: 'Backfill discovery_context from legacy discovery_source',
        operationClass: 'data',
        target: {
          id: 'postgres',
          details: {
            schema: 'public',
            objectType: 'table',
            name: 'bilibili_video_metadata',
          },
        },
        precheck: [],
        execute: [
          {
            description: 'copy the legacy source channel into discovery_context',
            sql: `UPDATE "public"."bilibili_video_metadata"
SET "discovery_context" = json_build_object(
  'origin', json_build_object(
    'channel', CASE "discovery_source"
      WHEN 'recommendation' THEN 'related'
      WHEN 'recommendation-graph-explorer' THEN 'graph'
      ELSE "discovery_source"
    END,
    'capturedAt', to_char("captured_at" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
  )
)
WHERE "discovery_context" IS NULL
  AND "discovery_source" IN ('search', 'related', 'manual', 'recommendation', 'recommendation-graph-explorer');

UPDATE "public"."bilibili_video_metadata"
SET "discovery_source" = CASE "discovery_source"
  WHEN 'recommendation' THEN 'related'
  WHEN 'recommendation-graph-explorer' THEN 'graph'
  ELSE "discovery_source"
END
WHERE "discovery_source" IN ('recommendation', 'recommendation-graph-explorer');

INSERT INTO "public"."discovery_sample" (
  "aid", "bvid", "title", "description", "tags", "decision",
  "model_version", "probabilities", "song_probability", "created_at"
)
SELECT
  m."aid", m."bvid", m."title", m."description", m."tags", 'manual_import',
  'manual', '[]'::json, 1, m."captured_at"
FROM "public"."video_tracking" t
JOIN "public"."bilibili_video_metadata" m ON m."aid" = t."aid"
LEFT JOIN "public"."discovery_sample" s ON s."aid" = t."aid"
WHERE s."aid" IS NULL
ON CONFLICT ("aid") DO NOTHING`,
            params: [],
          },
        ],
        postcheck: [],
      }),
    ];
  }
}

MigrationCLI.run(import.meta.url, M);
