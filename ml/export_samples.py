import argparse
import json
import os
import psycopg


def export_samples(database_url: str, output_path: str) -> int:
    os.makedirs(os.path.dirname(os.path.abspath(output_path)), exist_ok=True)
    query = """
        SELECT
            aid,
            bvid,
            title,
            description,
            tags,
            decision,
            model_version,
            probabilities,
            song_probability,
            human_label,
            labeled_at
        FROM discovery_sample
        WHERE human_label IS NOT NULL
        ORDER BY updated_at DESC
    """
    count = 0
    with psycopg.connect(database_url) as conn:
        with conn.cursor() as cur:
            cur.execute(query)
            with open(output_path, "w", encoding="utf-8") as f:
                for row in cur:
                    (
                        aid,
                        bvid,
                        title,
                        description,
                        tags,
                        decision,
                        model_version,
                        probabilities,
                        song_probability,
                        human_label,
                        labeled_at,
                    ) = row
                    record = {
                        "aid": int(aid),
                        "bvid": bvid,
                        "title": title or "untitled",
                        "description": description or "N/A",
                        "tags": tags if isinstance(tags, list) else [],
                        "decision": decision,
                        "modelVersion": model_version,
                        "probabilities": probabilities,
                        "songProbability": float(song_probability),
                        "label": int(human_label),
                        "labeledAt": labeled_at.isoformat() if labeled_at else None,
                    }
                    f.write(json.dumps(record, ensure_ascii=False) + "\n")
                    count += 1
    return count


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Export human-labeled DiscoverySample records to JSONL"
    )
    parser.add_argument(
        "--db-url",
        default=os.environ.get(
            "SNAPSHOT_DATABASE_URL",
            "postgres://cvsa:password@127.0.0.1:5433/cvsa_snapshot",
        ),
        help="PostgreSQL connection string for snapshot-db",
    )
    parser.add_argument(
        "--output",
        default=os.path.join(os.path.dirname(__file__), "data/labeled_samples.jsonl"),
        help="Output JSONL file path",
    )
    args = parser.parse_args()
    total = export_samples(args.db_url, args.output)
    print(f"Exported {total} labeled samples to {args.output}")


if __name__ == "__main__":
    main()
