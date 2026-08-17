const sanitizeHtml = require("sanitize-html");

const ALLOWED_TAGS = [
  "p", "br", "h2", "h3", "h4", "strong", "b", "em", "i", "u", "s",
  "blockquote", "code", "pre", "ul", "ol", "li", "a", "hr",
  "table", "thead", "tbody", "tr", "th", "td"
];

const ALLOWED_TAG_PATTERN = new RegExp(
  `<\\/?(?:${ALLOWED_TAGS.join("|")})\\b`,
  "i"
);

const SANITIZE_OPTIONS = {
  allowedTags: ALLOWED_TAGS,
  allowedAttributes: {
    a: ["href", "title", "target", "rel"],
    th: ["colspan", "rowspan"],
    td: ["colspan", "rowspan"]
  },
  allowedSchemes: ["http", "https", "mailto"],
  allowedSchemesAppliedToAttributes: ["href"],
  allowProtocolRelative: false,
  disallowedTagsMode: "discard",
  transformTags: {
    a(tagName, attributes) {
      return {
        tagName,
        attribs: {
          ...attributes,
          target: "_blank",
          rel: "nofollow noopener noreferrer"
        }
      };
    }
  }
};

function decodeEntities(value) {
  const character = (code, radix) => {
    const point = Number.parseInt(code, radix);
    return Number.isInteger(point) && point >= 0 && point <= 0x10ffff
      ? String.fromCodePoint(point)
      : "";
  };
  return String(value || "")
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => character(code, 16))
    .replace(/&#([0-9]+);/g, (_, code) => character(code, 10))
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

function sanitizeForumBody(value) {
  return sanitizeHtml(String(value || ""), SANITIZE_OPTIONS).trim();
}

function forumPlainText(value) {
  const source = String(value || "")
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(?:p|h2|h3|h4|li|blockquote|pre|tr|th|td)>/gi, " ");
  const text = sanitizeHtml(source, {
    allowedTags: [],
    allowedAttributes: {},
    disallowedTagsMode: "discard"
  });
  return decodeEntities(text).replace(/\s+/g, " ").trim();
}

function renderForumBody(value) {
  const source = String(value || "");
  const clean = sanitizeForumBody(source);
  if (ALLOWED_TAG_PATTERN.test(source)) return clean;
  return clean.replace(/\r\n?|\n/g, "<br>");
}

module.exports = {
  ALLOWED_TAGS,
  sanitizeForumBody,
  forumPlainText,
  renderForumBody
};
