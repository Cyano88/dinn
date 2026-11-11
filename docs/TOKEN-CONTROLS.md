# Verified token controls

Dinn now researches the ABI from the source provider whose deployed runtime matches the inspected token. The ABI/source artifact stays server-side and is not serialized into chat or saved reports.

The Pons v2 profile is a narrow implementation match, not a Pons-name heuristic. src/pons-token-profile.json pins the main source and all six transitive Solidity dependencies, ABI, compiler identity, and compiler settings (including import remappings). The source was obtained from the runtime-matched Blockscout record for BullSprint at 0x50baA3aB04c95871c22BBD531A0AD86Ca89D052A. This relies on explorer verification; Dinn does not independently recompile the artifact. Do not regenerate the profile for changed code without reviewing the dependency closure and behavior again.

The matched implementation mints only in the constructor, has no owner/admin/pause/blacklist/transfer-tax/upgrade entry point, and exposes burn and allowance-authorized burnFrom. Before assigning this profile, Dinn reads launchFactory(), curve(), and deployer() at the report block and matches all three to the factory record. Any source, dependency, ABI, compiler-settings, binding, or detected-proxy mismatch falls back to bounded interface research. This is token scope only; it does not classify factory/curve governance, liquidity, or execution safety.

Other verified implementations expose actual control-related method names and supported role/state getters at the checked block. Names alone do not establish permission semantics. Unverified source is not interpreted. Pinned artifacts remain non-enumerable and raw source is not sent to inference.

Source: https://robinhoodchain.blockscout.com/address/0x50baA3aB04c95871c22BBD531A0AD86Ca89D052A?tab=contract

Validation: mutation tests cover main source, inherited source, remappings, ABI, duplicate paths, missing live binding, proxies, failed reads, unverified source and generic method/getter evidence. Live source + role binding + final block recheck passed in output/research/bst-controls-live.json.

Pons launch audit: new /api/pons/pair read checks selected pairing approval, contract code, decimals, phantom reserve and graduation target at one canonical block during chat setup. Review and simulation still revalidate independently. A denied pair is not saved. Native ETH remains supported and fees/gas remain in ETH for stock-paired launches. A local description starting Read-only no longer routes into an unrelated read tool.

Live ETH and NVDA simulations succeeded using a public funded reference address, not a connected user wallet. No eth_sendTransaction or signature was requested. Output: output/research/pons-simulations-live.json. This is simulation evidence, not a deployed token or user-wallet approval result. Wallet mismatches, expiry, exact calldata checks, recovery and canonical receipt matching are covered by test/pons-launch.test.mjs fixtures. Playwright exercised chat setup, pair rejection/correction, 41.6 NVDA target propagation, review and simulation UI using network fixtures; output/playwright/pons-pair-review-fixture.png.

The public RPC intermittently timed out. One bounded transient retry was enabled for read-only requests. Missing reads remain unknown/partial, and holder totals are labelled verified subtotals if any candidate balance was not read.

Final verification: 211 Node tests passed (output/final-production-tests.log). Live Playwright inference -> inspect_token -> authenticated source/RPC findings -> controls summary passed, including persistence on refresh (output/playwright/controls-live.png). The connected account for this browser check was fixture authentication only; inference and research were live. The inference endpoint also exhibited intermittent ECONNRESET; a single bounded pre-stream connection retry now recovers transient connection failures without duplicating tool execution. Persistent failures produce a provider-unavailable message. No wallet signature, transaction broadcast, deployment or paid purchase occurred.
