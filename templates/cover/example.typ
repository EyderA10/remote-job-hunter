// Cover letter template — Typst port of the repo's cover.cls.
// Reference for structure; /apply writes output/cover_letters/<company>_<role>.typ.
//
// Hard limit (framework/06-cover-letter-templates.md): EXACTLY 1 page.
// Language: match the language of the job posting. The CV language is a profile-level
// choice; the cover letter follows the posting.
//
// Fill the #let values, then replace the <PLACEHOLDER> markers in the body.

#set document(author: "<NAME>", title: "<NAME> — Cover letter")

#set page(
  paper: "a4",
  margin: (x: 22mm, y: 20mm),
)

#set text(font: "Ubuntu Sans", size: 10.5pt, lang: "en", region: "US")
#set par(leading: 0.68em, justify: true)

// ---- identity (fill these) ----------------------------------------------
#let name = "<NAME>"
#let email = "<EMAIL>"
#let phone = "<PHONE>"
#let date = "<DATE>"

#let hiring-manager = "<HIRING_MANAGER>"
#let company = "<COMPANY>"
#let company-address = "<COMPANY_ADDRESS>"
#let role = "<ROLE>"

#let ink = rgb("#1f2937")
#let muted = rgb("#6b7280")

// ---- sender block --------------------------------------------------------
#align(right)[
  #set text(size: 9pt, fill: muted)
  #name \
  #email \
  #phone
]

#v(4mm)
#text(size: 9pt, fill: muted, date)

#v(2mm)
#text(weight: "bold", hiring-manager)
#text(fill: muted, company)
#text(fill: muted, company-address)

#v(4mm)
#text(weight: "bold", "Re: " + role)

#v(2.5mm)
Dear #text(weight: "bold", "<HIRING_MANAGER_SURNAME>"),

#v(1.5mm)
<OPENING_PARAGRAPH: name the role, name the company, state the single strongest match.>

#v(0.5mm)
<BODY_PARAGRAPHS: connect specific experience to the posting's requirements. Every claim
must be grounded in framework/01-candidate-profile.md — no invented skills, metrics, or
employers. Address a genuine gap with an honest bridge, not by hiding it.>

#v(0.5mm)
<CLOSING_PARAGRAPH: why this company, availability, reference/requisition ID if the
posting gives one.>

#v(4mm)
#align(left)[
  #text(weight: "bold", "Sincerely,") \
  #v(6mm)
  #text(weight: "bold", name) \
  #text(size: 8.5pt, fill: muted, email + "  ·  " + phone)
]
