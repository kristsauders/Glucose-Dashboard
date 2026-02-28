import ActivityKit
import Foundation

struct GlucoseActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var glucose: Int
        var trend: String
        var readingDate: Date
        var isLow: Bool
        var isHigh: Bool
    }
}
