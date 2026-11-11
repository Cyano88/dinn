# Conversational launch setup audit — 11 November 2026

Scope: setup UX and state transitions, not a contract/security audit.

Fixed findings:
- Logo, links and purchase each opened modal cards; asynchronous logo restoration resized the visible card. Setup now uses an inline assistant area in the existing conversation. Saved image state loads before the logo step is displayed. The bouncing Dinn loader is inline; only final launch review uses a modal.
- Native disclosure triangles looked like play buttons. Launch disclosures now use outline chevrons with keyboard focus styling and reduced-motion support.
- Typed skip, continue, explicitly requested logo generation, labelled links, and purchase amounts had no connection to final setup controls. They now invoke the same validated actions; wrong purchase-asset symbols are rejected. General questions remain on the normal agent route.
- Refresh lost the current setup location. The current step is persisted per user and token; preparing restores to purchase without automatically requesting another transaction or image. Clear chat resets the inline flow. Account changes hide its prior contents.
- Discarding an accepted public preview did not restore the prior URL. The original URL is now preserved per token and restored on discard. Pending requests cannot be discarded or skipped without checking their result; pause retains recovery.
- Repeated prompts and prominent secondary controls cluttered setup. Link fields and generation extras are collapsed, back/pause controls are secondary, and the preview remains inline.

Validation: all 248 existing automated tests passed. Browser checks verified no setup/preparation modals, typed skip/link/purchase, rejection of the wrong asset, step and link recovery after reload, clear-chat reset, optional purchase and live NVDA quote/approval simulation with a deliberately rejecting test wallet. Logo fixture checks verified pending recovery, private preview acceptance, original URL restoration, and the public URL reaching final review. Mobile screenshots were inspected and spacing corrected.

No transaction was broadcast. Existing local-only logo hosting restriction remains. Full authenticated funded wallet execution and Render deployment remain outside these UI checks.

## Sequential chat guidance

Dinn now asks for X, Telegram, then website individually. It accepts social handles, labelled links and bare website domains, validates social hosts, and saves the active question across reload. Skip clears only the current link; skip all links is explicit. Existing values can be kept. Browser verification covered X handle entry, refresh at Telegram, skipping Telegram without losing X, website entry, and automatic advance to opening purchase. Five new parser tests bring the suite to 253 passing tests.

Final review names the next required approval/check. The launch-recovery widget now lives in the chat thread, and submitted launches stay in Assistant rather than switching to Drafts. Receipt verification remains authoritative; the token link appears only after verification. No funded launch was broadcast during these checks.
