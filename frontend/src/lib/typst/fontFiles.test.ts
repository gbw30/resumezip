import { readdirSync, readFileSync, writeFileSync } from "node:fs"
import path from "node:path"
import { beforeAll, describe, expect, test } from "vitest"
import { CompileFormatEnum, createTypstCompiler, createTypstFontBuilder, type TypstCompiler } from "@myriaddreamin/typst.ts/compiler"
import { loadFonts } from "@myriaddreamin/typst.ts/options.init"
import { TEMPLATES } from "@/lib/templates"
import { covers, FONT_FILES, FONT_INFO, FONT_URLS, filesOf, fontsFor, lazyFonts } from "./fontFiles"
import { toTemplateData } from "./resumeData"

const TYPST = path.resolve("src/lib/typst")
const FONTS = path.join(TYPST, "fonts")
const WASM = path.resolve("node_modules/@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm")
const filesOnDisk = readdirSync(FONTS).filter((file) => /\.(otf|ttf)$/.test(file)).sort()
const bytesOf = (file: string) => new Uint8Array(readFileSync(path.join(FONTS, file)))

// Characters from many scripts, and symbols, that the templates' fonts don't all have.
const MIXED =
  "Đặng Thị Ngọc Ánh — Œuvre façade naïve Ærø Łódź Řehoř Ștefan Ğüşİ · Ελένη Παπαδοπούλου · Жанна Петрова · 张伟 · € £ ¥ ₹ ₫ ₽ © ® ™ ° ± × ÷ ≤ ≥ ≠ ≈ → ← ↑ ↓ ★ ✓ ✗ ∑ √ ∞ ½ ¼ ² ³ ‰ † ‡ § ¶ “quoted” ‘single’ … – fi fl 😀"

describe("coverage", () => {
  // Without 0, with 1 and 2, without 3 to 9, with 10 and on to 14.
  const coverage = [1, 2, 7, 5]

  test("reads runs of characters, alternately without and with the font", () => {
    expect([0, 1, 2, 3, 9, 10, 14, 15].map((codePoint) => covers(coverage, codePoint))).toEqual([false, true, true, false, false, true, true, false])
  })

  test("a resume in plain English needs only its template's family", () => {
    expect(fontsFor("Lato", "Ada Lovelace, London · ada@example.com").sort()).toEqual(filesOf("Lato").sort())
  })

  test("a character the family lacks brings every font that has it", () => {
    const greek = "Ελένη"
    const missing = [...greek].find((char) => !filesOf("Lato").every((file) => FONT_INFO[file].info.some((face) => covers(face.coverage, char.codePointAt(0)!))))
    expect(missing).toBeDefined()
    const extra = fontsFor("Lato", greek).filter((file) => !filesOf("Lato").includes(file))
    expect(extra.length).toBeGreaterThan(0)
  })

  test("a character no font has brings nothing more", () => {
    expect(fontsFor("EB Garamond", "张伟 😀").sort()).toEqual(filesOf("EB Garamond").sort())
  })
})

