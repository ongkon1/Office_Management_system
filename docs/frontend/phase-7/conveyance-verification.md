# Conveyance — Verification (`FE-0760`–`FE-0774`)

A travel-expense claim travelling the same approval chain as a requisition. Added after the requisition work, so Phase 7 was reopened a second time.

## The Extraction Came First (`FE-0760`)

Conveyance travels an identical path to requisition. The tempting move is to copy the stage machine; the reason not to is that two copies of one workflow drift, and the drift does not surface as a failing build — it surfaces as a record reaching a reviewer it should not have.

So the chain was lifted out before any conveyance code was written:

| Extracted to | What it holds |
|---|---|
| `src/contracts/approval.ts` | `ApprovalStage`, `ApprovalOutcome`, `ReviewerRole`, `Approvable`, `ApprovalReview`, timeline view models |
| `src/services/mock/approval-chain.ts` | `canView`, `canDecide`, `pendingReviewerRoles`, `applyDecision`, `initialStage`, `stageLabel`, `nextStep`, the shared result shapes |
| `src/components/feedback/approval-timeline.tsx` | The review timeline, rendered once for both |

**The proof it was behaviour-preserving:** the 40 requisition unit tests and the 44-check requisition browser gate were re-run **unchanged** against the extracted version, and passed. Requisition's own contracts now re-export the shared types under their existing names, so nothing that imported them had to change.

`Requisition` and `ConveyanceClaim` both `extends Approvable`. A workflow supplies only its own fields, its own validation, and its own presentation.

## What Is Genuinely Conveyance

| Field | Behaviour |
|---|---|
| Date/time | Read-only, **assigned by the service** |
| Business name · Client name | Text, required |
| Visited date + Time | Two controls, one instant, in Asia/Dhaka |
| Mode | Self / Uber / Other — `Other` requires a description |
| Amount | `Money` in BDT via `src/lib/money.ts` |
| Receipt | Optional upload, deny-by-default |

### Four rules that needed deciding, not just coding

**The submitted instant is the service's, never the client's.** A claim whose own timestamp the claimant chooses is not evidence of anything. It also keeps the demo reproducible: reading a clock in the component would produce a hydration mismatch *and* disagree with the pinned demo date the record is stamped with. The form's read-only field shows the value the record will carry — a test asserts the two are the same string.

**A future journey is refused, including later today.** The visited date and time are combined into one instant before the comparison. Comparing dates alone would let a claim made this morning for a trip "this evening" through, which is the version of this check that looks right and is not.

**"Other" carries a required description.** A mode of Other with no detail is unusable for the Finance reviewer who has to decide on it. The field appears when the mode is chosen and is cleared when it stops applying, so a hidden value can never be submitted.

**Absent is not failed.** A claim with no receipt is complete and says so on screen. A file that is too large or the wrong type is reported as a problem to fix. Conflating the two is how someone ends up believing they attached evidence they did not.

## The Receipt (`FE-0771`)

`AGENTS.md` §2 lists attachment data among the deny-by-default categories, so the receipt inherits the claim's visibility exactly.

Two mechanisms, because a screen omitting a link is not a control:

1. `ReceiptView` is a discriminated union whose `restricted` variant carries **no** file name, size or link. There is nothing in the view model for a component to leak.
2. `ConveyanceService.getReceipt` re-checks `canView` on the direct request. That is the access path that matters — it is what a URL-guessing viewer would use, and it is the only one a UI-level check never covers. Five roles are tested against it, including HR, Finance and the administrator *before* the claim reaches them.

## Decisions Worth Recording

**One dashboard prompt, not two.** A Team Lead with a requisition and a claim waiting gets a single sentence — "1 requisition and 1 conveyance claim waiting for you" — with a link to each queue. Two competing banners saying the same thing about different nouns is worse than one.

**Notifications reuse `request_submitted`.** Already in `ACTION_TYPES`, so a waiting claim lands under "Action required" with no new grouping rule.

**Cross-role flow steps stand on fixtures**, for the reason the requisition gate does: the mock store lives for one page load.

## A Defect in My Own Gate

The requisition browser gate failed after the dashboard prompt was combined. Two things were true at once, and only one was a real problem:

- The assertion had been written against the old single-noun wording. `FE-0769` changed it deliberately, so the check was re-asserted against the combined prompt — same two claims as before (a waiting requisition is named, and there is a way through to the queue), plus an explicit check for the link. Not loosened.
- While rewriting it, a `\b` in a patch collapsed into a literal **backspace character**, producing `/\x08requisition/i` — a regex that can never match. `grep` renders 0x08 invisibly, so the file *looked* correct; `cat -A` showed `/^Hrequisition/i`. Fixed, and worth remembering: a check that cannot pass is indistinguishable from a broken feature until you look at the bytes.

## Evidence

| Gate | Result |
|---|---:|
| `npm run audit:conveyance` (new) | 45/45 |
| Conveyance unit tests | 50/50 |
| `npm run audit:requisition` | 45/45 (44 before, unchanged behaviour + 1 new assertion) |
| Requisition unit tests | 40/40, **unchanged**, against the extracted chain |
| `npm run audit:a11y` | 279/279 (was 248) |
| `npm run audit:stress` | 73/73 (was 68) |
| `npm run audit:journeys` | 41/41 |
| `npm run audit:flows7` | pass |
| `npm run audit:contrast` | 48/48 |
| `npm run verify` | 366 tests, 67-route build |

The three conveyance routes were added to the responsive, accessibility and content-stress route lists (`FE-0774`). A gate that does not visit a screen says nothing about it.

## Still Open

The seven questions recorded when this was planned are unchanged. The build reflects the assumptions; it does not settle them.

1. **No `REQ-*` covers conveyance or requisition.** Neither is traceable to an acceptance criterion.
2. The submitted instant is service-assigned from the demo clock.
3. "Other" reveals a required description — **assumed**, and worth confirming, since the alternative is a claim nobody can check.
4. Visited date and time combine in Asia/Dhaka and cannot be in the future.
5. **Nothing consumes the amount after approval.** No payroll or expense total reads it. If Finance expects conveyance in an export, that is scope not yet built.
6. `clientName` is free text, unlinked to `Project.client`. The product now types client names in two places; if they are meant to be the same clients, that is an argument for a Client entity.
7. The upload is a **prototype**: metadata only, no storage provider, presented as such.
