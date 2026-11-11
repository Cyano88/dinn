# Dinn policy preparation
Unpublished drafts. Do not enable acceptance links until the operator confirms the missing facts and adopts final policies.

## Pending facts
- Operator legal name, public contact email, jurisdiction and service address.
- Hosting/logging providers, actual retention periods and deletion process.
- Provider data processing, international transfers and any analytics used at deployment.
- Eligibility, fees, governing terms and dispute process.

## Confirmed implementation facts
- Privy provides Google/X sign-in and embedded wallet functionality when configured.
- The client reads identity/profile information returned by Privy and uses a provider user ID to scope browser drafts.
- Drafts and tracked launches use sessionStorage. Pending submissions use localStorage for recovery.
- User messages sent for planning reach the Dinn server; configured inference sends messages to the selected AI endpoint.
- Simulation and receipt checks send relevant addresses, transactions and contract data to configured RPC infrastructure.
- Public blockchain transactions cannot be erased by clearing local application data.
- Sign-in and inference are not configured in the current local preview.

## Terms draft outline
Dinn provides a conversational interface for supported token operations. Capabilities vary by deployment.
Review all transaction details, permissions and fees before authorizing an action. Generated explanations may be inaccurate.
Signing and submitting a blockchain transaction can create an irreversible public record. Dinn does not guarantee token value or successful execution.
Use only accounts and assets you are authorized to control. Do not misuse the service to deceive others or access their accounts.
Describe the actual operator, eligibility, fees, support and applicable terms before publication; do not invent them.

## Privacy draft outline
Identify the operator and contact route.
Explain identity data processed through Privy and the selected login provider.
Explain browser storage, request data processed by the backend, optional AI processing and RPC requests.
Specify actual service providers, purposes, retention and deletion processes; do not promise unverified retention or confidentiality.
Explain that blockchain records are public and persist independently of Dinn.
Describe applicable user rights and how to exercise them after confirming operating jurisdictions.

## Publishing
Publish final Terms and Privacy pages, then set DINN_TERMS_URL and DINN_PRIVACY_URL to their HTTPS URLs.
The local preview displays the approved agreement layout and links to clearly labelled drafts at /terms and /privacy. Both configured URLs replace those draft destinations. Adopt final policies before enabling public sign-in.
