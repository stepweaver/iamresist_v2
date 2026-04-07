export const journalEntries = [
  {
    slug: 'civic-resistance-network-expands',
    title: 'Civic Resistance Network Expands Into Five New States',
    date: '2026-03-28',
    excerpt: 'Grassroots alliances are organizing legal support and mutual aid in response to federal overreach, with coordinated structure emerging across state lines.',
    author: 'Maya Rodríguez',
    category: 'ORGANIZING',
    content: `
When federal agents began demanding local law enforcement comply with immigration enforcement tasks earlier this year, no one knew how communities would respond. Three months later, a decentralized network of civic resistance groups has emerged—spanning five states and growing.

The network, operating under the banner "Civic Defense Coalitions," has established secure communication channels, legal aid pipelines, and rapid response protocols. What began as scattered county-level resistance has coalesced into something resembling a parallel infrastructure.

"People are realizing that waiting for institutional protection is no longer viable," said María Santos, a coordinator in New Mexico. "We're building the safeguards ourselves."

The coalitions operate on three core principles: nonviolent civil disobedience, legal preparedness, and mutual aid. Each local chapter maintains autonomy while adhering to shared security practices developed by legal advisors with experience in previous movements.

Federal officials have not commented publicly on the coalitions' growth. Local sheriffs in several counties have signaled tacit support, refusing to prioritize immigration enforcement tasks over community policing.

The expansion continues, with organizers in three additional states currently forming chapters.
    `.trim(),
  },
  {
    slug: 'press-freedom-under-siege',
    title: 'Press Freedom Under Siege: Journalists Face New Legal Threats',
    date: '2026-03-15',
    excerpt: 'A pattern of subpoenas and prior restraints emerges as lawsuits against mainstream and independent media multiply, chilling investigative reporting.',
    author: 'Thomas Webb',
    category: 'REPORTING',
    content: `
The Committee to Protect Journalists counted at least 17 separate legal actions against news organizations in the first quarter of 2026—a number that surpasses any full year in the past decade. The cases range from defamation suits to grand jury subpoenas seeking source information.

What unites them is not just the plaintiffs—often government-aligned entities or individuals—but the legal theories being advanced. Several cases attempt to bypass traditional reporter privileges by applying commercial or national security frameworks to ordinary newsgathering.

"These aren't random lawsuits," said legal scholar Dr. Arjun Patel at the University of Michigan. "They're part of a coherent strategy to drain resources, create uncertainty, and ultimately silence critical voices."

The effect is already apparent. Small independent outlets have folded rather than face protracted litigation. Larger organizations have reassigned investigative teams to areas with lower legal risk.

Press freedom groups are mobilizing a defensive response, but resources are strained. The Press Legal Defense Fund reports a 400% increase in requests for assistance compared to last year.

The situation has prompted calls for state-level shield law strengthening and the formation of journalist collectives to share legal resources. Whether these measures will suffice remains an open question.
    `.trim(),
  },
  {
    slug: 'voter-registration-drive-adapts',
    title: 'Voter Registration Drive Adapts in Face of New Restrictions',
    date: '2026-02-28',
    excerpt: 'Community organizations modify tactics after aggressive audit threats and documentation requirements threaten to suppress registration efforts.',
    author: 'Elena Chen',
    category: 'CIVIC ACTION',
    content: `
The National Voter Registration Act of 1993 has long protected community-based registration efforts. But new state-level enforcement actions are exploiting loopholes to challenge and intimidate organizations conducting voter registration drives.

In Georgia, Texas, and Florida, state election boards have issued warnings about "potential fraud" in registration submissions, demanding thousands of pages of documentation within tight deadlines. The requests appear calculated to overwhelm small nonprofit organizations.

"Normally we submit 2,000 registrations a month," explained Diego Morales of Georgia Voices. "Now we're spending all our time responding to document requests instead of registering voters."

The strategy has had a measurable effect. Registration rates in targeted communities have dropped by an estimated 35% compared to previous cycles.

In response, organizations are shifting to digital-first strategies and focusing on early registration periods before enforcement actions can mount. They're also building legal defense capabilities and documenting every interaction with officials.

Some groups are training "registration navigators" who assist voters in completing forms correctly and providing direct support rather than bulk submission. The approach is slower but less legally vulnerable.

With midterm elections approaching, the battle over who gets to participate continues—just with a reshaped battlefield.
    `.trim(),
  },
  {
    slug: 'digital-rights-coalition-forms',
    title: 'Digital Rights Coalition Forms to Counter Mass Data Collection',
    date: '2026-02-10',
    excerpt: 'Technology activists and privacy advocates announce coordinated effort to develop alternatives to mainstream platforms and protect digital organizing spaces.',
    author: 'Jordan Lee',
    category: 'TECH RESISTANCE',
    content: `
A coalition of digital rights organizations has launched the "Resistant Infrastructure Project," an ambitious effort to create decentralized, secure alternatives to mainstream digital tools that are increasingly used for surveillance and deplatforming.

The initiative, announced at a closed gathering in Denver, brings together expertise from encryption specialists, decentralized protocol developers, and veteran activists who have seen their online organizing spaces compromised.

"We've relied too long on infrastructure we don't control," said project coordinator Alex Harper. "When platforms decide to remove accounts or hand over data, movements get disrupted. We're building alternatives that can't be shut down by a single boardroom decision."

The project's first outputs include:
- An open-source, self-hosted video conferencing system with end-to-end encryption
- A federated social platform designed for group coordination rather than virality
- Secure file-sharing tools specifically for activist documentation
- Training materials on operational security for community organizers

Funding comes from a mix of foundation grants and direct small donations. The code will be released under permissive licenses to allow wide adoption and modification.

The coalition acknowledges the steep technical and adoption challenges but points to recent events as proof of necessity. "When the infrastructure you depend on becomes hostile, you have no choice but to build your own," Harper said. "We're starting now."
    `.trim(),
  },
];

export function getJournalEntryBySlug(slug) {
  return journalEntries.find(entry => entry.slug === slug);
}

export function getAllJournalSlugs() {
  return journalEntries.map(entry => entry.slug);
}

export function getRecentJournalEntries(limit = 5) {
  return [...journalEntries]
    .sort((a, b) => new Date(b.date) - new Date(a.date))
    .slice(0, limit);
}
