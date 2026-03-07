#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(GlucoseWidgetsModule, NSObject)

RCT_EXTERN_METHOD(updateGlucose:(double)glucose
                  trend:(NSString *)trend
                  timestamp:(double)timestamp
                  isLow:(BOOL)isLow
                  isHigh:(BOOL)isHigh
                  history:(NSArray *)history
                  lastInsulinUnits:(NSNumber *)lastInsulinUnits
                  lastInsulinDate:(NSNumber *)lastInsulinDate)

RCT_EXTERN_METHOD(startLiveActivity:(double)glucose
                  trend:(NSString *)trend
                  timestamp:(double)timestamp
                  isLow:(BOOL)isLow
                  isHigh:(BOOL)isHigh
                  history:(NSArray *)history
                  lastInsulinUnits:(NSNumber *)lastInsulinUnits
                  lastInsulinDate:(NSNumber *)lastInsulinDate
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(getPushToken:(NSString *)activityId
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(endLiveActivity)

@end
