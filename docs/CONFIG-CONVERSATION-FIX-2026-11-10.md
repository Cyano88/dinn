# Dinn configuration conversation fix - 2026-11-10

Fixed the compound request `10 b then 5% tax`: compare the requested supply with live Pons presets; validate the explicit creator tax independently against the current cap; never substitute a different supply or parse the supply as a preset ID. Requested supply is retained as a non-executable preference in account-local setup context across follow-up questions and refreshes. Selecting a valid preset clears the preference. Reset clears it. Existing financial settings still pass the current validation and review flow.

Preset buttons are labelled by supply and base fee, without internal config numbers. UI explains that enabled presets fix supply and creator tax is separate. Reply guidance must not describe an unset tax as zero or claim a preset was selected when only tax changed.

Validation: build/syntax checks and all 232 tests passed. The final targeted 15 draft/reply tests passed after follow-up copy and preference validation. Verified updated /app.js served by restarted local Dinn at http://127.0.0.1:4317. Model wording is guided, not proof of a live inference response. No wallet request, launch, or transaction was submitted. No remote deployment performed.
