#!/usr/bin/env python3
"""Apply the hard vetoes and score a scraped pool against the fit rubric.

Vetoes come from framework/04-job-evaluation.md (Deal-Breakers). A role that trips
any veto is excluded, not scored — a 90-point job that fails one is dropped.

Usage:
  python3 scripts/score_pool.py <pool.json> [--top 15]
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

# ---------------------------------------------------------------- vetoes
VETO_PATTERNS = [
    ("onsite", r"\b(onsite|on-site|presencial|in-office|in office|office-based|"
               r"must be (located|based) (in|near))\b"),
    # Relocation: the candidate is relocation-friendly, so a funded relocation is a
    # POSITIVE and an unfunded requirement is a problem. Surfaced as a flag for the
    # user to judge — never an automatic exclusion.
    ("relocation", r"\b(relocation (required|package|assistance|support|visa)|"
                   r"relocate to|must relocate|relocation (not )?(provided|offered|available))\b"),
    ("visa", r"\b(visa sponsorship (required|needed)|sponsorship required|"
             r"must (be able to|have) (work )?authori[sz]ation|US person|US citizen|"
             r"citizen or permanent resident|clearance required)\b"),
    ("live_coding", r"\b(live coding|live-coding|coding challenge|take[- ]home (test|assignment)|"
                    r"whiteboard (session|interview)|hackerrank|codility)\b"),
    ("language", r"\b(fluent|native|professional|business)[- ](level)?\s*"
                 r"(german|french|portuguese|italian|dutch|polish|russian|mandarin|chinese|japanese|korean|arabic|hindi)\b"),
    ("timezone", r"\b(overlap with (the )?(APAC|asia|australia)|australia hours|"
                r"singapore (time|hours)|sydney (time|hours)|tokyo (time|hours))\b"),
    ("contract", r"\b(part[- ]time|contractor only|1099 only|internship|intern position|"
                 r"fixed[- ]term contract (only|required)|freelance only|project[- ]based only)\b"),
    ("salary", r"\b(unpaid|volunteer (role|position)|equity[- ]only|no salary|"
               r"revenue share only)\b"),
]

# Non-negotiable timezones (LatAm / US / EU only).
# Classified positively against known regions rather than blacklisted, because a
# blacklist of "bad" cities is open-ended (Christchurch, Casablanca, Shanghai and
# Espoo all slipped through an earlier version of this).
LATAM = re.compile(r"\b(chile|brazil|brasil|mexico|méxico|colombia|colômbia|argentina|peru|perú|"
                   r"venezuela|uruguay|paraguay|bolivia|ecuador|panama|panamá|costa rica|"
                   r"guatemala|honduras|el salvador|nicaragua|cuba|dominicana|puerto rico|"
                   r"latam|latin america|san cristobal|caracas|santiago|bogota|buenos aires|"
                   r"lima|montevideo|quito|la paz|asuncion|brasilia|sao paulo|rio de janeiro)\b", re.I)
US = re.compile(r"\b(united states|estados unidos|usa|u\.s\.a?\.|us only|canada|canadá|"
                r"texas|california|new york|florida|washington|illinois|georgia|colorado|"
                r"oregon|virginia|pennsylvania|massachusetts|arizona|north carolina|"
                r"grapevine|miami|seattle|boston|denver|atlanta|austin|remote - usa)\b", re.I)
EU = re.compile(r"\b(spain|españa|espana|france|germany|deutschland|portugal|netherlands|holland|"
                r"belgium|belgique|lithuania|poland|polska|romania|ireland|united kingdom|"
                r"uk only|u\.k\.|sweden|sverige|norway|norge|denmark|finland|suomi|italy|italia|"
                r"austria|switzerland|schweiz|suisse|czech|croatia|hungary|greece|bulgaria|"
                r"estonia|latvia|lithuania|luxembourg|malta|slovakia|slovenia|"
                r"london|paris|madrid|barcelona|lisbon|lisboa|berlin|amsterdam|espoo|helsinki|"
                r"munich|münchen|milan|milano|rome|roma|vienna|warsaw|bucharest|prague|"
                r"europe|european union|eu only)\b", re.I)


def classify_tz(loc: str) -> str:
    """Classify a location string as latam / us / eu / other."""
    if not loc:
        return "other"
    if LATAM.search(loc):
        return "latam"
    if US.search(loc):
        return "us"
    if EU.search(loc):
        return "eu"
    return "other"


# Posting-language detection: the Language Gate reads the requirement stated for the
# role, but a posting written entirely in a third language is itself a strong signal
# that the job is conducted in it — and veto #4 makes a non-EN/ES job condition a hard
# exclusion. Scored by stopword/keyword density over the title plus the description head.
LANG_MARKERS = {
    "en": r"\b(engineer|developer|years|experience|company|team|role|product|remote|senior|"
          r"build|design|work|skills|requirements|join|about|the|and|with|for)\b",
    "es": r"\b(desarrollador|desarrolladora|ingeniero|ingeniera|años|experiencia|empresa|equipo|"
          r"rol|producto|remoto|remota|senior|construir|diseñar|trabajo|habilidades|"
          r"requisitos|unirse|el|la|los|las|con|para|por|del)\b",
    "fr": r"\b(ingénieur|ingénieure|développeur|développeuse|années|expérience|entreprise|équipe|"
          r"rôle|produit|télétravail|senior|construire|concevoir|travail|compétences|"
          r"le|la|les|des|une|avec|pour|dans|sur|au|aux)\b",
    "de": r"\b(entwickler|entwicklerin|jahre|erfahrung|unternehmen|team|rolle|produkt|remote|"
          r"senior|bauen|gestalten|arbeit|fähigkeiten|anforderungen|der|die|das|und|mit|für)\b",
    "pt": r"\b(desenvolvedor|desenvolvedora|engenheiro|engenheira|anos|experiência|empresa|"
          r"equipe|papel|produto|remoto|remota|senior|construir|projetar|trabalho|"
          r"habilidades|o|a|os|as|com|para|por|dos|das)\b",
}


# Strong, unambiguous role-word markers. One of these in the TITLE is decisive:
# a posting titled "Desenvolvedor Full Stack" or "Ingénieur GenAI" is a job
# conducted in that language, even when the description is missing or short.
TITLE_LANG = {
    "es": r"\b(desarrollador|desarrolladora|desarrollo|ingeniero|ingeniera|"
          r"desarrollador(a)? full stack|lider tecnologico)\b",
    "fr": r"\b(ingénieur|ingénieure|développeur|développeuse|concevoir|entreprise)\b",
    "de": r"\b(entwickler|entwicklerin|softwareentwickler|unternehmen)\b",
    "pt": r"\b(desenvolvedor|desenvolvedora|engenheiro|engenheira|empresa)\b",
}


def posting_language(title: str, description: str) -> str:
    t = f"{title} {description[:600]}".lower()
    scores = {lang: len(re.findall(pat, t)) for lang, pat in LANG_MARKERS.items()}
    best = max(scores, key=scores.get)
    if scores[best] >= 5:
        return best
    # Short text (e.g. a LinkedIn search hit with no description): fall back to the
    # title's own role words, which are decisive.
    ttitle = (title or "").lower()
    for lang, pat in TITLE_LANG.items():
        if re.search(pat, ttitle):
            return lang
    return "en"

# ------------------------------------------------------------ fit scoring
# Terms are matched as word-boundary regexes. The earlier substring match counted
# "go" inside "google"/"django"/"category" and "test" inside "latest", inflating
# the tech score for almost every posting.
#
# The stack is the user's real toolkit — the JavaScript ecosystem, Go and PHP with
# Laravel/Symfony. Vue/Angular/React Native round out the JS ecosystem from his CV.
# Python is deliberately a WEAK signal: he does not work with it, so a posting
# built on Python/Django/.NET/Java/Ruby scores lower rather than being vetoed.
STRONG_PATTERNS = [
    r"\bfull[\s-]?stack\b",
    r"\btypescript\b",
    r"\bnode\.?js\b",
    r"\bnext\.?js\b",
    r"\breact\b",
    r"\bjavascript\b",
    r"\bexpress(?:\.?js)?\b",
    r"\bvue(?:\.?js)?\b",
    r"\bangular(?:\.?js)?\b",
    r"\breact native\b",
    r"\bphp\b",
    r"\blaravel\b",
    r"\bsymfony\b",
    # "Go" as a language: bare \bgo\b matches "go to market" / "go live", so it
    # needs programming context — golang, or Go next to a development word.
    r"\bgolang\b|\bgo\b(?=\s*(?:developer|engineer|programmer|backend|microservice|"
    r"language|sdk|gorm|gin|fiber|goroutines|channels))",
    r"\brest[\s-]?api\b",
    r"\bapi design\b",
    r"\bmicroservices?\b",
    r"\bmulti[\s-]?tenant\b",
    r"\bpostgres(?:ql)?\b",
    r"\bmysql\b",
    r"\bmongodb\b",
    r"\bdocker\b",
    r"\bkubernetes\b",
    r"\baws\b",
    r"\bci\s*/\s*cd\b|\bci\s+cd\b",
    r"\btdd\b",
    r"\btest\b",
    r"\be2e\b",
    r"\bjest\b",
    r"\bvitest\b",
]
AI_PATTERNS = [
    r"\bai[\s-]?agent\b", r"\bagentic\b", r"\bllms?\b", r"\blangchain\b",
    r"\blanggraph\b", r"\bcrewai\b", r"\brag\b", r"\bretrieval augmented\b",
    r"\bmcp\b", r"\btool use\b", r"\btool[- ]calling\b", r"\bconversational ai\b",
    r"\belevenlabs\b", r"\bopenai\b", r"\bprompt engineering\b",
]
WEAK_PATTERNS = [
    r"\brust\b", r"\bkotlin\b", r"\bswift\b", r"\bscala\b",
    r"\bmachine learning\b", r"\bdata scientist\b",
    r"\bterraform\b", r"\bpulumi\b", r"\btensorflow\b", r"\bpytorch\b", r"\bscikit\b",
    # Stacks the user does not work with (his stack: JS ecosystem / Go / PHP).
    r"\bpython\b", r"\bdjango\b", r"\.net\b", r"\bc#", r"\bjava\b",
    r"\bruby\b", r"\brails\b", r"\bspring\b",
]

SECTORS = ["fintech", "saas", "e-commerce", "ecommerce", "retail", "software",
           "logistics", "platform", "healthtech", "proptech", "insurtech"]


def text_of(j: dict) -> str:
    # _description is the full body fetched by enrich_linkedin_remote.py; it replaces
    # the (usually empty) search-result description so LinkedIn roles score on real text.
    parts = [j.get("title") or "", j.get("company") or "", j.get("location") or "",
             j.get("_description") or j.get("description") or "",
             " ".join(j.get("tags") or [])]
    return " ".join(parts).lower()


# Patterns that are worth surfacing but are NOT hard vetoes. Relocation is the case in
# point: the candidate is relocation-friendly, so an employer-funded relocation is a
# positive, while office-based work itself is veto #1. Reported separately so the
# shortlist can show "relocation offered" without dropping the role.
FLAG_ONLY = {"relocation"}


REMOTE_ONLY = True  # the user requires every result to be remote


def vetoes(j: dict) -> list[str]:
    t = text_of(j)
    hits = []
    # Remote-only is a hard requirement, not a preference: a posting whose location
    # is not remote is dropped before scoring regardless of how well it matches.
    if REMOTE_ONLY:
        loc = (j.get("location") or "").lower()
        if "remote" in loc:
            pass  # the portal states it directly
        elif j.get("_remote") is True:
            pass  # LinkedIn: confirmed from the posting's own description
        elif "weworkremotely.com" in (j.get("url") or ""):
            pass  # WWR is a remote-only board: every posting is remote by definition
        else:
            hits.append("not_remote")
    for name, pat in VETO_PATTERNS:
        if re.search(pat, t, re.I):
            if name in FLAG_ONLY:
                continue
            hits.append(name)
    # Timezone veto: classify positively against LatAm / US / EU. Anything else
    # (Christchurch, Shanghai, Casablanca, Tashkent, Dhaka, Kyiv...) is out.
    loc = j.get("location") or ""
    loc_l = loc.lower()
    if "remote" not in loc_l and "anywhere in the world" not in loc_l \
            and classify_tz(loc) == "other":
        hits.append("timezone_out_of_scope")
    # Language veto: a posting written entirely in a third language is a job-condition
    # signal for that language (veto #4: non-EN/ES is a hard exclusion).
    lang = posting_language(j.get("title") or "", j.get("description") or "")
    if lang not in ("en", "es"):
        hits.append(f"language_{lang}")
    # GetOnBoard residence restriction (enriched by enrich_getonboard_residence.py):
    # a posting whose residence list excludes Venezuela cannot be applied to — it
    # shows "Your country doesn't match the job's location" on its Apply button.
    if (j.get("_residence") or {}).get("status") == "veto":
        hits.append("residence_not_allowed")
    return hits


def flags(j: dict) -> list[str]:
    """Non-veto signals worth surfacing to the user."""
    t = text_of(j)
    fl = [name for name, pat in VETO_PATTERNS
          if name in FLAG_ONLY and re.search(pat, t, re.I)]
    # Ambiguous residence zone ("South America, Central America or Mexico"): the
    # zone includes Venezuela, but it can still fail in practice — surface it as a
    # flag, never a veto.
    if (j.get("_residence") or {}).get("status") == "flag":
        fl.append("residence_zone")
    return fl


def score(j: dict) -> tuple[int, dict]:
    t = text_of(j)
    strong = sum(1 for p in STRONG_PATTERNS if re.search(p, t))
    ai = sum(1 for p in AI_PATTERNS if re.search(p, t))
    weak = sum(1 for p in WEAK_PATTERNS if re.search(p, t))

    # Technical skills (30%): strong skill hits dominate
    tech = min(100, 30 + strong * 8 + ai * 4 - weak * 12)
    tech = max(0, tech)

    # Experience (25%): AI agent + full-stack domain overlap
    exp = min(100, 40 + ai * 14 + strong * 5)
    exp = max(0, exp)

    # Behavioral (15%): spec/test/ownership signals vs. drainer signals
    beh = 55
    beh += sum(1 for k in ["tdd", "test", "ci/cd", "clean code", "clean architecture",
                           "spec", "ddd", "mentor", "code review"] if k in t) * 6
    beh -= sum(1 for k in ["maintenance", "legacy", "firefight", "on-call", "break things"]
               if k in t) * 10
    beh = max(0, min(100, beh))

    # Location (pass/fail)
    loc = (j.get("location") or "").lower()
    remote = "remote" in loc or j.get("_remote") is True
    # "Anywhere in the World" (WWR's global region) is remote by definition: the
    # posting accepts applicants from every timezone, including the user's.
    loc_ok = remote or "anywhere in the world" in loc or classify_tz(loc) != "other"

    # Career alignment (30%): sector + seniority + stack fit
    car = 50
    car += sum(1 for s in SECTORS if s in t) * 8
    if re.search(r"\b(senior|sr\.?|lead|staff|principal)\b", (j.get("title") or ""), re.I):
        car += 12
    car += ai * 8
    # Laravel-first: when the posting names Laravel and not Symfony, it matches the
    # user's preferred PHP framework exactly.
    if re.search(r"\blaravel\b", t) and not re.search(r"\bsymfony\b", t):
        car += 4
    car = max(0, min(100, car))

    if not loc_ok:
        return 0, {"tech": tech, "exp": exp, "beh": beh, "loc": "FAIL", "car": car}

    overall = round(tech * 0.30 + exp * 0.25 + beh * 0.15 + car * 0.30)
    return overall, {"tech": tech, "exp": exp, "beh": beh, "loc": "PASS", "car": car}


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("pool")
    ap.add_argument("--top", type=int, default=15)
    ap.add_argument("--out", default=None)
    ap.add_argument("--apply-filter", action="store_true",
                    help="keep only postings with Easy Apply (LinkedIn only)")
    args = ap.parse_args()

    jobs = json.load(open(args.pool, encoding="utf-8"))
    kept, dropped = [], []
    for j in jobs:
        # Easy Apply filter: for LinkedIn, only keep if _easy_apply is True
        if args.apply_filter:
            is_linkedin = "linkedin.com" in (j.get("url") or "")
            easy_apply = j.get("_easy_apply")
            if is_linkedin and easy_apply is not True:
                j["_vetoes"] = ["no_easy_apply"]
                dropped.append(j)
                continue
        v = vetoes(j)
        if v:
            j["_vetoes"] = v
            dropped.append(j)
            continue
        s, dims = score(j)
        j["_score"] = s
        j["_dims"] = dims
        fl = flags(j)
        if fl:
            j["_flags"] = fl
        kept.append(j)

    kept.sort(key=lambda x: -x["_score"])
    dropped.sort(key=lambda x: -len(x["_vetoes"]))

    not_remote = sum(1 for j in dropped if "not_remote" in j.get("_vetoes", []))
    print(f"pool: {len(jobs)}  |  passed vetoes: {len(kept)}  |  vetoed: {len(dropped)}"
          f"  (of which not-remote: {not_remote})\n")
    print("=== VETOED (excluded, not scored) ===")
    for j in dropped[:20]:
        print(f"  [{','.join(j['_vetoes'])}] {j.get('title','')[:45]} @ {j.get('company','')[:22]}")

    flagged = [j for j in kept if j.get("_flags")]
    print(f"\n=== TOP {min(args.top, len(kept))} ===")
    for i, j in enumerate(kept[:args.top], 1):
        d = j["_dims"]
        fl = f"  [flags: {','.join(j['_flags'])}]" if j.get("_flags") else ""
        print(f"\n{i:>2}. {j['_score']}/100  {j.get('title','')[:50]}{fl}")
        print(f"     {j.get('company','')} | {j.get('location','')} | {j.get('date','')}")
        print(f"     tech {d['tech']} · exp {d['exp']} · beh {d['beh']} · loc {d['loc']} · car {d['car']}")
        print(f"     {j.get('url','')}")

    if flagged:
        print(f"\n=== FLAGGED (not vetoed, worth your call) ===")
        for j in flagged:
            print(f"  [{','.join(j['_flags'])}] {j.get('title','')[:45]} @ {j.get('company','')[:22]}")

    if args.out:
        json.dump({"kept": kept, "dropped": dropped}, open(args.out, "w"), indent=2)
        print(f"\nwrote {args.out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
