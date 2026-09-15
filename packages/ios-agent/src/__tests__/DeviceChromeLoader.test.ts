import { describe, it, expect } from 'vitest'
import { screenSizeFromDeviceType } from '../DeviceChromeLoader'

// Shapes as `plutil -convert json` reads the real files. The Xcode 26.6 ones are an iPhone 17 Pro's;
// the Xcode 27 entries are an iPad Pro 11-inch (M4)'s on Xcode 27.0 (27A266a), trimmed to the keys read.
// There every one of 129 device types lists `displays` and none keeps the profile keys.
const xcode26Profile = {
  mainScreenWidth: 1206, mainScreenHeight: 2622, mainScreenScale: 3,
  mainScreenWidthDPI: 460, mainScreenHeightDPI: 460,
}
// Xcode 26.6 already ships capabilities.plist. Where it states the screen at all (116 of 124 types),
// that is under a key nothing reads.
const xcode26Capabilities = {
  capabilities: {
    idiom: 'phone',
    ScreenDimensionsCapability: { 'main-screen-width': 1206, 'main-screen-height': 2622, 'main-screen-scale': 3 },
  },
}
const xcode27Profile = { chromeIdentifier: 'com.apple.dt.devicekit.chrome.tablet5' }
const tvOut = { displayType: 'tvOut', displayName: 'TVOut', width: 720, height: 480, scale: 1 }
const integrated = { displayType: 'integrated', displayName: 'LCD', width: 1668, height: 2420, scale: 2 }
const scene = { displayType: 'scene', displayName: 'Resizable', width: 7680, height: 4320, scale: 3 }
// `integrated` is deliberately not first, so picking the first display gets a different answer.
const xcode27Capabilities = { capabilities: { displays: [tvOut, integrated, scene] } }
// The iPad panel above is @2, so on it alone a scale fixed at 2 would pass. This is iPhone 17e's
// integrated display on Xcode 27.0, @3, which loads there at 390×844.
const phonePanel = { displayType: 'integrated', displayName: 'LCD', width: 1170, height: 2532, scale: 3 }

describe('screenSizeFromDeviceType', () => {
  it('reads the profile on Xcode 26', () => {
    expect(screenSizeFromDeviceType(xcode26Profile, xcode26Capabilities)).toEqual({ width: 402, height: 874 })
  })

  it('reads the integrated display on Xcode 27, wherever it sits in the list', () => {
    expect(screenSizeFromDeviceType(xcode27Profile, xcode27Capabilities)).toEqual({ width: 834, height: 1210 })
  })

  it("divides by the display's own scale", () => {
    expect(screenSizeFromDeviceType(xcode27Profile, { capabilities: { displays: [tvOut, phonePanel] } }))
      .toEqual({ width: 390, height: 844 })
  })

  // No measured install carries both (26.6 has no `displays`, 27 no profile keys): this pins the
  // order, not a shape that occurs.
  it('prefers the profile when both plists carry a size', () => {
    expect(screenSizeFromDeviceType(xcode26Profile, xcode27Capabilities)).toEqual({ width: 402, height: 874 })
  })

  it('has no size when the profile has none and capabilities lists no displays', () => {
    expect(screenSizeFromDeviceType(xcode27Profile, xcode26Capabilities)).toBeNull()
    expect(screenSizeFromDeviceType(xcode27Profile, null)).toBeNull()
  })

  it('has no size when no listed display is integrated', () => {
    expect(screenSizeFromDeviceType(xcode27Profile, { capabilities: { displays: [tvOut, scene] } })).toBeNull()
  })

  it('has no size for a zero scale or a missing dimension', () => {
    expect(screenSizeFromDeviceType({ ...xcode26Profile, mainScreenScale: 0 }, null)).toBeNull()
    const { width: _w, ...noWidth } = phonePanel
    const { height: _h, ...noHeight } = phonePanel
    const { scale: _s, ...noScale } = phonePanel
    for (const panel of [noWidth, noHeight, noScale]) {
      expect(screenSizeFromDeviceType(xcode27Profile, { capabilities: { displays: [panel] } })).toBeNull()
    }
  })
})
