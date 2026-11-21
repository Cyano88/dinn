# Review Dinn research feedback

From the Dinn Render service shell, run `node scripts/feedback-review.mjs`. The private weekly report lists exact replies, token, source and timestamps. Chat counts registered prompts. Marketplace counts feedback-page visits after acceptance. A visit or a missing reply is not a vote. Distinct signed-in respondents can be counted in chat; Marketplace counts jobs, not identities. Unclassified replies are not confirmed independent customers.

Chat only saves a reply as product feedback when the signed-in user explicitly starts it with **Feedback:**. Optional `DINN_INTERNAL_FEEDBACK_USERS` lists comma-separated internal Privy user IDs for excluding team usage. Marketplace test runs are marked automatically. Mark internal paid job feedback with `node scripts/feedback-review.mjs --mark-market-test ASSIGNMENT_UUID` after the feedback page has been visited.

Private Marketplace deliveries include an optional link to use after acceptance. The Marketplace closes the message thread at that point. Anyone with the private link can submit one reply for the assignment; do not publish the link. API callers can use the fragment parameters job and code with POST /api/feedback/market as JSON fields id and code, plus reply (up to 600 characters). One response per job; identical retries are safe. No feedback response creates an alert, watch or charge.
