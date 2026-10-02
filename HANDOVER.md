# HANDOVER.md

This file is used for session handovers between Claude instances when context limits are reached.

## CRITICAL: TRUTHFULNESS REQUIREMENTS

### What I MUST Do:
- Use Read/Grep/Glob tools to verify file existence before claiming they exist
- Copy exact code snippets from files, never paraphrase or recreate from memory
- Run commands to check actual state (git status, npm list, etc.)
- Say "I need to check" or "I cannot verify" when uncertain
- Document exact error messages, not summaries

### What I MUST NOT Do:
- Write "the file probably contains" or "it should have"
- Create example code that "would work" without testing
- Assume file locations or function names exist
- Hide failures or errors to appear competent
- Continue when core requirements are unclear

### Escalation Examples:
- "I found 3 different auth implementations and need guidance on which to modify"
- "The task requires database schema changes which need architectural review"
- "I cannot find the file mentioned in the requirements"
- "Two approaches are possible, and I need a decision on direction"

## Current Session Info

**Date**: 2026-10-01 to 2026-10-02
**Branch**: `claude/brave-mendel-9iQG2` (restarted from `origin/main` at `1a54e11` after PR #27 merged; carries this file plus a small CSV-detection fix)
**Primary Task**: (1) Get the Expo/React Native Android app building on Gradle 9.8 / AGP 9.4 / Kotlin 2.4. (2) Fix NatWest PDF statement import (it imported 0 transactions) and add CSV + OFX import.
**Session Start Context**: `./gradlew assembleDebug` failed on the user's Windows machine (`F:\Dev\PoisonedFinance\mobile\android`) with AGP 9 incompatibilities in vendored Gradle plugins. Once the app built and ran on an emulator, the user reported that uploading their NatWest PDF imported 0 transactions, and asked for CSV and OFX support (NatWest's main export formats). The user supplied real sample files: a PDF, a CSV and an OFX for account 600513-17924995, covering 01–30 Sep 2026.

## Work Completed

All work below is merged to `main` as squash commit `1a54e11` ("Android build on AGP 9 + NatWest PDF/CSV/OFX statement import (#27)"), except the **Follow-up fix** at the end of this list, which is on the branch alongside this file.

### Files Modified

**Android build (mobile/)**
- `mobile/android/gradle.properties`: added `android.newDsl=false`, AGP 9's opt-out that keeps the legacy `com.android.build.gradle.LibraryExtension`/`BaseExtension` types visible to the RN and Expo Gradle plugins.
- `mobile/patches/@react-native+gradle-plugin+0.81.5.patch`: adds a `registerOnce()` guard in `AgpConfiguratorUtils.kt` so the `finalizeDsl` hooks aren't re-registered on libraries that are already finalized. It also carries the Kotlin/apiVersion bumps.
- `mobile/patches/expo-modules-core+3.0.30.patch`: drops library DSL calls that AGP 9 removed (`targetSdk`, `lintOptions` → `lint`), stops applying `kotlin-android`, and mirrors extra Java source dirs into `kotlin.srcDir`.
- `mobile/patches/expo-modules-autolinking+3.0.26.patch`: passes a `File` (`.get().asFile`) instead of a `Provider` to the SourceSet API.
- `mobile/patches/react-native-safe-area-context+5.6.2.patch`, `react-native-screens+4.16.0.patch`, `react-native-gesture-handler+2.28.0.patch`: remove `kotlin-android` and mirror extra source dirs into `kotlin.srcDir` (AGP 9 built-in Kotlin compiles only `kotlin.srcDirs`).
- Patches are applied by `"postinstall": "patch-package"` in `mobile/package.json`.

**Statement import (api/)**
- `api/src/pdf/` → `api/src/statements/` (renamed via `git mv`):
  - `common.ts` (new): `ParsedTxn`, `ParsedStatement`, `StatementAccount`, `parseUkDate`, `toPence`, `accountFromNumbers`, `cleanDescription`.
  - `pdf.ts` (was `parse.ts`): `parsePdfText()`. Parses the NatWest online-transactions PDF layout and recovers each sign from the running balance. It falls back to the original whitespace-column parser when no NatWest rows are found.
  - `csv.ts` (new): `parseCsv()`, a small RFC4180 parser that looks up columns by header name (NatWest: `Date,Type,Description,Value,Balance,Account Name,Account Number`).
  - `ofx.ts` (new): `parseOfx()`. Handles OFX 1.x SGML (closing tags optional) and 2.x XML. Description = `NAME , MEMO`, cleaned.
  - `import.ts`: `importStatement(userId, statement: ParsedStatement)`. The `label` parameter was removed. The sentinel connection provider is now `'statement'` (was `'pdf'`). There is one linked account per bank account (`external_id = 'statement:<sortcode>-<acct>'`, fallback `'statement:unknown'`). The dedup key changed (see Key Decisions).
