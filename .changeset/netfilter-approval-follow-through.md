---
"tapflow": minor
---

`tapflow migrate net-filter` and `tapflow setup ios` now finish an install that stopped at macOS approval in the same run. Until now they printed where to approve the network extension and exited with the filter switched off, so even someone who approved straight away had to run the command a second time before iOS network control worked.

In a terminal the command now offers to open the approval screen — the Network Extensions sheet with tapflow's switch in it — waits up to two minutes for the switch, and turns the filter on. Before that moment it says that connections the Mac already has open may drop, SSH sessions included, and it will not switch on over a simulator somebody started while it waited. It never claims the window opened, because nothing can check that: the path to the screen is printed alongside.

Without a terminal, or when the offer is declined or nobody switches it on in time, the banner now says to run the command again rather than to check with `tapflow doctor ios`, which only led back to the same instruction.
