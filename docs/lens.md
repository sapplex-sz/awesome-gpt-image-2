# Lens

Lens is an optional phone-first companion to the main GPT-Image2 gallery.

- URL: `/lens` (for example https://gpt-image2.canghe.ai/lens)
- Data: the same generated `data/cases.json` and `data/style-library.json` as the homepage
- Features: two-column case grid, category chips, industrial templates, bottom-sheet prompt copy, local favorites without sign-in
- Language: follows the existing `language` localStorage key (`zh` / `en`)

It does not replace the main site. Auth, generation, billing, and the community page stay on `/`.

Local preview:

```bash
npm run dev
```

Then open `/lens`.
