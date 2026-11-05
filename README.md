# Overload

A gym tracker built for one lifter who trains on a lot of different machines at more than one gym.

**Open it:** https://altnicck.github.io/overload/

## What it does

- **Unlimited machines.** Each one has its own photo, gym, muscle group, settings note (seat, pins, grip) and history. Two leg presses at two gyms are two separate machines with separate PRs.
- **PR alerts.** When a set beats your best estimated 1RM on that machine, a notification banner drops in with a chime and a haptic tap.
- **Weekly recap.** Every Monday the app compares last week with the session before it on each exercise and labels the week Strong gain, Gain, Maintained or Dip. It also lists PRs and any machine that has stalled for three sessions.
- **Lifetime counter and streak.** Starts from 1,219 workouts (1,067 before Jefit + 152 in Jefit) and counts up with every workout you finish.
- **Progress charts.** Est. 1RM, top weight and volume per machine, plus weekly volume and workouts.
- **Body maps.** Every routine, workout and machine shows the muscles it trains on a front and back figure, and Summary and Progress show a heat map of the muscles you have worked lately. The figures come from react-native-body-highlighter (MIT); see `LICENSES.md`.
- **Works offline.** After the first launch the whole app is cached on the phone.

Est. 1RM uses the Epley formula (weight × (1 + reps / 30)), the same one Jefit uses, so imported numbers line up.

## Install on iPhone

1. Open the link above in **Safari**.
2. Tap **⋯** (or the Share button) → **Add to Home Screen**. Keep **Open as Web App** on.
3. Open **Overload** from the Home Screen and finish setup there.

## Your data

Workouts and photos are stored only on your iPhone, inside the Home Screen app (IndexedDB). Nothing is uploaded and this repository holds only the app's code. Removing the Home Screen icon deletes the data, so use **Settings → Back up now** and save the file to iCloud Drive every week or two. **Restore** brings it back on any phone.

## Updating

Push changes to `main`. GitHub Pages redeploys in about a minute, and the app shows "A new version is ready" the next time it opens. Bump `VERSION` in `sw.js` (and `APP_VERSION` in `js/version.js`) with every release so the cached files refresh.

## Code

Plain ES modules, no build step. Preact + htm are vendored in `js/preact.js`.

```
index.html            app shell, iOS meta tags, launch screens
sw.js                 offline cache
js/app.js             tabs, navigation stacks, sheets, banners
js/store.js           state, IndexedDB persistence, import/backup
js/logic.js           PRs, est. 1RM, weekly recap, streaks
js/screens/*.js       Summary, Workout, Machines, Progress, Settings
css/app.css           Liquid Glass styling
```
