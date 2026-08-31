# NUR 4.4 UI Audit & Optimization

**Release:** 0.25.4  
**Scope:** UI structure, files, state/schema, architecture, structural risks, duplication, render performance, memory, scalability and maintainability.

## 1. UI structure

```text
app/layout.tsx
└─ Providers
   └─ AppShell
      ├─ NurAmbient
      ├─ NurHeader
      ├─ route page / feature workspace
      └─ GlobalSearch (mounted only while open)

app/*/page.tsx
└─ thin route adapters
   └─ src/features/*
      ├─ shared UI: src/components/ui
      ├─ shared shell: src/components/shell
      ├─ state: src/state/AppProvider.tsx
      └─ services/content/storage/learning/audio
```

- 13 App Router page entrypoints.
- 48 TSX files including route entrypoints; 34 UI/feature TSX files under `src`.
- 10 global CSS files, about 159 KB source CSS.
- Routes are intentionally thin. Business/UI behavior lives in feature components.

## 2. File architecture

| Area | Responsibility | Assessment |
|---|---|---|
| `app/` | Next App Router entrypoints, root shell | Clean/thin |
| `src/components/shell` | global navigation, shell, profile gate, ambience | Improved |
| `src/components/ui` | reusable visual primitives | Good |
| `src/features/*` | route/workspace UI | Functional, several oversized files |
| `src/state` | state/context composition, progress copy-on-write | Improved, provider file still large |
| `src/styles` | global design system + feature overrides | Main structural UI risk |
| `src/shared` | shared catalogs/constants | Improved via canonical theme catalog |

Largest remaining UI files:

- `ExerciseRunner.tsx` ~31.9 KB
- `ModulePage.tsx` ~31.6 KB
- `HifzWorkspace.tsx` ~29.1 KB
- `AppProvider.tsx` ~26.4 KB
- `StudyWorkspace.tsx` ~22.0 KB
- `SettingsPage.tsx` ~21.4 KB
- `features.css` ~73.1 KB

## 3. UI state/schema

There is no separate UI database schema. UI state is derived from the application models:

- `Profile` / `AppPreferences`: appearance, Arabic rendering, audio, onboarding.
- `ProgressState`: journey, reader resume, Hifz, favorites, exercise/session state.
- `LearningContent`: catalog/content data with lazy hydrated domains.
- learning summaries/events: review, history, results, skill progress.
- route/query state: selected module, Quran reference/view, practice mode.
- local ephemeral UI state: open dialogs, filters, selected word, player state, form input.

Focused UI contexts after optimization:

- Runtime
- Content
- Profile
- Preferences
- Progress actions
- Progress
- Learning summary
- Learning
- Annotations

Root cause before this change: global chrome and repeated text nodes subscribed to payloads much larger than the data they actually rendered.

## 4. Architecture findings and root causes

### Fixed

| Finding | Root cause | Effect | Reliable fix |
|---|---|---|---|
| Global shell invalidated by learning/progress changes | coarse context subscriptions | broad React re-render fan-out | shell uses runtime/profile/preferences only |
| Header invalidated by full learning payload | header needed only summaries | unnecessary header renders | dedicated learning-summary context |
| Every `ArabicText` could react to any progress write | full progress context used for text preferences | expensive in Quran/long lists | preferences-only context |
| Quran reader re-rendered on every audio `timeupdate` | player state owned by `QuranReader` | up to 286 verse nodes revisited per audio tick | isolated `QuranAudioPlayer` child + memoized canvas |
| Quran canvas memo defeated by new `[reference]` arrays | unstable prop identity | avoidable canvas renders | memoized `canvasReferences` |
| Search work existed in global shell lifecycle | search component always mounted | index/search setup when unused | mount search only while open; optional chunk is lazy |
| Onboarding lazy-loading risk | optimization treated critical first-run UI like optional overlay | offline first run could miss chunk | onboarding kept eager |
| Library search rebuilt normalized strings per keystroke | normalization inside filter | repeated string allocation/CPU | pre-normalized `searchText` + deferred query |
| Library derived maps/sets recreated | derived collections built every render | allocation/GC pressure | memoized maps, sets and subsets |
| Theme definitions duplicated | header/settings owned separate catalogs | drift risk | one `theme-options.ts` catalog |
| Long collections painted/layouted off-screen | no render containment | scroll/layout/paint cost | `content-visibility:auto` + intrinsic size |
| Decorative effects consume mobile/slow GPU | SVG noise + animated floating letters | compositor/paint/battery cost | reduced effects on small/slow displays and reduced-motion |
| Player cleanup could set state during unmount | same cleanup path used for active reset/unmount | avoidable lifecycle edge case | cleanup has no unmount state write |
| Active audio ignored rate changes | playback rate only set at creation | settings/UI mismatch | synchronize active element rate |
| Practice audio controls subscribed to full progress | nested controls only needed audio settings | avoidable exercise rerenders | preferences-only subscriptions |

