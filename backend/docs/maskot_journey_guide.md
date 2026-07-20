# Mascot journey guide

## Shared behavior

Mascot journeys live in `frontend/features/guide/`. Desktop uses the floating character,
spotlight, and accessible dialog; mobile uses the compact accessible sheet. Both support
reduced motion, focus trapping, Escape/arrow-key controls, skip confirmation, a replay
launcher, a first-run activity guard, nudge/snooze behavior, and independent browser
storage for guests. Signed-in completion and hard dismissal are synchronized through the
preference endpoints documented in [user_preferences.md](user_preferences.md).

Guide copy is feature-local and must include both `en` and `bn` branches. Follow
`frontend_localization.md`: Bangla stays conversational, retains familiar product terms
such as FDR, DPS, and Zakat, and uses Western digits.

## Wealth Workspace overview

The Wealth journey is version 1 and runs only at `/wealth`. It has independent desktop
and mobile preference scopes, an overview-nav launcher on desktop, and the header mascot
launcher on mobile. Existing mascot artwork is reused.

1. **Welcome** — explain current money choices and future outcomes.
2. **Wealth menu overview** — introduce the navigation as the workspace map.
3. **Calculators** — force-open the calculator menu; mention FDR, DPS, Sanchayapatra,
   Zakat, and more without narrating each item.
4. **Tax Planner** — describe annual estimates and savings/rebate exploration.
5. **Other tools** — group Snapshot, Time Travel, and DPS vs FDR.

The calculator menu is explicitly controlled by the guide. It must close on navigation
away from its step, Back, skip, completion, dismissal, unmount, and route exit. Do not
simulate a user click.

## Testing and troubleshooting

Test both locales, route gating, separate desktop/mobile persistence, launcher replay,
keyboard and skip behavior, reduced motion, and calculator cleanup. For a fresh local
run, remove the relevant `smart-stock-guide-wealth-overview-*-v1` local-storage key and
its matching session auto-start key, or use a fresh browser profile.
