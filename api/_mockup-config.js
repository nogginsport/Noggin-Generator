// api/_mockup-config.js
//
// This file is the single source of truth for how each product's real
// Photoshop layers map onto the customer's two picked colours. Every name
// here was confirmed directly against the actual .psd files (not guessed
// from screenshots) — see the layer-mapping conversation for how each one
// was verified.
//
// If you ever swap in a new/updated .psd for a product, re-upload it to
// SudoMock, update that product's MOCKUP_UUID env var, and double check
// the layer names below still match (SudoMock resolves layers by name at
// request time, so a renamed layer in Photoshop will silently stop being
// found — better to get a clear "layer not found" error at request time
// than a silently wrong render, which is why generate.js checks for this).

const PRODUCTS = {
  beanie: {
    mockupUuidEnvVar: 'SUDOMOCK_BEANIE_MOCKUP_UUID',
    mockupUuid: '85f95510-b67f-4486-914d-2cc743bafb4b',
    logoLayerName: 'CUSTOMER LOGO',
    // Direct SudoMock UUIDs are used for this PSD because its API does not
    // consistently expose the same names shown in the dashboard.
    layerUuids: {
      'CUSTOMER LOGO': 'a0d1e04b-ab66-4d36-a05a-f4d819640948',
      'MAIN BODY COLOUR': 'c94a0f42-cabc-4787-973c-ac85e8d25631',
      'CUFF COLOUR': 'c4e56e71-314b-4928-ae0f-b4a8b45ca8ce',
      'STRIPES': '3e8b2036-def0-4a96-a5a4-2409cd289438',
      'MIDDLE BAND': 'e0cf21ce-1615-403f-aaa8-c9957ea3bfd8',
      'NOGGIN LOGO': '2a928716-7080-48ec-8d65-c784a0a6c0a2',
      'POM COLOUR 1': 'bd7b4936-1c82-482a-8486-6513fccfff34',
      'POM COLOUR 2': 'fbab41c9-a297-4896-bd79-6b776bc255bd',
    },
    // The body and cuff deliberately share the primary colour in every
    // design. Both thin stripes also share one colour. The two pom colours
    // remain independently addressable in SudoMock.
    colourZones: {
      primaryLed: {
        'MAIN BODY COLOUR': 'primary',
        'CUFF COLOUR': 'primary',
        'STRIPES': '#FFFFFF',
        'MIDDLE BAND': 'secondary',
        'NOGGIN LOGO': '#FFFFFF',
        'POM COLOUR 1': 'primary',
        'POM COLOUR 2': 'secondary',
      },
      secondaryLed: {
        'MAIN BODY COLOUR': 'primary',
        'CUFF COLOUR': 'primary',
        'STRIPES': 'secondary',
        'MIDDLE BAND': 'primary',
        'NOGGIN LOGO': 'secondary',
        'POM COLOUR 1': 'primary',
        'POM COLOUR 2': 'secondary',
      },
      balanced: {
        'MAIN BODY COLOUR': 'primary',
        'CUFF COLOUR': 'primary',
        'STRIPES': 'secondary',
        'MIDDLE BAND': '#FFFFFF',
        'NOGGIN LOGO': 'secondary',
        'POM COLOUR 1': 'primary',
        'POM COLOUR 2': 'secondary',
      },
    },
    variationCount: 3,
  },

  cap: {
    mockupUuidEnvVar: 'SUDOMOCK_CAP_MOCKUP_UUID',
    logoLayerName: 'FRONT DESIGN',
    // The cap's three existing design smart objects are proven independently
    // editable in SudoMock. We generate complete artwork for each one instead
    // of depending on inaccessible Photoshop colour-fill layers.
    artworkDriven: true,
    colourZones: {
      primaryLed: {},
      secondaryLed: {},
    },
    // Cap only has 2 real zones, so only 2 meaningful variations exist —
    // see the "cap 2 designs, not 3" decision.
    variationCount: 2,
  },

  bucketHat: {
    mockupUuidEnvVar: 'SUDOMOCK_BUCKET_HAT_MOCKUP_UUID',
    logoLayerName: 'BUCKET HAT CREST', // renamed from the ambiguous "BUCKET HAT DESIGN" (x3 duplicate names) — confirmed unique
    colourZones: {
      primaryLed:   { 'BUCKET HAT COLOR': 'primary', 'PART 1 COLOR': 'primary', 'PART 3 COLOR': 'primary', 'PART 4 COLOR': 'primary', 'PART 2 COLOR': 'secondary' },
      secondaryLed: { 'BUCKET HAT COLOR': 'secondary', 'PART 1 COLOR': 'secondary', 'PART 3 COLOR': 'secondary', 'PART 4 COLOR': 'secondary', 'PART 2 COLOR': 'primary' },
      balanced:     { 'BUCKET HAT COLOR': 'primary', 'PART 1 COLOR': 'primary', 'PART 3 COLOR': 'secondary', 'PART 4 COLOR': 'secondary', 'PART 2 COLOR': 'primary' },
    },
  },
};

// The bucket hat's crest layer was originally one of three identically-named
// "BUCKET HAT DESIGN" layers — renamed to "BUCKET HAT CREST" in Photoshop
// (confirmed via screenshot) to make it unambiguously identifiable here.

const PRODUCT_VARIATIONS = ['primaryLed', 'secondaryLed', 'balanced'];

module.exports = { PRODUCTS, PRODUCT_VARIATIONS };
