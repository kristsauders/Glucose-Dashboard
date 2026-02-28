#import <React/RCTBridgeModule.h>

@interface RCT_EXTERN_MODULE(GlucoseWidgetsModule, NSObject)

RCT_EXTERN_METHOD(updateGlucose:(double)glucose
                  trend:(NSString *)trend
                  timestamp:(double)timestamp
                  isLow:(BOOL)isLow
                  isHigh:(BOOL)isHigh)

RCT_EXTERN_METHOD(startLiveActivity:(double)glucose
                  trend:(NSString *)trend
                  timestamp:(double)timestamp
                  isLow:(BOOL)isLow
                  isHigh:(BOOL)isHigh
                  resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject)

RCT_EXTERN_METHOD(endLiveActivity)

@end
