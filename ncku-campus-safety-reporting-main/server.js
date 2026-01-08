// Import required modules
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const {Storage} = require('@google-cloud/storage');

// Create Express app
const app = express();
const PORT = process.env.PORT || 3002;

// Connect to MongoDB with improved options
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/campus_report';
mongoose.connect(MONGODB_URI, {
  serverSelectionTimeoutMS: 15000, // Timeout after 15 seconds
  socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
  retryWrites: true
})
.then(() => console.log('Connected to MongoDB'))
.catch(err => {
  console.error('MongoDB connection error:', err);
  console.log('Please check if your MongoDB Atlas IP whitelist includes 0.0.0.0/0');
});

// Setup Google Cloud Storage
let storage;
let bucket;
const bucketName = process.env.GCS_BUCKET_NAME || 'ncku-campus-safety-uploads';

try {
  // When running on Render, use the environment variable with the JSON content
  if (process.env.GCS_CREDENTIALS) {
    const credentials = JSON.parse(process.env.GCS_CREDENTIALS);
    storage = new Storage({
      projectId: credentials.project_id,
      credentials: credentials
    });
    console.log('Initialized Google Cloud Storage using environment credentials');
  } else {
    // For local development, use the file path
    storage = new Storage({
      keyFilename: process.env.GCS_KEY_FILE || path.join(__dirname, 'gcs-key.json')
    });
    console.log('Initialized Google Cloud Storage using key file');
  }
  
  bucket = storage.bucket(bucketName);
  console.log(`Connected to Google Cloud Storage bucket: ${bucketName}`);
} catch (err) {
  console.error('Error initializing Google Cloud Storage:', err);
}

// Define Report Schema
const reportSchema = new mongoose.Schema({
    lat: Number,
    lng: Number,
    type: String,
    time: Date,
    status: { type: String, default: 'Pending' },
    description: { type: String, default: '' },
    urgency: String,
    photo: String
}, {
    // Remove the __v field from the output
    versionKey: false
});

// Create Report model
const Report = mongoose.model('Report', reportSchema);

// Middleware
app.use(cors());
app.use(express.json());

// Ensure uploads directory exists for local development
const uploadsDir = path.join(__dirname, 'uploads');
try {
    if (!fs.existsSync(uploadsDir)) {
        console.log('Creating uploads directory:', uploadsDir);
        fs.mkdirSync(uploadsDir, { recursive: true });
    }
    
    // Create standard subdirectories
    const subdirs = ['Road', 'Accessible_Ramp', 'Street_Light', 'Other'];
    subdirs.forEach(dir => {
        const subDirPath = path.join(uploadsDir, dir);
        if (!fs.existsSync(subDirPath)) {
            console.log('Creating uploads subdirectory:', subDirPath);
            fs.mkdirSync(subDirPath, { recursive: true });
        }
    });
} catch (err) {
    console.error('Error creating directories:', err);
}

// Configure multer for memory storage (for GCS) or disk storage (for local)
const multerStorage = process.env.GCS_BUCKET_NAME ? multer.memoryStorage() : multer.diskStorage({
    destination: function (req, file, cb) {
        // For ANY custom type that isn't one of the standard types, use the "Other" folder
        const standardTypes = ['Road', 'Accessible Ramp', 'Street Light'];
        let typeDir = 'Other';
        
        if (req.body && req.body.type && standardTypes.includes(req.body.type)) {
            typeDir = req.body.type.toLowerCase().replace(/ /g, '_');
        }
        
        console.log(`Storing file for type "${req.body.type}" in directory: ${typeDir}`);
        
        const typePath = path.join(uploadsDir, typeDir);
        try {
            if (!fs.existsSync(typePath)) {
                console.log('Creating type directory:', typePath);
                fs.mkdirSync(typePath, { recursive: true });
            }
            cb(null, typePath);
        } catch (err) {
            console.error('Error creating type directory:', err);
            cb(err);
        }
    },
    filename: function (req, file, cb) {
        // Create a unique filename with date and original extension
        const dateStr = new Date().toISOString().replace(/:/g, '-').split('.')[0];
        const fileExt = path.extname(file.originalname);
        const filename = `${dateStr}_${path.basename(file.originalname, fileExt)}${fileExt}`;
        console.log('Generated filename:', filename);
        cb(null, filename);
    }
});

// File filter to only accept images
const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
        cb(null, true);
    } else {
        cb(new Error('Only image files are allowed!'), false);
    }
};

