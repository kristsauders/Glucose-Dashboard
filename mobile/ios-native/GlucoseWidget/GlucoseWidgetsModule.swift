import Foundation
import WidgetKit
import ActivityKit

private let APP_GROUP = "group.com.auders.t1dsage"

// How long (seconds) a Live Activity reading is considered fresh.
// After this, iOS will mark the activity as stale automatically.
private let STALE_INTERVAL: TimeInterval = 16 * 60  // 16 minutes

@objc(GlucoseWidgetsModule)
class GlucoseWidgetsModule: RCTEventEmitter {

    private var hasListeners = false

    // MARK: - RCTEventEmitter

    override func supportedEvents() -> [String]! {
        return ["liveActivityPushToken"]
    }

    override func startObserving() {
        hasListeners = true
    }

    override func stopObserving() {
        hasListeners = false
    }

    // MARK: - Widget + Live Activity update (called every poll from JS)

    @objc func updateGlucose(_ glucose: Double,
                              trend: String,
                              timestamp: Double,
                              isLow: Bool,
                              isHigh: Bool) {
        let defaults = UserDefaults(suiteName: APP_GROUP)
        defaults?.set(Int(glucose), forKey: "currentGlucose")
        defaults?.set(trend,        forKey: "currentTrend")
        defaults?.set(timestamp,    forKey: "currentTimestamp")
        defaults?.synchronize()
        WidgetCenter.shared.reloadAllTimelines()

        if #available(iOS 16.2, *) {
            Task {
                await GlucoseWidgetsModule.updateActivity(
                    glucose: Int(glucose), trend: trend, timestamp: timestamp,
                    isLow: isLow, isHigh: isHigh)
            }
        }
    }

    // MARK: - Start Live Activity (called once on first reading)

    @objc func startLiveActivity(_ glucose: Double,
                                  trend: String,
                                  timestamp: Double,
                                  isLow: Bool,
                                  isHigh: Bool,
                                  resolve: @escaping RCTPromiseResolveBlock,
                                  reject: @escaping RCTPromiseRejectBlock) {
        guard #available(iOS 16.2, *) else {
            reject("UNSUPPORTED", "Live Activities require iOS 16.2+", nil); return
        }
        Task {
            do {
                let readingDate = Date(timeIntervalSince1970: timestamp)
                let staleDate   = readingDate.addingTimeInterval(STALE_INTERVAL)
                let state = GlucoseActivityAttributes.ContentState(
                    glucose: Int(glucose), trend: trend,
                    readingDate: readingDate,
                    isLow: isLow, isHigh: isHigh)
                let content = ActivityContent(state: state, staleDate: staleDate)

                let activity: Activity<GlucoseActivityAttributes>
                if let existing = Activity<GlucoseActivityAttributes>.activities.first {
                    await existing.update(content)
                    activity = existing
                } else {
                    activity = try Activity.request(
                        attributes: GlucoseActivityAttributes(),
                        content: content)
                }

                resolve(activity.id)

                // Observe push token updates for the lifetime of this activity.
                // The first value comes immediately and gives us the token to register
                // with the server. iOS may rotate the token; each new value is emitted.
                self.observePushToken(for: activity)

            } catch {
                reject("START_FAILED", error.localizedDescription, error)
            }
        }
    }

    // MARK: - End Live Activity

    @objc func endLiveActivity() {
        guard #available(iOS 16.2, *) else { return }
        Task {
            for activity in Activity<GlucoseActivityAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
        }
    }

    // MARK: - Internal helpers

    @available(iOS 16.2, *)
    static func updateActivity(glucose: Int, trend: String, timestamp: Double,
                                isLow: Bool, isHigh: Bool) async {
        let readingDate = Date(timeIntervalSince1970: timestamp)
        let staleDate   = readingDate.addingTimeInterval(STALE_INTERVAL)
        let state = GlucoseActivityAttributes.ContentState(
            glucose: glucose, trend: trend,
            readingDate: readingDate,
            isLow: isLow, isHigh: isHigh)
        let content = ActivityContent(state: state, staleDate: staleDate)
        for activity in Activity<GlucoseActivityAttributes>.activities {
            await activity.update(content)
        }
    }

    /// Watches the activity's push token and emits it to JS whenever it changes.
    /// The first emission happens quickly after calling this — that token is what
    /// we register with the server so it can push updates while the app is frozen.
    @available(iOS 16.2, *)
    private func observePushToken(for activity: Activity<GlucoseActivityAttributes>) {
        Task {
            for await tokenData in activity.pushTokenUpdates {
                let hexToken = tokenData.map { String(format: "%02x", $0) }.joined()
                guard self.hasListeners else { continue }
                self.sendEvent(withName: "liveActivityPushToken", body: [
                    "token": hexToken,
                    "activityId": activity.id,
                ])
            }
        }
    }

    @objc override static func requiresMainQueueSetup() -> Bool { false }
}
