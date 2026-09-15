import { describe, it, expect } from 'vitest'
import { screenSizeFromDeviceType } from '../DeviceChromeLoader'

// Shapes as `plutil -convert json` reads the real files. The Xcode 26.6 ones are an iPhone 17 Pro's;
// the Xcode 27 one follows tddworks/baguette#35, measured on Xcode 27 beta 3.
const xcode26Profile = {
  mainScreenWidth: 1206, mainScreenHeight: 2622, mainScreenScale: 3,
  mainScreenWidthDPI: 460, mainScreenHeightDPI: 460,
}
// Xcode 26.6 already ships capabilities.plist, and its screen lives under a key nothing reads.
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

describe('screenSizeFromDeviceType', () => {
  it('reads the profile on Xcode 26', () => {
    expect(screenSizeFromDeviceType(xcode26Profile, xcode26Capabilities)).toEqual({ width: 402, height: 874 })
  })

  it('reads the integrated display on Xcode 27, wherever it sits in the list', () => {
    expect(screenSizeFromDeviceType(xcode27Profile, xcode27Capabilities)).toEqual({ width: 834, height: 1210 })
  })

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
    const noWidth = { displayType: 'integrated', height: 2420, scale: 2 }
    expect(screenSizeFromDeviceType(xcode27Profile, { capabilities: { displays: [noWidth] } })).toBeNull()
  })
})
