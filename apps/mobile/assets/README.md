# Open Outdoor home-screen icon

`app-icon.png` is the app's original mountain and winding trail artwork, generated on 2026-09-30 using the built-in image generation tool at the project owner's request. No reference images, stock artwork, existing brand marks or external visual assets were supplied. The project distributes this AI-assisted asset under its Apache-2.0 terms; see [the project notices](../../../THIRD_PARTY_NOTICES.md).

The source is a 1254 × 1254 opaque RGB PNG. `expo.icon` in [app.json](../app.json) points to it. The pinned Expo 56 prebuild icon plugin generates the opaque 1024 × 1024 universal iOS asset from this master; iOS applies its own corner mask. The image contains no text, credentials, location data or embedded home-screen mockup. Installing a new native app build is required to see the icon on the home screen.

## Generation prompt

The built-in tool received this prompt verbatim. The requested square composition was preserved; its returned master dimensions are recorded above.

```text
Use case: logo-brand.
Asset type: final iOS home-screen app icon for Open Outdoor, a personal offline outdoor mapping app.
Primary request: create one polished, original mountain and winding trail symbol on a deep forest-green background.
Style/medium: simple bold graphic illustration with crisp clean edges, broad solid color shapes, a distinctive balanced silhouette and generous negative space. A warm ivory mountain ridge with a winding ivory trail leading toward its central summit; restrained lighter green mountain facets give depth without fine detail. Calm, confident and welcoming outdoor identity.
Composition/framing: exactly square 1024 by 1024 pixels, one icon fills the canvas, continuous opaque forest-green background extends to all four edges. The mountain and trail mark is centered, occupies about 65 percent of the square, readable at 40 pixels, with comfortable clear margin so iOS corner masking keeps all important artwork intact.
Constraints: deliver the actual flat app-icon artwork only, not a phone mockup, not a grid of variations. No text, initials, labels, borders, watermarks, photographs, shadows, paper texture, tiny details, pre-rounded corners, or transparent areas. Do not imitate any existing brand or app icon. Opaque square artwork suitable to ship directly as an iOS app icon.
```