### Remaining structural risks

| Risk | Evidence | Why it remains | Recommended next solution |
|---|---|---|---|
| Global CSS bundle/cascade | ~159 KB across 10 globally imported style files | selector ownership overlaps across feature/responsive/polish layers | introduce explicit cascade layers, then route-owned CSS chunks |
| High override density | ~158 repeated selector heads across cascade/media layers | same visual concepts are restyled in multiple layers | consolidate by component/feature after visual regression baselines |
| Very large feature components | 5+ UI/state files above ~20 KB | interaction/state/render logic lives in one file | split by stable domain boundaries, not arbitrary line count |
| Feature contexts still broad | full `useAppProgress()` / `useAppLearning()` remain in feature workspaces | those screens genuinely use broad data, but changes can invalidate whole workspace | add domain selectors/contexts where profiler shows repeated waste |
| Quran verse DOM is not virtualized | containment skips paint but keeps DOM nodes | worst-case Surah still contains hundreds of nodes | add measured variable-height virtualization only if target devices require it |
| CSS cannot be safely auto-pruned | classes are shared and overridden dynamically | aggressive pruning can change cascade semantics | prune only with route screenshots/visual regression tests |

The repeated-selector count is an architecture signal, not a count of byte-identical duplicate rules. No byte-identical CSS block removal was applied blindly.

## 5. Duplicate and unused code

- Canonical theme choices were duplicated between Header and Settings: removed.
- Static reachability test reports all source modules reachable from app entrypoints.
- No complete orphan UI module was found, so no speculative file deletion was performed.
- Remaining duplication is primarily CSS ownership/override duplication and large-component rendering patterns.

## 6. Performance and memory changes

### React/rendering

- Global shell no longer subscribes to complete progress/content payloads.
- Header uses small summary/preferences contexts.
- Arabic text nodes are isolated from unrelated learning writes.
- High-frequency audio time updates are confined to the player.
- Quran canvas is memoized with stable callbacks and reference arrays.
- Optional search is mounted only when open.

### Search/allocation

- Library searchable text normalized once per item rather than once per query per item.
- Query work uses deferred input to protect typing responsiveness.
- favorites/map/recent/saved derivations are memoized.

### Browser rendering

- Long list rows use `content-visibility:auto`.
- Intrinsic sizes limit layout jumps while off-screen content is skipped.
- decorative effects are reduced for `prefers-reduced-motion`, app reduced-motion, small screens and slow-update devices.

## 7. Edge cases reviewed

- first-run while offline: onboarding remains eager.
- optional global search while offline before its chunk was cached: search is non-critical; shell remains usable.
- Surah 2 / long Quran lists: off-screen rendering contained; DOM remains bounded to Surah size.
- rapid library typing: deferred filter and precomputed normalized text.
- audio reference switches: old playback/revoke cleaned.
- changing playback rate while audio is active: applied immediately.
- unmount during audio playback: media cleanup without state update.
- unrelated progress writes while Quran Arabic text is visible: Arabic rendering no longer invalidated through full progress context.
- reduced-motion user setting: decorative compositor work removed, not merely animation duration shortened.

## 8. QA

- Repository/UI regression tests: **91/91 PASS**.
- SQLite migrations: **9/9 PASS**.
- Storage conformance: **28/28 PASS**.
- Content validation: **PASS**.
- Platform contract: **PASS**.
- P3 content audit: **PASS**.
- TypeScript parser pass: **102 TS/TSX files, 0 syntax errors**.
- Full semantic `tsc --noEmit` / Next production build was not rerun because this package has no installed dependencies in the execution environment. This is an environment limitation, not a passed gate.

## 9. Recommended follow-up order

1. Add visual-regression screenshots for every route/theme/breakpoint.
2. Introduce CSS cascade layers with explicit ownership.
3. Split global CSS into shell/shared and route feature chunks.
4. Decompose `ExerciseRunner`, `ModulePage`, `HifzWorkspace`, `StudyWorkspace` along stable sub-state boundaries.
5. Profile low-end Android hardware before adding Quran list virtualization.