// Create multer upload middleware
const upload = multer({ 
    storage: multerStorage,
    fileFilter: fileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024 // 5MB limit
    }
}).single('photo');

// Function to upload to Google Cloud Storage
const uploadToGCS = (file, typeDir) => {
    return new Promise((resolve, reject) => {
        if (!file) {
            resolve(null);
            return;
        }

        try {
            // Format for GCS folder structure
            const standardTypes = ['Road', 'Accessible Ramp', 'Street Light'];
            let folderName = 'Other';
            
            if (typeDir && typeof typeDir === 'string') {
                folderName = typeDir.toLowerCase().replace(/ /g, '_');
            }
            
            // Create a unique filename with date
            const dateStr = new Date().toISOString().replace(/:/g, '-').split('.')[0];
            const fileExt = path.extname(file.originalname) || '.jpg';
            const filename = `${dateStr}_${path.basename(file.originalname, fileExt)}${fileExt}`;
            
            // Full path in the bucket
            const filePath = `uploads/${folderName}/${filename}`;
            
            // Create a file object in the bucket
            const gcsFile = bucket.file(filePath);
            
            // Create a write stream without ACL (works with Uniform bucket-level access)
            const stream = gcsFile.createWriteStream({
                metadata: {
                    contentType: file.mimetype
                }
                // Remove predefinedAcl: 'publicRead' - it's causing the error
            });
            
            // Handle errors
            stream.on('error', (err) => {
                console.error('GCS upload error:', err);
                reject(err);
            });
            
            // Handle successful upload
            stream.on('finish', async () => {
                try {
                    // Generate a URL that's valid for 10 years
                    const [url] = await gcsFile.getSignedUrl({
                        action: 'read',
                        expires: Date.now() + 1000 * 60 * 60 * 24 * 365 * 10 // 10 years in milliseconds
                    });
                    
                    console.log('File uploaded to GCS with signed URL:', url);
                    resolve(url);
                } catch (err) {
                    console.error('Error generating signed URL:', err);
                    
                    // Fallback to direct URL (this may not work if bucket is not public)
                    const publicUrl = `https://storage.googleapis.com/${bucketName}/${filePath}`;
                    console.log('Falling back to public URL:', publicUrl);
                    resolve(publicUrl);
                }
            });
            
            // Send the file buffer to GCS
            stream.end(file.buffer);
        } catch (err) {
            console.error('Error in GCS upload function:', err);
            reject(err);
        }
    });
};

// Serve static files from uploads directory (for local development)
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Serve static files from public directory (for frontend)
app.use(express.static(path.join(__dirname, 'public')));

// Helper function to delete a file
const deleteFile = (filePath) => {
    try {
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            console.log('Deleted file:', filePath);
        }
    } catch (err) {
        console.error('Error deleting file:', err);
    }
};

// Routes
app.get('/reports', async (req, res) => {
    try {
        const reports = await Report.find();
        console.log(`Successfully fetched ${reports.length} reports`);
        res.json(reports);
    } catch (error) {
        console.error('Error fetching reports:', error);
        res.status(500).json({ error: 'Error fetching reports', details: error.message });
    }
});

// Ensure the SPA works with client-side routing
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.post('/reports', async (req, res) => {
    console.log('Received POST request for new report');
    
    upload(req, res, async function(err) {
        if (err instanceof multer.MulterError) {
            console.error('Multer error during upload:', err);
            return res.status(500).json({ error: `Multer upload error: ${err.message}` });
        } else if (err) {
            console.error('Unknown error during upload:', err);
            return res.status(500).json({ error: `Unknown upload error: ${err.message}` });
        }
        
        // Log request body and file
        console.log('Request body:', req.body);
        console.log('Uploaded file:', req.file);
        
        try {
            // Create a new report
            const reportData = {
                lat: parseFloat(req.body.lat),
                lng: parseFloat(req.body.lng),
                type: req.body.type,
                time: new Date(req.body.time || Date.now()),
                status: req.body.status || 'Pending',
                description: req.body.description || '',
                urgency: req.body.urgency
            };
            
            // Handle file upload based on environment
            if (req.file) {
                if (process.env.GCS_BUCKET_NAME) {
                    // Upload to Google Cloud Storage
                    const photoUrl = await uploadToGCS(req.file, reportData.type);
                    if (photoUrl) {
                        reportData.photo = photoUrl;
                        console.log('Saved photo URL to GCS:', reportData.photo);
                    }
                } else {
                    // Local file storage
                    const relativePath = path.relative(
                        path.join(__dirname),
                        req.file.path
                    ).replace(/\\/g, '/');
                    
                    reportData.photo = `/${relativePath}`;
                    console.log('Saved photo path locally:', reportData.photo);
                }
            }
            
            const report = new Report(reportData);
            await report.save();
            console.log('New report saved successfully:', report._id);
            res.status(201).json(report);
        } catch (error) {
            console.error('Error saving report:', error);
            res.status(500).json({ error: 'Error saving report', details: error.message });
        }
    });
});

