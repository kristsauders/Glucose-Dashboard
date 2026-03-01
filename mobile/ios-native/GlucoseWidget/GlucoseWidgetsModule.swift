import Foundation
import WidgetKit
import ActivityKit

private let APP_GROUP = "group.com.auders.t1dsage"

@objc(GlucoseWidgetsModule)
class GlucoseWidgetsModule: NSObject {

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
                let state = GlucoseActivityAttributes.ContentState(
                    glucose: Int(glucose), trend: trend,
                    readingDate: Date(timeIntervalSince1970: timestamp),
                    isLow: isLow, isHigh: isHigh)
                let content = ActivityContent(state: state, staleDate: nil)
                // Reuse an already-running activity (survives app restarts)
                if let existing = Activity<GlucoseActivityAttributes>.activities.first {
                    await existing.update(content)
                    resolve(existing.id)
                    return
                }
                let activity = try Activity.request(
                    attributes: GlucoseActivityAttributes(),
                    content: content)
                resolve(activity.id)
            } catch {
                reject("START_FAILED", error.localizedDescription, error)
            }
        }
    }

    @objc func endLiveActivity() {
        guard #available(iOS 16.2, *) else { return }
        Task {
            for activity in Activity<GlucoseActivityAttributes>.activities {
                await activity.end(nil, dismissalPolicy: .immediate)
            }
        }
    }

    @available(iOS 16.2, *)
    static func updateActivity(glucose: Int, trend: String, timestamp: Double,
                                isLow: Bool, isHigh: Bool) async {
        let state = GlucoseActivityAttributes.ContentState(
            glucose: glucose, trend: trend,
            readingDate: Date(timeIntervalSince1970: timestamp),
            isLow: isLow, isHigh: isHigh)
        let content = ActivityContent(state: state, staleDate: nil)
        for activity in Activity<GlucoseActivityAttributes>.activities {
            await activity.update(content)
        }
    }

    @objc static func requiresMainQueueSetup() -> Bool { false }
}
