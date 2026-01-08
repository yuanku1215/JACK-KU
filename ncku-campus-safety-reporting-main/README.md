# NCKU Campus Safety Reporting Platform

A web application for reporting safety concerns on the NCKU campus.

## Features

- Interactive map for reporting and viewing safety concerns
- Support for different types of reports: roads, accessible ramps, street lights, etc.
- Photo upload capability
- Real-time updates

## Tech Stack

- Frontend: HTML/CSS/JavaScript with Leaflet.js for maps
- Backend: Node.js with Express
- Database: MongoDB
- File Storage: 
  - Local file system (for development)
  - Google Cloud Storage (for production)

## Deployment Instructions

### Prerequisites

- Node.js (v18.x recommended)
- MongoDB account (for MongoDB Atlas)
- Google Cloud Platform account (for Cloud Storage)
- Render.com, Heroku, or similar platform account

### Local Development

1. Clone the repository
2. Install dependencies:
   ```
   cd ncku_campus_backend
   npm install
   ```
3. Start MongoDB locally or set up MongoDB Atlas
4. Start the development server:
   ```
   npm run dev
   ```

### Google Cloud Storage Setup

1. Create a new project in Google Cloud Console
2. Enable the Cloud Storage API
3. Create a new storage bucket for file uploads
4. Create a service account with Storage Object Admin role
5. Download the JSON key file for the service account
6. Set up your environment variables to use the service account credentials

### Deployment to Render.com

1. Create a new Web Service on Render
2. Connect your GitHub repository
3. Configure settings:
   - Environment: Node
   - Build Command: `npm install && npm run build`
   - Start Command: `node server.js`
4. Add environment variables:
   - `MONGODB_URI`: Your MongoDB Atlas connection string
   - `PORT`: 3000 (or leave as 3002)
   - `GCS_BUCKET_NAME`: Your Google Cloud Storage bucket name
   - `GCS_PROJECT_ID`: Your Google Cloud project ID
   - `GCS_KEY_FILE_JSON`: The content of your Google Cloud service account key file (JSON)

## Updating the Frontend API URL

The application automatically detects whether it's running locally or in a deployed environment and uses the appropriate API URL.

## Frontend and Backend Integration

The application correctly handles image URLs from both local storage and Google Cloud Storage:
- In development: Photos are stored locally and served from the local filesystem
- In production: Photos are stored in Google Cloud Storage with secure signed URLs

## License

ISC 