describe("the font files", () => {
  test("every file has its info and a URL, and nothing else does", () => {
    expect([...FONT_FILES].sort()).toEqual(filesOnDisk)
    expect(Object.keys(FONT_URLS).sort()).toEqual(filesOnDisk)
  })

  // After changing a font, run with UPDATE_FONT_INFO=1 to write fonts/info.json again.
  test("fonts/info.json says what each file has", async () => {
    const builder = createTypstFontBuilder()
    await builder.init({ getModule: () => readFileSync(WASM) })
    const lines: string[] = []
    const actual: Record<string, unknown> = {}
    for (const file of filesOnDisk) {
      actual[file] = await builder.getFontInfo(bytesOf(file))
      lines.push(`  ${JSON.stringify(file)}: ${JSON.stringify(actual[file])}`)
    }
    if (process.env.UPDATE_FONT_INFO) writeFileSync(path.join(FONTS, "info.json"), `{\n${lines.join(",\n")}\n}\n`)
    expect(FONT_INFO).toEqual(actual)
  })

  test("each template's font is the one its text is set in, and one of the files", () => {
    for (const template of TEMPLATES) {
      const source = readFileSync(path.join(TYPST, "templates", `${template.id}.typ`), "utf8")
      expect(source.match(/#set text\(font: "([^"]+)"/)?.[1], template.id).toBe(template.font)
      expect(filesOf(template.font).length, template.id).toBeGreaterThan(0)
    }
  })
})

describe("printing with only the fonts a resume needs", () => {
  let compiler: TypstCompiler

  beforeAll(async () => {
    compiler = createTypstCompiler()
    await compiler.init({ getModule: () => readFileSync(WASM), beforeBuild: [loadFonts(filesOnDisk.map(bytesOf), { assets: false })] })
    for (const file of readdirSync(path.join(TYPST, "templates"))) {
      compiler.addSource(`/${file}`, readFileSync(path.join(TYPST, "templates", file), "utf8"))
    }
  })

  // Every font loaded up front, as before, or each read only when it's printed with.
  async function useFonts(fonts: "all" | ((file: string) => Uint8Array)) {
    const builder = createTypstFontBuilder()
    await builder.init({ getModule: () => readFileSync(WASM) })
    if (fonts === "all") for (const file of filesOnDisk) await builder.addFontData(bytesOf(file))
    else for (const font of lazyFonts(fonts)) await builder.addLazyFont(font, font.blob)
    await builder.build(async (resolver) => compiler.setFonts(resolver))
  }

  async function print(template: string, data: unknown): Promise<string> {
    compiler.mapShadow("/resume.json", new TextEncoder().encode(JSON.stringify(data)))
    const { result, diagnostics } = await compiler.compile({ mainFilePath: `/${template}.typ`, format: CompileFormatEnum.pdf, diagnostics: "unix" })
    if (!result) throw new Error(diagnostics?.join("\n"))
    // The time it was made, which is all that differs between two PDFs of the same resume.
    return Buffer.from(result).toString("latin1").replace(/D:\d{14}Z|\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d/g, (date) => date.replace(/\d/g, "0"))
  }

  const samples = readdirSync(path.join(TYPST, "preview-samples")).map((file) =>
    JSON.parse(readFileSync(path.join(TYPST, "preview-samples", file), "utf8")),
  )
  const mixed = (template: string) => ({
    selectedTemplate: template,
    profileSection: { fullName: "Đặng Thị Ngọc Ánh", location: MIXED, email: "anh@example.com" },
    workExperienceSection: [
      {
        company: "Œuvre Łódź",
        role: "Kỹ sư phần mềm",
        location: "Hà Nội",
        startDate: "Jan 2024",
        endDate: "Present",
        description: MIXED.split(" · ").map((part) => `• ${part}`).join("\n"),
      },
    ],
  })
  const cases = [
    ...samples.map((resume) => ({ name: `${resume.selectedTemplate}'s sample`, resume, sample: true })),
    ...TEMPLATES.map((template) => ({ name: `${template.id} with mixed scripts`, resume: mixed(template.id), sample: false })),
  ]

  test.each(cases)("$name prints the same, reading only the fonts expected", async ({ resume, sample }) => {
    const data = toTemplateData(resume)
    const template = TEMPLATES.find((each) => each.id === resume.selectedTemplate)!
    await useFonts("all")
    const before = await print(template.id, data)

    const read = new Set<string>()
    await useFonts((file) => {
      read.add(file)
      return bytesOf(file)
    })
    expect(await print(template.id, data)).toBe(before)
    // The worker downloads these before compiling, so Typst never waits for one.
    const expected = fontsFor(template.font, JSON.stringify(data))
    expect([...read].filter((file) => !expected.includes(file))).toEqual([])
    if (sample) expect([...read].every((file) => filesOf(template.font).includes(file))).toBe(true)
  })
})
