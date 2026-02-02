# Glucose Dashboard

A comprehensive, interactive blood glucose analysis dashboard designed specifically for Type 1 Diabetes management and LADA progression tracking. Features real-time glucose monitoring with LibreView/LibreLinkUp integration and detailed historical analysis.

## Features

### Live Glucose Monitoring
- **Real-time LibreView Integration**: Connect to your LibreView/LibreLinkUp account for live glucose readings
- **Fresh Data**: Displays current glucose with trend arrows (updated every minute)
- **Today-focused View**: Shows glucose data from 7am through now
- **Last Night's Bedtime & Overnight**: Reference charts for bedtime (10pm-midnight) and overnight fasting (3am-7am)
- **Trend Arrows**: Real-time glucose direction indicators
- **Data Persistence**: Keeps up to 24 hours of readings in localStorage to preserve bedtime data

### Data Analysis
- **Daily Metrics**: Average, minimum, maximum glucose levels
- **Time in Range**: Track percentage of readings in target ranges (70-140 mg/dL and 70-180 mg/dL)
- **Glucose Variability**: Coefficient of variation (CV) analysis for glucose stability
- **Overnight Analysis**: Fasting glucose and overnight patterns
- **Bedtime Glucose**: Track bedtime glucose trends
- **Spike Analysis**: Monitor glucose excursions above 140 mg/dL
- **Estimated A1C**: Calculate estimated A1C from average glucose

### Visualizations
- **Continuous Glucose Monitor View**: Detailed timeline of all readings
- **Daily Overview Charts**: Long-range view with min/max ranges
- **Weekly Trends**: Aggregated weekly metrics
- **Multiple Interactive Charts**: Scrollable charts showing different aspects of your glucose control
- **Date Range Selector**: View data from 7 days to all-time

### Technical Features
- **CSV Import**: Upload Libre CGM CSV exports
- **Local Storage**: Data persists in your browser
- **Responsive Design**: Works on desktop and mobile
- **Modern UI**: Built with shadcn/ui and Tailwind CSS
- **Smooth Animations**: Framer Motion for polished interactions

## Getting Started

### Prerequisites

- Node.js 18+ and npm

### Installation

1. Clone the repository and navigate to the project directory:

```bash
git clone https://github.com/kristsauders/Glucose-Dashboard.git
cd Glucose-Dashboard/glucose-dashboard
```

2. Install dependencies:

```bash
npm install
```

3. Install CORS proxy dependencies:

```bash
cd ../cors-proxy
npm install
cd ../glucose-dashboard
```

### Running the Application

**Quick Start (Recommended):**

Run both the CORS proxy and the dashboard with a single command:

```bash
npm start
```

This starts:
- CORS Proxy on `http://localhost:3001`
- Dashboard on `http://localhost:5173`

**Alternative - Run Separately:**

If you prefer to run them separately:

```bash
# Terminal 1 - Start the CORS proxy
cd cors-proxy
npm start

# Terminal 2 - Start the dashboard
cd glucose-dashboard
npm run dev
```

### Using Live Mode

1. Open the dashboard at `http://localhost:5173`
2. Switch to "Live" mode in the date range selector
3. Enter your LibreView credentials
4. The dashboard will fetch and display real-time glucose data, updating every minute

### Accessing from Other Devices

You can access the dashboard from any device on your local network:

1. Find your computer's local IP address (e.g., `192.168.1.100`)
2. On another device (phone, tablet, etc.), open `http://YOUR-IP:5173`
3. The app automatically detects the correct hostname and connects to the CORS proxy

**Example:** If your computer's IP is `192.168.1.100`, access the dashboard at `http://192.168.1.100:5173`

**Note:** Both the dashboard and CORS proxy must be running on the host computer (`npm start`).

### Building for Production

```bash
npm run build
```

The built files will be in the `dist` directory.

### Deploying

You can deploy the `dist` directory to any static hosting service (Vercel, Netlify, GitHub Pages, etc.).

## Usage

### Live Mode (Real-time Monitoring)

1. **Switch to Live Mode**: Select "Live" from the date range selector
2. **Connect to LibreView**: Enter your LibreView credentials in the settings panel
3. **View Real-time Data**: See your current glucose, trend arrow, and today's data (from 7am)
4. **Auto-refresh**: Data updates automatically every minute
5. **Bedtime & Overnight**: View last night's bedtime and overnight glucose in separate reference charts

### Historical Data (CSV Upload)

1. **Upload Your Data**: On first load, you'll see an upload screen. Drag and drop or browse for your Libre CGM CSV export file
2. **Explore Your Data**: Once uploaded, you'll see:
   - Summary statistics at the top
   - Multiple interactive charts showing different aspects of your glucose control
   - Date range selector to focus on different time periods
3. **Data Persistence**: Your data is saved locally in your browser, so you can return anytime to review your metrics
4. **Upload New Data**: Click "New Upload" to replace your data with a newer CSV file

### CORS Proxy

The CORS proxy (`cors-proxy` directory) is required for LibreView integration because the LibreView API doesn't allow direct browser access. The proxy:

- Runs locally on port 3001
- Forwards requests to LibreView API with proper headers
- Only accessible from your local machine
- Logs all requests for debugging

**Note**: Never expose the proxy server to the internet or share your LibreView credentials.

## Libre CSV Export Format

This dashboard is designed to work with CSV files exported from the FreeStyle Libre app. The CSV should include:
- Device Timestamp
- Historic Glucose mg/dL
- Scan Glucose mg/dL
- Record Type

## Understanding the Metrics

- **Time in Range (70-180)**: Industry standard range for diabetes management
- **Time in Target (70-140)**: Tighter target range for optimal control
- **Coefficient of Variation (CV)**: Measure of glucose stability. Target: <36%
- **Estimated A1C**: Calculated using formula: (Average Glucose + 46.7) / 28.7
- **Fasting Glucose**: Average of readings from 3am-7am
- **Bedtime Glucose**: Average of readings from 10pm-midnight

## Technology Stack

### Frontend

- **React**: UI framework
- **TypeScript**: Type safety
- **Vite**: Build tool and dev server
- **Tailwind CSS**: Styling
- **shadcn/ui**: UI components
- **Recharts**: Charts and visualizations
- **Framer Motion**: Animations
- **date-fns**: Date manipulation
- **papaparse**: CSV parsing

### CORS Proxy

- **Node.js**: Runtime
- **Express**: Web server
- **node-fetch**: HTTP requests to LibreView API
- Runs locally on port 3001

## Privacy & Security

- All glucose data is stored locally in your browser's localStorage
- LibreView credentials are stored in browser localStorage (encrypted by the browser)
- The CORS proxy runs only on your local machine and is not accessible from the internet
- No data is sent to any third-party servers
- All LibreView API communication goes through your local proxy to your local browser

**Important**: Keep your LibreView credentials secure and never expose the CORS proxy server to the public internet.

## Future Enhancements

This dashboard is designed to evolve into a comprehensive T1D tracking app with:
- Meal and insulin logging
- Pattern recognition and insights
- Dosing adjustment suggestions
- More advanced analytics

## License

MIT

## Support

For issues or questions, please open an issue on the GitHub repository.
