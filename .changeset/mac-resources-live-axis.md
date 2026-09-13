---
'@tapflowio/relay': patch
---

**The Mac Resources charts follow the clock now** ([#751](https://github.com/jo-duchan/tapflow/issues/751)). They were fetched once, when the page opened, and the window ended at that moment for as long as the page stayed open — so a monitoring screen showed nothing newer than when you arrived, and the space between the last time label and the right edge read as an axis skewed to one side. The window's edge now advances at a pace set by the range, labels enter on the right and fade out on the left, and the history is re-fetched on a cadence that matches what the relay stores: every minute on 1h and 6h, every five minutes on 24h, every fifteen on 7d. Nothing runs while the tab is hidden, and a refresh that fails keeps the chart as it was instead of emptying it.

**The line reaches the present.** The relay stores one averaged sample a minute, so the newest stored point is up to a minute old. The Mac's latest report, sent every five seconds and already part of the dashboard's Mac list, ends each line in a dot, and is never stored. Hovering the dot, or pressing End on the chart, reads its value at the current time. It is dropped once it is more than 30 seconds old, the same point at which the QA Session cards call a Mac stale.

**Time labels sit on local round times** ([#749](https://github.com/jo-duchan/tapflow/issues/749)). They were aligned in UTC, which is only round where the offset is a whole number of hours: in a 45-minute zone the 1h axis read 07:45, 07:55, and west of Greenwich a 7d label named the day before the midnight it marked. Across a daylight-saving change one gap is now 23 or 25 hours wide, because that day is.
