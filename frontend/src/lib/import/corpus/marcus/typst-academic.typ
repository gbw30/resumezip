// A made-up academic CV, written by hand in Typst in the shape of a real one
// the parser read wrong: a left column of dates, descriptions written as
// paragraphs, sub-headings, headings it doesn't know ("Current Employment",
// "Academic Service"), page numbers, a phone number that links to tel:,
// links behind icons with no text, two degrees under one school, awards
// with a line about each, numbered citations across a page break, and
// Japanese beside the English. `make.mts` compiles it as it is.
//
// Its answer, resume.json, is what someone would type into the editor to
// print the same: entries under "Current Employment", "Experience" and
// "Teaching" are all work, "Academic Service" is leadership, and "Research
// Interests" is a row of skills. Lines with no field to go in (departments,
// advisors, a line about an award, mentoring) belong in "Couldn't place".

#set document(title: "Marcus J. Ferreira", author: "Marcus J. Ferreira", date: none)
#set page(paper: "us-letter", margin: (left: 68pt, right: 74pt, top: 56pt, bottom: 60pt), numbering: "1")
// EB Garamond runs narrower than most fonts, so it is set a little bigger.
#set text(font: ("EB Garamond", "IPAGothic"), size: 10.8pt, lang: "en")
#set par(justify: true, leading: 0.5em, spacing: 0.75em)
#show link: it => underline(offset: 2pt, stroke: 0.4pt + luma(150), it)

// The date column, and how far everything else is set in.
#let col = 79pt

#let section(title) = block(above: 13pt, below: 7pt, sticky: true, text(size: 12pt, weight: "bold", title))
#let dated(when, body) = block(above: 7pt, grid(columns: (col, 1fr), when, body))
#let sub(title) = block(above: 7pt, below: 5pt, sticky: true, box(width: col - 8pt, align(right, text(weight: "bold", style: "italic", title))))
#let org(name, place) = block(above: 8pt, below: 6pt, pad(left: col, [#text(weight: "bold", smallcaps(name)) #h(1fr) #place]))
#let inset(body) = pad(left: col + 17pt, body)
#let cite(n, body) = block(above: 6pt, grid(columns: (col, 1fr), align(right)[\[#n\] #h(8pt)], body))
#let icon(url, shape) = link(url, box(shape))

#text(size: 20pt, weight: "bold")[Marcus J. Ferreira #h(6pt) (フェレイラ・マーカス)]
#v(-4pt)
#grid(
  columns: (60pt, 1fr, auto),
  [],
  [Robotics Teaching Lab \ 1200 Innovation Drive \ Hall of Engineering, Room 214 \ West Lafayette, IN],
  align(right)[
    #link("mailto:ferreira@example.com")[ferreira\@example.com] \
    #link("tel:+17655550142")[(765) 555-0142] \
    #icon("https://linkedin.com/in/marcus-ferreira-lab", box(width: 7pt, height: 7pt, fill: black, radius: 1pt))
    #icon("https://marcusferreira.dev", circle(radius: 3.5pt, fill: black))
    #icon("https://github.com/mferreira-lab", box(width: 7pt, height: 7pt, fill: black, radius: 3.5pt))
  ],
)

#section[Current Employment]
#org[Purdue University (PU)][_West Lafayette, IN_]
#inset[
  Lab Manager & Instructional Staff \
  Robotics Teaching Lab \
  School of Engineering Education \
  College of Engineering
]
#inset(list(
  indent: 5pt,
  body-indent: 4pt,
  [*Operations:* Run a 2,800 sq. ft. robotics teaching lab serving 120+ students per semester, partner student teams, and department outreach events; supervise two lab assistants and four TAs.],
  [*Equipment:* Oversee \$80,000+ in robots, sensors, and test equipment, including motion-capture cameras, 3D printers, and a laser cutter; chose and bought the lab’s robot arms and led its full rebuild.],
  [*Safety & Compliance:* Run access control, safety training, and incident response; coordinate with Purdue Facilities, Environmental Health, and ITaP on equipment approvals, upkeep, and computing projects.],
  [*Budget:* Handle purchasing for the lab, the ME program, and BoilerHacks (\$40,000 in sponsorship funds for BoilerHacks) across a \$30,000 program budget, supply funds, and equipment fee accounts.],
  [*Systems:* Built request forms for parts and club orders, and a GitHub Issues–based ticketing system with automatic print-time estimates.],
  [*Research & Outreach:* Support faculty research with Dr. Ana Lucia Reyes and Dr. Samuel Whitfield; lead lab tours for visitors and sponsors; teach ENGR 2030 on robotics careers for first-year students.],
))

