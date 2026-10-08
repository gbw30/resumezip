// Makes the test set's PDFs (see README.md) from each person's resume.json,
// with the tools people really make resumes with: LaTeX, a word processor,
// a browser and Typst. A few are written by hand instead, as a Typst file
// beside the PDF. Only needed to add or change a file; the tests read the
// PDFs as they are. Needs pdflatex (with TeX Live's latex-extra packages),
// LibreOffice, Playwright's Chromium and a Japanese font. Run it from frontend/:
//
//   node src/lib/import/corpus/make.mts            every file
//   node src/lib/import/corpus/make.mts maya       one person's files
//
// Set CHROMIUM to a Chromium executable to use that instead of Playwright's.

import { execFileSync } from "node:child_process"
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { CompileFormatEnum, createTypstCompiler, type TypstCompiler } from "@myriaddreamin/typst.ts/compiler"
import { loadFonts } from "@myriaddreamin/typst.ts/options.init"
import { chromium, type Browser } from "@playwright/test"

/** Each person, and the layouts their resume is printed in. */
const FILES: Record<string, Layout[]> = {
  // Like a resume from Jake's LaTeX template with the company first, and a
  // hackathon's year in a project's name.
  maya: ["latex-jake-company-first", "latex-jake", "html-modern"],
  // Like a resume typed in a word processor, with a wrapped coursework line
  // and an "80/20" in a wrapped bullet.
  diego: ["writer-classic", "latex-jake", "html-harvard"],
  priya: ["latex-jake", "html-sidebar", "html-dates-left", "writer-modern"],
  jordan: ["writer-modern", "html-side-headings", "html-harvard", "html-modern"],
  wei: ["latex-jake", "html-dates-left", "writer-classic"],
  sam: ["html-harvard", "writer-classic", "html-sidebar", "html-side-headings"],
  // Like an academic CV made in Typst, written by hand: see marcus/typst-academic.typ.
  marcus: ["typst-academic"],
  // Like a resume typed in Word with the company first, a long degree with
  // the GPA beside it, and titles like "Physician Shadowing – Cardiology".
  nadia: ["writer-company-first", "latex-jake"],
}

type Layout =
  | "latex-jake"
  | "latex-jake-company-first"
  | "writer-classic"
  | "writer-modern"
  | "writer-company-first"
  | "html-modern"
  | "html-sidebar"
  | "html-dates-left"
  | "html-side-headings"
  | "html-harvard"
  | "typst-academic"

type Resume = Record<string, any>

const HERE = import.meta.dirname
const FONTS = path.resolve(HERE, "../../typst/fonts")
const TYPST_WASM = path.resolve(HERE, "../../../../node_modules/@myriaddreamin/typst-ts-web-compiler/pkg/typst_ts_web_compiler_bg.wasm")

/** Layouts written by hand, as `<person>/<layout>.typ`, for shapes too particular to print from resume.json. */
const handWritten = (layout: Layout): layout is "typst-academic" => layout === "typst-academic"

// ---------------------------------------------------------------- the resume

const SECTIONS: Record<string, { key: string; heading: string }> = {
  Education: { key: "educationSection", heading: "edu" },
  Work: { key: "workExperienceSection", heading: "work" },
  Projects: { key: "projectsSection", heading: "projects" },
  Publications: { key: "publicationsSection", heading: "publications" },
  Skills: { key: "skillsSection", heading: "skills" },
  Leadership: { key: "leadershipExperienceSection", heading: "leadership" },
  Volunteership: { key: "volunteerExperienceSection", heading: "volunteer" },
  Awards: { key: "awardsSection", heading: "awards" },
}

const DEFAULT_HEADINGS: Record<string, string> = {
  Education: "Education",
  Work: "Experience",
  Projects: "Projects",
  Publications: "Publications",
  Skills: "Skills",
  Leadership: "Leadership",
  Volunteership: "Volunteer Experience",
  Awards: "Awards",
}

const entriesOf = (resume: Resume, name: string): Resume[] => resume[SECTIONS[name].key] ?? []
/** The sections with something in them, in the resume's order. */
const sectionsOf = (resume: Resume) => (resume.sectionOrder as string[]).filter((name) => entriesOf(resume, name).length > 0)
const headingOf = (resume: Resume, name: string) => resume.headings?.[SECTIONS[name].heading] || DEFAULT_HEADINGS[name]

const dates = (start: string, end: string, between = " – ") => (start && end ? `${start}${between}${end}` : start || end)
const bulletsOf = (text: string) =>
  text
    .split("\n")
    .map((line) => line.replace(/^•\s*/, "").trim())
    .filter(Boolean)

interface Experience {
  role: string
  org: string
  location: string
  dates: string
  bullets: string[]
  /** Printed only by layouts that put the tools used beside the company. */
  tech: string
}

const PREFIX: Record<string, [string, string, string]> = {
  Work: ["work", "workRole", "companyName"],
  Leadership: ["leadership", "leadershipRole", "leadershipOrg"],
  Volunteership: ["volunteer", "volunteerRole", "volunteerOrg"],
}

function experiencesOf(resume: Resume, name: string): Experience[] {
  const [prefix, role, org] = PREFIX[name]
  return entriesOf(resume, name).map((entry) => ({
    role: entry[role],
    org: entry[org],
    location: entry[`${prefix}Location`],
    dates: dates(entry[`${prefix}StartDate`], entry[`${prefix}EndDate`]),
    bullets: bulletsOf(entry[`${prefix}Description`]),
    tech: entry.tech ?? "",
  }))
}

const isExperience = (name: string) => name in PREFIX

/** Contact details in the order they're printed, with where each one links. */
function contactsOf(resume: Resume): { text: string; href?: string }[] {
  const profile = resume.profileSection
  return [
    { text: profile.location },
    { text: profile.phoneNumber },
    { text: profile.email, href: `mailto:${profile.email}` },
    ...[profile.linkedin, profile.profileGithub, profile.personalWebsite].map((url: string) => ({ text: url, href: `https://${url}` })),
  ].filter((contact) => contact.text)
}

