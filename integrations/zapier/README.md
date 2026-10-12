# MemeCMO for Zapier

A Zapier integration (Platform CLI, `zapier-platform-core` 19) that puts MemeCMO's
measurement and deliverables into a Zap and writes the published result back
into the action ledger — so a client publishes in its own channels (Facebook
Page, LinkedIn Page, YouTube, a CMS…) with Zapier's own approved apps, and
MemeCMO verifies and attributes what moved. MemeCMO never holds social tokens.

| Kind | Key | What it does |
|---|---|---|
| Trigger | `new_scan` | A comparable scan finished: index, presence, share of voice, citation, gap count, top gaps |
| Trigger | `new_deliverable` | A content draft / distribution kit / site upgrade / encyclopedia entry / report is ready — full text with the client's edits applied |
| Action | `log_action` | Log what went live (URL, date, target questions) → verification + attribution |
| Search | `find_deliverable` | Latest deliverable of a type for a project |
| Search | `find_gaps` | Current high-intent gaps of a project |
| Hidden trigger | `projects` | Backs the project dropdown |

Auth is OAuth 2 (PKCE) against MemeCMO's own authorization server; the user
signs in and picks the organization on MemeCMO's consent page. Everything
goes through the REST face of the connector, `/api/connector/v1/*`.

## One-time setup (needs a Zapier developer account — done by the founder)

```bash
cd integrations/zapier
npx zapier login                       # browser login to Zapier
npx zapier register "MemeCMO"          # creates the app, writes .zapierapprc, prints the App ID
```

Register a confidential OAuth client for Zapier's redirect URL (replace `<APP_ID>`):

```bash
curl -s -X POST https://app.memecmo.ai/api/oauth/register -H 'Content-Type: application/json' -d '{
  "client_name": "Zapier",
  "client_uri": "https://zapier.com",
  "redirect_uris": ["https://zapier.com/dashboard/auth/oauth/return/App<APP_ID>CLIAPI/"],
  "token_endpoint_auth_method": "client_secret_post",
  "grant_types": ["authorization_code", "refresh_token"]
}'
```

Put the returned `client_id` / `client_secret` into the integration's environment, then push:

```bash
npx zapier env:set 1.0.0 CLIENT_ID=mcc_… CLIENT_SECRET=mcs_…
npx zapier push
```

Invite users (or yourself) from the Zapier developer dashboard, or share the
private invite link. The integration can stay private; publishing to Zapier's
public directory is a separate review.

## Local test (no Zapier account needed)

```bash
BASE_URL=https://app.memecmo.ai MEMECMO_TOKEN=mc_<connector key> TEST_PROJECT=<slug> npm test
TEST_WRITE=1 … npm test        # also exercises log_action (idempotent on URL)
npx zapier validate
```

## A typical Zap (FMVN pilot)

1. **Trigger** MemeCMO → New Deliverable, types = Content draft (or Distribution kit), project = the brand.
2. **Action** Facebook Pages → Create Page Post (or LinkedIn → Create Company Update) with the deliverable's `content`.
3. **Action** MemeCMO → Log Published Action: project, kind = third-party placement, URL = the post URL from step 2, published on = now, source run ID = the deliverable's `run_id`.

MemeCMO fetches the URL within minutes; outcomes appear after the next scheduled scan.