#section[Education]
#org[Purdue University (PU)][_West Lafayette, IN_]
#inset[
  M.S. in Mechanical Engineering, May 2027 \
  _Mentor:_ Prof. Ana Lucia Reyes

  B.S. (Honors) in Mechanical Engineering, December 2025 \
  _Thesis:_ Teaching Robot Kinematics with Physical Models: A Constructivist Approach for First-Year Robotics Students \
  _Advisor:_ Prof. Ana Lucia Reyes
]
#org[Tohoku University (東北大学)][_(日本・仙台)_ #h(8pt) _Sendai, Japan_]
#inset[
  Study Abroad, Purdue in Japan: Robotics & Society, Summer 2025 \
  _Research Project:_ Mapping Earthquake Damage with Small Drones \
  _Advisor:_ Dr. Kenji Mori (森健二)
]

#section[Research Interests]
#pad(left: col)[Engineering Education, Lab Infrastructure, Mobile Robotics, Embedded Systems, Digital Fabrication, Human–Robot Interaction, AI in Education.]

#section[Technical Skills]
#pad(left: col)[
  *Infrastructure & Systems:* Linux, Docker, Kubernetes, networking, access control, ticketing and inventory systems \
  *Lab & Fabrication:* Motion capture, oscilloscopes and test equipment, 3D printing, laser cutting, CNC milling, and machine shop tools \
  *Embedded & Software:* Microcontrollers (ESP32, Arduino), ROS 2, Python, C, C++, MATLAB, SQL, and TypeScript
]

#section[Experience]
#dated[2026][
  *Study Abroad Instructional Staff (#link("https://example.com/purdue-in-japan")[Purdue in Japan: RAS])* #h(1fr) _Purdue Univ., Sendai, Japan_

  Supported a 10-week Purdue engineering study abroad program to Sendai, Japan during Summer 2026, combining Japanese language study with robotics and culturally aware design courses for 40 undergraduate and graduate students. Guided team projects between Purdue and Tohoku University students, ending in final demos for faculty and staff from both universities, alongside internships with a local nonprofit. Coordinated student field trips and cultural activities, and held full (director-level) responsibility for program operations during the final week.
]
#dated[2023 – 2025][
  *Lead Teaching Assistant, #link("https://example.com/me-3410")[Robot Kinematics]* #h(1fr) _Purdue Univ., West Lafayette, IN_

  Rebuilt the course’s MATLAB labs and rubrics and built a Dockerized autograder on Gradescope, cutting grading time from 12+ hours to about 3 per TA and giving students instant feedback on submissions. Built automatic plagiarism checks and a quiz grading tool that works with Brightspace. Started using an open-source online homework system to bring required course material costs from over \$90 to under \$10. These tools supported the course’s growth to nearly 600 students per semester.
]
#dated[2024][
  *Software Engineer Intern (Maps \@ RouteWise)* #h(1fr) _Microsoft Corp., Redmond, WA, USA_

  Designed a caching layer that cut costly API calls and latency in RouteWise’s trip report generation. Enabled cross-team permission checks for services supporting a new offline report service, and worked with partner teams to reduce load on a key internal service by providing a second access path.
]
#dated[2023][
  *Software Engineer Intern (Teams \@ Workplace)* #h(1fr) _Microsoft Corp., Redmond, WA, USA_

  Built a Slack integration for Workplace Teams to improve weekly employee–manager check-ins. Architected and deployed it on Azure (Functions, Key Vault, API Management) with a focus on security and scalability, and wrote and documented APIs connecting Slack to existing internal services. Presented the integration at the summer intern showcase to the Workplace leadership team, and handed it off with a runbook for on-call engineers.
]

