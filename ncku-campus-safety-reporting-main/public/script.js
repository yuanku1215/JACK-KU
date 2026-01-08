// Global variables
var map; // Map instance
var userMarker; // User location marker
var reports = []; // Array to store report data
var geoJsonPolygon; // Campus boundary polygon
var mapLoaded = false; // Flag to track if map is loaded
var dataLoaded = false; // Flag to track if data is loaded
var baseMaps; // Layer control variable
var API_URL = window.location.hostname === 'localhost' 
    ? 'http://localhost:3002' 
    : window.location.origin; // This will use the same domain for API calls when deployed

// Marker colors for different types of reports
var markerColors = {
    'Street Light': '#FF9800', // Orange for street lights (changed from orange-red to pure orange)
    'Road': '#4CAF50',         // Vibrant green for roads
    'Accessible Ramp': '#2196F3', // Bright blue for ramps
    'Other': '#9E9E9E'         // Medium gray for other
};

// =============== LOADING FUNCTIONS ===============

// Show loading overlay
function showLoadingOverlay() {
    document.getElementById('loadingOverlay').style.display = 'flex';
}

// Hide loading overlay
function hideLoadingOverlay() {
    // Only hide if both map and data are loaded
    if (mapLoaded && dataLoaded) {
        const overlay = document.getElementById('loadingOverlay');
        overlay.style.opacity = '0';
        setTimeout(() => {
            overlay.style.display = 'none';
            overlay.style.opacity = '1';
        }, 500); // Match the transition duration in CSS
    }
}

// Check if everything is loaded
function checkAllLoaded() {
    if (mapLoaded && dataLoaded) {
        hideLoadingOverlay();
    }
}

// =============== UI FUNCTIONS ===============

// Help popup functions
function showHelpPopup() {
    hideLoginPopup();
    const helpPopup = document.getElementById('helpPopup');
    helpPopup.style.display = helpPopup.style.display === 'block' ? 'none' : 'block';
}

function hideHelpPopup() {
    document.getElementById('helpPopup').style.display = 'none';
}

// Login popup functions
function showLoginPopup() {
    hideHelpPopup();
    const loginPopup = document.getElementById('loginPopup');
    loginPopup.style.display = loginPopup.style.display === 'block' ? 'none' : 'block';
}

function hideLoginPopup() {
    document.getElementById('loginPopup').style.display = 'none';
}

function login() {
    var username = document.getElementById('username').value;
    var password = document.getElementById('password').value;
    if (username === 'admin' && password === 'password') {
        window.location.href = 'staff_management.html';
    } else {
        alert('Invalid credentials');
    }
}

// =============== MAP INITIALIZATION ===============

// Initialize map
function initializeMap() {
    // Show loading overlay
    showLoadingOverlay();
    
    if (map) {
        map.remove(); // Destroy existing map instance if it exists
    }
    
    map = L.map('map'); // Initialize new map
    
    // Define basemap layers
    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '&copy; OpenStreetMap contributors',
        zIndex: 1 // Ensure the tile layer is below other layers
    });
    
    const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
        zIndex: 1
    });
    
    // Define base maps for layer control
    baseMaps = {
        "Standard Map": osmLayer,
        "Satellite Imagery": satelliteLayer
    };
    
    // Add the default layer to the map
    osmLayer.addTo(map);
    
    // Add layer control to the map
    L.control.layers(baseMaps, null, {
        position: 'bottomright',
        collapsed: false
    }).addTo(map);
    
    // Set default view
    function setDefaultView() {
        map.setView([22.9972, 120.2194], 16);
        mapLoaded = true;
        checkAllLoaded();
    }
    
    // Try to get user location, fall back to default
    if (navigator.geolocation) {
        // Set a timeout to fall back to default view if geolocation takes too long
        const locationTimeout = setTimeout(() => {
            console.log('Geolocation timed out, using default view');
            setDefaultView();
        }, 5000); // 5 second timeout
        
        navigator.geolocation.getCurrentPosition(function(position) {
            clearTimeout(locationTimeout); // Clear the timeout
            var userLatLng = [position.coords.latitude, position.coords.longitude];
            map.setView(userLatLng, 16);
            
            // Create a custom user location marker
            const userIcon = L.divIcon({
                className: 'custom-div-icon',
                html: `<div class="user-location-marker">
                         <div class="user-location-pulse"></div>
                         <div class="user-location-center"></div>
                       </div>`,
                iconSize: [30, 30],
                iconAnchor: [15, 15],
                popupAnchor: [0, -15]
            });
            
            userMarker = L.marker(userLatLng, {
                icon: userIcon,
                zIndexOffset: 1000 // Ensure it's above other markers
            }).addTo(map);
            
            // Create styled popup content
            const popupContent = `
                <div class="location-popup">
                    <div class="location-icon">📍</div>
                    <div class="location-text">Your Current Location</div>
                </div>
            `;
            
            userMarker.bindPopup(popupContent, {
                className: 'location-popup-container',
                closeButton: true
            }).openPopup();
            
            // Close the popup after 3 seconds
            setTimeout(() => {
                userMarker.closePopup();
            }, 3000);
            
            mapLoaded = true;
            checkAllLoaded();
            
        }, function(error) {
            // Geolocation error
            console.error('Geolocation error:', error);
            clearTimeout(locationTimeout); // Clear the timeout
            setDefaultView();
        }, {
            enableHighAccuracy: true,
            timeout: 5000,
            maximumAge: 0
        });
    } else {
        setDefaultView();
    }
    
    // Load campus boundary
    loadCampusBoundary();
    
    // Add click handler for adding new reports
    map.on('click', function(e) {
        addReportPopup(e);
    });
    
    // Set up loaded event to track when the map finishes rendering
    map.whenReady(() => {
        console.log('Map is ready');
        mapLoaded = true;
        checkAllLoaded();
    });
}

