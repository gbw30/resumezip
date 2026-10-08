// Files for tests to open, made in memory the way another app would make
// them. Used by the import tests here and the browser tests in e2e/.

import { crc32, deflateRawSync } from "node:zlib"

/**
 * A PDF with a page per list, and a line of text per entry, in Helvetica of
 * `size` points. pdf.js leaves out text that runs off the page, so the more
 * text a page needs, the smaller it has to be.
 */
export function textPdf(pages: string[][], { size = 12 } = {}): Buffer {
  return pdfOf(
    pages.map((lines) => {
      const text = lines.map((line) => `(${line.replace(/[\\()]/g, "\\$&")}) Tj 0 -${(size * 4) / 3} Td`).join(" ")
      return `BT /F1 ${size} Tf 72 720 Td ${text} ET`
    }),
  )
}

/** A PDF of pages drawn by `contents`, each a page's content stream, with Helvetica as /F1. */
export function pdfOf(contents: string[]): Buffer {
  // The catalog, the page list (filled in once the pages are numbered) and the font come first.
  const objects = ["<< /Type /Catalog /Pages 2 0 R >>", "", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>"]
  const kids: string[] = []
  for (const content of contents) {
    objects.push(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`)
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${objects.length} 0 R >>`,
    )
    kids.push(`${objects.length} 0 R`)
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.join(" ")}] /Count ${contents.length} >>`

  let pdf = "%PDF-1.4\n"
  const offsets = objects.map((object, index) => {
    const offset = pdf.length
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`
    return offset
  })
  const xref = pdf.length
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  pdf += offsets.map((offset) => `${String(offset).padStart(10, "0")} 00000 n \n`).join("")
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(pdf, "latin1")
}

const escapeXml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")

/**
 * A Word (.docx) file with a paragraph per entry. `padding` adds that many
 * spaces to its XML, which zip squeezes down to almost nothing: a small file
 * that unzips to a lot.
 */
export function wordFile(paragraphs: string[], { padding = 0 } = {}): Buffer {
  const body = paragraphs.map((text) => `<w:p><w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`).join("")
  const xml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
  return zip({
    "[Content_Types].xml": `${xml}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
    "_rels/.rels": `${xml}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
    "word/document.xml": `${xml}<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body>${" ".repeat(padding)}</w:document>`,
  })
}

/** A zip file holding `files`, compressed. */
function zip(files: Record<string, string>): Buffer {
  const entries: Buffer[] = []
  const directory: Buffer[] = []
  let offset = 0
  for (const [path, text] of Object.entries(files)) {
    const name = Buffer.from(path)
    const data = Buffer.from(text)
    const packed = deflateRawSync(data)
    // Both headers share these fields: version 2.0, no flags, deflated, no date, then the sizes.
    const fields = Buffer.alloc(26)
    fields.writeUInt16LE(20, 0)
    fields.writeUInt16LE(8, 4)
    fields.writeUInt32LE(crc32(data), 10)
    fields.writeUInt32LE(packed.length, 14)
    fields.writeUInt32LE(data.length, 18)
    fields.writeUInt16LE(name.length, 22)

    const local = Buffer.alloc(4)
    local.writeUInt32LE(0x04034b50)
    entries.push(local, fields, name, packed)

    const central = Buffer.alloc(46)
    central.writeUInt32LE(0x02014b50, 0)
    central.writeUInt16LE(20, 4)
    fields.copy(central, 6)
    central.writeUInt32LE(offset, 42)
    directory.push(central, name)
    offset += 30 + name.length + packed.length
  }

  const list = Buffer.concat(directory)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0)
  end.writeUInt16LE(Object.keys(files).length, 8)
  end.writeUInt16LE(Object.keys(files).length, 10)
  end.writeUInt32LE(list.length, 12)
  end.writeUInt32LE(offset, 16)
  return Buffer.concat([...entries, list, end])
}
