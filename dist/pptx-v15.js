const EMU = 9525;
const PAGE_W = 1280;
const PAGE_H = 720;
const COLORS = { ink: "26332D", green: "D6EF79", paper: "F4F3EF", white: "FFFFFF", muted: "6F756D", line: "E1E3DB", pale: "EAF0DE", blue: "E7EDF8", orange: "F7E9D8" };
const XML_NS = "http://schemas.openxmlformats.org/presentationml/2006/main";

function escapeXml(value = "") {
  return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[char]);
}

function fontRun(text, size, color, bold = false) {
  return `<a:r><a:rPr lang="zh-CN" sz="${size}"${bold ? ' b="1"' : ""} dirty="0"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:latin typeface="Aptos"/><a:ea typeface="Microsoft YaHei"/><a:cs typeface="Aptos"/></a:rPr><a:t xml:space="preserve">${escapeXml(text)}</a:t></a:r>`;
}

function paragraph(text, options = {}) {
  const { size = 1800, color = COLORS.ink, bold = false, align = "l", after = 0, bullet = false } = options;
  const bulletXml = bullet ? '<a:buChar char="•"/>' : "<a:buNone/>";
  return `<a:p><a:pPr algn="${align}" marL="0" indent="0"><a:lnSpc><a:spcPct val="112000"/></a:lnSpc><a:spcAft><a:spcPts val="${after}"/></a:spcAft>${bulletXml}</a:pPr>${fontRun(text, size, color, bold)}<a:endParaRPr lang="zh-CN" sz="${size}"/></a:p>`;
}

function textShape(id, name, x, y, w, h, lines, options = {}) {
  const { size = 1800, color = COLORS.ink, bold = false, align = "l", fill = null, inset = 0, anchor = "t" } = options;
  const fillXml = fill ? `<a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>` : "<a:noFill/>";
  const paras = (Array.isArray(lines) ? lines : [lines]).map((line) => paragraph(line, { size, color, bold, align })).join("");
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${escapeXml(name)}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${Math.round(x * EMU)}" y="${Math.round(y * EMU)}"/><a:ext cx="${Math.round(w * EMU)}" cy="${Math.round(h * EMU)}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${fillXml}<a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="square" lIns="${Math.round(inset * EMU)}" rIns="${Math.round(inset * EMU)}" tIns="${Math.round(inset * EMU)}" bIns="${Math.round(inset * EMU)}" anchor="${anchor}"><a:spAutoFit/></a:bodyPr><a:lstStyle/>${paras}</p:txBody></p:sp>`;
}

function rectShape(id, name, x, y, w, h, fill, radius = false, line = null) {
  const geom = radius ? "roundRect" : "rect";
  const lineXml = line ? `<a:ln w="15240"><a:solidFill><a:srgbClr val="${line}"/></a:solidFill></a:ln>` : "<a:ln><a:noFill/></a:ln>";
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${escapeXml(name)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${Math.round(x * EMU)}" y="${Math.round(y * EMU)}"/><a:ext cx="${Math.round(w * EMU)}" cy="${Math.round(h * EMU)}"/></a:xfrm><a:prstGeom prst="${geom}"><a:avLst/></a:prstGeom><a:solidFill><a:srgbClr val="${fill}"/></a:solidFill>${lineXml}</p:spPr></p:sp>`;
}

function lineShape(id, name, x1, y1, x2, y2, color = COLORS.line, width = 18000) {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="${escapeXml(name)}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="${Math.round(x1 * EMU)}" y="${Math.round(y1 * EMU)}"/><a:ext cx="${Math.round((x2 - x1) * EMU)}" cy="${Math.round((y2 - y1) * EMU)}"/></a:xfrm><a:prstGeom prst="line"><a:avLst/></a:prstGeom><a:ln w="${width}"><a:solidFill><a:srgbClr val="${color}"/></a:solidFill><a:tailEnd type="none"/><a:headEnd type="triangle"/></a:ln></p:spPr></p:sp>`;
}

function slideGroupStart() {
  return '<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>';
}

function slideXml(shapes) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="${XML_NS}"><p:cSld><p:spTree>${slideGroupStart()}${shapes.join("")}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