// Load campus boundary from GeoJSON
function loadCampusBoundary() {
    map.whenReady(() => {
        fetch('ncku_campus_region.geojson')
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                console.log('GeoJSON data loaded successfully:', data);
                const geoJsonLayer = L.geoJSON(data, {
                    style: {
                        color: '#420A15', // Dark red outline
                        weight: 2,
                        fillColor: '#420A15', // Fill with same color
                        fillOpacity: 0.1 // 10% opacity
                    }
                }).addTo(map);

                // Bring the GeoJSON layer to the front
                geoJsonLayer.bringToFront();

                // Adjust the map view to fit the GeoJSON layer
                map.fitBounds(geoJsonLayer.getBounds());

                // Store the GeoJSON polygon for precise point-in-polygon checks
                geoJsonPolygon = data.features[0].geometry;
            })
            .catch(error => {
                console.error('Error loading GeoJSON:', error);
                // Even if GeoJSON fails to load, we should still consider the map loaded
                // This prevents the loading overlay from staying visible indefinitely
                mapLoaded = true;
                checkAllLoaded();
            });
    });
}

// =============== REPORT FUNCTIONS ===============

// Fetch reports from server
function fetchReports() {
    console.log('Fetching reports from server...');
    fetch(`${API_URL}/reports`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            reports = data; // Update reports array with fetched data
            console.log(`Fetched ${reports.length} reports from server`);
            updateMarkers(); // Refresh markers after fetching reports
            dataLoaded = true;
            checkAllLoaded();
        })
        .catch(error => {
            console.error('Error fetching reports:', error);
            alert('Failed to load reports. Please try refreshing the page.');
            dataLoaded = true; // Still mark as loaded to hide the overlay
            checkAllLoaded();
        });
}

