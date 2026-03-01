import WidgetKit
import SwiftUI
import ActivityKit

@main
struct GlucoseWidgetBundle: WidgetBundle {
    var body: some Widget {
        GlucoseWidget()
        if #available(iOS 16.2, *) {
            GlucoseLiveActivityWidget()
        }
    }
}

@available(iOS 16.2, *)
struct GlucoseLiveActivityWidget: Widget {
    var body: some WidgetConfiguration {
        ActivityConfiguration(for: GlucoseActivityAttributes.self) { context in
            GlucoseLiveActivityView(state: context.state)
                .activityBackgroundTint(Color(.systemBackground))
        } dynamicIsland: { context in
            DynamicIsland {
                DynamicIslandExpandedRegion(.leading) {
                    let color = glucoseColor(context.state.glucose)
                    HStack(alignment: .firstTextBaseline, spacing: 4) {
                        Text("\(context.state.glucose)")
                            .font(.system(size: 36, weight: .bold, design: .rounded))
                            .foregroundStyle(color)
                        Text(context.state.trend).font(.system(size: 24)).foregroundStyle(color)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    if context.state.isLow || context.state.isHigh {
                        let color = glucoseColor(context.state.glucose)
                        Text(context.state.isLow ? "LOW" : "HIGH")
                            .font(.caption.bold()).foregroundStyle(color)
                            .padding(.horizontal, 6).padding(.vertical, 3)
                            .background(color.opacity(0.2), in: Capsule())
                    }
                }
                DynamicIslandExpandedRegion(.bottom) {
                    HStack {
                        Text(context.state.readingDate, style: .relative)
                            .font(.caption2).foregroundStyle(.secondary)
                        Spacer()
                        if let label = insulinLabel(units: context.state.lastInsulinUnits,
                                                    date: context.state.lastInsulinDate) {
                            Text(label).font(.caption2).foregroundStyle(.secondary)
                        }
                    }
                }
            } compactLeading: {
                Text("\(context.state.glucose)")
                    .font(.system(size: 14, weight: .semibold, design: .rounded))
                    .foregroundStyle(glucoseColor(context.state.glucose))
            } compactTrailing: {
                Text(context.state.trend)
                    .font(.system(size: 13))
                    .foregroundStyle(glucoseColor(context.state.glucose))
            } minimal: {
                Text("\(context.state.glucose)")
                    .font(.system(size: 12, weight: .bold, design: .rounded))
                    .foregroundStyle(glucoseColor(context.state.glucose))
            }
        }
        .supplementalActivityFamilies([.small])
    }
}
