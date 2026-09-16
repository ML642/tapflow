---
"tapflow": minor
---

`tapflow setup ios` and `tapflow migrate net-filter` now say what the network-filter install is waiting on, instead of printing nothing while it runs. The install can take up to three minutes, and the silence read as a hang.

Each step is named as it starts: checking what the Mac already has, taking the current filter out of the path, copying, activating, and confirming that a filter came back up. The activation line carries the approval warning **before** macOS asks, because the host binary reports "needs user approval" only by exiting 120 seconds later — a synchronous install cannot read that in between, so a warning afterwards would describe a wait that is already over.
