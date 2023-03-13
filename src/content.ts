import "./content-globals"


require('arrive')

import {ChatruletkaDriver} from "./drivers/content-driver-chatruletka";
import {ChatruletkaSimpleDriver} from "./drivers/content-driver-chatruletka-simple";
import {switchMode} from "./drivers/chatruletka/content-swal-switchmode";
import {injectIpGrabber} from "./drivers/chatruletka/content-module-geolocation";
import {injectContextInvalidatedCheck} from "./swal/content-swal-context-invalidated"
import {ContentSwalInfo} from "./drivers/chatruletka/content-swal-info";
import {ContentSwalChangelog} from "./swal/content-swal-changelog";
import {extractDomain, getPlatformByHost} from "./utils/utils";
import * as Sentry from "@sentry/browser";
import {PlatformSettings} from "./content-platform";
import {OmegleSimpleDriver} from "./drivers/content-driver-omegle-simple";
import {ContentSwalInfoOmegle} from "./drivers/omegle/content-swal-info";

injectIpGrabber()

async function content() {
    let settings = await chrome.storage.sync.get()

    // TODO: firefox just crashes when sentry tries to initialise
    // ¯\_(ツ)_/¯
    // @ts-ignore
    if (settings.sentry && typeof browser === "undefined") {
        Sentry.init({
            dsn: "https://09512316dbc3422f931ad37d4fb12ed2@o1272228.ingest.sentry.io/6533563",
            release: "videochat-extension@" + chrome.runtime.getManifest().version,
            autoSessionTracking: false // disable session tracking
        });
    }
    let domain = extractDomain(location.href)
    if (domain === 'videochatru.com') {
        if (settings["legacyPrevent"]["98ea82db-9d50-4951-935e-2405d9fe892e"]) {
            return
        }
    } else if (domain === 'ome.tv') {
        if (settings["legacyPrevent"]["7fef97eb-a5cc-4caa-8d19-75dab7407b6b"]) {
            return
        }
    }

    let platforms = await (await fetch(chrome.runtime.getURL('platforms.json'))).json()

    let website = getPlatformByHost(platforms, domain)

    if (!website) {
        alert("VIDEOCHAT EXTENSION: unknown videochat platform / host, no idea what to do, sorry :(.\n\nYou can report the bug to: https://github.com/qrlk/videochat-extension, https://discord.gg/YZKnbKGWen or qrluke@proton.me.")
        return
    }

    let recentDict = (await chrome.storage.sync.get({"recentDict": {}})).recentDict
    recentDict[website.site.id] = Math.ceil(+new Date() / 1000)

    globalThis.platformSettings = PlatformSettings.initInstance(website.platform.id)

    await globalThis.platformSettings.setup()

    console.dir(globalThis.platformSettings.settings)

    await chrome.storage.sync.set({"recentDict": recentDict})
    await chrome.storage.sync.set({"lastIconName": website.site.favicon})
    await chrome.storage.sync.set({"lastDomain": domain})

    let platform = website.platform.id
    if (["7390db38-a617-4f6e-8a8a-ee353b76cc25", "8fa234f6-1767-4d81-897e-758df844ae31", "b15b920c-6882-4023-af28-f31e296b80e3", "b0073d25-a35d-4388-8dfb-6db6c81ad6ed"].includes(platform)) {
        platform = "COMC"
    }
    if (platform === "b101a84a-8549-4676-9bd9-ec2582c72c54") {
        platform = "Omegle"
    }

    async function processSwals(website: { site?: any; platform: any; }) {
        if (!globalThis.platformSettings.get("swalInfoCompleted")) {
            // TODO: maybe show people only 1-step info about what features are supported?
            new ContentSwalInfo(website.platform.name).showFromStart()
        } else {
            if (settings.allowShowChangelog) {
                if (settings.lastVersion !== chrome.runtime.getManifest().version) {
                    ContentSwalChangelog.getInstance().showFromVersion(settings.lastVersion)
                }
                chrome.storage.sync.set({lastVersion: chrome.runtime.getManifest().version})
            }
        }
    }

    switch (platform) {
        case "COMC": {
            if (globalThis.platformSettings.get("askForMode")) {
                document.arrive(".buttons__button.start-button", {onceOnly: true, existing: true}, () => {
                    switchMode()
                })
                return false
            } else if (globalThis.platformSettings.get("minimalism")) {
                document.arrive(".buttons__button.start-button", {onceOnly: true, existing: true}, () => {
                    injectContextInvalidatedCheck()
                    globalThis.driver = ChatruletkaSimpleDriver.getInstance()
                    globalThis.driver.start(document.getElementById('remote-video-wrapper') as HTMLElement)
                })
                return false
            } else {
                await globalThis.platformSettings.setDriverDefaults(ChatruletkaDriver.defaults)
                document.arrive(".buttons__button.start-button", {onceOnly: true, existing: true}, () => {
                    if (website) {
                        injectContextInvalidatedCheck()
                        processSwals(website)
                        globalThis.driver = ChatruletkaDriver.getInstance(website)
                        globalThis.driver.start(document.getElementById('remote-video-wrapper') as HTMLElement)
                    }
                })
            }
            break;
        }
        case "Omegle": {
            if (location.pathname === "/" && window === window.top) {
                document.arrive("body", {onceOnly: true, existing: true}, async () => {
                    injectContextInvalidatedCheck()
                    await globalThis.platformSettings.setDriverDefaults({
                        darkMode: false
                    })
                    globalThis.driver = OmegleSimpleDriver.getInstance()
                    globalThis.driver.start(document.body)
                    if (!globalThis.platformSettings.get("swalInfoCompleted")) {
                        new ContentSwalInfoOmegle().showFromStart()
                    }
                })
            }
            break;
        }
        default: {
            return false
        }
    }
}

// TODO: firefox for some reason injects the content script in about:blank ???
// this happens only in dynamic scripts, possible allFrames issue ???
if (location.href.includes('http')) {
    content()
}
