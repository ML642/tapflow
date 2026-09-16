---
"tapflow": minor
---

`tapflow migrate net-filter` and `tapflow setup ios` now finish an install that stopped at macOS approval in the same run. Until now they printed where to approve the network extension and exited with the filter switched off, so even someone who approved straight away had to run the command a second time before iOS network control worked.

In an interactive terminal the command now offers to open the approval screen — the Network Extensions sheet with tapflow's switch in it — and **the question itself says what a yes leads to**: once the switch is on, tapflow turns the filter on, and connections the Mac already has open may drop, SSH sessions included. It then waits up to two minutes for the switch and turns the filter on, naming the content-filtering question macOS may ask at that point. It will not switch on over a simulator somebody started while it waited, and when it declines it says whether the filter is off. It never claims the window opened, because nothing can check that: the path to the screen is printed alongside.

Without an interactive terminal — stdin as well as stdout, since a prompt reading an empty stdin ends the command with no output at all — or when the offer is declined or nobody switches it on in time, the banner now says to run the command again rather than to check with `tapflow doctor ios`, which only led back to the same instruction.
