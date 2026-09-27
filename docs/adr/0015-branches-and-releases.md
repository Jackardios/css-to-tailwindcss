# ADR-15: Branches, release channels and the 2.0 cutover

- **Status:** Proposed
- **Date:** 2026-09-27

## Context

Releases are published by semantic-release from squash-merged pull requests. Version 2 is developed while 1.x keeps
receiving fixes. A wrong commit message on the wrong branch can publish a major version to every `^1` user, or burn the
`2.0.0` version number on a prerelease channel.

## Decision

**Branches.** `main` publishes 1.x to `latest` until the cutover. `next` carries version 2 and publishes
`2.0.0-next.N` to the `next` dist-tag. `1.x` is created only at the cutover.

```json
"branches": ["+([0-9])?(.+([0-9])).x", "main", { "name": "next", "prerelease": true }]
```

The first pattern matches `1.x` and `1.2.x`, not `1.x.x`.

**Protection.**

- Pull requests are squash-merged with the PR title as the commit subject and an empty body; rebase merges are off. The
  title's type decides the release: `feat` → minor, `fix`/`perf`/`build(deps)` → patch, anything else → none.
- The release workflow fails if `next` is configured without `prerelease: true`.
- The `Conventional title` check runs from the base branch (`pull_request_target`, no PR code executed). For PRs into
  `main` and `*.x` it rejects titles and bodies that would publish a major, using the same patterns as the commit
  parser, and it rejects PRs that contain commits from `next`. The only override is the `release:major` label.
- Rulesets: `main` and `*.x` allow only squash merges; `next` allows squash and merge commits (for syncing from `main`);
  `v*` tags cannot be deleted or moved. Pushes that create `next` or `1.x` are allowed.

**Flow.**

1. Version 2 work is squash-merged into `next`. The first `feat!` PR makes the next release on `next` a 2.0.0
   prerelease.
2. 1.x fixes land in `main` and are merged into `next` with a merge commit (not cherry-picked, so they are not repeated
   in the 2.0.0 notes).
3. Prereleases on `next` start after gate G2 (ADR-18).
4. **Cutover:**
   1. freeze `main` and merge it into `next`;
   2. **before** creating `1.x`, record the channel note on the last 1.x tag:
      `git notes --ref semantic-release-v1.1.X add -f -m '{"channels":[null,"1.x"]}' v1.1.X` and push
      `refs/notes/semantic-release-v1.1.X`;
   3. create `1.x` from `main`;
   4. turn off `delete_branch_on_merge` and temporarily allow merge commits on `main`;
   5. merge `next` into `main` with a merge commit, with the `release:major` label; `main` publishes 2.0.0 to `latest`;
   6. restore the `main` ruleset and the branch setting; fast-forward or delete `next`; edit the release notes by hand.
5. After 2.0.0, 1.x fixes go to `1.x` and publish to the `release-1.x` dist-tag. 1.x receives correctness and security
   fixes for 12 months after 2.0.0.

## Consequences

- Nothing can publish 2.0.0 by accident from `main` or `next`.
- A dry run of semantic-release is not used: it moves the local `main`. Configuration is checked by the guard step and
  by simulation in a throwaway repository.
- The single maintainer can bypass the rulesets; the bypass should not be used without a reason.

## Evidence

Simulated with semantic-release 25.0.9 and the conventionalcommits preset in a throwaway repository with a local bare
origin:

| Step | Result |
|---|---|
| `ci:` commit on `main` | no release |
| `1.x` created while `main` is on 1.x, then `fix:` on `1.x` | `EINVALIDNEXTVERSION` (range `>=1.1.2 <1.1.2`) |
| `feat!:` on `next` | `2.0.0-next.1` |
| merge `main` → `next`, then `feat:` on `next` | `2.0.0-next.2`, `2.0.0-next.3` |
| cutover merge into `main` | `2.0.0` |
| `fix:` on `1.x` after the cutover | `1.1.4` on `release-1.x` |
| `fix:` on `main` after the cutover | `2.0.1` |
| `next` fast-forwarded, then `feat:` | `2.1.0-next.1` |

- Without the channel note, pushing `1.x` makes semantic-release add the `1.x` channel to the last tag with
  `npm dist-tag add`, which trusted publishing (OIDC) cannot authenticate (semantic-release/npm#1023), so the release
  job fails.
- Commit parser rules (conventional-commits-parser 6.4.0, preset 9.3.1): a body line that, after spaces, `|` or `*`,
  starts with `BREAKING CHANGE` or `BREAKING-CHANGE` in any case, followed by `:` or a space, publishes a major. The
  title pattern `^\w*(\(.*\))?!: ` has a greedy scope. The title check matches the parser on 180 of 180 test inputs.
- The rulesets and the title check were verified on the live repository with a probe pull request.
