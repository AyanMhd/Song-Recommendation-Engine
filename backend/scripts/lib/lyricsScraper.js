const axios = require("axios");
const cheerio = require("cheerio");

async function scrapeLyricsFromGenius(url) {
  const response = await axios.get(url, {
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    },
  });

  const $ = cheerio.load(response.data);
  const sections = [];

  $('[data-lyrics-container="true"]').each((_, element) => {
    $(element).find("br").replaceWith("\n");

    const text = $(element)
      .text()
      .replace(/\r/g, "")
      .replace(/\n{3,}/g, "\n\n")
      .trim();

    if (text) {
      sections.push(text);
    }
  });

  if (!sections.length) {
    const fallback = $(".lyrics").text().trim();

    if (fallback) {
      sections.push(fallback);
    }
  }

  return sections.join("\n\n").replace(/\n{3,}/g, "\n\n").trim();
}

module.exports = {
  scrapeLyricsFromGenius,
};
