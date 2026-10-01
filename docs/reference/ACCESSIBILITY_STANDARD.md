# Accessibility Standard

**Status:** Accepted planning baseline

## 1. Conformance target

- Browser/shared semantic UI targets WCAG 2.2 Level AA where applicable.
- Native iOS behavior additionally targets current Apple accessibility APIs/guidance, VoiceOver, Dynamic Type, Bold Text, Increase Contrast, Differentiate Without Color, Reduce Motion, and supported appearance settings.
- WCAG conformance claims apply only to the browser content actually evaluated; native acceptance is reported as platform test evidence rather than an unsupported web conformance claim.

References:

- [W3C WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- [Apple Accessibility](https://developer.apple.com/accessibility/)

## 2. Baseline requirements

- Every control has an accessible name, role, value/state, action, and logical focus/order.
- Critical status is conveyed through text/shape/icon and accessibility value, never color alone.
- Text and controls remain usable at supported Dynamic Type sizes without clipping or hiding the primary action.
- Interactive targets are at least 44 × 44 points unless a documented platform-equivalent pattern provides an equally usable target.
- Text/non-text contrast meets WCAG 2.2 AA where the criterion applies.
- Motion is not required to understand state; Reduce Motion suppresses or replaces nonessential movement.
- Timeouts, progress, errors, and status changes are announced without destructive focus changes.

## 3. Critical flows

Native physical acceptance covers:

- first-run privacy/permission explanations;
- start, pause, resume, finish, save, and cancel recording;
- crash/recovery and GPS/battery/provisioning warnings;
- offline/stale/unknown/restricted/closure camping states;
- map selection and non-map alternative details/list;
- catalog activation, rollback, incompatible/low-space errors;
- import/export privacy trimming and encrypted backup/restore;
- private/public origin and unavailable-private-extension state; and
- delete individual/all private data.

## 4. Map accessibility

- Every selected map feature has an equivalent accessible detail representation.
- Search and list views provide non-visual access to nearby/filtered trails, camping places, restrictions, and provenance.
- Map gestures are not the only way to select, filter, zoom to, or inspect a result.
- Active recording statistics and controls remain accessible without interacting with the map.
- Land/status legends expose semantic labels and explanations, not color swatches alone.

## 5. Outdoor and one-handed use

- Critical controls remain reachable, spaced, and distinguishable in rain/glove/fatigue scenarios.
- High-contrast/light/dark appearances preserve active route/user location visibility.
- Bright-sunlight review and increased text size are physical-device gates.
- Destructive actions use explicit labels, confirmation, and recovery where feasible.

## 6. Test method

- Automated semantic/contrast/layout tests run on every public pull request where supported.
- Manual browser keyboard/screen-reader checks supplement automation.
- Physical iPhone VoiceOver, Dynamic Type, Bold Text, contrast, reduced-motion, dark-mode, touch-target, and outdoor scripts are required at Phase 1 and release gates.
- Every critical state has a stable accessibility test case and evidence capture that contains no private route/data.

## 7. Defect policy

- Critical: cannot start/stop/recover recording, understand a safety status, restore data, or avoid destructive action. Blocks phase/release.
- High: major flow requires sight/color/precise gesture or loses meaningful content at supported settings. Blocks production release and affected milestone unless no feature is shipped.
- Medium/low: inconvenience with a viable equivalent path; scheduled with owner and target release.

No “works in browser” result closes a native accessibility defect.
