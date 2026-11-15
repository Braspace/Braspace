# Archived MoonProof persona selection (2026-11-15)

The canonical /moonproof/ entry now opens the Cockpit directly. The older
Explore / Teach / Plan persona chooser is retired from the entry path,
not deleted from Git history. Its previous source and rendered assets are
available at immutable main snapshot 62bf446e386d3101b6448582330248e160edbb09.

Restore on a separate branch if required:

```sh
git restore --source=62bf446e386d3101b6448582330248e160edbb09 -- web/moonproof/index.html web/moonproof/screens/entry.tsx web/moonproof/screens/entry.js
```

The prior entry stylesheet and shared role/layer translations are not
removed by this change. Existing task/layer/site/locale query values and
the fragment are carried to the Cockpit; direct links to other MoonProof
screens are unaffected. The rest of the legacy archive is tracked
separately by PR #321.
