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
                    let color = islandColor(context.state)
                    HStack(spacing: 4) {
                        Text("\(context.state.glucose)")
                            .font(.system(size: 28, weight: .bold, design: .rounded))
                            .foregroundStyle(color)
                        Text(context.state.trend).font(.system(size: 20)).foregroundStyle(color)
                    }
                }
                DynamicIslandExpandedRegion(.trailing) {
                    let color = islandColor(context.state)
                    Text(context.state.isLow ? "LOW" : context.state.isHigh ? "HIGH" : "IN RANGE")
                        .font(.caption.bold()).foregroundStyle(color)
                        .padding(.horizontal, 6).padding(.vertical, 3)
                        .background(color.opacity(0.2), in: Capsule())
                }
                DynamicIslandExpandedRegion(.bottom) {
                    Text(context.state.readingDate, style: .relative)
                        .font(.caption2).foregroundStyle(.secondary)
                }
            } compactLeading: {
                Text("\(context.state.glucose)")
                    .font(.system(size: 14, weight: .semibold, design: .rounded))
                    .foregroundStyle(islandColor(context.state))
            } compactTrailing: {
                Text(context.state.trend)
                    .font(.system(size: 13))
                    .foregroundStyle(islandColor(context.state))
            } minimal: {
                Text("\(context.state.glucose)")
                    .font(.system(size: 12, weight: .bold, design: .rounded))
                    .foregroundStyle(islandColor(context.state))
            }
        }
    }
}

@available(iOS 16.2, *)
private func islandColor(_ state: GlucoseActivityAttributes.ContentState) -> Color {
    glucoseColor(state.glucose)
}
