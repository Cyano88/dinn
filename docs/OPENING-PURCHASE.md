# Optional opening purchase

Implemented locally on 2026-11-11. Production deployment has not changed.

Flow: logo and links -> optional purchase -> preparation loader -> review -> pairing-token approval when needed -> launch check -> explicit wallet approval.

The creator enters spending in the selected quote asset. Dinn shows estimated and minimum token output, with configurable slippage from 0.01% to 5% (default 1%). Skip uses the existing direct factory launch. A purchase uses the official router `0xe33E9E479dF8802cb0866d5d05258bEc4cF62948`; the deployed code and factory `launchForwarder()` were verified live at block 111574594. References: https://docs.ponsfamily.com/v2 sections Launching and buying in one transaction, Getting a quote, and Reading state.

Native purchases add spend to the launch fee in transaction value. ERC-20 purchases keep transaction value at the launch fee and require approval of exactly the requested spend. Insufficient nonzero allowances are reset to zero first. Approval and launch are separate wallet confirmations. Pending or uncertain approvals are persisted per account, checked by hash, and block duplicate approval or launch submissions. Both use the same cross-tab submission lock. An unknown result without a hash requires checking wallet history and entering that hash; it is never silently retried.

Server checks include the active router, allowed pair and actual decimals, factory economics pin, amount precision, balances, allowances, gas and exact contract simulation. Browser reconstructs approval and launch calldata before requesting a signature. Launch receipt verification checks exact transaction identity, canonical factory event and a token transfer from the launched curve to the creator for at least the reviewed minimum. No server signer exists.

Current bounds: opening purchases that complete the curve are rejected; partial-fill/graduation during launch-and-buy is not enabled. Fee-on-transfer or other incompatible assets must pass actual router simulation. Estimates are not a transaction success guarantee. Local generated logos still require public hosting before a real launch can use them.

Verification:
- Read-only live native launch-and-buy simulation used a synthetic ETH balance and returned exactly the calculated output: 559210917700810260925434 base units for a 0.001 ETH purchase with 6% trading fees.
- Live NVDA quote read actual economics and allowance. Browser test used real review and approval-simulation endpoints, then a test wallet deliberately rejected signing; nothing was broadcast.
- Browser verified skip, invalid amounts, saved amount, loader, displayed NVDA estimate, approval-required gating, rejection and return to no-purchase review. Screenshots are in output/playwright/opening-purchase-*.png.
- Unit tests cover precision, slippage, native value, ERC-20 allowance/reset, insufficient balance, router changes, calldata tampering, uncertain duplicate prevention and receipt transfer verification. Full suite results are in output/purchase-final-tests.log.

Not yet verified: funded approval and launch broadcasts from the user's actual embedded wallet, and deployed Render execution. No transaction was sent by this implementation task.

## USD reference estimates — 11 November 2026

Amount entry and final review now show approximate USD value for the opening purchase, separately from launch fee/gas. The asset quantity remains the transaction denomination. Robinhood stock tokens are resolved by chain 4663 deployment address, not by ticker alone, and valued using the underlying bid/ask midpoint multiplied by the current shares-per-token multiplier. Source: https://docs.robinhood.com/chain/stock-token-apis/ . Native ETH uses Coinbase Exchange ETH/USD bid/ask midpoint. Unsupported quote assets show unavailable; no dollar peg is assumed.

Quotes older than two minutes, wrong deployments, halted or invalid markets and fetch failures are rejected. Backend caching is 15 seconds, UI refreshes every 30 seconds, and source timestamps are displayed. Decimal arithmetic uses integers, avoiding floating-point rounding of token amounts. Browser check used 111 NVDA with a live Robinhood reference and verified the USD estimate again in final review. This is an informational reference, not an executable conversion quote or share-ownership claim.
