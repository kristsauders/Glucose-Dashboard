# Glucose Dashboard

A comprehensive, interactive blood glucose analysis dashboard designed specifically for Type 1 Diabetes management and LADA progression tracking.

## Features

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

1. Navigate to the project directory:
```bash
cd glucose-dashboard
```

2. Install dependencies:
```bash
npm install
```

3. Start the development server:
```bash
npm run dev
```

4. Open your browser and navigate to the URL shown (typically `http://localhost:5173`)

### Building for Production

```bash
npm run build
```

The built files will be in the `dist` directory.

### Deploying

You can deploy the `dist` directory to any static hosting service (Vercel, Netlify, GitHub Pages, etc.).

## Usage

1. **Upload Your Data**: On first load, you'll see an upload screen. Drag and drop or browse for your Libre CGM CSV export file.

2. **Explore Your Data**: Once uploaded, you'll see:
   - Summary statistics at the top
   - Multiple interactive charts showing different aspects of your glucose control
   - Date range selector to focus on different time periods

3. **Data Persistence**: Your data is saved locally in your browser, so you can return anytime to review your metrics.

4. **Upload New Data**: Click "New Upload" to replace your data with a newer CSV file.

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

- **React**: UI framework
- **TypeScript**: Type safety
- **Vite**: Build tool and dev server
- **Tailwind CSS**: Styling
- **shadcn/ui**: UI components
- **Recharts**: Charts and visualizations
- **Framer Motion**: Animations
- **date-fns**: Date manipulation
- **papaparse**: CSV parsing

## Privacy

All your glucose data is stored locally in your browser's localStorage. No data is ever sent to any server or third party.

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
