# Pons pair support and DEX service decision - 2026-11-10

Implemented locally: ETH and any currently Pons-approved ERC-20 pairing asset. Named discovery catalog contains 81 assets from the official Pons app (78 stock/ETF candidates plus cbBTC, USDG and TAO). All 81 passed live approval/economics/decimals reads in this session. This is a dated discovery catalog, not permanent authorization; review and simulation recheck approval, code, decimals and positive pair economics at the pinned block. Direct contract entry supports newly approved assets beyond the catalog.

The original chat UI collects pairing asset as the eighth setting, resolves known tickers, and preserves address answers during setup. Quote, calldata, simulation and factory receipt matching use the chosen pair. Graduation targets use pair decimals. Fee and gas remain ETH; initial purchase remains disabled. Existing native ETH recovery records remain compatible.

Validation: 170 tests passed including custom pair permission/decimal/call binding cases. Playwright verified named NVDA selection and direct TSLA address in chat, plus a live NVDA review (41.6 NVDA target, 0.0005 ETH fee at that check). Authentication was a browser fixture. No wallet transaction or production deployment. Evidence: output/playwright/stock-pair-review.png, stock-pair-chat.png; output/research/pons-approved-pairs.json.

DEX recommendation: DEX Screener Enhanced Token Info first; DEXTools token info second. Screener supports Robinhood and documents token-pair reads and public orders status. Official checkout currently advertises from USD299 (subject to checkout); do not hardcode price or collect payment to a Dinn wallet. Basic indexing is automatic once supported pool/trading conditions are met, not a paid listing. Proposed path: check token index -> prepare profile -> official checkout -> recheck provider order status and published info. No purchase API or checkout payment integration is implemented yet. Public order status is not proof that this user purchased an order.

Live sample KYRON returned HTTP200 with no pairs and empty orders/boosts; do not interpret this as eligibility, purchase completion or provider failure.

Sources: https://docs.ponsfamily.com/v2 ; https://ponsfamily.com/create ; https://marketplace.dexscreener.com/product/token-info ; https://docs.dexscreener.com/token-listing ; https://docs.dexscreener.com/api/reference ; https://info.dextools.io/how-to-update-token-info-on-dextools-first-steps-guide/

Remaining broader production work: swaps, transfers, token-specific fee claims, locker integration, funding, dedicated production RPC and real OAuth/wallet validation. Do not label these delivered based on this change.