// Update markers on map based on reports
function updateMarkers() {
    console.log('Updating markers on map...');
    
    // Remove all existing markers from the map
    map.eachLayer(function (layer) {
        if (layer instanceof L.CircleMarker || layer instanceof L.Marker) {
            if (layer !== userMarker) { // Don't remove the user location marker
                map.removeLayer(layer);
            }
        }
    });

    if (reports.length === 0) {
        console.log('No reports to display');
        return;
    }

    console.log(`Creating ${reports.length} markers on the map...`);

    // Add markers for all reports
    reports.forEach((report, index) => {
        if (!report.lat || !report.lng) {
            console.warn('Report missing coordinates:', report);
            return;
        }
        
        // Get color based on report type
        const markerColor = markerColors[report.type] || '#9E9E9E';
        
        try {
            // Create simple circular marker icon
            const markerIcon = L.divIcon({
                className: 'custom-div-icon',
                html: `<div style="background-color:${markerColor};" class="simple-circle-marker"></div>`,
                iconSize: [14, 14],
                iconAnchor: [7, 7],
                popupAnchor: [0, -7]
            });
            
            // Create the marker with the custom icon
            const marker = L.marker([report.lat, report.lng], {
                icon: markerIcon,
                riseOnHover: true,
                title: report.type || 'Report',
                alt: `Report #${index + 1}`
            }).addTo(map);
            
            // Create popup content
            const popupContent = createPopupContent(report);
            
            // Bind popup to marker
            marker.bindPopup(popupContent, {
                minWidth: 250,
                maxWidth: 300,
                className: 'report-popup',
                closeButton: true,
                closeOnClick: false
            });
            
            // Add direct click handler to ensure popup opens
            marker.on('click', function(e) {
                L.DomEvent.preventDefault(e);
                L.DomEvent.stopPropagation(e);
                this.openPopup();
            });
            
            // Handle popup open event to set up button handlers
            marker.on('popupopen', function() {
                console.log(`Popup opened for report ${report._id}`);
                
                // Get the buttons and add click handlers
                setTimeout(() => {
                    const editBtn = document.getElementById(`edit-${report._id}`);
                    const deleteBtn = document.getElementById(`delete-${report._id}`);
                    
                    if (editBtn) {
                        editBtn.onclick = function(e) {
                            e.preventDefault();
                            e.stopPropagation();
                            editReport(report._id);
                            return false;
                        };
                    }
                    
                    if (deleteBtn) {
                        deleteBtn.onclick = function(e) {
                            e.preventDefault();
                            e.stopPropagation();
                            deleteReport(report._id);
                            return false;
                        };
                    }
                }, 100);
            });
        } catch (err) {
            console.error(`Error creating marker for report ${report._id}:`, err);
        }
    });
    
    console.log(`Markers created successfully`);
}

// Function to get a darker shade of a color
function getDarkerColor(hex, percent) {
    // Convert hex to RGB
    let r = parseInt(hex.substring(1, 3), 16);
    let g = parseInt(hex.substring(3, 5), 16);
    let b = parseInt(hex.substring(5, 7), 16);
    
    // Make darker
    r = Math.floor(r * (100 - percent) / 100);
    g = Math.floor(g * (100 - percent) / 100);
    b = Math.floor(b * (100 - percent) / 100);
    
    // Convert back to hex
    return '#' + 
        ((r < 16 ? '0' : '') + r.toString(16)) +
        ((g < 16 ? '0' : '') + g.toString(16)) +
        ((b < 16 ? '0' : '') + b.toString(16));
}

// Create popup content for a report - add more defensive coding
function createPopupContent(report) {
    try {
        // Format date safely
        let timeStr = 'N/A';
        try {
            if (report.time) {
                timeStr = new Date(report.time).toLocaleString();
            }
        } catch (err) {
            console.warn('Error formatting date:', err);
        }
        
        return `
            <div class="report-details">
                <div class="detail-item">
                    <strong>Type:</strong>
                    <div class="detail-value">${report.type || 'Unknown'}</div>
                </div>
                <div class="detail-item">
                    <strong>Time:</strong>
                    <div class="detail-value">${timeStr}</div>
                </div>
                <div class="detail-item">
                    <strong>Status:</strong>
                    <div class="detail-value">${report.status || 'N/A'}</div>
                </div>
                <div class="detail-item">
                    <strong>Description:</strong>
                    <div class="detail-value">${report.description || 'N/A'}</div>
                </div>
                <div class="detail-item">
                    <strong>Urgency:</strong>
                    <div class="detail-value">${report.urgency || 'N/A'}</div>
                </div>
                ${report.photo ? `
                    <div class="detail-item">
                        <strong>Photo:</strong>
                        <img src="${report.photo.startsWith('/') ? API_URL + report.photo : report.photo}" alt="Report Photo" style="max-width:100%; max-height:200px; margin:8px 0; border-radius:4px;">
                    </div>
                ` : ''}
                <div class="report-actions">
                    <button id="edit-${report._id}" class="action-button" onclick="editReport('${report._id}'); return false;">Edit</button>
                    <button id="delete-${report._id}" class="action-button delete-button" onclick="deleteReport('${report._id}'); return false;">Delete</button>
                </div>
            </div>
        `;
    } catch (err) {
        console.error('Error creating popup content:', err);
        return `<div class="report-details">Error loading report details</div>`;
    }
}

