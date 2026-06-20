import json
from pathlib import Path

from common import clean_lyrics, compute_theme_scores, embed_texts, split_into_chunks, vector_to_list

ROOT_DIR = Path(__file__).resolve().parents[1]
INPUT_PATH = ROOT_DIR / "data" / "songs.json"
OUTPUT_PATH = ROOT_DIR / "data" / "processed_songs.json"


def main():
    if not INPUT_PATH.exists():
        raise FileNotFoundError("data/songs.json does not exist. Run the Node.js collection pipeline first.")

    with INPUT_PATH.open("r", encoding="utf-8") as file:
        songs_data = json.load(file)

    artist_name = songs_data.get("artist", "")
    raw_songs = songs_data.get("songs", [])
    prepared_songs = []
    full_song_texts = []
    all_chunk_texts = []
    chunk_song_indexes = []

    for song in raw_songs:
        cleaned_lyrics = clean_lyrics(song.get("lyrics", ""))
        if not cleaned_lyrics:
            continue

        chunks = split_into_chunks(song.get("lyrics", ""))
        prepared_songs.append(
            {
                "title": song.get("title", ""),
                "artist": artist_name,
                "clean_lyrics": cleaned_lyrics,
                "chunks": [{"text": chunk} for chunk in chunks],
            }
        )
        full_song_texts.append(cleaned_lyrics)

        for chunk in chunks:
            all_chunk_texts.append(chunk)
            chunk_song_indexes.append(len(prepared_songs) - 1)

    full_song_embeddings = embed_texts(full_song_texts)
    chunk_embeddings = embed_texts(all_chunk_texts)

    for index, song in enumerate(prepared_songs):
        embedding = full_song_embeddings[index]
        song["embedding"] = vector_to_list(embedding)
        song["themes"] = compute_theme_scores(embedding)

    per_song_chunk_cursor = [0 for _ in prepared_songs]
    for embedding, song_index in zip(chunk_embeddings, chunk_song_indexes):
        cursor = per_song_chunk_cursor[song_index]
        prepared_songs[song_index]["chunks"][cursor]["embedding"] = vector_to_list(embedding)
        per_song_chunk_cursor[song_index] += 1

    with OUTPUT_PATH.open("w", encoding="utf-8") as file:
        json.dump(prepared_songs, file, indent=2)
        file.write("\n")

    print(f"Saved {len(prepared_songs)} processed songs to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
