> For the complete documentation index, see [llms.txt](https://ascendlaunch.gitbook.io/docs/llms.txt). Markdown versions of documentation pages are available by appending `.md` to page URLs; this page is available as [Markdown](https://ascendlaunch.gitbook.io/docs/developers/apis-and-bridging.md).

# APIs and bridging

Every endpoint here is public. None needs a key or a wallet signature. Each answers browser requests with CORS. No throughput is promised. For a wallet, trading tool or analytics product that needs more, contact [@AscendLaunch](https://x.com/AscendLaunch) with your product, use case and expected request volume.

## Market data

Ascend's indexer serves Ascend's own app. Partner access is arranged directly: contact [@AscendLaunch](https://x.com/AscendLaunch) with your use case and expected request volume.

`GET https://indexer.ascendlaunch.xyz/health` reports the indexed block and readiness.

To build your own view of the market, index the chain from block 422319. The [event table](https://ascendlaunch.gitbook.io/docs/developers/abis-and-events#event-sources) lists each event and its source.

## Token metadata API

`https://api.ascendlaunch.xyz` serves each coin's published art and links.

```http
GET https://api.ascendlaunch.xyz/v1/tokens/<token-address>/metadata
```

| Field                            | Meaning                                                              |
| -------------------------------- | -------------------------------------------------------------------- |
| `metadataUri`                    | The published metadata JSON, as an `ipfs://` URI                     |
| `imageUri`                       | The coin's image, as an `ipfs://` URI                                |
| `name`, `symbol`, `description`  | The creator's details                                                |
| `website`, `twitter`, `telegram` | Optional links from the creator                                      |
| `creator`                        | The wallet that published the claim                                  |
| `verified`                       | Whether the service verified the publisher's authority over the coin |

| Response | Meaning                                               |
| -------- | ----------------------------------------------------- |
| `200`    | The current claim                                     |
| `400`    | The address is malformed                              |
| `404`    | No published claim. The coin may still exist on chain |
| `429`    | Back off. Honor `Retry-After`                         |
| `5xx`    | Retry with backoff                                    |

A launch carries no metadata. The creator publishes art after the launch, so a new coin answers `404` until then. A claim with `verified: false` is provisional. Verification concerns the publisher, not the coin. Resolve `ipfs://` URIs through your own gateway and cache the answers. Treat every creator field as untrusted.

`GET /health` on the same host reports the chain and the service state.

## Bridge HYPE to Elysium

HYPE is Elysium's gas token. It bridges from HyperEVM 1:1 as native value. There is no wrapper on the way in.

* [Kinetiq's bridge](https://elysium.kinetiq.xyz/bridge) moves HYPE between HyperEVM and Elysium. Access is partner-only until Elysium's public launch.
* [Token bridging on Elysium](https://elysium.kinetiq.xyz/docs/token-bridging-on-elysium) explains every route: native HYPE, HyperEVM tokens and Elysium tokens.

USDC on Elysium is HyperEVM USDC bridged through the canonical bridge. KNTQ bridges the same way.

After the bridge, wrap HYPE into WHYPE with `deposit()` to trade a HYPE pair.
