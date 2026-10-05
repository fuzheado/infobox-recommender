// lib/families.js — the template "specificity ladder": which infobox templates
// are variants of the same thing.
//
// Why (2026-10-05): the four legacy eval failures were template-FAMILY
// confusions, not genre mistakes — {{Infobox officeholder}} vs {{Infobox person}},
// {{Infobox publisher}} vs {{Infobox company}}, {{Automatic taxobox}} vs
// {{Infobox fossil}}. A tool that only counts exact template names treats those as
// disagreement and, with a small pool, picks the most specific variant and calls it
// a recommendation (cap-25 runs recommended {{Infobox badminton player}} where the
// genre's editors chose {{Infobox person}}). Grouping members into families lets the
// tool say "the biographical family covers 78% of boxed peers — most used:
// {{Infobox officeholder}}; general fallback: {{Infobox person}}" instead of
// pretending there is no signal, or pretending the member and the base agree.
//
// Curation: hand-written, bounded by evidence rather than recall —
//   * `scripts/research/build-family-map.mjs` counts how often each template really
//     appears in peer pages (top 100 ≈ 90% of instances), which is what decides
//     which families are worth having;
//   * every `base` was checked to exist as a template (a missing one would be an
//     invented name — {{Infobox military formation}}, {{Infobox sculpture}} and
//     {{Infobox suburb}} failed that check and are not used);
//   * every `members` entry appears in real peer pages or in a corpus label.
// The Wikipedia category tree is NOT a usable source here: 94 of the top 120
// templates sit in the catch-all Category:Infobox templates.
//
// A template belongs to at most one family (`base` included). Overlaps were
// resolved deliberately: {{Infobox monument}} and {{Infobox military memorial}} are
// artworks (memorials are usually sculptures) rather than buildings.