// Delete a report
function deleteReport(id) {
    // Show confirmation dialog
    if (!confirm('Are you sure you want to delete this report?')) {
        return; // User canceled
    }
    
    console.log('Deleting report with id:', id);
    
    fetch(`${API_URL}/reports/${id}`, {
        method: 'DELETE'
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return response.json();
    })
    .then(() => {
        console.log('Report deleted successfully');
        // Remove the deleted report from the reports array
        reports = reports.filter(r => r._id !== id);
        updateMarkers(); // Refresh the markers on the map
        map.closePopup(); // Close any open popup
        alert('Report deleted successfully');
    })
    .catch(error => {
        console.error('Error deleting report:', error);
        alert('Error deleting report: ' + error.message);
    });
}

// Edit a report
function editReport(id) {
    const report = reports.find(r => r._id === id);
    if (!report) return;

    const popupContent = `
        <form id="editForm">
            <label>Type <span class="required"></span>
                <select id="editType" onchange="updateEditStatusOptions(this)" required>
                    <option value="">Please select</option>
                    <option value="Road" ${report.type === 'Road' ? 'selected' : ''}>Road</option>
                    <option value="Accessible Ramp" ${report.type === 'Accessible Ramp' ? 'selected' : ''}>Accessible Ramp</option>
                    <option value="Street Light" ${report.type === 'Street Light' ? 'selected' : ''}>Street Light</option>
                    <option value="Other" ${report.type === 'Other' || !['Road', 'Accessible Ramp', 'Street Light'].includes(report.type) ? 'selected' : ''}>Other</option>
                </select>
            </label>
            <label id="editOtherTypeLabel" style="display:${report.type === 'Other' || !['Road', 'Accessible Ramp', 'Street Light'].includes(report.type) ? 'block' : 'none'};">Other Type <input type="text" id="editOtherType" value="${report.type === 'Other' || !['Road', 'Accessible Ramp', 'Street Light'].includes(report.type) ? report.type : ''}"></label>
            <label>Time <span class="required"></span>
                <input type="datetime-local" id="editTime" value="${new Date(report.time).toISOString().slice(0, 16)}" required>
            </label>
            <label>Status <span class="required"></span>
                <select id="editStatus" required></select>
            </label>
            <label>Description
                <textarea id="editDescription">${report.description || ''}</textarea>
            </label>
            <label>Urgency <span class="required"></span>
                <select id="editUrgency" required>
                    <option value="">Please select</option>
                    <option value="Low" ${report.urgency === 'Low' ? 'selected' : ''}>Low</option>
                    <option value="Medium" ${report.urgency === 'Medium' ? 'selected' : ''}>Medium</option>
                    <option value="High" ${report.urgency === 'High' ? 'selected' : ''}>High</option>
                </select>
            </label>
            <label>Photo
                <input type="file" id="editPhoto" accept="image/*" onchange="previewPhoto(this)">
                ${report.photo ? `<img id="editPhotoPreview" style="display:block; max-width:100%; max-height:120px; margin:6px 0; border-radius:4px;" src="${report.photo.startsWith('/') ? API_URL + report.photo : report.photo}">` : 
                `<img id="editPhotoPreview" style="display:none; max-width:100%; max-height:120px; margin:6px 0; border-radius:4px;">`}
            </label>
            <div class="button-group">
                <button type="button" onclick="updateReport('${id}')">Update</button>
                <button type="button" onclick="deleteReport('${id}')">Delete</button>
            </div>
        </form>
    `;
    
    L.popup().setLatLng([report.lat, report.lng]).setContent(popupContent).openOn(map);
    
    // Initialize status options based on the report's type
    setTimeout(() => {
        const typeSelect = document.getElementById('editType');
        if (typeSelect) {
            updateEditStatusOptions(typeSelect);
            // Select the current status if it exists
            setTimeout(() => {
                const statusSelect = document.getElementById('editStatus');
                if (statusSelect && report.status) {
                    for(let i = 0; i < statusSelect.options.length; i++) {
                        if(statusSelect.options[i].value === report.status) {
                            statusSelect.selectedIndex = i;
                            break;
                        }
                    }
                }
            }, 50);
        }
    }, 100);
}

