import Foundation
import WidgetKit
import ActivityKit

private let APP_GROUP = "group.com.auders.t1dsage"

// How long (seconds) a Live Activity reading is considered fresh.
// After this, iOS will mark the activity as stale automatically.
private let STALE_INTERVAL: TimeInterval = 16 * 60  // 16 minutes

@objc(GlucoseWidgetsModule)
class GlucoseWidgetsModule: NSObject {

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
    //
    // Resolves immediately with the activity ID (plain String).
    // A background Task then observes pushTokenUpdates with NO timeout — the
    // token may arrive well after 5 s depending on APNs conditions. Once it
    // arrives the token is POSTed to the server via URLSession.
    //
    // Server config (URL + auth token) is read from NSUserDefaults.standard,
    // written there by JS via React Native's Settings.set() before this call.

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
                if let existing = Activity<GlucoseActivityAttributes>.activities.first,
                   existing.pushToken != nil {
                    // Reuse existing activity only if it already has a push token channel.
                    await existing.update(content)
                    activity = existing
                } else {
                    // End any stale activity that lacks a push token, then start fresh.
                    for stale in Activity<GlucoseActivityAttributes>.activities {
                        await stale.end(nil, dismissalPolicy: .immediate)
                    }
                    activity = try Activity.request(
                        attributes: GlucoseActivityAttributes(),
                        content: content,
                        pushType: .token)
                }

                // Resolve immediately — no waiting for the push token here.
                resolve(activity.id)

                let serverUrl = Bundle.main.infoDictionary?["T1DServerURL"] as? String ?? ""
                let activityId = activity.id

                // Observe pushTokenUpdates indefinitely; APNs may take >5 s.
                Task {
                    for await tokenData in activity.pushTokenUpdates {
                        let hex = tokenData.map { String(format: "%02x", $0) }.joined()
                        NSLog("[GlucoseWidgets] Push token received (%@…)", String(hex.prefix(16)))
                        await GlucoseWidgetsModule.postPushToken(hex, activityId: activityId, serverUrl: serverUrl)
                        // Continue loop — iOS rotates tokens occasionally.
                    }
                    NSLog("[GlucoseWidgets] pushTokenUpdates stream ended.")
                }

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

    private static func postPushToken(_ token: String,
                                       activityId: String,
                                       serverUrl: String) async {
        guard !serverUrl.isEmpty,
              let url = URL(string: "\(serverUrl)/notifications/live-activity-token") else {
            NSLog("[GlucoseWidgets] postPushToken: invalid or missing serverUrl")
            return
        }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        // No auth header needed — the endpoint looks up the user by activityId,
        // which was pre-registered by JS via /live-activity-register (with auth).
        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: [
                "token": token, "activityId": activityId
            ])
            let (_, response) = try await URLSession.shared.data(for: request)
            let status = (response as? HTTPURLResponse)?.statusCode ?? 0
            NSLog("[GlucoseWidgets] Token registration response: %d", status)
        } catch {
            NSLog("[GlucoseWidgets] postPushToken error: %@", error.localizedDescription)
        }
    }

    @objc static func requiresMainQueueSetup() -> Bool { false }
}
