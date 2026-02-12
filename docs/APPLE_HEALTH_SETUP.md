# Apple Health Integration Setup Guide

This guide explains how to set up automatic workout syncing from Apple Health to Sage using iOS Shortcuts.

## Overview

The Apple Health integration uses iOS Shortcuts to automatically sync workout data from your Apple Watch to Sage every 2 hours. This enables Sage to analyze how exercise affects your glucose levels.

## Prerequisites

- iPhone with iOS 14 or later
- Apple Watch (optional, but required for automatic workout tracking)
- Sage account with active login
- iOS Shortcuts app (pre-installed on iOS 14+)

## Setup Steps

### 1. Get Your Authentication Token

1. Open Sage in Safari or your PWA
2. Go to Settings
3. Scroll to "Data Sources"
4. Find the "Apple Health" section
5. Click "Setup Apple Health Sync"
6. Click "Copy Token" to copy your authentication token

### 2. Create the Shortcut

Since iOS Shortcuts cannot be directly shared via web links, you'll need to manually create the shortcut. Follow these steps:

#### Open Shortcuts App

1. Open the **Shortcuts** app on your iPhone
2. Tap the **+** button to create a new shortcut
3. Tap "Add Action"

#### Configure the Shortcut

Follow these steps to build the shortcut:

**Step 1: Find Health Samples**
1. Search for "Find Health Samples"
2. Add the action
3. Configure:
   - Sample Type: **Workouts**
   - Sort by: **Start Date**
   - Order: **Latest First**
   - Limit: **100**
   - Start Date: **Last 2 Hours**

**Step 2: Repeat with Each**
1. Search for "Repeat with Each"
2. Add the action
3. It will automatically loop through the workouts from Step 1

**Step 3: Get Details of Workout**
1. Search for "Get Details of Workout"
2. Add the action (inside the repeat loop)
3. Configure to get these details:
   - UUID
   - Workout Type
   - Start Date
   - End Date
   - Duration
   - Active Energy Burned
   - Distance

**Step 4: Get Contents of URL (API Request)**
1. Search for "Get Contents of URL"
2. Add the action (inside the repeat loop)
3. Configure:
   - URL: `http://YOUR_SAGE_SERVER:3002/api/apple-health/workouts`
     - Replace `YOUR_SAGE_SERVER` with your Sage server address
     - For local testing: `http://192.168.1.X:3002/api/apple-health/workouts`
     - For production: Use your deployed URL
   - Method: **POST**
   - Headers:
     - Add Header: `Authorization`
       - Value: `Bearer YOUR_TOKEN_HERE` (paste your token from Step 1)
     - Add Header: `Content-Type`
       - Value: `application/json`
   - Request Body: **JSON**
     ```json
     {
       "workouts": [
         {
           "id": "UUID from Step 3",
           "type": "Workout Type from Step 3",
           "startDate": "Start Date from Step 3",
           "endDate": "End Date from Step 3",
           "duration": "Duration from Step 3 (in minutes)",
           "totalEnergyBurned": "Active Energy Burned from Step 3",
           "totalDistance": "Distance from Step 3"
         }
       ]
     }
     ```

**Note**: The actual shortcut will use variables from Step 3. In the Shortcuts app:
- Tap in the JSON body
- Select "Select Variable"
- Choose the appropriate value from Step 3

#### Simplified Shortcut Configuration

Here's a simplified JSON structure for the shortcut (for reference):

```json
{
  "workouts": [
    {
      "id": "[Repeat Item > UUID]",
      "type": "[Repeat Item > Workout Type]",
      "startDate": "[Repeat Item > Start Date]",
      "endDate": "[Repeat Item > End Date]",
      "duration": "[Calculate: (End Date - Start Date) / 60]",
      "totalEnergyBurned": "[Repeat Item > Active Energy]",
      "totalDistance": "[Repeat Item > Distance]"
    }
  ]
}
```

### 3. Test the Shortcut

1. Tap "Done" to save the shortcut
2. Give it a name: **"Sage Health Sync"**
3. Tap the shortcut to run it manually
4. Grant Health permissions when prompted
   - Allow access to:
     - Workouts
     - Active Energy
     - Distance (optional)