// Update a report
function updateReport(id) {
    const report = reports.find(r => r._id === id);
    if (!report) return;

    const typeSelect = document.getElementById('editType');
    const statusSelect = document.getElementById('editStatus');
    
    // Validate form fields
    if (typeSelect.value === '') {
        alert('Please select a report type');
        typeSelect.focus();
        return false;
    }
    
    if (statusSelect.value === '') {
        alert('Please select a status');
        statusSelect.focus();
        return false;
    }
    
    const typeValue = typeSelect.value;
    let finalType = typeValue;
    
    if (typeValue === 'Other') {
        finalType = document.getElementById('editOtherType').value || 'Other';
    }

    const description = document.getElementById('editDescription').value || '';
    console.log('Description to be updated:', description);

    const formData = new FormData();
    formData.append('lat', report.lat);
    formData.append('lng', report.lng);
    formData.append('type', finalType);
    formData.append('time', document.getElementById('editTime').value);
    formData.append('status', statusSelect.value);
    formData.append('description', description);
    formData.append('urgency', document.getElementById('editUrgency').value);
    
    // Handle photo upload more carefully
    const photoInput = document.getElementById('editPhoto');
    if (photoInput && photoInput.files && photoInput.files.length > 0) {
        const photoFile = photoInput.files[0];
        
        // Check if the file is an image
        if (!photoFile.type.match('image.*')) {
            alert('Please select an image file (JPEG, PNG, GIF)');
            return false;
        }
        
        // Check if the file size is reasonable (under 5MB)
        if (photoFile.size > 5 * 1024 * 1024) {
            alert('The photo is too large. Please select an image under 5MB.');
            return false;
        }
        
        console.log('Adding photo to form data:', photoFile.name, photoFile.type, photoFile.size + ' bytes');
        formData.append('photo', photoFile);
    } else if (report.photo) {
        console.log('Keeping existing photo:', report.photo);
        formData.append('existingPhoto', report.photo);
    }

    // Display a loading message
    const updateButton = document.querySelector('button[onclick^="updateReport"]');
    if (updateButton) {
        updateButton.disabled = true;
        updateButton.textContent = 'Updating...';
    }

    // Log FormData entries for debugging
    console.log('Sending updated form data to server...');

    fetch(`${API_URL}/reports/${id}`, {
        method: 'PUT',
        body: formData
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`Server returned ${response.status}: ${response.statusText}`);
        }
        return response.json();
    })
    .then(updatedReport => {
        console.log('Report updated:', updatedReport);
        const index = reports.findIndex(r => r._id === id);
        if (index !== -1) {
            reports[index] = updatedReport;
        }
        updateMarkers();
        map.closePopup();
        alert('Report updated successfully!');
    })
    .catch(error => {
        console.error('Error updating report:', error);
        alert('Error updating report: ' + error.message);
        // Re-enable the update button
        if (updateButton) {
            updateButton.disabled = false;
            updateButton.textContent = 'Update';
        }
    });
}

// Update status options in edit form
function updateEditStatusOptions(select) {
    const statusSelect = document.getElementById('editStatus');
    const otherTypeLabel = document.getElementById('editOtherTypeLabel');
    
    if (!statusSelect) return;
    
    // Clear existing options
    statusSelect.innerHTML = '';
    
    // Add default option
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Please select';
    statusSelect.appendChild(defaultOption);
    
    // Show/hide other type field
    if (otherTypeLabel) {
        otherTypeLabel.style.display = (select.value === 'Other') ? 'block' : 'none';
    }
    
    // Add options based on selected type
    switch(select.value) {
        case 'Road':
            addOptions(statusSelect, [
                'Uneven surface',
                'Slippery pavement',
                'Narrow width',
                'Insufficient accessibility features',
                'Prone to water accumulation',
                'Others (please specify in the Description)'
            ]);
            break;
        case 'Accessible Ramp':
            addOptions(statusSelect, [
                'Uneven surface',
                'Slippery pavement',
                'Narrow width',
                'Excessively steep slope',
                'Prone to water accumulation',
                'Others (please specify in the Description)'
            ]);
            break;
        case 'Street Light':
            addOptions(statusSelect, [
                'Not working (malfunction/offline)',
                'Dim lighting',
                'Flickering light',
                'Others (please specify in the Description)'
            ]);
            break;
        case 'Other':
            addOptions(statusSelect, ['Please specify in the Description']);
            break;
    }
    
    // Always reset to the first (empty) option when type changes
    statusSelect.selectedIndex = 0;
}

