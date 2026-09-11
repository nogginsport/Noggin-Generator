# Internal studio: HEX inputs and swap colours

Open internal-studio.html in a browser. It uses the same existing public rendering endpoint as the previous internal HTML file; no new endpoint, environment variable or access key is needed.

- Adds HEX fields alongside the two main colour pickers and each per-concept colour picker.
- Accepts six-digit HEX and short three-digit HEX, with or without #.
- Swap exchanges the primary and secondary colours and rebuilds the three concept presets. This resets per-concept manual overrides, just like changing a main colour in the existing generator.
- Invalid HEX values block generation with a readable error.
- No custom wording, Pantone lookup or backend changes.
- Existing customer-logo upload, rendering, downloads and sharing code are preserved.
- This remains the existing internal-use page, not a newly authenticated portal.

The draft adds only this page and these instructions. No public generator, GA4/GTM, Typeform, Sheets or scheduled report files are changed.
