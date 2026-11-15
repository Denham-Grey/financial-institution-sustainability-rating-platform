const currentRatingLabel = (rating) => (rating === "Green Leader" ? "Sustainability Leader" : rating);

const green = [0.086, 0.396, 0.204];
const dark = [0.094, 0.145, 0.11];
const muted = [0.39, 0.45, 0.41];

function ascii(value) {
  return String(value ?? "")
    .replaceAll("—", "-")
    .replaceAll("–", "-")
    .replaceAll("’", "'")
    .replaceAll("“", '"')
    .replaceAll("”", '"')
    .replaceAll("÷", "/")
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "");
}

function pdfEscape(value) {
  return ascii(value).replaceAll("\\", "\\\\").replaceAll("(", "\\(").replaceAll(")", "\\)");
}

function wrap(value, width) {
  const words = ascii(value).split(/\s+/).filter(Boolean);
  const lines = [];
  let line = "";
  for (const word of words) {
    if (!line) line = word;
    else if ((line + " " + word).length <= width) line += " " + word;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function buildPdf(objects, infoId) {
  let output = "%PDF-1.4\n";
  const offsets = [0];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = Buffer.byteLength(output, "latin1");
    output += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = Buffer.byteLength(output, "latin1");
  output += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < objects.length; id += 1) {
    output += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  output += `trailer\n<< /Size ${objects.length} /Root 1 0 R${infoId ? ` /Info ${infoId} 0 R` : ""} >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(output, "latin1");
}

export function createInstitutionPdf(detail, ranking, pillars) {
  const pages = [];
  const provisional = Boolean(ranking.provisional);
  let commands;
  let y;

  const text = (value, x, baseline, size = 9, bold = false, color = dark) => {
    commands.push(`BT /${bold ? "F2" : "F1"} ${size} Tf ${color.join(" ")} rg ${x} ${baseline} Td (${pdfEscape(value)}) Tj ET`);
  };
  const box = (x, baseline, width, height, color) => {
    commands.push(`q ${color.join(" ")} rg ${x} ${baseline} ${width} ${height} re f Q`);
  };
  const newPage = () => {
    commands = [];
    pages.push(commands);
    box(0, 782, 595, 60, [0.047, 0.196, 0.11]);
    text("Financial Institution Sustainability Rating Platform", 36, 814, 15, true, [1, 1, 1]);
    text(ascii(detail.institution.name), 36, 795, 9, false, [0.85, 0.94, 0.88]);
    if (provisional) text("PROVISIONAL - INTERNAL REVIEW ONLY", 365, 795, 8, true, [1, 0.82, 0.35]);
    y = 758;
  };
  const ensure = (height = 20) => {
    if (y - height < 48) newPage();
  };
  const line = (value, options = {}) => {
    const size = options.size || 9;
    const leading = options.leading || size * 1.42;
    const width = options.width || 92;
    const lines = wrap(value, width);
    ensure(lines.length * leading + 4);
    for (const item of lines) {
      text(item, options.x || 38, y, size, Boolean(options.bold), options.color || dark);
      y -= leading;
    }
    y -= options.after ?? 2;
  };

  newPage();
  line("Institution rating report", { size: 20, bold: true, color: green, width: 52, after: 8 });
  line(`Reporting period: ${detail.institution.reportingPeriod}    Institution type: ${detail.institution.type}`, { color: muted, width: 100, after: 14 });
  line(`Review status: ${String(detail.workflow?.status || "draft").replaceAll("_", " ")}    Assessment cycle: ${ranking.cycleNumber || detail.workflow?.cycleNumber || 1}    Revision: ${ranking.revision ?? detail.workflow?.revision ?? 0}`, { bold: true, after: 8 });
  if (provisional) {
    box(38, y - 24, 519, 30, [1, 0.94, 0.84]);
    text("PROVISIONAL - NOT APPROVED FOR PUBLICATION", 50, y - 12, 10, true, [0.63, 0.23, 0.04]);
    y -= 40;
  }
  line(`Assessment completion: ${Number(ranking.completionPercentage || 0).toFixed(1)}%    Methodology: ${ranking.methodologyVersion || detail.workflow?.methodologyVersion || "Not specified"}`, { color: muted, width: 100, after: 14 });

  box(38, y - 58, 519, 66, [0.94, 0.97, 0.94]);
  const metrics = [
    ["Adjusted score", ranking.adjustedGreenScore.toFixed(1)],
    ["Raw score", ranking.rawGreenScore.toFixed(1)],
    ["Rating", ranking.rating],
    ["Evidence confidence", `${Math.round(ranking.evidenceConfidence * 100)}%`],
  ];
  metrics.forEach(([label, value], index) => {
    const x = 52 + index * 128;
    text(label, x, y - 12, 7, true, muted);
    text(value, x, y - 36, 15, true, dark);
  });
  y -= 82;
  line("Pillar performance", { size: 13, bold: true, color: green, after: 8 });
  pillars.forEach((pillar) => {
    ensure(20);
    const label = ascii(pillar.replace(/^Principle \d+ [-] /, ""));
    text(label, 42, y, 8.5, false, dark);
    text(`${Number(ranking.pillars[pillar] || 0).toFixed(1)}`, 515, y, 8.5, true, green);
    y -= 18;
  });

  y -= 8;
  line("Signal assessment", { size: 13, bold: true, color: green, after: 6 });
  for (const item of detail.assessments) {
    const contribution = item.assessed && item.applicable
      ? (Number(item.score) / 5) * Number(item.weight) * (Number(item.evidenceGrade) / 3)
      : 0;
    const wrappedTitle = wrap(`${item.signalId}  ${item.signal}`, 76);
    const titleLines = wrappedTitle.slice(0, 3);
    if (wrappedTitle.length > 3) titleLines[2] = `${titleLines[2].slice(0, 72)}...`;
    const cardHeight = 31 + titleLines.length * 10;
    ensure(cardHeight + 6);
    box(38, y - cardHeight + 7, 519, cardHeight, [0.975, 0.982, 0.975]);
    titleLines.forEach((title, index) => text(title, 46, y - 5 - index * 10, 8.2, true, dark));
    const applicability = item.applicable ? "Applicable" : "Not applicable";
    const score = item.assessed ? `${Number(item.score).toFixed(0)}/5` : "Not assessed";
    text(`Weight ${Number(item.weight).toFixed(1)}%   Score ${score}   Evidence ${Number(item.evidenceGrade).toFixed(0)}/3   Adjusted ${contribution.toFixed(3)}   ${applicability}`, 46, y - 9 - titleLines.length * 10, 7.5, false, muted);
    y -= cardHeight + 6;
  }

  pages.forEach((page, index) => {
    page.push(`BT /F1 7 Tf 0.39 0.45 0.41 rg 38 25 Td (Generated ${pdfEscape(new Date().toISOString())}) Tj ET`);
    page.push(`BT /F1 7 Tf 0.39 0.45 0.41 rg 510 25 Td (Page ${index + 1} of ${pages.length}) Tj ET`);
  });

  const objects = new Array(5 + pages.length * 2);
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";
  const kids = [];
  pages.forEach((page, index) => {
    const pageId = 5 + index * 2;
    const contentId = pageId + 1;
    kids.push(`${pageId} 0 R`);
    const stream = page.join("\n");
    objects[pageId] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`;
  });
  objects[2] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${pages.length} >>`;
  return buildPdf(objects);
}

function certificateDate(value) {
  if (!value) return "Not specified";
  const raw = String(value);
  const isoDate = raw.match(/^(\d{4})-(\d{2})-(\d{2})/);
  const date = isoDate
    ? new Date(Date.UTC(Number(isoDate[1]), Number(isoDate[2]) - 1, Number(isoDate[3])))
    : new Date(raw);
  if (Number.isNaN(date.getTime())) return ascii(raw);
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/**
 * Create a single-page, A4 portrait Midnight Heritage rating certificate.
 *
 * The preferred report API contract is one object:
 *   { institution, certificate, issuer }
 * The legacy three-argument form (detail, ranking, certificate) remains accepted
 * so report callers can adopt the certificate module independently.
 */
export function createRatingCertificatePdf(payload, legacyRanking, legacyCertificate) {
  const oneObjectContract = legacyRanking === undefined && legacyCertificate === undefined && payload?.certificate;
  const detail = oneObjectContract ? payload : payload || {};
  const certificate = oneObjectContract ? payload.certificate : legacyCertificate || {};
  const ranking = oneObjectContract
    ? {
        adjustedGreenScore: certificate.adjustedScore,
        rawGreenScore: certificate.rawScore,
        rating: certificate.rating,
        evidenceConfidence: certificate.evidenceConfidence,
      }
    : legacyRanking || {};
  const institution = oneObjectContract ? payload.institution || {} : detail?.institution || {};
  const certificateNumber = certificate?.certificateNumber || certificate?.number || "Pending";
  const institutionName = institution.name || certificate?.institutionName || "Financial Institution";
  const institutionCategory = institution.category || institution.type || certificate?.institutionCategory || "Financial Institution";
  const reportingPeriod = institution.reportingPeriod || certificate?.reportingPeriod || "Not specified";
  const rating = currentRatingLabel(certificate?.rating || ranking?.rating || "Not rated");
  const numericScore = Number(certificate?.score ?? ranking?.adjustedGreenScore);
  const score = Number.isFinite(numericScore) ? numericScore.toFixed(1) : "N/A";
  const rawScoreValue = Number(certificate?.rawScore ?? ranking?.rawGreenScore);
  const rawScore = Number.isFinite(rawScoreValue) ? rawScoreValue.toFixed(1) : "N/A";
  const confidenceValue = Number(ranking?.evidenceConfidence);
  const confidence = Number.isFinite(confidenceValue) ? `${Math.round(confidenceValue * 100)}%` : "N/A";
  const issuerValue = certificate?.issuerName || certificate?.issuedBy || (oneObjectContract ? payload.issuer : undefined);
  const issuer = issuerValue && typeof issuerValue === "object"
    ? issuerValue.displayName || issuerValue.name || issuerValue.username
    : issuerValue;
  const verificationToken = certificate?.verificationToken || certificate?.token || "Not available";
  const verificationUrl = certificate?.verificationUrl || certificate?.verifyUrl || "Use the certificate verification module";
  const methodologyVersion = certificate?.methodologyVersion || "Current approved version";
  const status = String(certificate?.status || "active").toUpperCase();

  const commands = [];
  const width = 595;
  const height = 842;
  const centre = width / 2;
  const title = "Financial Institutions Sustainability Rating";
  const colour = {
    midnight: "0.027 0.094 0.137",
    emerald: "0.022 0.227 0.17",
    ivory: "0.973 0.957 0.91",
    paper: "0.988 0.98 0.957",
    gold: "0.75 0.62 0.36",
    paleGold: "0.91 0.86 0.71",
    muted: "0.30 0.35 0.32",
    ink: "0.09 0.13 0.12",
  };
  const textWidth = (value, size, font) => {
    const serif = font === "F3";
    return ascii(value).split("").reduce((total, letter) => {
      if (/[\sijlI.,:;!'|]/.test(letter)) return total + 0.26;
      if (/[MWmw]/.test(letter)) return total + 0.84;
      if (/[A-Z]/.test(letter)) return total + (serif ? 0.68 : 0.67);
      if (/[0-9]/.test(letter)) return total + (serif ? 0.5 : 0.556);
      return total + 0.49;
    }, 0) * size;
  };
  const fit = (value, size, font, maxWidth) => Math.min(size, maxWidth / Math.max(1, textWidth(value, 1, font)));
  const text = (value, x, y, size, font = "F1", fill = colour.ink) => {
    commands.push(`BT /${font} ${size.toFixed(2)} Tf ${fill} rg ${x.toFixed(2)} ${y} Td (${pdfEscape(value)}) Tj ET`);
  };
  const centred = (value, x, y, size, font = "F1", fill = colour.ink) => {
    text(value, x - textWidth(value, size, font) / 2, y, size, font, fill);
  };
  const rect = (x, y, w, h, fill) => commands.push(`q ${fill} rg ${x} ${y} ${w} ${h} re f Q`);
  const border = (x, y, w, h, stroke, weight) => commands.push(`q ${stroke} RG ${weight} w ${x} ${y} ${w} ${h} re S Q`);
  const rule = (x1, y1, x2, y2, stroke = colour.gold) => commands.push(`q ${stroke} RG 0.7 w ${x1} ${y1} m ${x2} ${y2} l S Q`);
  const fact = (label, value, x, y, maxWidth) => {
    text(label, x, y, 7, "F2", colour.muted);
    text(value, x, y - 17, fit(value, 10, "F2", maxWidth), "F2");
    rule(x, y - 25, x + maxWidth, y - 25, colour.paleGold);
  };

  rect(0, 0, width, height, colour.ivory);
  border(22, 22, width - 44, height - 44, colour.midnight, 1.2);
  border(29, 29, width - 58, height - 58, colour.gold, 0.65);
  rect(30, 608, width - 60, 204, colour.midnight);
  rect(30, 606, width - 60, 2, colour.gold);

  text(certificateNumber, 53, 786, fit(certificateNumber, 8, "F2", 210), "F2", colour.paleGold);
  text(status, width - 53 - textWidth(status, 8, "F2"), 786, 8, "F2", colour.paleGold);
  commands.push(`q ${colour.emerald} rg ${colour.paleGold} RG 1 w 343.5 718 m 343.5 743.4 322.9 764 297.5 764 c 272.1 764 251.5 743.4 251.5 718 c 251.5 692.6 272.1 672 297.5 672 c 322.9 672 343.5 692.6 343.5 718 c B Q`);
  commands.push(`q ${colour.paleGold} RG 1.7 w 1 J 288 709 m 310 735 l S 289 714 m 286 728 300 740 312 737 c 312 724 302 713 289 714 c S Q`);
  centred("FISR", centre, 688, 10, "F2", colour.paleGold);
  centred("DENHAM & GREY", centre, 642, 9, "F2", colour.paleGold);

  centred(title, centre, 558, fit(title, 23, "F3", width - 100), "F3", colour.midnight);
  centred("Awarded to", centre, 532, 11, "F4", colour.muted);
  const words = ascii(institutionName).split(/\s+/);
  const nameLines = [words.join(" ")];
  if (textWidth(nameLines[0], 27, "F3") > width - 110 && words.length > 1) {
    let split = 1;
    const midpoint = nameLines[0].length / 2;
    while (split < words.length - 1 && words.slice(0, split + 1).join(" ").length <= midpoint) split += 1;
    nameLines.splice(0, 1, words.slice(0, split).join(" "), words.slice(split).join(" "));
  }
  const nameSize = Math.min(...nameLines.map((line) => fit(line, nameLines.length === 1 ? 27 : 21, "F3", width - 110)));
  const nameBaseline = nameLines.length === 1 ? 499 : 505;
  nameLines.forEach((line, index) => centred(line, centre, nameBaseline - index * 22, nameSize, "F3", colour.emerald));
  rule(83, 472, width - 83, 472);
  centred(institutionCategory, centre, 454, fit(institutionCategory, 9, "F1", width - 110), "F1", colour.muted);
  const periodLabel = `Reporting period: ${reportingPeriod}`;
  centred(periodLabel, centre, 437, fit(periodLabel, 8, "F2", width - 110), "F2", colour.muted);

  rect(58, 302, width - 116, 113, colour.paper);
  border(58, 302, width - 116, 113, colour.gold, 0.8);
  rect(58, 302, 7, 113, colour.emerald);
  text("APPROVED RATING", 84, 387, 7, "F2", colour.muted);
  text(rating, 84, 350, fit(rating, 28, "F3", 174), "F3", colour.midnight);
  rule(84, 336, 189, 336);
  rule(270, 322, 270, 393, colour.paleGold);
  const metrics = [
    [311, "ADJUSTED", score, "SCORE"],
    [389, "RAW", rawScore, "SCORE"],
    [474, "CONFIDENCE", confidence, "EVIDENCE"],
  ];
  for (const [x, label, value, unit] of metrics) {
    centred(label, x, 386, 6.5, "F2", colour.muted);
    centred(value, x, 351, 21, "F3", colour.emerald);
    centred(unit, x, 330, 6, "F1", colour.muted);
  }

  const validity = `${certificateDate(certificate?.issuedAt)} to ${certificateDate(certificate?.validUntil)}`;
  fact("VALIDITY PERIOD", validity, 64, 273, width - 128);
  fact("METHODOLOGY", methodologyVersion, 64, 225, 204);
  fact("AUTHORISED ISSUER", issuer || "FISR Platform Administrator", 318, 225, 213);
  fact("VERIFICATION TOKEN", verificationToken, 64, 175, width - 128);
  text("VERIFY CERTIFICATE", 64, 126, 7, "F2", colour.muted);
  text(verificationUrl, 64, 110, fit(verificationUrl, 8, "F1", width - 128), "F1", colour.emerald);
  rule(64, 102, width - 64, 102, colour.paleGold);

  const disclaimer = "This certificate records an approved rating calculated under the Financial Institution Sustainability Rating Platform methodology for the stated reporting period. It is not a credit rating, investment recommendation, regulatory licence, or guarantee of future performance.";
  wrap(disclaimer, 108).forEach((line, index) => centred(line, centre, 75 - index * 10, 7.1, "F1", colour.muted));

  const stream = commands.join("\n");
  const clickable = /^https?:\/\/\S+$/i.test(verificationUrl);
  const objects = new Array(clickable ? 11 : 10);
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = "<< /Type /Pages /Kids [5 0 R] /Count 1 >>";
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>";
  objects[5] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 7 0 R /F4 8 0 R >> >> /Contents 6 0 R${clickable ? " /Annots [10 0 R]" : ""} >>`;
  objects[6] = `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`;
  objects[7] = "<< /Type /Font /Subtype /Type1 /BaseFont /Times-Bold >>";
  objects[8] = "<< /Type /Font /Subtype /Type1 /BaseFont /Times-Italic >>";
  objects[9] = `<< /Title (${pdfEscape(title)}) >>`;
  if (clickable) objects[10] = `<< /Type /Annot /Subtype /Link /Rect [64 104 531 122] /Border [0 0 0] /A << /S /URI /URI (${pdfEscape(verificationUrl)}) >> >>`;
  return buildPdf(objects, 9);
}