app.put('/reports/:id', async (req, res) => {
    console.log(`Received PUT request for report ${req.params.id}`);
    
    upload(req, res, async function(err) {
        if (err) {
            console.error('Error during upload:', err);
            return res.status(500).json({ error: `Upload error: ${err.message}` });
        }
        
        console.log('Request body for update:', req.body);
        console.log('Uploaded file for update:', req.file);
        
        try {
            // Find the existing report
            const report = await Report.findById(req.params.id);
            if (!report) {
                return res.status(404).json({ error: 'Report not found' });
            }
            
            // Update report data
            report.type = req.body.type || report.type;
            report.time = req.body.time ? new Date(req.body.time) : report.time;
            report.status = req.body.status || report.status;
            report.description = req.body.description || report.description;
            report.urgency = req.body.urgency || report.urgency;
            
            // Handle photo updates
            if (req.file) {
                if (process.env.GCS_BUCKET_NAME) {
                    // Upload to Google Cloud Storage
                    const photoUrl = await uploadToGCS(req.file, report.type);
                    if (photoUrl) {
                        // If we're updating from local storage to GCS, no need to delete the old file
                        // as it exists in a different storage system
                        report.photo = photoUrl;
                        console.log('Updated photo URL in GCS:', report.photo);
                    }
                } else {
                    // Local file storage - handle deleting old file
                    if (report.photo && report.photo !== '' && report.photo.startsWith('/')) {
                        const oldPhotoPath = path.join(__dirname, report.photo);
                        deleteFile(oldPhotoPath);
                    }
                    
                    // Use relative path for storage in DB
                    const relativePath = path.relative(
                        path.join(__dirname),
                        req.file.path
                    ).replace(/\\/g, '/');
                    
                    report.photo = `/${relativePath}`;
                    console.log('Updated photo path locally:', report.photo);
                }
            }
            
            await report.save();
            console.log('Report updated successfully:', report._id);
            res.json(report);
        } catch (error) {
            console.error('Error updating report:', error);
            res.status(500).json({ error: 'Error updating report', details: error.message });
        }
    });
});

app.delete('/reports/:id', async (req, res) => {
    try {
        const report = await Report.findById(req.params.id);
        
        if (!report) {
            return res.status(404).json({ error: 'Report not found' });
        }
        
        // Delete associated photo if it exists
        if (report.photo && report.photo !== '') {
            // Only delete local files, GCS files we leave for now
            if (report.photo.startsWith('/')) {
                const photoPath = path.join(__dirname, report.photo);
                deleteFile(photoPath);
            } else if (process.env.GCS_BUCKET_NAME && 
                      (report.photo.includes('storage.googleapis.com') || 
                       report.photo.includes('storage.cloud.google.com'))) {
                // For GCS files, extract the path and delete
                try {
                    // Parse the URL to extract the path
                    const url = new URL(report.photo);
                    let gcsPath;
                    
                    // Handle both signed URLs and direct URLs
                    if (url.pathname.includes('/o/')) {
                        // This is a signed URL format
                        const objectPath = url.pathname.split('/o/')[1];
                        gcsPath = decodeURIComponent(objectPath.split('?')[0]);
                    } else {
                        // This is a direct storage.googleapis.com URL
                        gcsPath = url.pathname.split('/').slice(2).join('/');
                    }
                    
                    console.log('Attempting to delete GCS file:', gcsPath);
                    await bucket.file(gcsPath).delete();
                    console.log('Deleted file from GCS:', gcsPath);
                } catch (err) {
                    console.error('Error deleting file from GCS:', err);
                }
            }
        }
        
        await Report.findByIdAndDelete(req.params.id);
        console.log('Report deleted successfully:', req.params.id);
        res.json({ message: 'Report deleted successfully' });
    } catch (error) {
        console.error('Error deleting report:', error);
        res.status(500).json({ error: 'Error deleting report' });
    }
});

// Start server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
}); 
