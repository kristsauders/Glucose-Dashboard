import ActivityKit
import Foundation

struct GlucosePoint: Codable, Hashable {
    var glucose: Int
    var minutesAgo: Int
}

struct GlucoseActivityAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        var glucose: Int
        var trend: String
        var readingDate: Date
        var isLow: Bool
        var isHigh: Bool
        var lastInsulinUnits: Double?
        var lastInsulinDate: Date?
        var history: [GlucosePoint]?  // last ~2 hours of readings, oldest first
    }
}
