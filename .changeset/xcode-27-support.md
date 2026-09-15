---
'@tapflowio/ios-agent': patch
---

**iOS input and streaming find SimulatorKit where Xcode 27 put it** ([#797](https://github.com/jo-duchan/tapflow/issues/797)). Xcode 27 moved `SimulatorKit.framework` out of the developer directory (`Contents/Developer/Library/PrivateFrameworks/`) into `Contents/SharedFrameworks/`. The touch and screen-capture helpers knew only the old location, so on a Mac whose only Xcode is 27 they could not start: no input reached the simulator and no stream opened. On a Mac with Xcode 26 installed beside 27 they appeared to work, by loading Xcode 26's SimulatorKit against the simulator service Xcode 27 installed. Both locations are now checked on the selected Xcode before any other Xcode is, and each helper logs the SimulatorKit it loaded.

**Bezels come back on every iPad and most iPhones.** Xcode 27 no longer lists a device's screen size in its `profile.plist` and publishes it in `capabilities.plist` instead, so a device whose frame is assembled from nine slices rather than one image lost its bezel. That is most of them: on Xcode 27, 104 of 129 device types, including every iPad and the iPhone 11 through 14, SE, 16e and 17e. The size is now read from either file, and on Xcode 26 exactly as before.
