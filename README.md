# pi-setup

A small, opinionated [Pi](https://pi.dev) configuration: compact transcripts, a real
tokens-per-second readout, a prompt-cache countdown, browser tabs for sessions, a
full-bleed startup splash and two patches that keep startup fast.

Everything here is **visual or local tooling**. No prompt injection, no extra model
calls, no changes to how the agent reasons.

## What's inside

| Piece | What it does |
|---|---|
| `extensions/tabs.ts` | Session tabs: several sessions open in one window, a tab bar above the editor, `/tabs` menu, `alt+1…9` to jump, `alt+.`/`alt+,` to cycle. Persists per directory in `pi-tabs.json`. |
| `extensions/tps.ts` | Real output TPS. Live value while streaming, turn average when the run settles. Counts provider-reported `usage.output` over real generation time, discarding server stalls > 300 ms. |
| `extensions/cache-ttl.ts` | Prompt-cache countdown in the status bar (`⏳ cache 4:42`), green → yellow → `cache expired`. Uses `model.promptCache.short`, 5 min fallback. |
| `extensions/bash-eta.ts` | Estimated duration in the bash tool row: `[⏱ 8s] · ~15s · máx 1m 00s`. Learns per-command averages locally (no model calls) and uses the agent’s `timeout` as a ceiling. |
| `extensions/ctrl-p-menu.ts` | `ctrl+p` opens a quick model/thinking menu instead of cycling models. Requires `keybindings.json` to free the key. |
| `extensions/omp-look.ts` | The eight-glyph thinking spinner (`✻ ✼ ❉ ❊ ✺ ✹ ✸ ✶`). Purely cosmetic. |
| `extensions/repatch.ts` | Re-applies the patches below after a package update, and refuses to when the package version changed. |
| `AGENTS.md` | Global agent instructions (Spanish, informal, verification-first, respects build time). Edit or ignore. |
| `settings.example.json` | Settings keys worth copying: thinking level, hidden thinking blocks, package list, minimalist preset. |
| `patches/` | Five diffs against upstream packages: lazy-load Playwright, turndown/linkedom/readability and unpdf so startup is ~0.9 s faster; make the splash fill the window and respect terminal transparency. |

## Install

```bash
git clone <this-repo> pi-setup && cd pi-setup
./install.sh
```

`install.sh` copies the extensions into `${PI_CODING_AGENT_DIR:-~/.pi/agent}/extensions`,
merges `settings.example.json` into your `settings.json` (existing keys win), and
installs the packages with `pi install`.

Then install the community packages this setup leans on:

```bash
pi install npm:pi-minimalist
pi install npm:awesome-pi-themes
pi install npm:pi-subagents-lite
pi install npm:pi-hermes-memory
pi install npm:@underactive/pi-topping-splash
pi install npm:@underactive/pi-topping-web-tools
pi install npm:pi-subagents-lite
npx playwright install chromium   # only if you want the web_browser tool
```

Restart Pi. The splash needs `"quietStartup": true` in `settings.json` to be the
only header.

## Patches

```bash
./apply-patches.sh          # dry run: shows what would change
./apply-patches.sh --apply  # patch the installed packages
```

Or let `extensions/repatch.ts` handle it: it runs at startup, re-applies what is
missing and warns when an upstream release moved on. `apply-patches.sh` is the
same logic without launching Pi.

The patches are **not** required for anything to work. They make startup faster and
the splash prettier. Skip them if you prefer stock packages.

## Why these patches

- **Lazy Playwright / turndown / linkedom / unpdf.** `pi-topping-web-tools` imports
  ~1 s of parsing and browser code at startup for tools you may never call. Moves
  them behind `await import()`.
- **Splash height and transparency.** The splash caps itself at 60 % of the terminal
  and paints opaque background blocks, which fights semi-transparent terminals. The
  patch lifts the cap to 85 %, keeps the info panel compact, and paints the gradient
  in the foreground only so the window's transparency shows through.

## Credits

This repo is glue and four small extensions; the heavy lifting is other people's work.
All upstream packages are MIT licensed.

- [Pi](https://github.com/earendil-works/pi) — the harness itself, by earendil-works.
- [pi-minimalist](https://github.com/EviHex/pi-minimalist) — Pinglei He (MIT). One-line
  tool rows, grouped runs, folded activity.
- [awesome-pi-themes](https://github.com/isashi/awesome-pi-themes) — isashi (MIT). 71 themes.
- [pi-subagents-lite](https://github.com/AlexParamonov/pi-subagents-lite) — AlexParamonov (MIT).
- [pi-hermes-memory](https://github.com/chandra447/pi-hermes-memory) — chandra447 (MIT).
- [pi-topping-splash](https://github.com/underactive/pi-topping-splash) and
  [pi-topping-web-tools](https://github.com/underactive/pi-topping-web-tools) — Eric Sison (MIT).
  The diffs in `patches/` are derivative works of these two, under the same license.
- Inspiration for the thinking spinner: [oh-my-pi](https://github.com/can1357/oh-my-pi).

The patches are version-pinned (splash 0.6.1, web-tools 0.4.0). If upstream changes
shape, `repatch.ts` will tell you instead of corrupting the file.

## License

MIT — see [LICENSE](LICENSE).
