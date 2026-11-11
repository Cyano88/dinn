# Embedded-wallet onboarding

X and Google are the primary entry points. The sign-in card precedes the workspace; drafting is available after authentication. There is no guest access or injected-wallet bypass in the human UI.

## Provider setup

1. Create/configure a Privy app and enable Twitter/X and Google login. Allow the exact local/deployed origins. The local preview is http://127.0.0.1:4317; localhost is a different origin.
2. Enable Ethereum embedded wallets. The SDK uses createOnLogin: all-users. Existing wallets are recovered from the authenticated account; Create wallet is available in the account menu if needed.
3. Set the public PRIVY_APP_ID in local .env. No app secret is used by the frontend.
4. Set ELYSIUM_PUBLIC_RPC_URL to a verified browser-safe HTTPS RPC for chain 99901. Keep ELYSIUM_RPC_URL separate if the server provider URL contains credentials.
5. Configure production OAuth credentials and redirect settings in the provider dashboard. Never put provider secrets in frontend code or chat.
6. Run npm run build, then restart npm start. Until both app ID and public RPC are configured, social sign-in is visibly unavailable and the workspace stays hidden.

## Account behavior

- The account menu links Google and X to the same account. Separately signing in with an unlinked identity can create a different account/wallet.
- Back up wallet opens the provider export UI. Launchflow does not read or store private keys.
- Signing out closes the workspace and invalidates the current review.
- Drafts and tracking history are tab-local and scoped to provider user ID. They are not cloud-synced or encrypted backups.
- Transaction recovery remains browser-local and is matched to the connected deployer. An uncertain send never permits a blind retry.
- Embedded-wallet confirmation UI is explicitly enabled with showWalletUIs: true.
- No delegated server signer, custody or deposits. ENABLE_LIVE_LAUNCH defaults to false.
- Browser authentication events control UI visibility and wallet readiness only. They do not authenticate a backend request. Private server data or paid endpoints will require server-side access-token verification.

## Required live validation

Test both OAuth redirects/returns, wallet creation, repeated login, linking, sign-out, recovery/export, provider errors, wrong-account/network protection, and RPC chain identity. Check the configured provider flow under the CSP. Browser mocks cannot validate real OAuth or wallet approval.

## Local evidence

The Privy 3.51.3 production bundle builds and imports in the browser. Forty application tests and the UI/submission mock walkthroughs pass; see UI-WORKFLOW.md.

The current dependency audit remains 28 affected packages (21 high, 7 moderate), after the scoped ws patch. See DEPENDENCY-REMEDIATION.md for remaining roots and bundle exposure. No production release clearance has been granted.

## Sources

- https://docs.privy.io/basics/react/quickstart
- https://docs.privy.io/basics/react/advanced/automatic-wallet-creation
- https://docs.privy.io/basics/react/advanced/configuring-evm-networks
- https://docs.privy.io/basics/get-started/dashboard/configure-login-methods
- https://docs.privy.io/security/implementation-guide/content-security-policy

## Dinn dashboard setup ? 2026-11-06

Created a separate Dinn development app in the existing Privy organisation using the onojacyano Chrome profile. Saved and verified after reload: Google and Twitter/X are the only enabled login methods; email, SMS, external wallets and other social methods are disabled. Automatic EVM wallet creation is enabled for all users; SVM wallets are disabled. Allowed development origins are http://127.0.0.1:4317 and http://localhost:4317. Branding name is Dinn and accent colour is #344B3B.

The app ID and one-time server secret were saved to the ignored local .env without printing the secret. The server secret is not part of the frontend or public auth configuration. Clipboard was overwritten and verified empty after transfer.

The dashboard requires a hosted PNG logo; the SDK already uses the local selected Dinn icon. Add the hosted logo and verified production origin after deployment. The public Elysium RPC is still unset, so the app auth gate remains disabled. No real end-user OAuth, wallet creation, fee claiming, transaction, delegated signing, production upgrade or fee sponsorship was performed. Current social providers use Privy default OAuth credentials; configure Dinn-owned OAuth applications for production branding.

## Verified testnet onboarding - 2026-11-06

The saved private RPC and https://testnet-rpc.elysium.kinetiq.xyz both returned chain 99801. The private URL remains only in ELYSIUM_RPC_URL. ELYSIUM_PUBLIC_RPC_URL uses the verified public testnet endpoint and ELYSIUM_AUTH_CHAIN_ID=99801. Live launch remains disabled. Auth network metadata is separate from the Ascend execution chain, which remains 99901. Testnet onboarding disables launch simulation/receipt RPC adapters and broadcasting even if ENABLE_LIVE_LAUNCH is accidentally true.

Real browser checks reached Google Accounts sign-in and X OAuth authorization using the configured Privy app. No end-user authentication, account linking, wallet creation, signing or transaction was completed. The browser was returned to Dinn for user sign-in. Public config/status were checked against both local secrets; neither the private RPC nor app secret appeared.

42 application tests passed, including testnet execution isolation. Follow-up HTTP/auth tests passed after adding HEAD support for Privy COOP checks and allowing the documented WalletConnect Explorer endpoint used by the SDK. SDK WalletConnect discovery is not an enabled user login method.

Sources: https://www.alchemy.com/rpc/elysium-testnet ; https://ascendlaunch.gitbook.io/docs/developers/mainnet-contracts ; https://docs.privy.io/security/implementation-guide/content-security-policy