/** "A. Smith and B. Lee, “Title,” Venue, details, 2025. doi: 10.1/x", split around the italic venue. */
function citationOf(publication: Resume): { before: string; venue: string; after: string } {
  const link = publication.publicationLink
  const where = /^10\.\d{4,9}\//.test(link) ? ` doi: ${link}.` : link ? ` ${link}` : ""
  const details = publication.publicationDetails ? `, ${publication.publicationDetails}` : ""
  return {
    before: `${publication.publicationAuthors}, “${publication.publicationTitle},” `,
    venue: publication.publicationVenue,
    after: `${details}, ${publication.publicationDate}.${where}`,
  }
}

const educationDates = (school: Resume) => dates(school.schoolStartDate, school.schoolEndDate)

// ---------------------------------------------------------------- LaTeX

const TEX: Record<string, string> = {
  "\\": "\\textbackslash{}",
  "&": "\\&",
  "%": "\\%",
  $: "\\$",
  "#": "\\#",
  _: "\\_",
  "{": "\\{",
  "}": "\\}",
  "~": "$\\sim$",
  "^": "\\^{}",
  "|": "$|$",
  "<": "$<$",
  ">": "$>$",
  "→": "$\\rightarrow$",
  "×": "$\\times$",
}
const tex = (text: string) => text.replace(/[\\&%$#_{}~^|<>→×]/g, (char) => TEX[char])

// Jake Gutierrez's resume template (MIT), as most copies of it are.
const JAKE_PREAMBLE = String.raw`\documentclass[letterpaper,11pt]{article}
\usepackage[utf8]{inputenc}
\usepackage{latexsym}
\usepackage[empty]{fullpage}
\usepackage{titlesec}
\usepackage{marvosym}
\usepackage[usenames,dvipsnames]{color}
\usepackage{verbatim}
\usepackage{enumitem}
\usepackage[hidelinks]{hyperref}
\usepackage{fancyhdr}
\usepackage[english]{babel}
\usepackage{tabularx}
\input{glyphtounicode}

\pagestyle{fancy}
\fancyhf{}
\fancyfoot{}
\renewcommand{\headrulewidth}{0pt}
\renewcommand{\footrulewidth}{0pt}

\addtolength{\oddsidemargin}{-0.5in}
\addtolength{\evensidemargin}{-0.5in}
\addtolength{\textwidth}{1in}
\addtolength{\topmargin}{-.5in}
\addtolength{\textheight}{1.0in}

\urlstyle{same}
\raggedbottom
\raggedright
\setlength{\tabcolsep}{0in}

\titleformat{\section}{
  \vspace{-4pt}\scshape\raggedright\large
}{}{0em}{}[\color{black}\titlerule \vspace{-5pt}]

\pdfgentounicode=1

\newcommand{\resumeItem}[1]{
  \item\small{
    {#1 \vspace{-2pt}}
  }
}

\newcommand{\resumeSubheading}[4]{
  \vspace{-2pt}\item
    \begin{tabular*}{0.97\textwidth}[t]{l@{\extracolsep{\fill}}r}
      \textbf{#1} & #2 \\
      \textit{\small#3} & \textit{\small #4} \\
    \end{tabular*}\vspace{-7pt}
}

\newcommand{\resumeProjectHeading}[2]{
    \item
    \begin{tabular*}{0.97\textwidth}{l@{\extracolsep{\fill}}r}
      \small#1 & #2 \\
    \end{tabular*}\vspace{-7pt}
}

\renewcommand\labelitemii{$\vcenter{\hbox{\tiny$\bullet$}}$}

\newcommand{\resumeSubHeadingListStart}{\begin{itemize}[leftmargin=0.15in, label={}]}
\newcommand{\resumeSubHeadingListEnd}{\end{itemize}}
\newcommand{\resumeItemListStart}{\begin{itemize}}
\newcommand{\resumeItemListEnd}{\end{itemize}\vspace{-5pt}}
`

const JAKE_HEADINGS: Record<string, string> = { Skills: "Technical Skills" }

function jake(resume: Resume, companyFirst: boolean): string {
  const link = (text: string, href: string) => `\\href{${href}}{\\underline{${tex(text)}}}`
  const contact = contactsOf(resume)
    .map((item) => (item.href ? link(item.text, item.href) : tex(item.text)))
    .join(" $|$ ")
  const items = (bullets: string[]) =>
    bullets.length ? `\\resumeItemListStart\n${bullets.map((bullet) => `  \\resumeItem{${tex(bullet)}}`).join("\n")}\n\\resumeItemListEnd` : ""
  const list = (body: string) => `\\resumeSubHeadingListStart\n${body}\n\\resumeSubHeadingListEnd`

  const section = (name: string): string => {
    if (isExperience(name)) {
      return list(
        experiencesOf(resume, name)
          .map((job) => {
            const first = companyFirst ? tex(job.org) + (job.tech ? ` $|$ \\emph{${tex(job.tech)}}` : "") : tex(job.role)
            const second = companyFirst ? tex(job.role) : tex(job.org)
            return `\\resumeSubheading{${first}}{${tex(job.dates)}}{${second}}{${tex(job.location)}}\n${items(job.bullets)}`
          })
          .join("\n"),
      )
    }
    if (name === "Education") {
      return list(
        entriesOf(resume, name)
          .map((school) => {
            const degree = tex(school.degree) + (school.gpa ? `, GPA: ${tex(school.gpa)}` : "")
            const details = [
              school.coursework && `\\item \\small{\\textbf{Relevant Coursework}: \\textit{${tex(school.coursework)}}}`,
              school.involvement && `\\item \\small{\\textbf{Involvement}: ${tex(school.involvement)}}`,
            ]
            return [`\\resumeSubheading{${tex(school.schoolName)}}{${tex(school.schoolLocation)}}{${degree}}{${tex(educationDates(school))}}`, ...details]
              .filter(Boolean)
              .join("\n")
          })
          .join("\n"),
      )
    }
    if (name === "Projects") {
      return list(
        entriesOf(resume, name)
          .map((project) => {
            // "Sprout – HackGT 2026": only the name itself is bold.
            const [title, ...rest] = project.projectName.split(" – ")
            const links = [project.projectGithub, project.additionalLink].filter(Boolean).map((url: string) => ` $|$ ${link(url, `https://${url}`)}`)
            const heading = `\\textbf{${tex(title)}}${rest.map((piece: string) => ` – ${tex(piece)}`).join("")} $|$ \\emph{${tex(project.techStack)}}${links.join("")}`
            return `\\resumeProjectHeading{${heading}}{${tex(project.projectDate)}}\n${items(bulletsOf(project.projectDescription))}`
          })
          .join("\n"),
      )
    }
    if (name === "Skills") {
      const rows = entriesOf(resume, name).map((skill) => `\\textbf{${tex(skill.skillName)}}{: ${tex(skill.skillDetails)}} \\\\`)
      return `\\begin{itemize}[leftmargin=0.15in, label={}]\n\\small{\\item{\n${rows.join("\n")}\n}}\n\\end{itemize}`
    }
    if (name === "Awards") {
      return list(
        entriesOf(resume, name)
          .map((award) => `\\resumeProjectHeading{\\textbf{${tex(award.awardName)}}, ${tex(award.awardOrg)}}{${tex(award.awardDate)}}`)
          .join("\n"),
      )
    }
    // Publications
    const citations = entriesOf(resume, name).map((publication) => {
      const { before, venue, after } = citationOf(publication)
      return `  \\item \\small{${tex(before)}\\textit{${tex(venue)}}${tex(after)}}`
    })
    return `\\begin{enumerate}[leftmargin=0.35in, label={[\\arabic*]}]\n${citations.join("\n")}\n\\end{enumerate}`
  }

  const body = sectionsOf(resume)
    .map((name) => `\\section{${tex(resume.headings?.[SECTIONS[name].heading] || JAKE_HEADINGS[name] || DEFAULT_HEADINGS[name])}}\n${section(name)}`)
    .join("\n\n")
  // Copies with the company first often pull the page up a little, to fit it on one.
  const margins = companyFirst ? "\\addtolength{\\topmargin}{-0.2in}\n\\addtolength{\\textheight}{0.2in}\n" : ""
  return `${JAKE_PREAMBLE}${margins}
\\begin{document}
\\begin{center}
  \\textbf{\\Huge \\scshape ${tex(resume.profileSection.fullName)}} \\\\ \\vspace{1pt}
  \\small ${contact}
\\end{center}

${body}
\\end{document}
`
}

function pdflatex(source: string, dir: string): Buffer {
  writeFileSync(path.join(dir, "resume.tex"), source)
  // A fixed date, so the same source makes the same file.
  const env = { ...process.env, SOURCE_DATE_EPOCH: "1790000000", FORCE_SOURCE_DATE: "1" }
  execFileSync("pdflatex", ["-interaction=nonstopmode", "-halt-on-error", "resume.tex"], { cwd: dir, env, stdio: "pipe" })
  return readFileSync(path.join(dir, "resume.pdf"))
}

// ---------------------------------------------------------------- word processor

const xml = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")

const span = (style: string, text: string) => `<text:span text:style-name="${style}">${xml(text)}</text:span>`
const TAB = "<text:tab/>"
const para = (style: string, inner: string) => `<text:p text:style-name="${style}">${inner}</text:p>`
const odtLink = (text: string, href: string) => `<text:a xlink:type="simple" xlink:href="${xml(href)}">${xml(text)}</text:a>`

interface WriterLook {
  font: string
  size: string
  margin: string
  /** Where right-aligned text ends: the page's width less its margins. */
  right: string
  /** How the name and contact line are aligned. */
  align: "center" | "start"
  name: string
  contact: string
  headingParagraph: string
  headingText: string
  bullet: string
  bulletIndent: string
  /** Top and bottom page margins. */
  edge: string
}

const WRITER_LOOKS: Record<"classic" | "modern", WriterLook> = {
  // Times-like type and bold capitals under a rule, as many word-processor resumes have.
  classic: {
    font: "Liberation Serif",
    size: "10pt",
    margin: "0.5in",
    right: "7.5in",
    align: "center",
    name: `fo:font-size="16pt" fo:font-weight="bold"`,
    contact: "",
    headingParagraph: `fo:border-bottom="0.75pt solid #000000" fo:padding-bottom="0.5pt" fo:margin-top="4pt" fo:margin-bottom="2pt"`,
    headingText: `fo:font-size="11pt" fo:font-weight="bold"`,
    bullet: "•",
    bulletIndent: "0.25in",
    edge: "0.3in",
  },
  // Like Word's own resume styles: Calibri-like type, coloured headings.
  modern: {
    font: "Carlito",
    size: "11pt",
    margin: "0.75in",
    right: "7in",
    align: "start",
    name: `fo:font-size="22pt" fo:font-weight="bold" fo:color="#1F3864"`,
    contact: `fo:color="#595959"`,
    headingParagraph: `fo:margin-top="10pt" fo:margin-bottom="3pt"`,
    headingText: `fo:font-size="13pt" fo:font-weight="bold" fo:color="#2E74B5"`,
    bullet: "▪",
    bulletIndent: "0.3in",
    edge: "0.5in",
  },
}

function fodt(look: WriterLook, body: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<office:document xmlns:office="urn:oasis:names:tc:opendocument:xmlns:office:1.0" xmlns:style="urn:oasis:names:tc:opendocument:xmlns:style:1.0" xmlns:text="urn:oasis:names:tc:opendocument:xmlns:text:1.0" xmlns:fo="urn:oasis:names:tc:opendocument:xmlns:xsl-fo-compatible:1.0" xmlns:svg="urn:oasis:names:tc:opendocument:xmlns:svg-compatible:1.0" xmlns:xlink="http://www.w3.org/1999/xlink" office:version="1.3" office:mimetype="application/vnd.oasis.opendocument.text">
<office:font-face-decls>
  <style:font-face style:name="${look.font}" svg:font-family="'${look.font}'"/>
</office:font-face-decls>
<office:styles>
  <style:default-style style:family="paragraph">
    <style:paragraph-properties fo:margin-top="0in" fo:margin-bottom="0in"/>
    <style:text-properties style:font-name="${look.font}" fo:font-size="${look.size}" fo:language="en" fo:country="US"/>
  </style:default-style>
  <style:style style:name="Standard" style:family="paragraph"/>
  <style:style style:name="Name" style:family="paragraph"><style:paragraph-properties fo:text-align="${look.align}"/><style:text-properties ${look.name}/></style:style>
  <style:style style:name="Contact" style:family="paragraph"><style:paragraph-properties fo:text-align="${look.align}" fo:margin-bottom="2pt"/><style:text-properties ${look.contact}/></style:style>
  <style:style style:name="Heading" style:family="paragraph"><style:paragraph-properties ${look.headingParagraph}/><style:text-properties ${look.headingText}/></style:style>
  <style:style style:name="Entry" style:family="paragraph"><style:paragraph-properties><style:tab-stops><style:tab-stop style:position="${look.right}" style:type="right"/></style:tab-stops></style:paragraph-properties></style:style>
  <style:style style:name="First" style:family="paragraph" style:parent-style-name="Entry"><style:paragraph-properties fo:margin-top="2pt"/></style:style>
  <style:style style:name="Body" style:family="paragraph"/>
  <style:style style:name="Bullet" style:family="paragraph"/>
  <style:style style:name="B" style:family="text"><style:text-properties fo:font-weight="bold"/></style:style>
  <style:style style:name="I" style:family="text"><style:text-properties fo:font-style="italic"/></style:style>
</office:styles>
<office:automatic-styles>
  <style:page-layout style:name="Page"><style:page-layout-properties fo:page-width="8.5in" fo:page-height="11in" fo:margin-top="${look.edge}" fo:margin-bottom="${look.edge}" fo:margin-left="${look.margin}" fo:margin-right="${look.margin}"/></style:page-layout>
  <text:list-style style:name="Bullets">
    <text:list-level-style-bullet text:level="1" text:bullet-char="${look.bullet}">
      <style:list-level-properties text:list-level-position-and-space-mode="label-alignment">
        <style:list-level-label-alignment text:label-followed-by="listtab" text:list-tab-stop-position="${look.bulletIndent}" fo:text-indent="-0.15in" fo:margin-left="${look.bulletIndent}"/>
      </style:list-level-properties>
    </text:list-level-style-bullet>
  </text:list-style>
</office:automatic-styles>
<office:master-styles><style:master-page style:name="Standard" style:page-layout-name="Page"/></office:master-styles>
<office:body><office:text>
${body.join("\n")}
</office:text></office:body>
</office:document>
`
}

const odtBullets = (bullets: string[]) =>
  bullets.length ? `<text:list text:style-name="Bullets">${bullets.map((bullet) => `<text:list-item>${para("Bullet", xml(bullet))}</text:list-item>`).join("")}</text:list>` : ""

type WriterKind = "classic" | "modern" | "company-first"

function writer(resume: Resume, kind: WriterKind): string {
  // The company-first layout is the classic one, with each job's lines the other way round.
  const look = WRITER_LOOKS[kind === "modern" ? "modern" : "classic"]
  const classic = kind !== "modern"
  const companyFirst = kind === "company-first"
  const contacts = contactsOf(resume).map((item) => (item.href ? odtLink(item.text, item.href) : xml(item.text)))
  const body = [para("Name", xml(resume.profileSection.fullName)), para("Contact", contacts.join(classic ? " | " : " • "))]
  const heading = (text: string) => body.push(para("Heading", xml(classic ? text.toUpperCase() : text)))

  if (resume.summary && !classic) {
    heading("Summary")
    body.push(para("Body", xml(resume.summary)))
  }
  for (const name of sectionsOf(resume)) {
    heading(headingOf(resume, name))
    if (isExperience(name)) {
      for (const job of experiencesOf(resume, name)) {
        if (companyFirst) {
          body.push(para("First", span("B", job.org) + TAB + xml(job.location)))
          body.push(para("Entry", span("I", job.role) + TAB + span("I", job.dates)))
        } else if (classic && name === "Leadership") {
          // "ColorStack - National Member" on one line, as many people write it.
          body.push(para("First", span("B", job.role ? `${job.org} - ${job.role}` : job.org) + TAB + xml(job.dates)))
        } else if (classic) {
          body.push(para("First", span("B", job.role) + TAB + xml(job.dates)))
          body.push(para("Entry", span("I", job.org) + TAB + span("I", job.location)))
        } else {
          body.push(para("First", span("B", job.org) + xml(` – ${job.location}`)))
          body.push(para("Entry", span("I", job.role) + TAB + xml(job.dates)))
        }
        body.push(odtBullets(job.bullets))
      }
    } else if (name === "Education") {
      for (const school of entriesOf(resume, name)) {
        if (companyFirst) {
          const place = school.schoolLocation ? `, ${school.schoolLocation}` : ""
          body.push(para("First", span("B", school.schoolName) + xml(place) + TAB + xml(educationDates(school))))
          body.push(para("Entry", span("I", school.degree) + TAB + span("I", school.gpa ? `GPA: ${school.gpa}` : "")))
        } else if (classic) {
          body.push(para("First", span("B", school.schoolName) + TAB + xml(educationDates(school))))
          body.push(para("Entry", span("I", school.degree + (school.gpa ? `, GPA: ${school.gpa}` : "")) + TAB + span("I", school.schoolLocation)))
        } else {
          body.push(para("First", span("B", school.schoolName) + xml(` – ${school.schoolLocation}`)))
          body.push(para("Entry", xml(school.degree) + TAB + xml(educationDates(school))))
          if (school.gpa) body.push(para("Body", xml(`GPA: ${school.gpa}`)))
        }
        if (school.coursework) body.push(para("Body", span("B", "Relevant Coursework:") + xml(` ${school.coursework}`)))
        if (school.involvement) body.push(para("Body", span("B", classic ? "Involvement:" : "Activities:") + xml(` ${school.involvement}`)))
      }
    } else if (name === "Projects") {
      for (const project of entriesOf(resume, name)) {
        if (classic) {
          body.push(para("First", span("B", `${project.projectName} | ${project.techStack}`) + TAB + xml(project.projectDate)))
        } else {
          body.push(para("First", span("B", project.projectName) + TAB + xml(project.projectDate)))
          body.push(para("Body", span("I", project.techStack)))
        }
        body.push(odtBullets(bulletsOf(project.projectDescription)))
      }
    } else if (name === "Skills") {
      for (const skill of entriesOf(resume, name)) body.push(para("Body", span("B", `${skill.skillName}:`) + xml(` ${skill.skillDetails}`)))
    } else if (name === "Awards") {
      for (const award of entriesOf(resume, name)) {
        body.push(
          classic
            ? para("Entry", span("B", award.awardName) + xml(`, ${award.awardOrg}`) + TAB + xml(award.awardDate))
            : para("Body", span("B", award.awardName) + xml(`, ${award.awardOrg} (${award.awardDate})`)),
        )
      }
    } else {
      entriesOf(resume, name).forEach((publication, index) => {
        const { before, venue, after } = citationOf(publication)
        body.push(para("First", xml(`[${index + 1}] ${before}`) + span("I", venue) + xml(after)))
      })
    }
  }
  return fodt(look, body)
}

function libreOffice(source: string, dir: string): Buffer {
  writeFileSync(path.join(dir, "resume.fodt"), source)
  const profile = `file://${path.join(dir, "profile")}`
  execFileSync("soffice", [`-env:UserInstallation=${profile}`, "--headless", "--convert-to", "pdf", "--outdir", dir, path.join(dir, "resume.fodt")], { stdio: "pipe" })
  return readFileSync(path.join(dir, "resume.pdf"))
}

// ---------------------------------------------------------------- browser

const html = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;")
const a = (text: string, href?: string) => (href ? `<a href="${html(href)}">${html(text)}</a>` : html(text))
const fontFace = (family: string, file: string, weight = 400, style = "normal") =>
  `@font-face { font-family: "${family}"; src: url("file://${path.join(FONTS, file)}"); font-weight: ${weight}; font-style: ${style}; }`

const BASE_CSS = `
@page { size: Letter; margin: 0.5in; }
* { box-sizing: border-box; }
body { margin: 0; color: #111; }
a { color: inherit; text-decoration: none; }
p { margin: 0; }
ul { margin: 2px 0 6px; padding-left: 18px; }
.row { display: flex; justify-content: space-between; gap: 12px; }
.muted { color: #555; }
`

/** Bullets as text ("• ", "– ") with a hanging indent, the way some builders print them. */
const textBullets = (bullets: string[], mark: string) =>
  bullets.map((bullet) => `<div class="tb"><span class="mark">${mark}</span><span>${html(bullet)}</span></div>`).join("")
const TEXT_BULLET_CSS = `.tb { display: flex; margin-left: 10px; } .tb .mark { flex: 0 0 12px; }`
/** Bullets as a list, whose dots browsers draw as shapes rather than text. */
const listBullets = (bullets: string[]) => (bullets.length ? `<ul>${bullets.map((bullet) => `<li>${html(bullet)}</li>`).join("")}</ul>` : "")

const contactLine = (resume: Resume, between: string) =>
  contactsOf(resume)
    .map((item) => a(item.text, item.href))
    .join(between)

const citationHtml = (publication: Resume) => {
  const { before, venue, after } = citationOf(publication)
  return `${html(before)}<i>${html(venue)}</i>${html(after)}`
}

/** A section's entries in a layout, from one function per kind of entry. */
interface HtmlParts {
  experience: (job: Experience, section: string) => string
  education: (school: Resume) => string
  project: (project: Resume) => string
  skill: (skill: Resume) => string
  award: (award: Resume) => string
  publication: (publication: Resume, index: number) => string
}

function sectionHtml(resume: Resume, name: string, parts: HtmlParts): string {
  if (isExperience(name)) return experiencesOf(resume, name).map((job) => parts.experience(job, name)).join("")
  if (name === "Education") return entriesOf(resume, name).map(parts.education).join("")
  if (name === "Projects") return entriesOf(resume, name).map(parts.project).join("")
  if (name === "Skills") return entriesOf(resume, name).map(parts.skill).join("")
  if (name === "Awards") return entriesOf(resume, name).map(parts.award).join("")
  return entriesOf(resume, name).map(parts.publication).join("")
}

const projectLinks = (project: Resume) =>
  [project.projectGithub, project.additionalLink]
    .filter(Boolean)
    .map((url: string) => a(url, `https://${url}`))
    .join(" · ")

/** Like FlowCV or Reactive Resume: one column, role and company on one line, dates on the right. */
function modernHtml(resume: Resume): string {
  const parts: HtmlParts = {
    experience: (job) =>
      `<div class="entry"><div class="row"><p><b>${html(job.role)}</b>${job.role && job.org ? ", " : ""}${html(job.org)}</p><p class="muted">${html(job.dates)}</p></div>${job.location ? `<p class="muted small">${html(job.location)}</p>` : ""}${listBullets(job.bullets)}</div>`,
    education: (school) =>
      `<div class="entry"><div class="row"><p><b>${html(school.schoolName)}</b></p><p class="muted">${html(educationDates(school))}</p></div><div class="row"><p>${html(school.degree)}${school.gpa ? ` · GPA ${html(school.gpa)}` : ""}</p><p class="muted">${html(school.schoolLocation)}</p></div>${school.coursework ? `<p><b>Relevant Coursework:</b> ${html(school.coursework)}</p>` : ""}${school.involvement ? `<p><b>Involvement:</b> ${html(school.involvement)}</p>` : ""}</div>`,
    project: (project) =>
      `<div class="entry"><div class="row"><p><b>${html(project.projectName)}</b> · <i>${html(project.techStack)}</i></p><p class="muted">${html(project.projectDate)}</p></div>${projectLinks(project) ? `<p class="small">${projectLinks(project)}</p>` : ""}${listBullets(bulletsOf(project.projectDescription))}</div>`,
    skill: (skill) => `<p><b>${html(skill.skillName)}:</b> ${html(skill.skillDetails)}</p>`,
    award: (award) => `<div class="row"><p><b>${html(award.awardName)}</b>, ${html(award.awardOrg)}</p><p class="muted">${html(award.awardDate)}</p></div>`,
    publication: (publication) => `<p class="cite">${citationHtml(publication)}</p>`,
  }
  const sections = sectionsOf(resume).map((name) => `<h2>${html(headingOf(resume, name))}</h2>${sectionHtml(resume, name, parts)}`)
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${fontFace("Lato", "Lato-Regular.ttf")}${fontFace("Lato", "Lato-Bold.ttf", 700)}${fontFace("Lato", "Lato-Italic.ttf", 400, "italic")}${fontFace("Lato", "Lato-BoldItalic.ttf", 700, "italic")}
${BASE_CSS}
body { font-family: Lato; font-size: 10pt; line-height: 1.3; }
h1 { font-size: 24pt; margin: 0; }
h2 { font-size: 10.5pt; text-transform: uppercase; letter-spacing: 0.08em; color: #0f766e; border-bottom: 1px solid #99c9c3; margin: 12px 0 5px; padding-bottom: 2px; }
.entry { margin-bottom: 6px; }
.small { font-size: 9pt; }
.cite { margin-bottom: 4px; }
</style></head><body>
<h1>${html(resume.profileSection.fullName)}</h1>
<p class="muted">${contactLine(resume, " · ")}</p>
${resume.summary ? `<h2>Summary</h2><p>${html(resume.summary)}</p>` : ""}
${sections.join("\n")}
</body></html>`
}

/** Like Canva or Novoresume: contact, education and skills in a shaded column on the left. */
function sidebarHtml(resume: Resume): string {
  const side = ["Education", "Skills", "Awards"]
  const parts: HtmlParts = {
    experience: (job) =>
      `<div class="entry"><p class="title">${html(job.role)}</p><p>${html(job.org)}${job.location ? ` · ${html(job.location)}` : ""}</p><p class="muted small">${html(job.dates)}</p>${listBullets(job.bullets)}</div>`,
    education: (school) =>
      `<div class="entry"><p><b>${html(school.schoolName)}</b></p><p>${html(school.degree)}</p><p class="muted">${html(educationDates(school))}</p><p class="muted">${html(school.schoolLocation)}</p>${school.gpa ? `<p>GPA: ${html(school.gpa)}</p>` : ""}${school.coursework ? `<p>Coursework: ${html(school.coursework)}</p>` : ""}</div>`,
    project: (project) =>
      `<div class="entry"><p class="title">${html(project.projectName)}</p><p class="muted small">${html(project.techStack)}${project.projectDate ? ` · ${html(project.projectDate)}` : ""}</p>${listBullets(bulletsOf(project.projectDescription))}</div>`,
    skill: (skill) => `<div class="entry"><p><b>${html(skill.skillName)}</b></p><p>${html(skill.skillDetails)}</p></div>`,
    award: (award) => `<div class="entry"><p><b>${html(award.awardName)}</b></p><p>${html(award.awardOrg)}</p><p class="muted">${html(award.awardDate)}</p></div>`,
    publication: (publication) => `<p class="entry">${citationHtml(publication)}</p>`,
  }
  const block = (name: string) => `<h2>${html(headingOf(resume, name))}</h2>${sectionHtml(resume, name, parts)}`
  const names = sectionsOf(resume)
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${fontFace("TeX Gyre Heros", "texgyreheros-regular.otf")}${fontFace("TeX Gyre Heros", "texgyreheros-bold.otf", 700)}${fontFace("TeX Gyre Heros", "texgyreheros-italic.otf", 400, "italic")}${fontFace("TeX Gyre Heros", "texgyreheros-bolditalic.otf", 700, "italic")}
${BASE_CSS}
@page { margin: 0; }
body { font-family: "TeX Gyre Heros"; font-size: 9pt; line-height: 1.35; }
.page { display: grid; grid-template-columns: 2.4in 1fr; min-height: 11in; }
aside { background: #eef2f6; padding: 0.5in 0.25in 0.5in 0.4in; }
main { padding: 0.5in 0.45in 0.5in 0.3in; }
h1 { font-size: 20pt; margin: 0 0 8px; line-height: 1.1; }
h2 { font-size: 10pt; text-transform: uppercase; letter-spacing: 0.06em; color: #1e3a5f; margin: 14px 0 6px; }
.title { font-weight: 700; font-size: 10pt; }
.entry { margin-bottom: 8px; }
.small { font-size: 8.5pt; }
aside p { overflow-wrap: anywhere; }
</style></head><body><div class="page">
<aside>
<h1>${html(resume.profileSection.fullName)}</h1>
<h2>Contact</h2>${contactsOf(resume)
    .map((item) => `<p>${a(item.text, item.href)}</p>`)
    .join("")}
${names.filter((name) => side.includes(name)).map(block).join("\n")}
</aside>
<main>
${resume.summary ? `<h2>Profile</h2><p>${html(resume.summary)}</p>` : ""}
${names.filter((name) => !side.includes(name)).map(block).join("\n")}
</main>
</div></body></html>`
}

/** Like a European CV or Google Docs' "Modern Writer": dates in a column on the left. */
function datesLeftHtml(resume: Resume): string {
  const entry = (left: string, right: string) => `<div class="entry"><div class="when">${left}</div><div>${right}</div></div>`
  const parts: HtmlParts = {
    experience: (job) =>
      entry(
        `${html(job.dates)}${job.location ? `<br><span class="muted">${html(job.location)}</span>` : ""}`,
        `<p><b>${html(job.role)}</b></p><p><i>${html(job.org)}</i></p>${textBullets(job.bullets, "•")}`,
      ),
    education: (school) =>
      entry(
        `${html(educationDates(school))}<br><span class="muted">${html(school.schoolLocation)}</span>`,
        `<p><b>${html(school.degree)}</b></p><p><i>${html(school.schoolName)}</i></p>${school.gpa ? `<p>GPA: ${html(school.gpa)}</p>` : ""}${school.coursework ? `<p>Relevant coursework: ${html(school.coursework)}</p>` : ""}`,
      ),
    project: (project) =>
      entry(html(project.projectDate), `<p><b>${html(project.projectName)}</b> | ${html(project.techStack)}</p>${textBullets(bulletsOf(project.projectDescription), "•")}`),
    skill: (skill) => entry(`<b>${html(skill.skillName)}</b>`, `<p>${html(skill.skillDetails)}</p>`),
    award: (award) => entry(html(award.awardDate), `<p><b>${html(award.awardName)}</b>, ${html(award.awardOrg)}</p>`),
    publication: (publication) => entry(html(publication.publicationDate), `<p>${citationHtml(publication)}</p>`),
  }
  const sections = sectionsOf(resume).map((name) => `<h2>${html(headingOf(resume, name))}</h2>${sectionHtml(resume, name, parts)}`)
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${BASE_CSS}
${TEXT_BULLET_CSS}
body { font-family: "Liberation Sans"; font-size: 9.5pt; line-height: 1.3; }
h1 { font-size: 22pt; margin: 0; font-weight: 400; }
h2 { font-size: 11pt; margin: 12px 0 6px; padding-bottom: 2px; border-bottom: 2px solid #333; }
.entry { display: grid; grid-template-columns: 1.35in 1fr; gap: 10px; margin-bottom: 7px; }
.when { font-size: 9pt; }
</style></head><body>
<h1>${html(resume.profileSection.fullName)}</h1>
<p class="muted">${contactLine(resume, " | ")}</p>
${resume.summary ? `<h2>Summary</h2><p>${html(resume.summary)}</p>` : ""}
${sections.join("\n")}
</body></html>`
}

/** Section headings in a margin column on the left, with dash bullets. */
function sideHeadingsHtml(resume: Resume): string {
  const parts: HtmlParts = {
    experience: (job) =>
      `<div class="entry"><div class="row"><p><b>${html(job.role)}</b></p><p>${html(job.dates)}</p></div><p><i>${html(job.org)}${job.location ? ` — ${html(job.location)}` : ""}</i></p>${textBullets(job.bullets, "–")}</div>`,
    education: (school) =>
      `<div class="entry"><div class="row"><p><b>${html(school.schoolName)}</b></p><p>${html(educationDates(school))}</p></div><p><i>${html(school.degree)}${school.gpa ? `, GPA ${html(school.gpa)}` : ""}</i></p>${school.involvement ? `<p>Activities: ${html(school.involvement)}</p>` : ""}${school.coursework ? `<p>Coursework: ${html(school.coursework)}</p>` : ""}</div>`,
    project: (project) =>
      `<div class="entry"><div class="row"><p><b>${html(project.projectName)}</b> — ${html(project.techStack)}</p><p>${html(project.projectDate)}</p></div>${textBullets(bulletsOf(project.projectDescription), "–")}</div>`,
    skill: (skill) => `<p><b>${html(skill.skillName)}:</b> ${html(skill.skillDetails)}</p>`,
    award: (award) => `<div class="row"><p><b>${html(award.awardName)}</b>, ${html(award.awardOrg)}</p><p>${html(award.awardDate)}</p></div>`,
    publication: (publication) => `<p class="entry">${citationHtml(publication)}</p>`,
  }
  const sections = sectionsOf(resume).map(
    (name) => `<section><h2>${html(headingOf(resume, name))}</h2><div>${sectionHtml(resume, name, parts)}</div></section>`,
  )
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${fontFace("EB Garamond", "EBGaramond-Regular.ttf")}${fontFace("EB Garamond", "EBGaramond-Bold.ttf", 700)}${fontFace("EB Garamond", "EBGaramond-Italic.ttf", 400, "italic")}${fontFace("EB Garamond", "EBGaramond-BoldItalic.ttf", 700, "italic")}
${BASE_CSS}
${TEXT_BULLET_CSS}
body { font-family: "EB Garamond"; font-size: 11pt; line-height: 1.25; }
h1 { font-size: 26pt; margin: 0; font-weight: 400; }
section { display: grid; grid-template-columns: 1.3in 1fr; gap: 12px; border-top: 1px solid #888; padding: 7px 0; }
h2 { font-size: 10pt; text-transform: uppercase; letter-spacing: 0.1em; margin: 2px 0 0; }
.entry { margin-bottom: 6px; }
</style></head><body>
<h1>${html(resume.profileSection.fullName)}</h1>
<p>${contactLine(resume, " · ")}</p>
${resume.summary ? `<section><h2>Profile</h2><div><p>${html(resume.summary)}</p></div></section>` : ""}
${sections.join("\n")}
</body></html>`
}

/** Like Harvard's career office template: centered headings, organization then role. */
function harvardHtml(resume: Resume): string {
  const parts: HtmlParts = {
    experience: (job) =>
      `<div class="entry"><div class="row"><p><b>${html(job.org)}</b></p><p>${html(job.location)}</p></div><div class="row"><p><i>${html(job.role)}</i></p><p>${html(job.dates)}</p></div>${textBullets(job.bullets, "•")}</div>`,
    education: (school) =>
      `<div class="entry"><div class="row"><p><b>${html(school.schoolName)}</b></p><p>${html(school.schoolLocation)}</p></div><div class="row"><p>${html(school.degree)}${school.gpa ? `. GPA ${html(school.gpa)}` : ""}</p><p>${html(educationDates(school))}</p></div>${school.coursework ? `<p>Relevant Coursework: ${html(school.coursework)}</p>` : ""}${school.involvement ? `<p>Activities: ${html(school.involvement)}</p>` : ""}</div>`,
    project: (project) =>
      `<div class="entry"><div class="row"><p><b>${html(project.projectName)}</b>, <i>${html(project.techStack)}</i></p><p>${html(project.projectDate)}</p></div>${textBullets(bulletsOf(project.projectDescription), "•")}</div>`,
    skill: (skill) => `<p><b>${html(skill.skillName)}:</b> ${html(skill.skillDetails)}</p>`,
    award: (award) => `<div class="row"><p><b>${html(award.awardName)}</b>, ${html(award.awardOrg)}</p><p>${html(award.awardDate)}</p></div>`,
    publication: (publication) => `<p class="entry">${citationHtml(publication)}</p>`,
  }
  const sections = sectionsOf(resume).map((name) => `<h2>${html(headingOf(resume, name))}</h2>${sectionHtml(resume, name, parts)}`)
  return `<!doctype html><html><head><meta charset="utf-8"><style>
${BASE_CSS}
${TEXT_BULLET_CSS}
body { font-family: "Liberation Serif"; font-size: 11pt; line-height: 1.2; }
h1 { font-size: 18pt; text-align: center; margin: 0; }
.contact { text-align: center; margin-bottom: 4px; }
h2 { font-size: 11.5pt; text-align: center; margin: 10px 0 4px; }
.entry { margin-bottom: 6px; }
</style></head><body>
<h1>${html(resume.profileSection.fullName)}</h1>
<p class="contact">${contactLine(resume, " • ")}</p>
${sections.join("\n")}
</body></html>`
}

const HTML_LAYOUTS = {
  "html-modern": modernHtml,
  "html-sidebar": sidebarHtml,
  "html-dates-left": datesLeftHtml,
  "html-side-headings": sideHeadingsHtml,
  "html-harvard": harvardHtml,
}

async function print(browser: Browser, source: string, dir: string): Promise<Buffer> {
  // Opened from a file, so the page can load the fonts next to it.
  const file = path.join(dir, "resume.html")
  writeFileSync(file, source)
  const page = await browser.newPage()
  try {
    await page.goto(`file://${file}`)
    await page.evaluate(() => document.fonts.ready)
    return await page.pdf({ preferCSSPageSize: true, printBackground: true })
  } finally {
    await page.close()
  }
}

// ---------------------------------------------------------------- Typst

let typst: Promise<TypstCompiler> | null = null

/** The Typst compiler resumezip's templates use, with their fonts and a Japanese one from the system. */
function typstCompiler(): Promise<TypstCompiler> {
  typst ??= (async () => {
    const japanese = execFileSync("fc-match", ["-f", "%{file}", "IPAGothic:lang=ja"], { encoding: "utf8" }).trim()
    const files = [...readdirSync(FONTS).filter((file) => /\.(ttf|otf)$/.test(file)).map((file) => path.join(FONTS, file)), japanese]
    const compiler = createTypstCompiler()
    await compiler.init({
      getModule: () => readFileSync(TYPST_WASM),
      beforeBuild: [loadFonts(files.map((file) => new Uint8Array(readFileSync(file))), { assets: false })],
    })
    return compiler
  })()
  return typst
}

async function typstPdf(source: string): Promise<Buffer> {
  const compiler = await typstCompiler()
  compiler.addSource("/resume.typ", source)
  const { result, diagnostics } = await compiler.compile({ mainFilePath: "/resume.typ", format: CompileFormatEnum.pdf, diagnostics: "unix" })
  if (!result) throw new Error(diagnostics?.join("\n") || "Typst made no PDF")
  return Buffer.from(result)
}

// ---------------------------------------------------------------- making the files

async function make(browser: Browser, person: string, layout: Layout) {
  // A hand-written layout is made from its own file; the others print the resume.
  const resume = handWritten(layout) ? {} : JSON.parse(readFileSync(path.join(HERE, person, "resume.json"), "utf8"))
  const dir = mkdtempSync(path.join(tmpdir(), "resumezip-corpus-"))
  try {
    let pdf: Buffer
    if (handWritten(layout)) pdf = await typstPdf(readFileSync(path.join(HERE, person, `${layout}.typ`), "utf8"))
    else if (layout === "latex-jake" || layout === "latex-jake-company-first") pdf = pdflatex(jake(resume, layout === "latex-jake-company-first"), dir)
    else if (layout === "writer-classic" || layout === "writer-modern" || layout === "writer-company-first")
      pdf = libreOffice(writer(resume, layout.slice("writer-".length) as WriterKind), dir)
    else pdf = await print(browser, HTML_LAYOUTS[layout](resume), dir)
    writeFileSync(path.join(HERE, person, `${layout}.pdf`), pdf)
    console.log(`${person}/${layout}.pdf`)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const people = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(FILES)
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || undefined })
try {
  for (const person of people) {
    if (!FILES[person]) throw new Error(`No one called ${person} in FILES`)
    for (const layout of FILES[person]) await make(browser, person, layout)
  }
} finally {
  await browser.close()
}