function xmlEscape(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function columnName(index) {
  let value = index + 1;
  let name = "";
  while (value) {
    value -= 1;
    name = String.fromCharCode(65 + (value % 26)) + name;
    value = Math.floor(value / 26);
  }
  return name;
}

function worksheetXml(rows, options = {}) {
  const rowXml = rows.map((row, rowIndex) => {
    const cells = row.map((cell, columnIndex) => {
      const ref = `${columnName(columnIndex)}${rowIndex + 1}`;
      if (cell === null || cell === undefined) return "";
      if (typeof cell === "object" && cell.formula) {
        return `<c r="${ref}" s="${cell.style || 0}"><f>${xmlEscape(cell.formula.replace(/^=/, ""))}</f><v>${Number(cell.value) || 0}</v></c>`;
      }
      if (typeof cell === "number") return `<c r="${ref}" s="${options.styles?.[rowIndex]?.[columnIndex] || 0}"><v>${cell}</v></c>`;
      return `<c r="${ref}" t="inlineStr" s="${options.styles?.[rowIndex]?.[columnIndex] || 0}"><is><t xml:space="preserve">${xmlEscape(cell)}</t></is></c>`;
    }).join("");
    return `<row r="${rowIndex + 1}">${cells}</row>`;
  }).join("");
  const columns = (options.widths || []).map((width, index) =>
    `<col min="${index + 1}" max="${index + 1}" width="${width}" customWidth="1"/>`,
  ).join("");
  const merge = options.merge ? `<mergeCells count="1"><mergeCell ref="${options.merge}"/></mergeCells>` : "";
  const filter = options.filter ? `<autoFilter ref="${options.filter}"/>` : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <sheetViews><sheetView workbookViewId="0">${options.freeze ? `<pane ySplit="${options.freeze}" topLeftCell="A${options.freeze + 1}" activePane="bottomLeft" state="frozen"/>` : ""}</sheetView></sheetViews>
  <cols>${columns}</cols><sheetData>${rowXml}</sheetData>${merge}${filter}
</worksheet>`;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipStore(files) {
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBuffer = Buffer.from(name);
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8");
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8); local.writeUInt16LE(0, 10); local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuffer.length, 26); local.writeUInt16LE(0, 28);
    localParts.push(local, nameBuffer, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8); central.writeUInt16LE(0, 10); central.writeUInt16LE(0, 12); central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24);
    central.writeUInt16LE(nameBuffer.length, 28); central.writeUInt16LE(0, 30); central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34); central.writeUInt16LE(0, 36); central.writeUInt32LE(0, 38); central.writeUInt32LE(offset, 42);
    centralParts.push(central, nameBuffer);
    offset += local.length + nameBuffer.length + data.length;
  }
  const centralBuffer = Buffer.concat(centralParts);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(0, 4); end.writeUInt16LE(0, 6);
  end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(centralBuffer.length, 12); end.writeUInt32LE(offset, 16); end.writeUInt16LE(0, 20);
  return Buffer.concat([...localParts, centralBuffer, end]);
}

export function createInstitutionXlsx(detail, ranking, pillars) {
  const summaryRows = [
    ["Financial Institution Sustainability Rating Platform", "", "", "", "", ""],
    ["Institution", detail.institution.name],
    ["Institution type", detail.institution.type],
    ["Reporting period", detail.institution.reportingPeriod],
    ["Review status", String(detail.workflow?.status || "draft").replaceAll("_", " ")],
    ["Result status", ranking.provisional ? "PROVISIONAL - NOT APPROVED FOR PUBLICATION" : "Approved"],
    ["Assessment completion", Number(ranking.completionPercentage || 0) / 100],
    ["Assessment cycle", Number(ranking.cycleNumber || detail.workflow?.cycleNumber || 1)],
    ["Revision", Number(ranking.revision ?? detail.workflow?.revision ?? 0)],
    ["Methodology version", ranking.methodologyVersion || detail.workflow?.methodologyVersion || ""],
    ["Generated at (UTC)", new Date().toISOString()],
    [],
    ["Metric", "Value"],
    ["Adjusted score", ranking.adjustedGreenScore],
    ["Raw score", ranking.rawGreenScore],
    ["Rating", ranking.rating],
    ["Evidence confidence", ranking.evidenceConfidence],
    [],
    ["Pillar", "Adjusted score"],
    ...pillars.map((pillar) => [pillar, Number(ranking.pillars[pillar] || 0) / 100]),
  ];
  const summaryStyles = summaryRows.map((row, index) =>
    row.map(() => index === 0 ? 1 : ["Metric", "Pillar"].includes(row[0]) ? 2 : ["Assessment completion", "Evidence confidence"].includes(row[0]) || index >= summaryRows.findIndex((item) => item[0] === "Pillar") + 1 ? 4 : 0),
  );

  const signalRows = [["Signal ID", "Pillar", "Signal", "Weight", "Assessment status", "Applicable", "Score", "Evidence grade", "Adjusted contribution", "N/A reason"]];
  detail.assessments.forEach((item, index) => {
    const contribution = item.assessed && item.applicable
      ? (Number(item.score) / 5) * Number(item.weight) * (Number(item.evidenceGrade) / 3)
      : 0;
    const rowNumber = index + 2;
    signalRows.push([
      item.signalId, item.pillar, item.signal, Number(item.weight), item.assessed ? "Assessed" : "Not assessed",
      item.applicable ? "Yes" : "No", item.assessed ? Number(item.score) : "", Number(item.evidenceGrade),
      { formula: `=IF(OR(E${rowNumber}<>"Assessed",F${rowNumber}="No"),0,(G${rowNumber}/5)*D${rowNumber}*(H${rowNumber}/3))`, value: contribution, style: 3 },
      item.naReason || "",
    ]);
  });
  const signalStyles = signalRows.map((row, index) => row.map(() => index === 0 ? 2 : 0));

  const evidenceRows = [["Signal ID", "Signal", "Reporting period", "Grade", "Evidence summary", "Primary source", "Secondary source", "Assessment note", "Owner"]];
  detail.evidence.forEach((item) => evidenceRows.push([
    item.signalId, item.signal, item.reportingPeriod, Number(item.evidenceGrade), item.summary,
    item.primarySourceUrl, item.secondarySourceUrl, item.assessmentNote, item.createdBy,
  ]));
  const evidenceStyles = evidenceRows.map((row, index) => row.map(() => index === 0 ? 2 : 0));

  const sheets = {
    "xl/worksheets/sheet1.xml": worksheetXml(summaryRows, { widths: [38, 30, 18, 18, 18, 18], styles: summaryStyles, merge: "A1:F1" }),
    "xl/worksheets/sheet2.xml": worksheetXml(signalRows, { widths: [12, 38, 58, 11, 18, 12, 10, 14, 20, 38], styles: signalStyles, freeze: 1, filter: `A1:J${signalRows.length}` }),
    "xl/worksheets/sheet3.xml": worksheetXml(evidenceRows, { widths: [12, 48, 18, 10, 58, 34, 34, 52, 24], styles: evidenceStyles, freeze: 1, filter: `A1:I${evidenceRows.length}` }),
  };
  const files = {
    "[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
    "_rels/.rels": `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Summary" sheetId="1" r:id="rId1"/><sheet name="Signals" sheetId="2" r:id="rId2"/><sheet name="Evidence" sheetId="3" r:id="rId3"/></sheets><calcPr calcId="191029" fullCalcOnLoad="1"/></workbook>`,
    "xl/_rels/workbook.xml.rels": `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/><Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    "xl/styles.xml": `<?xml version="1.0" encoding="UTF-8"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="3"><font><sz val="10"/><name val="Aptos"/></font><font><b/><sz val="16"/><color rgb="FF166534"/><name val="Aptos"/></font><font><b/><sz val="10"/><color rgb="FFFFFFFF"/><name val="Aptos"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF166534"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border/></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="2" fillId="2" borderId="0" xfId="0" applyFill="1" applyFont="1"/><xf numFmtId="2" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="10" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`,
    ...sheets,
  };
  return zipStore(files);
}
