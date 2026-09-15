---
'@tapflowio/ios-agent': patch
---

**Taking an iOS simulator offline no longer fails on the first press with "This Mac is not set up"** ([#797](https://github.com/jo-duchan/tapflow/issues/797)). Right after writing the filter rule, the agent asked the network filter once what it was holding, and the filter could still answer with the rule from before the write. That answer was treated as a filter tapflow cannot control: the press was refused, the control said the Mac was not set up, and it kept saying so until a later toggle went through. On a macOS 27 Mac it happened on four offline presses in four during one session, and on some presses coming back online. The agent now asks again for up to three seconds before refusing, so only a filter still holding the wrong rule after that is reported.