- `api/src/routes/importPdf.ts` → `api/src/routes/importStatement.ts`: `POST /import/statement` replaces `POST /import/pdf`. It detects the format from the file contents and returns `{ ok, imported, found }`, or 422 when no transactions are found. The multer mimetype filter was removed.
- `api/src/app.ts`: mounts `importStatementRouter`.
- Tests: `api/src/__tests__/statements/{common,csv,ofx,pdf,import}.test.ts` and `api/src/__tests__/routes/importStatement.test.ts`. All fixtures are synthetic, not the user's real data.

**Mobile UI**
- `mobile/app/(tabs)/settings.tsx`: the picker type is `'*/*'`, uploads go to `/import/statement`, the mime type comes from `asset.mimeType ?? 'application/octet-stream'`, and the alert shows new vs already-imported counts. The button label/accessibilityLabel is now "Upload statement".
- `mobile/__tests__/app/tabs/settings.test.tsx`, `mobile/__tests__/lib/api.test.ts`: updated paths and labels.

**Docs**
- `README.md`, `features/README.md`, `docs/superpowers/specs/2026-06-01-contracts-and-revisions.md` (endpoint table + feature file name).
- `features/sync/pdf-import.feature` → `features/sync/statement-import.feature` (still `@wip`; 4 scenarios added for NatWest PDF/CSV/OFX and cross-format dedup; there are no step definitions).

**Follow-up fix (this branch, found while writing this handover)**
- `api/src/routes/importStatement.ts`: `detectFormat` decoded the first 4KB as latin1, so a UTF-8 BOM appeared as `ï»¿` and a BOM-prefixed CSV without a `.csv` extension wasn't detected. It now decodes as utf8. Literal (invisible) BOM characters in this file and `api/src/statements/csv.ts` were replaced with the `\uFEFF` escape; behaviour is unchanged.
- `api/src/__tests__/routes/importStatement.test.ts`: added "detects a BOM-prefixed CSV without a .csv extension". It fails with the old latin1 decoding and passes with the fix.

### Key Decisions & Pivots
- **Used `android.newDsl=false` instead of rewriting the vendored plugins against the new DSL.** The new DSL interfaces have setter-only properties that the plugins read. The flag is removed in AGP 10, so this is temporary.
- **Fixed node_modules through patch-package**, not by forking packages.
- **PDF sign comes from the running balance.** NatWest's PDF merges Paid in/Paid out into one unsigned amount. Rows are newest-first; `|balance_i − balance_{i+1}| == amount_i` gives the sign. When that doesn't reconcile (the oldest row), the type code decides: `BAC, BGC, CDM, IBP, INT` are credits and everything else is a debit.
- **`BACS` was removed from the type-code list.** The PDF row `BACSCC PAYROLL` is actually type `BAC` + `SCC PAYROLL`, as confirmed by the CSV.
- **The dedup key is `sha256(date|amount_pence|occurrence)`, not the description**, scoped per linked account. OFX descriptions differ from CSV/PDF (e.g. `B AND Q 1152` vs `B & Q 1152`, and OFX drops some reference text), so a description-based key would duplicate rows when the same period is imported in two formats. `occurrence` keeps genuine same-day, same-amount payments separate.
- **Descriptions are cleaned for every format** (card number/date segment, `FP dd/mm/yy n`, `VIA MOBILE - PYMT`/`Via Mobile Xfer`, long alphanumeric references). The categorisation rules in `api/src/categorisation/rules.ts` match the normalised description *exactly*, so without cleaning no rule would ever re-match.
- **The branch was merged with main using `git merge -s ours origin/main`.** Main's squash commit `74ebb23` (#26) had a tree identical to this branch's `f5b6206` (verified with `git diff f5b6206 origin/main` being empty), so the conflicts were only duplicated history.

### Code Patterns Discovered
Description cleaning (`api/src/statements/common.ts`):
```typescript
export function cleanDescription(raw: string): string {
  const segments = raw
    .split(',')
    .map(s => s.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter((s, i) => {
      if (CARD_SEGMENT_RE.test(s)) return false;
      if (i === 0) return true;
      return !FASTER_PAYMENT_SEGMENT_RE.test(s)
        && !CHANNEL_SEGMENT_RE.test(s)
        && !REFERENCE_SEGMENT_RE.test(s);
    });
  return segments.length > 0 ? segments.join(', ') : raw.replace(/\s+/g, ' ').trim();
}
```
Format detection (`api/src/routes/importStatement.ts`):
```typescript
function detectFormat(buffer: Buffer, filename: string): StatementFormat | null {
  if (buffer.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  const head = buffer.subarray(0, 4096).toString('utf8');
  if (/OFXHEADER|<OFX>/i.test(head)) return 'ofx';
  if (/\.csv$/i.test(filename) || /^\uFEFF?"?date"?\s*,/im.test(head)) return 'csv';
  return null;
}
```
AGP 9 built-in Kotlin source-dir mirroring (the same line appears in 4 patches):
```groovy
java.srcDirs.findAll { it != project.file("src/main/java") }.each { kotlin.srcDir(it) }
```
DB access pattern: raw SQL via `pool.query` from `@/db/client`. Tests mock `@/db/client` and queue `mockQuery.mockResolvedValueOnce(...)` results in call order.