// Add a new report popup
function addReportPopup(e) {
    // Check if point is inside campus area
    if (!isPointInPolygon(e.latlng.lat, e.latlng.lng)) {
        alert('You can only report issues within the campus area!');
        return;
    }

    // Create popup content with form (removed pre-filled time)
    const popupContent = `
        <form onsubmit="return saveReport(${e.latlng.lat}, ${e.latlng.lng}, this)">
            <label>Type <span class="required"></span>
                <select id="type" onchange="updateStatusOptions(this)" required>
                    <option value="">Please select</option>
                    <option value="Road">Road</option>
                    <option value="Accessible Ramp">Accessible Ramp</option>
                    <option value="Street Light">Street Light</option>
                    <option value="Other">Other</option>
                </select>
            </label>
            <label id="otherTypeLabel" style="display:none;">Other Type <input type="text" id="otherType"></label>
            <label>Time <span class="required"></span>
                <input type="datetime-local" id="time" required>
            </label>
            <label>Status <span class="required"></span>
                <select id="status" required></select>
            </label>
            <label>Description
                <textarea id="description" rows="3" placeholder="Describe the issue"></textarea>
            </label>
            <label>Urgency <span class="required"></span>
                <select id="urgency" required>
                    <option value="">Please select</option>
                    <option value="Low">Low</option>
                    <option value="Medium">Medium</option>
                    <option value="High">High</option>
                </select>
            </label>
            <label>Photo
                <input type="file" id="photo" accept="image/*" onchange="previewPhoto(this)">
                <img id="photoPreview" style="display:none; max-width:100%; max-height:120px; margin:6px 0; border-radius:4px;">
            </label>
            <div class="button-group">
                <button type="submit">Submit</button>
                <button type="button" onclick="map.closePopup()">Cancel</button>
            </div>
        </form>
    `;

    // Create and open popup
    L.popup()
        .setLatLng(e.latlng)
        .setContent(popupContent)
        .openOn(map);
}

// Save a new report
function saveReport(lat, lng, form) {
    if (form.checkValidity() === false) {
        alert("Please fill in all required fields");
        return false;
    }
    
    const typeSelect = form.querySelector('#type');
    const typeValue = typeSelect.value;
    let finalType = typeValue;
    
    if (typeValue === 'Other') {
        const otherType = form.querySelector('#otherType').value.trim();
        if (!otherType) {
            alert("Please specify the 'Other' type");
            form.querySelector('#otherType').focus();
            return false;
        }
        finalType = otherType;
    }

    const description = form.querySelector('#description').value.trim();
    console.log('Description to be sent:', description);
    
    // Create form data and log each field
    const formData = new FormData();
    formData.append('lat', lat);
    formData.append('lng', lng);
    formData.append('type', finalType);
    formData.append('time', form.querySelector('#time').value);
    formData.append('status', form.querySelector('#status').value);
    formData.append('description', description);
    formData.append('urgency', form.querySelector('#urgency').value);
    
    // Handle photo upload
    const photoInput = form.querySelector('#photo');
    if (photoInput && photoInput.files && photoInput.files.length > 0) {
        const photoFile = photoInput.files[0];
        
        // Check if the file is an image
        if (!photoFile.type.match('image.*')) {
            alert('Please select an image file (JPEG, PNG, GIF)');
            return false;
        }
        
        // Check if the file size is reasonable (under 5MB)
        if (photoFile.size > 5 * 1024 * 1024) {
            alert('The photo is too large. Please select an image under 5MB.');
            return false;
        }
        
        console.log('Adding photo to form data:', photoFile.name, photoFile.type, photoFile.size + ' bytes');
        formData.append('photo', photoFile);
    }
    
    // Display a loading message
    const submitButton = form.querySelector('button[type="submit"]');
    if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Submitting...';
    }
    
    // Log FormData entries for debugging
    console.log('Sending form data to server...');
    for (let pair of formData.entries()) {
        console.log(pair[0] + ': ' + pair[1]);
    }

    fetch(`${API_URL}/reports`, {
        method: 'POST',
        body: formData
    })
    .then(response => {
        if (!response.ok) {
            throw new Error(`Server returned ${response.status}: ${response.statusText}`);
        }
        return response.json();
    })
    .then(data => {
        console.log('New report saved:', data);
        reports.push(data);
        updateMarkers();
        map.closePopup();
        alert('Report submitted successfully!');
    })
    .catch(error => {
        console.error('Error saving report:', error);
        alert('Error submitting report: ' + error.message);
        // Re-enable the submit button
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.textContent = 'Submit';
        }
    });
    
    return false;
}

