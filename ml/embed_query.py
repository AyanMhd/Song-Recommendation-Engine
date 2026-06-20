import json
import sys

from common import clean_lyrics, compute_theme_scores, embed_texts, vector_to_list


def main():
    payload = json.load(sys.stdin)
    text = payload.get("text", "")

    if not text or not text.strip():
        raise ValueError("Missing query text.")

    cleaned_text = clean_lyrics(text) or text.strip()
    embedding = embed_texts([cleaned_text])[0]

    json.dump(
        {
            "text": cleaned_text,
            "embedding": vector_to_list(embedding),
            "themes": compute_theme_scores(embedding),
        },
        sys.stdout,
    )


if __name__ == "__main__":
    main()