## In Progress

### Current Task
None. Both tasks are merged. This branch adds only this handover file and the CSV BOM-detection fix above.

### Next Steps
1. Wait for the user's on-device check (see Verification Steps). Investigate if the counts differ.
2. If the user wants other banks/cards (e.g. NW Mastercard, Monzo, TSB, which appear as payees in their statement), get real sample exports first. The parsers are tuned to NatWest; `parseCsv` also accepts `Amount`/`Narrative`/`Details` headers and DD/MM/YYYY dates.
3. Optionally implement step definitions for `features/sync/statement-import.feature` (currently `@wip`).

### Blockers/Issues
- None known. I cannot verify the Windows Android build or the emulator flow from this Linux container; the user confirmed the app launches on an emulator and shows its tabs.

### Escalation Needed
None currently.

## Important Context

### Dependencies/Imports
- API: `pdf-parse` ^1.1.1 (PDF → text), `multer` (memory storage, 10MB cap), `express`, `pg`. No new dependencies were added; the CSV/OFX parsers are hand-written.
- Mobile: `expo-document-picker`, `patch-package` (postinstall).
- Toolchain: Gradle 9.8.0 (`mobile/android/gradle/wrapper/gradle-wrapper.properties`), AGP 9.4, Kotlin 2.4.x, RN 0.81.5, Expo SDK 54.

### File Relationships
- `routes/importStatement.ts` → `detectFormat` → `statements/{pdf,csv,ofx}.ts` (each returns `ParsedStatement`) → `statements/import.ts` → `categorisation/pipeline.ts` (`runPipeline(userId, newIds)`).
- All parsers use `statements/common.ts` for date and amount parsing and description cleaning.
- Mobile `settings.tsx` → `apiUpload('/import/statement', formData)` in `mobile/lib/api.ts` (base URL `process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000'`).

### State Management
- Imported rows: `transactions` with `needs_review = TRUE`, `merchant_name = NULL`, and `transaction_date = posted_date`, inserted with `ON CONFLICT (account_id, external_id) DO NOTHING`.
- `bank_connections` sentinel row with `provider = 'statement'` (tokens = `encrypt('')`, expiry 2099). `linked_accounts` has `UNIQUE (user_id, external_id)` (from `api/src/db/migrations/001_initial_schema.sql`). No migration was needed.

### API/Message Patterns
- `POST /import/statement`, multipart fields `file` and `userId`. Responses: 200 `{ ok: true, imported, found }`; 400 (missing file/userId, unsupported format); 413 (over 10MB); 422 (no transactions found); 500 (generic, no internal detail).

## Testing & Validation

### Testing Notes
- `cd api && npm test` → 36 suites, 254 tests passed on `1a54e11`; 255 with the follow-up BOM test (re-run 2026-10-02).
- `cd mobile && npx jest` → 18 suites, 103 tests passed (same run).
- `npx tsc --noEmit` was clean in both `api` and `mobile` at commit time.
- Against the user's real files (in the previous session's uploads; not in the repo), PDF, CSV and OFX each parsed to 102 transactions with account `600513-17924995` and a net of +43217 pence. That equals the PDF's closing balance (£3,941.44) minus its opening balance (£3,507.27 + the £2.00 charge = £3,509.27). PDF and CSV descriptions matched exactly. OFX differed on 3 rows only, all due to missing detail in NatWest's OFX.

### Verification Steps
- **Not yet confirmed by the user:** with the API restarted on main, import the September PDF in the app (expect "102 new transactions imported"), then the CSV for the same month (expect "0 new transactions imported. 102 already imported."), then the OFX (same as CSV).
- Android: `.\gradlew.bat clean assembleDebug` on Windows produces `mobile\android\app\build\outputs\apk\debug\app-debug.apk`. The user confirmed the app ran on an emulator.

