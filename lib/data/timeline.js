export const timelineEvents = [
  {
    id: 'exec-order-12b',
    date: '2025-12-15',
    title: 'Executive Order 12-B invokes emergency powers',
    summary: 'President declares a "national security emergency" citing border threats, invoking powers that allow reallocation of military funds and suspension of certain procurement regulations.',
    source: 'Federal Register, Vol. 90, No. 245',
    category: 'executive',
  },
  {
    id: 'doj-memo-2026-01',
    date: '2026-01-22',
    title: 'DOJ issues directive on "sanctuary" jurisdictions',
    summary: 'Department of Justice memo requires local law enforcement to honor all immigration detainer requests or face loss of federal grant funding. Several sheriffs vow noncompliance.',
    source: 'DOJ Press Release',
    category: 'federal',
  },
  {
    id: 'fbi-outreach-2026-02',
    date: '2026-02-10',
    title: 'FBI visits press freedom advocacy groups',
    summary: 'Agents question staff at several press defense organizations about foreign funding and "potential coordination" with leak investigations. Press associations condemn the visits.',
    source: 'Statement from the Press Freedom Defense Coalition',
    category: 'surveillance',
  },
  {
    id: 'ncb-raid-2026-02-28',
    date: '2026-02-28',
    title: 'U.S. Marshals raid nonprofit voter registration offices',
    summary: 'Federal agents execute search warrants on three state-level voter registration nonprofits alleging "fraudulent submission patterns." No arrests made; documents seized.',
    source: 'Court docket: United States v. Georgia Voices, Case No. 1:26-cv-0045',
    category: 'voter-rights',
  },
  {
    id: 'nlrb-oust-2026-03-05',
    date: '2026-03-05',
    title: 'NLRB Chair removed via new "at-will" interpretation',
    summary: 'White House cites newly discovered "executive privilege" doctrine to remove the NLRB Chair, citing inability to "perform duties in alignment with administration policy."',
    source: 'White House Counsel memorandum, March 5, 2026',
    category: 'governance',
  },
  {
    id: 'circuit-stay-2026-03-18',
    date: '2026-03-18',
    title: 'Fifth Circuit stays nationwide injunction on detention policy',
    summary: 'Appeals court blocks lower court ruling that had halted expansion of pretrial detention without counsel for noncitizens.Government announces plan to resume transfers.',
    source: 'Fifth Circuit Order, In re: Department of Homeland Security, No. 23-50489',
    category: 'courts',
  },
  {
    id: 'state-resistance-2026-03-28',
    date: '2026-03-28',
    title: 'Multi-state "Civic Defense" network forms',
    summary: 'Community groups in New Mexico, Arizona, Oregon, Washington, and Colorado announce coordinated mutual aid and legal defense network in response to federal enforcement expansion.',
    source: 'Press release, Civic Defense Coalitions',
    category: 'resistance',
  },
  {
    id: 'digital-infra-2026-04-01',
    date: '2026-04-01',
    title: 'Encryption standards weakened by new regulations',
    summary: 'Commerce Department rollouts rules limiting export of "strong encryption" to certain countries and requiring "backdoor access" for law enforcement for platforms used by more than 100,000 users.',
    source: 'BIS Final Rule, 15 CFR Part 744',
    category: 'digital-rights',
  },
];

export function getTimelineEvents() {
  return timelineEvents.sort((a, b) => new Date(b.date) - new Date(a.date));
}

export function getTimelineEventsByCategory(category) {
  return timelineEvents.filter(event => event.category === category);
}