function buildSlide(slide, context, index, total) {
  const shapes = [];
  let id = 2;
  const addText = (x, y, w, h, value, opts = {}) => shapes.push(textShape(id++, `Text ${id}`, x, y, w, h, value, opts));
  const addRect = (x, y, w, h, fill, rounded = false, line = null) => shapes.push(rectShape(id++, `Shape ${id}`, x, y, w, h, fill, rounded, line));
  const addLine = (x1, y1, x2, y2, color, width) => shapes.push(lineShape(id++, `Connector ${id}`, x1, y1, x2, y2, color, width));
  const points = Array.isArray(slide.points) ? slide.points.slice(0, 5) : [];
  const layout = slide.layout || "key_points";

  if (layout === "cover") {
    addRect(0, 0, PAGE_W, PAGE_H, COLORS.ink);
    addRect(0, 0, 22, PAGE_H, COLORS.green);
    addText(82, 72, 1040, 36, "AI COURSE STUDIO  ·  授课级课件", { size: 1200, color: COLORS.green, bold: true });
    addText(82, 165, 1100, 112, slide.title, { size: 3600, color: COLORS.white, bold: true });
    addText(84, 280, 1040, 54, slide.subtitle || "模块授课 PPT", { size: 2000, color: "DDE3D9" });
    addRect(82, 392, 1050, 162, "34423A", true);
    addText(112, 418, 980, 52, slide.objective || "", { size: 1800, color: COLORS.white });
    addText(112, 492, 980, 36, [slide.audience, slide.duration].filter(Boolean).join("  ·  "), { size: 1300, color: "C5D0C2" });
    addText(84, 637, 1060, 24, context.courseTitle || "课程工坊", { size: 1000, color: "C5D0C2" });
    return slideXml(shapes);
  }

  addRect(0, 0, PAGE_W, PAGE_H, COLORS.paper);
  addRect(0, 0, PAGE_W, 10, COLORS.green);
  addText(68, 34, 830, 26, `${context.moduleLabel}   ·   ${slide.ropesStage || "P"} / ROPES`, { size: 1050, color: COLORS.muted, bold: true });
  addText(1070, 34, 145, 26, `${index + 1} / ${total}`, { size: 1050, color: COLORS.muted, align: "r" });
  addText(68, 80, 1130, 65, slide.title || "", { size: 3000, color: COLORS.ink, bold: true });
  addText(70, 151, 1120, 48, slide.lead || "", { size: 1550, color: COLORS.muted });

  if (layout === "process" && slide.visualLabels?.length >= 2) {
    const labels = slide.visualLabels.slice(0, 5);
    const gap = 18, x0 = 68, y = 284, totalW = 1144, boxW = (totalW - gap * (labels.length - 1)) / labels.length;
    labels.forEach((label, i) => {
      const x = x0 + i * (boxW + gap);
      if (i < labels.length - 1) addLine(x + boxW - 4, y + 48, x + boxW + gap - 4, y + 48, "A6B68A", 22000);
      addRect(x, y, boxW, 104, i % 2 ? COLORS.blue : COLORS.pale, true);
      addText(x + 10, y + 13, boxW - 20, 25, `0${i + 1}`, { size: 1050, color: "658047", bold: true, align: "c" });
      addText(x + 12, y + 40, boxW - 24, 49, label, { size: 1500, color: COLORS.ink, bold: true, align: "c", anchor: "ctr" });
      if (points[i]) addText(x, y + 122, boxW, 100, points[i], { size: 1250, color: COLORS.muted, align: "c" });
    });
  } else if (layout === "compare") {
    const labels = slide.visualLabels?.slice(0, 2) || ["做法一", "做法二"];
    const split = Math.ceil(points.length / 2);
    [0, 1].forEach((column) => {
      const x = 68 + column * 580;
      addRect(x, 242, 550, 300, column ? COLORS.blue : COLORS.pale, true);
      addText(x + 24, 260, 500, 42, labels[column] || (column ? "方案二" : "方案一"), { size: 1900, color: COLORS.ink, bold: true });
      const items = column ? points.slice(split) : points.slice(0, split);
      items.forEach((point, row) => addText(x + 28, 320 + row * 65, 492, 54, `•  ${point}`, { size: 1450, color: COLORS.ink }));
    });
  } else if (layout === "case") {
    addRect(68, 232, 660, 333, COLORS.white, true, COLORS.line);
    addText(96, 255, 600, 34, "案例情境", { size: 1200, color: "658047", bold: true });
    addText(96, 300, 600, 230, slide.lead || points[0] || "", { size: 1800, color: COLORS.ink });
    addRect(760, 232, 452, 333, COLORS.orange, true);
    addText(788, 255, 396, 34, "讨论与观察", { size: 1200, color: "8B633B", bold: true });
    points.slice(0, 4).forEach((point, row) => addText(788, 302 + row * 58, 396