### Error States Encountered
- `Unable to load script. Make sure you're running Metro or that your bundle 'index.android.bundle' is packaged correctly for release.` This was a runtime error, not a build error; it is resolved by running Metro (`npm start`) and, on a physical USB device, `adb reverse tcp:8081 tcp:8081`.
- Build errors fixed earlier (exact text from the user where available):
  - `Function invocation 'srcFile(...)' expected` at `AgpConfiguratorUtils.kt:121:78` (RN gradle plugin)
  - `It is too late to call finalizeDsl as the DSL finalization blocks have already been executed` → `registerOnce()` guard
  - `You cannot add Provider instances to the Android SourceSet API` → `.get().asFile` in expo-autolinking
  - `Unresolved reference 'InsetsChangeEvent'` (and `getReactContext`, `setViewLocalData`) → `kotlin.srcDir` mirroring
- PDF import returning 0: the old `LINE_RE` required 2+ spaces between columns and a signed amount, and the NatWest PDF text has neither.

## Commands & Environment

### Commands Run
```bash
# Inspect what pdf-parse produces for a PDF (scratch script)
node -e "require('/home/user/PoisonedFinance/api/node_modules/pdf-parse/lib/pdf-parse.js')(require('fs').readFileSync(process.argv[1])).then(r=>console.log(r.text))" statement.pdf

# Run a TS file ad hoc (use relative imports; tsx does not resolve the @/ alias here)
npx tsx src/__run_tmp.ts

# Tests
(cd api && npm test)
(cd mobile && npx jest)

# Check a branch merges cleanly into main
git merge-tree --write-tree origin/main HEAD >/dev/null && echo CLEAN || echo CONFLICT
```

### Environment State
- Environment mode: normal (cloud Linux container; the user builds and runs on Windows with an Android emulator)
- Firebase emulators: N/A (the project uses Postgres via `pg`, not Firebase)
- `gh` CLI is unavailable; use the GitHub MCP tools (repo `poisoneddm/PoisonedFinance`).

## Todo List State
- [x] Fix AGP 9 / Gradle 9.8 Android build (merged in #27)
- [x] Fix NatWest PDF import returning 0 transactions (merged in #27)
- [x] Add CSV and OFX statement import (merged in #27)
- [x] Cross-format dedup + per-account linked accounts (merged in #27)
- [ ] User to confirm on-device import counts (PDF → CSV → OFX)
- [ ] (Optional) Step definitions for `features/sync/statement-import.feature`

## Questions for User
- Did the PDF → CSV → OFX import sequence produce 102 / 0 / 0 new transactions as expected?
- Do you want statement import for other accounts (e.g. NatWest Mastercard, Monzo, TSB)? If so, please share a sample export of each.

## Potential Pitfalls
- **Patches are pinned to exact package versions** (file names encode them, e.g. `react-native-screens+4.16.0`). Upgrading any of these packages makes patch-package fail or skip, and the AGP 9 errors come back. Regenerate patches with `npx patch-package <pkg>` after editing `node_modules`.
- **`android.newDsl=false` is removed in AGP 10.** Upgrading AGP past 9.x needs RN/Expo plugins that are natively compatible with the new DSL.
- **Never hand-edit `node_modules` without regenerating the patch.** A fresh `npm install` discards unpatched edits.
- **The dedup key ignores the description.** Two different accounts would collide only if they share a linked account, which happens only when no account number is detected (`statement:unknown`). Statements without account numbers all land in that one fallback account.
- **The occurrence-based dedup assumes statements cover whole days**, which is true for NatWest exports. A partial-day export overlapping a later import could miscount.
- The PDF parser's balance logic assumes one account per PDF and rows sorted by date. Ordering is detected by comparing the first and last row dates.
- `docs/superpowers/plans/2026-06-01-pdf-import.md` still references `/import/pdf`. It's a historical implementation plan and was intentionally left unchanged.
- Any old `bank_connections` rows with `provider = 'pdf'` and the `pdf-import` linked account are no longer used. The old parser never matched NatWest PDFs, so they are unlikely to hold data, but this was not checked against the user's database.
- From an Android emulator, `http://localhost:3000` refers to the emulator itself. I have not verified how the user's `EXPO_PUBLIC_API_URL` is set; if uploads fail with network errors, check it (e.g. `http://10.0.2.2:3000`, or `adb reverse tcp:3000 tcp:3000`).
- `CLAUDE.md` workflow: create the PR and merge to main automatically when working directly on a task. Ask first only when experimenting.

## Time Tracking
**Estimated Time**: Not estimated at the start.
**Actual Time Spent**: Cannot verify; this session ran across 2026-10-01 and 2026-10-02 with a context compaction in between.
**Remaining Estimate**: About 0 for the merged scope; pending only the user's on-device confirmation.

---
*Note: Clear this file when starting a new major task or after successful task completion.*
*Last Updated: 2026-10-02 by Claude Code session https://claude.ai/code/session_018C891otGdNykDRgfPtWnZp*