#section[Awards and Honors]
#dated[2026][
  #link("https://example.com/rising-leader")[Rising Leader Award], Purdue Student Life Awards

  Awarded to BoilerHacks XI while serving as Vice-President & Staff Advisor.
]
#dated[2025][
  #link("https://example.com/coe-award")[Engineering Student Society Award for Excellence], Purdue CoE

  Awarded to BoilerHacks for BoilerHacks X while serving as Director of Technology.
]
#dated[2022][
  #link("https://example.com/boilermake")[1st Place Overall], BoilerMake

  Designed and built Balancer, a self-balancing robot with obstacle detection and path planning, in under 36 hours at the Midwest’s largest hackathon.
]

#section[Research and Publications]
#sub[Conference]
#cite(1)[*M. Ferreira*, D. L. Hart, A. L. Reyes, J. K. Okafor, P. S. Lindqvist Moreno, R. Bianchi, T. N. Ward, and E. V. Sato, “Low-cost localization for greenhouse inspection robots,” ASABE Paper No. 2600531, _ASABE Annual International Meeting_, Indianapolis, IN, Jul. 12–15, 2026, doi: #link("https://doi.org/10.13031/aim.202600531")[10.13031/aim.202600531].]
#sub[Advising]
#cite(2)[L. Park, H. Ortiz, A. L. Reyes, and *M. Ferreira*, “Boiler Proctor: Integrating Safe Exam Browser with Brightspace,” Senior Design Project, School of Electrical and Computer Engineering, Purdue University, West Lafayette, IN, USA, Apr. 2026.]
#sub[Thesis]
#cite(3)[*M. Ferreira*, “Teaching robot kinematics with physical models: A constructivist approach for first-year robotics students,” B.S. honors thesis, School of Engineering Education, Purdue University, West Lafayette, IN, USA, 2025.]

#section[Academic Service]
#dated[2025 - Present][
  Advisor for several student organizations

  #link("https://example.com/boilerhacks")[BoilerHacks] (_XI_, _XII_), #link("https://example.com/pru")[Purdue Robotics Union (PRU)], #link("https://example.com/orc")[Open Robotics Club (ORC)]. Advised the development of BoilerHacks’ current event check-in platform, in use for two years.
]
#dated[2025][Vice-President, #link("https://example.com/boilerhacks-xi")[BoilerHacks XI]]
#dated[2024 - 2025][Technical Director, #link("https://example.com/pru")[Purdue Robotics Union (PRU)]]
#dated[2024 - 2025][
  Director of Technology, #link("https://example.com/boilerhacks-x")[BoilerHacks X]

  Led a team of three developers to build HackDesk, a platform managing registration, applications, check-in, attendance, and payments for a 600-person event.
]
#dated[2022 - 2024][Technical Lead, #link("https://example.com/orc")[Open Robotics Club (ORC)]]

#section[Teaching and Mentoring Experience]
#sub[Teaching]
#dated[2026][
  *Instructional Staff*, #link("https://example.com/purdue-in-japan")[Purdue in Japan: RAS], ME 49700 / ME 59700 #h(1fr) _Sendai, Japan_

  Mobile Robot Programming, Robots in Society, and Principles of Culturally Aware Design.
]
#dated[2025 - Present][*Instructional Staff*, #link("https://example.com/me-4630")[ME 4630/4640] - Robotics Design 1/2 #h(1fr) _West Lafayette, IN_]
#dated[2023 - 2025][*Lead Teaching Assistant*, #link("https://example.com/me-3410")[ME 3410] - Robot Kinematics #h(1fr) _West Lafayette, IN_]
#sub[Mentoring]
#dated[Purdue Univ.][*J. K. Okafor* → Boeing, *T. N. Ward* → Caterpillar, *E. V. Sato* → Cummins, *P. S. Lindqvist Moreno*, *R. Bianchi*. Undergraduate team; coauthored conference paper on low-cost localization for greenhouse inspection robots.]
#dated[Purdue Univ.][*L. Park* → Salesforce, *H. Ortiz* → Eli Lilly. Senior design team, “Boiler Proctor: Integrating Safe Exam Browser with Brightspace,” 2026.]
