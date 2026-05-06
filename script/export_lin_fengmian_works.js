const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');

const SOURCE_PATH = path.resolve(__dirname, '../data/docs/pdf-center/ART/林风眠作品集 (上海中国画院).md');
const OUTPUT_PATH = path.resolve(__dirname, '../data/docs/pdf-center/ART/林风眠作品集 (上海中国画院)-作品数据.xlsx');

function readSource() {
  return fs.readFileSync(SOURCE_PATH, 'utf8');
}

function splitLines(text) {
  return String(text || '').split(/\r?\n/);
}

function normalizeSpace(value = '') {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function stripHeadingPrefix(value = '') {
  return String(value || '').replace(/^\s*#+\s*/, '').trim();
}

function cleanLine(value = '') {
  return normalizeSpace(stripHeadingPrefix(value));
}

function hasHan(value = '') {
  return /[\p{Script=Han}]/u.test(String(value || ''));
}

function hasLatin(value = '') {
  return /[A-Za-z]/.test(String(value || ''));
}

function isImageLine(value = '') {
  return /^\s*!\[\]\((.+)\)\s*$/.test(String(value || '').trim());
}

function extractImagePath(value = '') {
  const match = String(value || '').trim().match(/^!\[\]\((.+)\)$/);
  return match ? match[1].trim() : '';
}

function decodeImageAssetPath(rawPath = '') {
  try {
    const url = new URL(rawPath, 'https://reader.local');
    const encoded = url.searchParams.get('path');
    return encoded ? decodeURIComponent(encoded) : rawPath;
  } catch {
    return rawPath;
  }
}

function isYearLine(value = '') {
  const text = cleanLine(value);
  return /^(?:20世纪[0-9一二三四五六七八九十]+年代|19\d{2}年|20\d{2}年)$/.test(text);
}

function isMediumLine(value = '') {
  const text = cleanLine(value);
  return /^(?:纸本设色|布面油画|纸本水墨|设色纸本)$/.test(text);
}

function isNoiseLine(value = '') {
  const text = cleanLine(value);
  if (!text) return true;
  if (/^W\s*O\s*R\s*K\s*S$/i.test(text)) return true;
  if (/^[\[\]()（）【】0-9OoIi=\-_.·•\s]+$/.test(text)) return true;
  if (/^[\[(（【][^A-Za-z\p{Script=Han}]*[\])）】]$/u.test(text)) return true;
  if (/^第?\d+$/.test(text)) return true;
  return false;
}

function isLikelyChineseTitleLine(value = '') {
  const text = cleanLine(value);
  if (!text || !hasHan(text)) return false;
  if (isYearLine(text) || isMediumLine(text)) return false;
  if (/^(?:图\s*版|林风眠作品集|上海中国画院藏)$/.test(text)) return false;
  return true;
}

function previousNonEmptyLineIndex(lines, startIndex) {
  for (let index = startIndex; index >= 0; index -= 1) {
    if (cleanLine(lines[index])) return index;
  }
  return -1;
}

function nextNonEmptyLineIndex(lines, startIndex) {
  for (let index = startIndex; index < lines.length; index += 1) {
    if (cleanLine(lines[index])) return index;
  }
  return -1;
}

function parseTocEntries(text) {
  const tocStart = text.indexOf('目 录');
  const tableStart = text.indexOf('<table>', tocStart);
  const tableEnd = text.indexOf('</table>', tableStart);
  const tocTailEnd = text.indexOf('![](', tableEnd);

  const entries = [];
  if (tocStart === -1 || tableStart === -1 || tableEnd === -1 || tocTailEnd === -1) {
    throw new Error('未找到完整目录区块。');
  }

  const tableHtml = text.slice(tableStart, tableEnd);
  for (const rowMatch of tableHtml.matchAll(/<tr>(.*?)<\/tr>/gs)) {
    const cells = [...rowMatch[1].matchAll(/<td>(.*?)<\/td>/gs)].map(match => normalizeSpace(match[1]));
    for (let index = 0; index + 2 < cells.length; index += 3) {
      const first = cells[index];
      const second = cells[index + 1];
      const third = cells[index + 2];
      const firstMatch = first.match(/^(\d{3})\s*(.+)$/);
      if (!firstMatch) continue;
      entries.push({
        sequence: Number(firstMatch[1]),
        toc_raw_number: firstMatch[1],
        toc_cn_title: normalizeSpace(firstMatch[2]),
        toc_en_title: normalizeSpace(second),
        page: Number(third),
      });
    }
  }

  const tailText = text.slice(tableEnd + '</table>'.length, tocTailEnd);
  const tailLines = splitLines(tailText).map(line => normalizeSpace(line)).filter(Boolean);
  let expectedSequence = entries.length + 1;
  for (const line of tailLines) {
    const pageMatch = line.match(/(\d{2,3})\s*$/);
    if (!pageMatch) continue;
    const page = Number(pageMatch[1]);
    const prefix = normalizeSpace(line.slice(0, pageMatch.index));
    const match = prefix.match(/^(\d+)[.\s]*([\p{Script=Han}]+)\s*(.*)$/u);
    if (!match) continue;
    entries.push({
      sequence: expectedSequence,
      toc_raw_number: match[1],
      toc_cn_title: normalizeSpace(match[2]),
      toc_en_title: normalizeSpace(match[3]),
      page,
    });
    expectedSequence += 1;
  }

  if (entries.length !== 117) {
    throw new Error(`目录解析数量异常，预期 117，实际 ${entries.length}。`);
  }

  return entries.sort((left, right) => left.sequence - right.sequence);
}

function collectEnglishLines(lines, startIndex) {
  const result = [];
  let endIndex = startIndex - 1;

  for (let index = startIndex; index < lines.length; index += 1) {
    const rawLine = lines[index];
    if (isImageLine(rawLine)) break;
    const text = cleanLine(rawLine);
    if (!text) continue;
    if (isNoiseLine(text)) continue;
    if (hasHan(text) && !hasLatin(text) && !isYearLine(text) && !isMediumLine(text)) break;
    result.push(text);
    endIndex = index;
  }

  return { lines: result, endIndex };
}

function collectTrailingImageCluster(lines, startIndex) {
  const imagePaths = [];
  let endIndex = startIndex - 1;
  let seenImage = false;

  for (let index = startIndex; index < lines.length; index += 1) {
    const rawLine = lines[index];
    const text = cleanLine(rawLine);

    if (isImageLine(rawLine)) {
      imagePaths.push(extractImagePath(rawLine));
      endIndex = index;
      seenImage = true;
      continue;
    }

    if (!text || isNoiseLine(text)) {
      if (seenImage) endIndex = index;
      continue;
    }

    break;
  }

  return { imagePaths, endIndex };
}

function choosePrimaryImagePath(imagePaths = []) {
  const resolved = imagePaths
    .map(rawPath => ({
      rawPath,
      filePath: decodeImageAssetPath(rawPath),
    }))
    .map(item => ({
      ...item,
      absolutePath: path.resolve(__dirname, '..', item.filePath),
    }))
    .filter(item => fs.existsSync(item.absolutePath))
    .map(item => ({
      ...item,
      size: fs.statSync(item.absolutePath).size,
    }))
    .sort((left, right) => right.size - left.size);

  if (resolved.length > 0) return resolved[0];
  const fallback = imagePaths[0];
  if (!fallback) return null;
  const filePath = decodeImageAssetPath(fallback);
  return {
    rawPath: fallback,
    filePath,
    absolutePath: path.resolve(__dirname, '..', filePath),
    size: 0,
  };
}

function parseBodyEntries(lines) {
  const worksStart = lines.findIndex(line => line.includes('# 图 版'));
  if (worksStart === -1) throw new Error('未找到“图版”区块。');

  const yearIndexes = [];
  for (let index = worksStart; index < lines.length; index += 1) {
    if (isYearLine(lines[index])) yearIndexes.push(index);
  }

  if (yearIndexes.length !== 117) {
    throw new Error(`正文作品数量异常，预期 117，实际 ${yearIndexes.length}。`);
  }

  const entries = [];
  let cursor = worksStart + 1;

  for (const yearIndex of yearIndexes) {
    const sizeIndex = previousNonEmptyLineIndex(lines, yearIndex - 1);
    const mediumIndex = nextNonEmptyLineIndex(lines, yearIndex + 1);
    if (sizeIndex === -1 || mediumIndex === -1) {
      throw new Error(`无法定位尺寸或材质行，年份行索引 ${yearIndex}。`);
    }

    let titleIndex = sizeIndex - 1;
    while (titleIndex >= cursor && !isLikelyChineseTitleLine(lines[titleIndex])) {
      titleIndex -= 1;
    }
    if (titleIndex < cursor) {
      throw new Error(`无法定位中文标题，年份行索引 ${yearIndex}。`);
    }

    const english = collectEnglishLines(lines, mediumIndex + 1);
    const englishLines = english.lines.filter(Boolean);
    const englishTitle = englishLines[0] || '';
    const englishDetails = englishLines.slice(1).join('\n');
    const imageCluster = collectTrailingImageCluster(lines, english.endIndex + 1);
    const primaryImage = choosePrimaryImagePath(imageCluster.imagePaths);

    entries.push({
      body_cn_title: cleanLine(lines[titleIndex]),
      size_raw: cleanLine(lines[sizeIndex]),
      year: cleanLine(lines[yearIndex]),
      medium: cleanLine(lines[mediumIndex]),
      body_en_title: englishTitle,
      body_en_details: englishDetails,
      image_paths: primaryImage?.rawPath ? [primaryImage.rawPath] : [],
      image_file_paths: primaryImage?.filePath ? [primaryImage.filePath] : [],
      image_candidate_paths: imageCluster.imagePaths,
      image_candidate_file_paths: imageCluster.imagePaths.map(decodeImageAssetPath),
    });

    cursor = Math.max(imageCluster.endIndex + 1, english.endIndex + 1, mediumIndex + 1);
  }

  return entries;
}

function parseSize(sizeRaw = '') {
  const cleaned = String(sizeRaw || '')
    .replace(/\\times/g, ' × ')
    .replace(/\\mathrm/g, ' ')
    .replace(/\\[a-zA-Z]+/g, ' ')
    .replace(/[${}]/g, ' ')
    .replace(/~/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const numericParts = cleaned.match(/\d+(?:\.\d+)?/g) || [];
  const unitMatch = cleaned.match(/\b(cm|mm)\b/i);
  const width = numericParts[0] ? Number(numericParts[0]) : '';
  const height = numericParts[1] ? Number(numericParts[1]) : '';
  const unit = unitMatch ? unitMatch[1].toLowerCase() : '';
  const normalized = width && height ? `${width}×${height}${unit ? ` ${unit}` : ''}` : '';
  return { width, height, unit, normalized };
}

function buildRows(tocEntries, bodyEntries) {
  if (tocEntries.length !== bodyEntries.length) {
    throw new Error(`目录与正文数量不一致：目录 ${tocEntries.length}，正文 ${bodyEntries.length}。`);
  }

  return tocEntries.map((tocEntry, index) => {
    const bodyEntry = bodyEntries[index];
    const size = parseSize(bodyEntry.size_raw);
    return {
      编号: String(index + 1).padStart(3, '0'),
      页码: tocEntry.page,
      中文标题: bodyEntry.body_cn_title || tocEntry.toc_cn_title || '',
      图版中文标题: bodyEntry.body_cn_title || '',
      目录中文标题: tocEntry.toc_cn_title || '',
      英文标题: bodyEntry.body_en_title || tocEntry.toc_en_title || '',
      图版英文标题: bodyEntry.body_en_title || '',
      目录英文标题: tocEntry.toc_en_title || '',
      尺寸标准化: size.normalized,
      宽: size.width,
      高: size.height,
      单位: size.unit,
      年代: bodyEntry.year,
      材质: bodyEntry.medium,
      英文补充信息: bodyEntry.body_en_details,
      图片路径: bodyEntry.image_paths.join('\n'),
      图片文件路径: bodyEntry.image_file_paths.join('\n'),
    };
  });
}

function writeWorkbook(rows) {
  const sheet = XLSX.utils.json_to_sheet(rows);
  sheet['!cols'] = [
    { wch: 8 },
    { wch: 8 },
    { wch: 14 },
    { wch: 14 },
    { wch: 14 },
    { wch: 24 },
    { wch: 24 },
    { wch: 24 },
    { wch: 16 },
    { wch: 10 },
    { wch: 10 },
    { wch: 8 },
    { wch: 14 },
    { wch: 12 },
    { wch: 28 },
    { wch: 56 },
    { wch: 56 },
  ];

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, '作品数据');
  XLSX.writeFile(workbook, OUTPUT_PATH);
}

function main() {
  const text = readSource();
  const lines = splitLines(text);
  const tocEntries = parseTocEntries(text);
  const bodyEntries = parseBodyEntries(lines);
  const rows = buildRows(tocEntries, bodyEntries);
  writeWorkbook(rows);
  process.stdout.write(JSON.stringify({
    source: SOURCE_PATH,
    output: OUTPUT_PATH,
    rows: rows.length,
    first: rows[0],
    last: rows[rows.length - 1],
  }, null, 2));
}

main();
