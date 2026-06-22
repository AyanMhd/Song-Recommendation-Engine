import os
import re
import sys
from pathlib import Path

import psycopg2
from psycopg2.extras import RealDictCursor

from common import clean_lyrics, compute_theme_scores, embed_texts, split_into_chunks, vector_to_list

EMBEDDING_MODEL = "all-MiniLM-L6-v2"
THEME_MODEL_VERSION = "theme_definitions_v1"
ROOT_DIR = Path(__file__).resolve().parents[1]


def load_dotenv():
    env_path = ROOT_DIR / ".env"
    if not env_path.exists():
        return

    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        os.environ.setdefault(key.strip(), value.strip().strip('"').strip("'"))


def normalize_key(text: str) -> str:
    text = re.sub(r"\s+", " ", text or "").strip().lower()
    text = text.replace("&", " and ")
    text = re.sub(r"[^a-z0-9\s]", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def get_connection():
    database_url = os.environ.get("DATABASE_URL")
    if not database_url:
        raise RuntimeError("DATABASE_URL is not set. Add it to your .env file.")
    return psycopg2.connect(database_url)


def find_artist(cur, artist_name: str):
    normalized = normalize_key(artist_name)
    cur.execute(
        """
        SELECT id, name
        FROM artists
        WHERE name_normalized = %s
        """,
        (normalized,),
    )
    row = cur.fetchone()
    if row:
        return row

    cur.execute(
        """
        SELECT id, name
        FROM artists
        WHERE name_normalized LIKE %s
        ORDER BY LENGTH(name)
        LIMIT 1
        """,
        (f"%{normalized}%",),
    )
    return cur.fetchone()


def get_songs_needing_embed(cur, artist_id: int, reembed: bool = False):
    cur.execute(
        """
        SELECT s.id, s.title, COALESCE(l.raw_lyrics, '') AS raw_lyrics
        FROM songs s
        JOIN lyrics l ON l.song_id = s.id
        WHERE s.artist_id = %s
          AND COALESCE(l.raw_lyrics, '') <> ''
          AND (
            %s
            OR s.processing_status IN ('pending_embed', 'pending_lyrics')
            OR NOT EXISTS (SELECT 1 FROM song_embeddings se WHERE se.song_id = s.id)
          )
        ORDER BY s.title
        """,
        (artist_id, reembed),
    )
    return cur.fetchall()


def clear_song_derived_data(cur, song_id: int):
    cur.execute("DELETE FROM chunk_embeddings WHERE song_id = %s", (song_id,))
    cur.execute("DELETE FROM lyric_chunks WHERE song_id = %s", (song_id,))
    cur.execute("DELETE FROM song_embeddings WHERE song_id = %s", (song_id,))
    cur.execute("DELETE FROM song_theme_scores WHERE song_id = %s", (song_id,))


def to_vector_literal(values):
    return "[" + ",".join(str(float(value)) for value in values) + "]"


def save_processed_song(cur, artist_id: int, song_id: int, payload: dict):
    clean_lyrics_text = payload["clean_lyrics"]
    chunks = payload["chunks"]
    embedding = to_vector_literal(payload["embedding"])
    themes = payload["themes"]

    clear_song_derived_data(cur, song_id)

    cur.execute(
        """
        INSERT INTO lyrics (song_id, raw_lyrics, clean_lyrics, fetched_at)
        VALUES (
          %s,
          COALESCE((SELECT raw_lyrics FROM lyrics WHERE song_id = %s), ''),
          %s,
          NOW()
        )
        ON CONFLICT (song_id) DO UPDATE
          SET clean_lyrics = EXCLUDED.clean_lyrics
        """,
        (song_id, song_id, clean_lyrics_text),
    )

    chunk_ids = []
    for index, chunk in enumerate(chunks):
        cur.execute(
            """
            INSERT INTO lyric_chunks (song_id, chunk_index, text)
            VALUES (%s, %s, %s)
            RETURNING id
            """,
            (song_id, index, chunk["text"]),
        )
        chunk_ids.append((cur.fetchone()["id"], to_vector_literal(chunk["embedding"])))

    cur.execute(
        """
        INSERT INTO song_embeddings (song_id, artist_id, embedding, model_name)
        VALUES (%s, %s, %s::vector, %s)
        ON CONFLICT (song_id) DO UPDATE
          SET artist_id = EXCLUDED.artist_id,
              embedding = EXCLUDED.embedding,
              model_name = EXCLUDED.model_name,
              embedded_at = NOW()
        """,
        (song_id, artist_id, embedding, EMBEDDING_MODEL),
    )

    for chunk_id, chunk_embedding in chunk_ids:
        cur.execute(
            """
            INSERT INTO chunk_embeddings (chunk_id, song_id, artist_id, embedding, model_name)
            VALUES (%s, %s, %s, %s::vector, %s)
            ON CONFLICT (chunk_id) DO UPDATE
              SET embedding = EXCLUDED.embedding,
                  model_name = EXCLUDED.model_name,
                  embedded_at = NOW()
            """,
            (chunk_id, song_id, artist_id, chunk_embedding, EMBEDDING_MODEL),
        )

    cur.execute(
        """
        INSERT INTO song_theme_scores (
          song_id, struggle, uplifting, introspective, love, party, theme_model_version
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s)
        ON CONFLICT (song_id) DO UPDATE
          SET struggle = EXCLUDED.struggle,
              uplifting = EXCLUDED.uplifting,
              introspective = EXCLUDED.introspective,
              love = EXCLUDED.love,
              party = EXCLUDED.party,
              theme_model_version = EXCLUDED.theme_model_version,
              computed_at = NOW()
        """,
        (
            song_id,
            themes["struggle"],
            themes["uplifting"],
            themes["introspective"],
            themes["love"],
            themes["party"],
            THEME_MODEL_VERSION,
        ),
    )

    cur.execute(
        """
        UPDATE songs
        SET processing_status = 'embedded',
            updated_at = NOW()
        WHERE id = %s
        """,
        (song_id,),
    )


def mark_song_skipped(cur, song_id: int):
    cur.execute(
        """
        UPDATE songs
        SET processing_status = 'skipped_no_lyrics',
            updated_at = NOW()
        WHERE id = %s
        """,
        (song_id,),
    )


def main():
    load_dotenv()

    reembed = "--reembed" in sys.argv
    artist_name = " ".join(arg for arg in sys.argv[1:] if arg != "--reembed").strip()

    if not artist_name:
        raise SystemExit('Usage: python ml/preprocess.py "Artist Name" [--reembed]')

    conn = get_connection()

    try:
        with conn:
            with conn.cursor(cursor_factory=RealDictCursor) as cur:
                artist = find_artist(cur, artist_name)
                if not artist:
                    raise RuntimeError(
                        f'Artist "{artist_name}" was not found in PostgreSQL. Run the collection pipeline first.'
                    )

                songs = get_songs_needing_embed(cur, artist["id"], reembed=reembed)
                if not songs:
                    print(f"No songs need embedding for {artist['name']}.")
                    return

                prepared = []
                full_song_texts = []
                all_chunk_texts = []
                chunk_song_indexes = []

                for song in songs:
                    cleaned = clean_lyrics(song["raw_lyrics"])
                    if not cleaned:
                        mark_song_skipped(cur, song["id"])
                        continue

                    chunks = split_into_chunks(song["raw_lyrics"])
                    prepared.append(
                        {
                            "id": song["id"],
                            "title": song["title"],
                            "clean_lyrics": cleaned,
                            "chunks": [{"text": chunk} for chunk in chunks],
                        }
                    )
                    full_song_texts.append(cleaned)

                    for chunk in chunks:
                        all_chunk_texts.append(chunk)
                        chunk_song_indexes.append(len(prepared) - 1)

                if not prepared:
                    print(f"No songs with usable lyrics for {artist['name']}.")
                    return

                full_song_embeddings = embed_texts(full_song_texts)
                chunk_embeddings = embed_texts(all_chunk_texts)

                for index, song in enumerate(prepared):
                    embedding = full_song_embeddings[index]
                    song["embedding"] = vector_to_list(embedding)
                    song["themes"] = compute_theme_scores(embedding)

                per_song_chunk_cursor = [0 for _ in prepared]
                for embedding, song_index in zip(chunk_embeddings, chunk_song_indexes):
                    cursor = per_song_chunk_cursor[song_index]
                    prepared[song_index]["chunks"][cursor]["embedding"] = vector_to_list(embedding)
                    per_song_chunk_cursor[song_index] += 1

                for song in prepared:
                    save_processed_song(
                        cur,
                        artist["id"],
                        song["id"],
                        {
                            "clean_lyrics": song["clean_lyrics"],
                            "chunks": song["chunks"],
                            "embedding": song["embedding"],
                            "themes": song["themes"],
                        },
                    )

                print(f"Saved {len(prepared)} processed songs for {artist['name']} to PostgreSQL")
    finally:
        conn.close()


if __name__ == "__main__":
    main()