export const FAMILIES = [
  {
    id: 'person',
    label: 'biographical',
    base: 'Infobox person',
    members: [
      'Infobox person', 'Infobox officeholder', 'Infobox musical artist', 'Infobox writer',
      'Infobox military person', 'Infobox artist', 'Infobox scientist', 'Infobox sportsperson',
      'Infobox academic', 'Infobox royalty', 'Infobox noble', 'Infobox Christian leader',
      'Infobox saint', 'Infobox criminal', 'Infobox comics creator', 'Infobox social media personality',
      'Infobox football biography', 'Infobox cricketer', 'Infobox badminton player', 'Infobox model',
      'Infobox philosopher', 'Infobox engineer', 'Infobox architect', 'Infobox economist',
    ],
  },
  {
    id: 'settlement',
    label: 'place',
    base: 'Infobox settlement',
    members: [
      'Infobox settlement', 'Infobox UK place', 'Infobox German place', 'Infobox Italian comune',
      'Infobox Russian inhabited locality', 'Infobox former subdivision', 'Infobox U.S. state',
      'Infobox Australian electorate',
    ],
  },
  { id: 'country', label: 'country', base: 'Infobox country', members: ['Infobox country', 'Infobox former country'] },
  {
    id: 'organization',
    label: 'organization',
    base: 'Infobox organization',
    members: [
      'Infobox organization', 'Infobox company', 'Infobox publisher', 'Infobox restaurant',
      'Infobox university', 'Infobox political party', 'Infobox government agency', 'Infobox laboratory',
      'Infobox museum', 'Infobox brand', 'Infobox football club', 'Infobox school', 'Infobox hospital',
      'Infobox record label', 'Infobox school district',
    ],
  },
  {
    id: 'structure',
    label: 'building or structure',
    base: 'Infobox building',
    members: [
      'Infobox building', 'Infobox church', 'Infobox religious building', 'Infobox station',
      'Infobox bridge', 'Infobox venue', 'Infobox historic site', 'Infobox NRHP', 'Infobox dam',
      'Infobox airport', 'Infobox power station',
    ],
  },
  {
    id: 'geography',
    label: 'geographic feature',
    base: 'Infobox landform',
    members: [
      'Infobox landform', 'Infobox mountain', 'Infobox river', 'Infobox body of water',
      'Infobox protected area', 'Infobox street', 'Infobox urban feature', 'Infobox road',
      'Infobox rail line', 'Infobox rail',
    ],
  },
  {
    id: 'astronomical',
    label: 'astronomical object',
    base: 'Infobox astronomical object',
    members: [
      'Infobox astronomical object', 'Infobox galaxy', 'Infobox planet', 'Infobox quasar',
      'Infobox open cluster', 'Infobox star', 'Infobox nebula', 'Infobox asteroid', 'Infobox constellation',
    ],
  },
  {
    id: 'taxon',
    label: 'taxon',
    base: 'Taxobox',
    members: [
      'Taxobox', 'Automatic taxobox', 'Speciesbox', 'Subspeciesbox', 'Infraspeciesbox', 'Virusbox',
      'Infobox fossil', 'Infobox animal breed',
    ],
  },
  { id: 'chemical', label: 'chemical substance', base: 'Chembox', members: ['Chembox', 'Drugbox', 'Infobox drug', 'Infobox enzyme'] },
  {
    id: 'food',
    label: 'food or drink',
    base: 'Infobox food',
    members: ['Infobox food', 'Infobox drink', 'Infobox prepared food', 'Infobox beverage', 'Infobox nutritional value'],
  },
  {
    id: 'print',
    label: 'publication',
    base: 'Infobox book',
    members: [
      'Infobox book', 'Infobox document', 'Infobox magazine', 'Infobox newspaper',
      'Infobox comic book title', 'Infobox short story',
    ],
  },
  {
    id: 'screen',
    label: 'film or television work',
    base: 'Infobox television',
    members: ['Infobox television', 'Infobox film', 'Infobox television episode'],
  },
  {
    id: 'music',
    label: 'music release',
    base: 'Infobox album',
    members: ['Infobox album', 'Infobox song', 'Infobox single', 'Infobox musical composition', 'Infobox concert'],
  },
  {
    id: 'artwork',
    label: 'artwork or memorial',
    base: 'Infobox artwork',
    members: ['Infobox artwork', 'Infobox monument', 'Infobox military memorial'],
  },
  {
    id: 'conflict',
    label: 'conflict or attack',
    base: 'Infobox military conflict',
    members: ['Infobox military conflict', 'Infobox civilian attack', 'Infobox military operation'],
  },
  {
    id: 'legislation',
    label: 'legislation',
    base: 'Infobox U.S. legislation',
    members: ['Infobox U.S. legislation', 'Infobox UK legislation'],
  },
  { id: 'unit', label: 'military formation', base: null, members: ['Infobox military unit', 'Infobox military installation'] },
];

const BY_TEMPLATE = new Map();
for (const f of FAMILIES) {
  for (const m of f.members) {
    // A template in two families would make advice depend on Map iteration order.
    if (BY_TEMPLATE.has(m) && BY_TEMPLATE.get(m) !== f.id) {
      throw new Error(`families.js: "${m}" is listed in two families (${BY_TEMPLATE.get(m)}, ${f.id})`);
    }
    BY_TEMPLATE.set(m, f.id);
  }
}

const BY_ID = new Map(FAMILIES.map((f) => [f.id, f]));

/** Family id for a template name, or null when it is not in the map. */
export const familyOf = (template) => (template ? BY_TEMPLATE.get(String(template).trim()) ?? null : null);
export const familyById = (id) => BY_ID.get(id) ?? null;

/** Same family (and not merely both unmapped). */
export const sameFamily = (a, b) => {
  const x = familyOf(a);
  return x != null && x === familyOf(b);
};

/** How much of the map a set of templates covers — used by the docs/tests. */
export const mappedCount = () => BY_TEMPLATE.size;
