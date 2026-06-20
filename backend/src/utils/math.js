function dot(left = [], right = []) {
  return left.reduce((sum, value, index) => sum + value * (right[index] || 0), 0);
}

function magnitude(vector = []) {
  return Math.sqrt(dot(vector, vector));
}

function cosineSimilarity(left = [], right = []) {
  if (!left.length || !right.length || left.length !== right.length) {
    return 0;
  }

  const denominator = magnitude(left) * magnitude(right);

  if (!denominator) {
    return 0;
  }

  return dot(left, right) / denominator;
}

function blendVectors(primary = [], secondary = [], primaryWeight = 0.7, secondaryWeight = 0.3) {
  if (!primary.length) {
    return secondary;
  }

  if (!secondary.length) {
    return primary;
  }

  return primary.map((value, index) => value * primaryWeight + (secondary[index] || 0) * secondaryWeight);
}

function roundScore(value) {
  return Number(value.toFixed(4));
}

module.exports = {
  blendVectors,
  cosineSimilarity,
  roundScore,
};
