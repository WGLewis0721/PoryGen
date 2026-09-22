# Customer flows

## 1. Real public scan — `/scan`

This is the primary MVP experience.

No account is required.

### Flow

1. Open `https://porygen.vercel.app/scan`.
2. Paste a public GitHub repository URL.
3. Click **Scan**.
4. PoryGen resolves the latest default-branch commit and checks supported JS/TS/Python files.
5. Results show:
   - strong source matches;
   - possible/common patterns;
   - or no strong source match.
6. Each reportable finding includes:
   - customer file and matched lines;
   - commit-pinned public source;
   - source license;
   - side-by-side excerpts;
   - coverage/contiguous evidence;
   - a plain-English explanation.
7. The user can **Review source**, **Dismiss** with a reason, **Reopen**, or push a fix and **Rescan latest commit**.

Review/dismiss state is stored in browser local storage for the MVP.

### Rescan behavior

If the repository commit changed, PoryGen only calls a disappeared finding resolved when the affected file was successfully rechecked or a complete tree proves the file was deleted.

If the same commit is scanned again, the UI says results are unchanged.

### Current boundaries

- public repositories only;
- JS/TS/Python only;
- bounded file/byte/time limits;
- small reference corpus;
- no durable cloud history yet.

## 2. Guided sample demo — `/demo`

The sample demo remains available for someone who wants to understand the workflow without using a real repository.

The repository and source examples are fictional. The demo is clearly labelled as sample data.

It demonstrates:

```
scan
→ inspect finding
→ review/dismiss
→ simulate fix
→ rescan
→ resolved
```

The demo is educational. It is not evidence that a particular real repository was scanned.

The final CTA now sends the user to `/scan`, not sign-up.

## 3. Connected/authenticated product — future path

The repository still contains earlier Supabase-authenticated screens and persistence groundwork.

The intended future flow is:

```
anonymous public scan
→ Connect GitHub when the user wants persistence/private repos
→ choose protected repositories
→ durable findings/history
→ automatic checks
```

Authentication is no longer allowed to block the first useful experience.

## 4. Billing — future customer path

Billing groundwork exists, but paid customer entitlements are not part of the public MVP.

The intended upgrade moment is protecting additional repositories and enabling automation, not paying to perform the first scan.

See [ROADMAP.md](../ROADMAP.md) and [STRIPE_SETUP.md](STRIPE_SETUP.md).
