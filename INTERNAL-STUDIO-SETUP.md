# Internal mock-up studio update

This branch adds an internal page and separate API route. Existing public files are unchanged.

## Deployment
1. Deploy this branch to Vercel with the existing SudoMock, Blob, KV and product environment variables.
2. Add a strong shared secret as INTERNAL_STUDIO_KEY in the deployment environment. Share it privately with Kieran and Conor; never put it in the HTML or commit it.
3. Open /internal-studio.html on that deployment and enter the key.
4. Render a customer logo with Noggin unchanged, then with VILLA, then a longer word. Check caps and beanies at full size. This live render check has not yet been performed.

## Features and limits
- Custom text: blank preserves Noggin, up to 24 English letters/numbers/basic punctuation. Uses a plain sans-serif font, not the proprietary Noggin lettering. Generated artwork goes to SudoMock, so text should appear in downloaded renders.
- Beanie replacement depends on SudoMock returning the NOGGIN LOGO smart-object dimensions. If unavailable, the request fails with a clear message rather than guessing placement.
- Bucket hats are omitted when custom text is used: their current configuration has no separately editable Noggin layer. To support them, expose that layer in the template and map it explicitly.
- Swap exchanges primary and secondary colours and reference labels, then rebuilds the three colour presets (overwriting manual per-concept colour overrides).
- Pantone reference + HEX fields. 2607 C has an approximate #500778 sample mapping, not a complete Pantone database. Other Pantone references require an approved HEX value. Screen mock-ups are not production colour proofs. References are printed on the downloaded concept sheet.
- Access key protects the rendering endpoint, not the static page or resulting public image URLs. Existing render/share storage remains unchanged.
- No changes to public generator, tracking events, Typeform, Sheets or email scheduling.

Validation performed locally: JavaScript syntax, word size/character validation, and endpoint rejection without an access key. Real SudoMock rendering remains unverified.
