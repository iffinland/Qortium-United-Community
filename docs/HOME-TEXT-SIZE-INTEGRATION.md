# Qortium Home Text-Size Integration

Status: complete — implementation and owner runtime validation passed

## Scope

QUC follows Qortium Home's existing user-controlled text size. QUC does not add
a local text-size preference, a local zoom setting, or any second zoom/transform
layer. Home remains the sole zoom authority.

## Verified Home contract

Reference revision inspected:

- Qortium Home: `927d932`
- Discussion Boards: `dd42a23`

Home text-size values:

`extra-small`, `small`, `medium`, `large`, `extra-large`, `huge`

QUC consumes text size through:

- initial Q-App URL parameter `textSize`;
- Home message `TEXT_SIZE_CHANGED`;
- aggregate frame/mobile message `qortium:home-settings-changed`;
- desktop WebContentsView custom event `qortiumHomeSettingsChanged`;
- bridge read fallback `GET_HOME_SETTINGS`.

Relevant Home source areas verified:

- `electron/home-settings-bridge.ts`
- `electron/qdn.ts`
- `electron/qdn-views.ts`
- `src/QdnViewer.tsx`

## Discussion Boards reference used

The proven Discussion Boards display-settings pattern was adapted for the
text-size subset:

- `src/services/qortium/homeDisplaySettings.ts`
- root CSS `html[data-text-size='...']`
- pre-render URL normalization in `src/main.tsx`
- centralized message/bridge synchronization in the app provider

QUC intentionally implements only the text-size subset. Theme, accent,
language, and UI style are not copied into a duplicate QUC settings surface.

## Adapter implementation

`src/services/qortium/homeTextSize.ts`

The adapter is the only QUC entry point for Home text size. It:

- validates the six supported values;
- normalizes missing/malformed values to `medium`;
- supports both `textSize` and legacy `textScale` payload fields;
- reads `textSize` from the initial URL;
- uses `GET_HOME_SETTINGS` as fallback/synchronization;
- listens for `TEXT_SIZE_CHANGED`,
  `qortium:home-settings-changed`, and desktop
  `qortiumHomeSettingsChanged`;
- prevents a slow bridge read from overwriting a newer live event;
- returns a cleanup function that removes both listeners;
- fails safely when the Home bridge is unavailable.

## Startup precedence

1. Live Home event (newest).
2. Successful `GET_HOME_SETTINGS`.
3. Initial URL `textSize`.
4. QUC default `medium`.

The URL value is applied in `src/main.tsx` before React renders, which avoids a
medium-size flash when a valid Home size is already present in the URL.

## Root font-size mapping

Implemented in `src/index.css`:

| Home value   | Root font size |
| ------------ | -------------- |
| extra-small  | 14px           |
| small        | 15px           |
| medium       | 16px           |
| large        | 17px           |
| extra-large  | 18px           |
| huge         | 20px           |

Existing rem-based Tailwind typography scales from this root value. No global
CSS `zoom`, `transform: scale`, or root-scale logic was added to QUC.

## Fixed-pixel microtext

Only clearly user-facing microtext was converted to root-relative rem
equivalents. Avatar/badge circles and decorative fixed sizing were left alone.

Converted:

- `FundBalance` label: 9px to 0.5625rem
- Admin member address: 10px to 0.625rem
- Sidebar warning notices and metadata: 10px to 0.625rem
- Header wallet/balance labels: 10px to 0.625rem
- Footer copied/copyright text: 11px to 0.6875rem

These preserve the existing medium appearance while scaling with Home's large
and huge text sizes.

## Zoom

QUC does not implement `appZoom`. QUC may receive `appZoom` inside a Home
settings payload, but the adapter ignores it. Home continues to own desktop
native Electron zoom, embedded WebContentsView zoom, and the iframe CSS scaling
fallback.

## Files changed

- `src/App.tsx`
- `src/index.css`
- `src/main.tsx`
- `src/services/qortium/homeTextSize.ts`
- `src/services/qortium/__tests__/homeTextSize.test.ts`
- `src/components/admin/AdminManagement.tsx`
- `src/components/common/FundBalance.tsx`
- `src/components/layout/Footer.tsx`
- `src/components/layout/Header.tsx`
- `src/components/layout/Sidebar.tsx`

## Tests added

`src/services/qortium/__tests__/homeTextSize.test.ts`

Covers:

- all six valid values;
- malformed value to medium;
- missing value to medium;
- URL `textSize` startup value;
- `TEXT_SIZE_CHANGED`;
- `qortium:home-settings-changed`;
- desktop `qortiumHomeSettingsChanged`;
- `GET_HOME_SETTINGS` fallback;
- slow bridge response cannot overwrite newer live event;
- bridge unavailable does not block startup;
- root `data-text-size` state updates;
- listener cleanup.

## Verification results

- `npx tsc -b` passed
- `npm run lint` passed
- `npm test` passed: 61 files, 1255 tests
- `npm run build` passed
- `git diff --check` passed

## Embedded visual validation

The CSS mappings are present in the production build output, and automated
adapter tests cover both medium/huge values. On 2026-08-26, the owner confirmed
that runtime testing in Qortium Home passed, including the intended Home-driven
text-size behavior and the absence of a QUC-local zoom layer.

## Observed Home zoom issue

None observed from source inspection or the owner's runtime validation.

## Report path

`docs/HOME-TEXT-SIZE-INTEGRATION.md`
