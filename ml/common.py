import re
from typing import Dict, List

import numpy as np
import transformers
from transformers.utils import import_utils as transformers_import_utils

transformers_import_utils._torchvision_available = False
transformers.is_torchvision_available = lambda: False
transformers.utils.is_torchvision_available = lambda: False

if not hasattr(transformers, "PreTrainedModel"):
    from transformers.modeling_utils import PreTrainedModel

    transformers.PreTrainedModel = PreTrainedModel

from sentence_transformers import SentenceTransformer

from theme_definitions import THEME_DESCRIPTIONS

_MODEL = None
_THEME_EMBEDDINGS = None


def get_model() -> SentenceTransformer:
    global _MODEL
    if _MODEL is None:
        _MODEL = SentenceTransformer("all-MiniLM-L6-v2")
    return _MODEL


def clean_lyrics(text: str) -> str:
    if not text:
        return ""

    text = text.replace("\r", "")
    text = re.sub(r"\[[^\]]+\]", "\n", text)
    lines = [re.sub(r"[ \t]+", " ", line).strip() for line in text.split("\n")]
    filtered = [line for line in lines if line]
    cleaned = "\n".join(filtered)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def flatten_whitespace(text: str) -> str:
    return re.sub(r"\s+", " ", text).strip()


def split_into_chunks(text: str) -> List[str]:
    if not text:
        return []

    text = text.replace("\r", "")
    text = re.sub(r"\[[^\]]+\]", "\n\n", text)
    raw_blocks = [block for block in re.split(r"\n{2,}", text) if block.strip()]
    chunks = []

    for block in raw_blocks:
        lines = [re.sub(r"[ \t]+", " ", line).strip() for line in block.split("\n")]
        chunk = " ".join(line for line in lines if line)
        if chunk:
            chunks.append(chunk)

    if not chunks:
        cleaned = clean_lyrics(text)
        return [flatten_whitespace(cleaned)] if cleaned else []

    return chunks


def embed_texts(texts: List[str]) -> np.ndarray:
    if not texts:
        return np.array([])

    model = get_model()
    return model.encode(texts, convert_to_numpy=True, normalize_embeddings=True)


def cosine_similarity(left, right) -> float:
    left_array = np.asarray(left, dtype=float)
    right_array = np.asarray(right, dtype=float)
    denominator = np.linalg.norm(left_array) * np.linalg.norm(right_array)
    if denominator == 0:
        return 0.0
    return float(np.dot(left_array, right_array) / denominator)


def get_theme_embeddings() -> Dict[str, np.ndarray]:
    global _THEME_EMBEDDINGS
    if _THEME_EMBEDDINGS is None:
        embeddings = embed_texts(list(THEME_DESCRIPTIONS.values()))
        _THEME_EMBEDDINGS = {
            theme: embeddings[index]
            for index, theme in enumerate(THEME_DESCRIPTIONS.keys())
        }
    return _THEME_EMBEDDINGS


def compute_theme_scores(embedding) -> Dict[str, float]:
    theme_embeddings = get_theme_embeddings()
    return {
        theme: max(0.0, float(cosine_similarity(embedding, theme_embedding)))
        for theme, theme_embedding in theme_embeddings.items()
    }


def vector_to_list(vector) -> List[float]:
    return [float(value) for value in np.asarray(vector).tolist()]