// =============== UTILITY FUNCTIONS ===============

// Update status options in add form
function updateStatusOptions(select) {
    const statusSelect = document.getElementById('status');
    const otherTypeLabel = document.getElementById('otherTypeLabel');
    
    if (!statusSelect) return;
    
    // Clear existing options
    statusSelect.innerHTML = '';
    
    // Add default option
    const defaultOption = document.createElement('option');
    defaultOption.value = '';
    defaultOption.textContent = 'Please select';
    statusSelect.appendChild(defaultOption);
    
    // Show/hide other type field
    if (otherTypeLabel) {
        otherTypeLabel.style.display = (select.value === 'Other') ? 'block' : 'none';
    }
    
    // Add options based on selected type
    switch(select.value) {
        case 'Road':
            addOptions(statusSelect, [
                'Uneven surface',
                'Slippery pavement',
                'Narrow width',
                'Insufficient accessibility features',
                'Prone to water accumulation',
                'Others (please specify in the Description)'
            ]);
            break;
        case 'Accessible Ramp':
            addOptions(statusSelect, [
                'Uneven surface',
                'Slippery pavement',
                'Narrow width',
                'Excessively steep slope',
                'Prone to water accumulation',
                'Others (please specify in the Description)'
            ]);
            break;
        case 'Street Light':
            addOptions(statusSelect, [
                'Not working (malfunction/offline)',
                'Dim lighting',
                'Flickering light',
                'Others (please specify in the Description)'
            ]);
            break;
        case 'Other':
            addOptions(statusSelect, ['Please specify in the Description']);
            break;
    }
}

// Add options to a select element
function addOptions(selectElement, options) {
    options.forEach(option => {
        const optionElement = document.createElement('option');
        optionElement.value = option;
        optionElement.textContent = option;
        selectElement.appendChild(optionElement);
    });
}

// Preview uploaded photo
function previewPhoto(input) {
    const preview = document.getElementById('photoPreview') || document.getElementById('editPhotoPreview');
    if (!preview) return;
    
    if (input.files && input.files[0]) {
        const reader = new FileReader();
        
        reader.onload = function(e) {
            preview.src = e.target.result;
            preview.style.display = 'block';
        };
        
        reader.readAsDataURL(input.files[0]);
    } else {
        preview.style.display = 'none';
    }
}

// Check if a point is inside the campus polygon
function isPointInPolygon(lat, lng) {
    if (!geoJsonPolygon || !geoJsonPolygon.coordinates) {
        console.error('GeoJSON polygon is not properly loaded or invalid.');
        return false;
    }

    // Use Turf.js to check if the point is inside the polygon
    const point = turf.point([lng, lat]);
    const polygon = turf.polygon(geoJsonPolygon.coordinates);
    return turf.booleanPointInPolygon(point, polygon);
}

// Toggle other type field visibility
function toggleOtherType(select) {
    document.getElementById('otherTypeLabel').style.display = (select.value === 'Other') ? 'block' : 'none';
}

// Validate form
function validateForm(form) {
    // Check required fields
    const typeSelect = form.querySelector('#type');
    const urgencySelect = form.querySelector('#urgency');
    
    if (typeSelect.value === "") {
        alert("Please select a report type");
        typeSelect.focus();
        return false;
    }
    
    if (typeSelect.value === "Other") {
        const otherType = form.querySelector('#otherType');
        if (!otherType.value.trim()) {
            alert("Please specify the 'Other' type");
            otherType.focus();
            return false;
        }
    }
    
    if (urgencySelect.value === "") {
        alert("Please select an urgency level");
        urgencySelect.focus();
        return false;
    }
    
    return true;
}

// =============== INITIALIZATION ===============
// Initialize the map when the page loads
document.addEventListener('DOMContentLoaded', function() {
    // Show loading overlay immediately
    showLoadingOverlay();
    
    // Initialize map
    initializeMap();
    
    // Fetch reports from server
    fetchReports();
    
    // Add a fallback timeout to hide the loading overlay in case something goes wrong
    setTimeout(() => {
        console.log('Fallback timeout: Ensuring loading overlay is hidden');
        mapLoaded = true;
        dataLoaded = true;
        hideLoadingOverlay();
    }, 15000); // 15 seconds fallback
}); 