5. Wait a few seconds for the sync to complete
6. Open Sage and check the exercise log to verify workouts appear

### 4. Enable Automation

To run the shortcut automatically every 2 hours:

1. In the Shortcuts app, tap the **Automation** tab at the bottom
2. Tap the **+** button to create a new automation
3. Select **Time of Day**
4. Configure:
   - Time: Choose any start time (e.g., 8:00 AM)
   - Repeat: **Every 2 Hours**
   - Or choose **Custom** and select specific times throughout the day
5. Tap "Next"
6. Search for your "Sage Health Sync" shortcut
7. Add it to the automation
8. Tap "Next"
9. **IMPORTANT**: Turn OFF "Ask Before Running"
   - This allows the shortcut to run silently in the background
10. Tap "Done"

### 5. Verify Automation

- The shortcut will now run every 2 hours automatically
- Workouts from the last 2 hours will be synced each time
- Check the Sage exercise log periodically to confirm sync is working
- You can also run the shortcut manually anytime for immediate sync

## Troubleshooting

### No Workouts Showing Up

1. **Check shortcut permissions**:
   - Go to Settings > Privacy & Security > Health
   - Find "Shortcuts"
   - Ensure all workout data is enabled

2. **Check authentication token**:
   - Your token may have expired
   - Copy a new token from Sage Settings
   - Update the token in the shortcut

3. **Check server URL**:
   - Ensure the URL in the shortcut is correct
   - Verify your Sage server is running and accessible

4. **Check workout timing**:
   - The shortcut only syncs workouts from the last 2 hours
   - Older workouts won't be synced automatically
   - Run the shortcut manually to sync recent workouts

### Automation Not Running

1. **Check "Ask Before Running" is OFF**:
   - Go to Automations tab
   - Find your Sage Health Sync automation
   - Ensure "Ask Before Running" is toggled off

2. **Check automation time**:
   - Verify the automation is set to run at the correct times
   - Check that it's set to repeat every 2 hours

3. **Check iPhone settings**:
   - Go to Settings > Shortcuts
   - Ensure "Allow Running Scripts" is enabled
   - Ensure "Private Sharing" is enabled

### Duplicate Workouts

- The Sage API automatically prevents duplicates
- Each workout has a unique ID from Apple Health
- If you see duplicates, they may be from different time periods or manual vs automatic tracking

## Data Privacy

- Your workout data flows directly from your iPhone to your Sage server
- No third-party services are involved
- Authentication token is stored securely in iOS Keychain
- You can disable the automation or delete the shortcut anytime

## Advanced Configuration

### Sync More Frequently

To sync every hour instead of every 2 hours:
1. Edit the automation
2. Change "Repeat" to "Hourly"
3. Or create multiple automations at different times

### Sync on App Launch

To sync whenever you open Sage:
1. Create a new automation
2. Choose "App" trigger
3. Select Safari or your PWA
4. Choose "Is Opened"
5. Add the "Sage Health Sync" shortcut
6. Turn off "Ask Before Running"

### Include Heart Rate Data

To also sync heart rate data during workouts:
1. Add another "Find Health Samples" action for Heart Rate
2. Filter by workout start/end times
3. Add heart rate data to the API request

(Note: This requires Phase 2 of the Apple Health integration to be implemented)

## Support

If you encounter issues:
1. Check the troubleshooting section above
2. Run the shortcut manually to see any error messages
3. Check Sage server logs for API errors
4. Verify your authentication token is valid

## What Gets Synced

The shortcut syncs the following workout data:
- **Workout Type**: Running, Cycling, Yoga, etc.
- **Duration**: Length of workout in minutes
- **Start/End Time**: When the workout occurred
- **Calories Burned**: Active energy expenditure
- **Distance**: For cardio workouts (running, cycling, etc.)

This data is used by Sage to:
- Analyze exercise-glucose correlations
- Detect patterns in glucose response to different workout types
- Provide insights on optimal exercise timing and intensity

## Future Enhancements

Planned features for future releases:
- Heart rate data syncing
- Sleep data integration
- Active energy (daily calories)
- Two-way sync (write glucose to Apple Health)
- Apple Watch complications showing current glucose
