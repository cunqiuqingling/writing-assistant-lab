# Online Public Resources — M3

## Scope

M3 adds an optional browser-side resource center for English Wikipedia and English Wikisource. Opening the resource center itself performs no network request.

A request is made only when the user:

1. searches a term; or
2. chooses a search result and asks to preview the page.

The app does not send learner writing, notes, paragraph plans, practice progress, AI configuration or API keys to Wikimedia.

## Curated catalog

The bundled catalog contains metadata and search prompts only, not copied article text. It has forty entries:

- 10 IELTS Writing topics;
- 10 Academic Writing topics;
- 10 Pharmacy & Biomedicine topics;
- 10 Literature/Wikisource starting points.

Curated items resolve through live search so a renamed or disambiguated page can still be reviewed before import.

## Network boundary

Only these endpoints are permitted by the M3 client:

- `https://en.wikipedia.org/w/api.php`
- `https://en.wikisource.org/w/api.php`

Requests are unauthenticated, omit credentials and use MediaWiki CORS with `origin=*`.

## Import flow

```text
Curated item or manual search
→ Wikimedia search results
→ user selects one page
→ fetch and sanitise page HTML
→ local chapter preview
→ user reviews title, source, licence and chapters
→ save to IndexedDB
```

Remote HTML is never inserted directly into the Practice Library. The parser removes navigation, references, scripts, forms, tables, media and other non-practice elements, then converts allowed headings and text blocks into plain-text chapters.

## Copyright and attribution

Wikipedia and Wikisource are discovery sources, not a blanket permission to redistribute every page or work. The import preview preserves the source URL and displays a source-specific licence reminder. Users should verify the original page before republishing imported text.

## Limits

- 10 search results per request;
- 20-second request timeout;
- 5,000,000 characters of remote HTML;
- 350,000 characters of retained practice text;
- up to 180 generated chapters after long-section splitting.

These are browser-safety limits, not guarantees that every wiki page will parse perfectly.
