'use strict';

/**
 * Parse a local PDF file to plain text using LiteParse.
 *
 * LiteParse is an ESM-only package so we load it via dynamic import().
 * Used as a fallback in contentQueue when a site handler only returns
 * minimal text (e.g. arXiv abstract-only) but a PDF is available on disk.
 *
 * @param {string} pdfPath - Absolute path to the local PDF file
 * @returns {Promise<string|null>} Extracted text, or null on failure
 */
async function parsePdf(pdfPath) {
  const { LiteParse } = await import('@llamaindex/liteparse');
  const parser = new LiteParse();
  const result = await parser.parse(pdfPath);
  const text = (result.text || '').trim();
  return text.length > 0 ? text : null;
}

module.exports = { parsePdf };
