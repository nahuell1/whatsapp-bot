/**
 * @module commands/cameraCommand
 * @description Camera snapshot command implementation for the WhatsApp bot
 * 
 * This module provides the !camera command that takes a snapshot from various
 * camera types (RTSP, ONVIF, MJPEG) and sends it to the user via WhatsApp.
 * Supports multiple camera configurations and various protocols to communicate
 * with different IP camera models.
 * 
 * @requires onvif
 * @requires fluent-ffmpeg
 * @requires path
 * @requires fs.promises
 * @requires ./utils
 */
const { Cam } = require('onvif');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs').promises;
const { formatMessage } = require('./utils');
const { spawn } = require('child_process');

/**
 * Automatically discover cameras from environment variables
 * Environment variables should follow the pattern: CAMERA_[NAME]_[CONFIG]
 * Example: CAMERA_FRONT_IP=192.168.1.100, CAMERA_FRONT_TYPE=mjpeg
 * @returns {Object} Camera configurations
 */
function discoverCameras() {
  const cameras = {};
  const processedCameras = new Set();
  
  // First, add legacy cameras for backward compatibility
  if (process.env.CAMERA_IP) {
    cameras['default'] = {
      IP: process.env.CAMERA_IP,
      PORT: process.env.CAMERA_PORT || '554',
      USERNAME: process.env.CAMERA_USERNAME || 'admin',
      PASSWORD: process.env.CAMERA_PASSWORD || '',
      TYPE: process.env.CAMERA_TYPE || 'rtsp',
      PATH: process.env.CAMERA_PATH || undefined
    };
  }
  
  // Legacy camera 2
  if (process.env.CAMERA2_IP) {
    cameras['2'] = {
      IP: process.env.CAMERA2_IP,
      PORT: process.env.CAMERA2_PORT || '8081',
      USERNAME: process.env.CAMERA2_USERNAME || '',
      PASSWORD: process.env.CAMERA2_PASSWORD || '',
      TYPE: process.env.CAMERA2_TYPE || 'mjpeg',
      PATH: process.env.CAMERA2_PATH || '?action=stream'
    };
  }
  
  // Discover new pattern cameras: CAMERA_[NAME]_[CONFIG]
  for (const [key, value] of Object.entries(process.env)) {
    const match = key.match(/^CAMERA_([A-Z0-9_]+)_(.+)$/);
    if (match) {
      const [, cameraName, configKey] = match;
      const normalizedName = cameraName.toLowerCase();
      
      if (!cameras[normalizedName]) {
        cameras[normalizedName] = {
          IP: '',
          PORT: '554',
          USERNAME: 'admin',
          PASSWORD: '',
          TYPE: 'rtsp',
          PATH: undefined
        };
      }
      
      // Map config keys to camera properties
      switch (configKey.toUpperCase()) {
        case 'IP':
          cameras[normalizedName].IP = value;
          break;
        case 'PORT':
          cameras[normalizedName].PORT = value;
          break;
        case 'USERNAME':
          cameras[normalizedName].USERNAME = value;
          break;
        case 'PASSWORD':
          cameras[normalizedName].PASSWORD = value;
          break;
        case 'TYPE':
          cameras[normalizedName].TYPE = value.toLowerCase();
          break;
        case 'PATH':
          cameras[normalizedName].PATH = value;
          break;
      }
      
      processedCameras.add(normalizedName);
    }
  }
  
  // Remove cameras without IP addresses
  for (const [name, config] of Object.entries(cameras)) {
    if (!config.IP) {
      delete cameras[name];
    }
  }
  
  console.log(`Discovered ${Object.keys(cameras).length} cameras:`, Object.keys(cameras));
  return cameras;
}

/**
 * Configuration from environment variables with sensible defaults
 * @constant {Object}
 */
const CONFIG = {
  // Auto-discovered camera settings
  cameras: discoverCameras(),
  
  // RTSP URL patterns to try (specific patterns for TAPO C100 cameras)
  RTSP_URL_PATTERNS: [
    // The working stream URL from VLC - try this first
    'rtsp://{username}:{password}@{ip}:{port}/stream1',
    // // Other TAPO C100 specific patterns (most likely to work)
    // 'rtsp://{username}:{password}@{ip}:{port}/video',
    // 'rtsp://{username}:{password}@{ip}/video',
    // 'rtsp://{username}:{password}@{ip}:{port}/av0_0',
    // 'rtsp://{username}:{password}@{ip}/av0_0',
    // 'rtsp://{ip}:{port}/video',
    // 'rtsp://{ip}/video',
    // 'rtsp://{username}:{password}@{ip}:{port}/stream1',
    // 'rtsp://{username}:{password}@{ip}:{port}/stream2',
    // // Try without authentication in case it's open
    // 'rtsp://{ip}:{port}/stream1',
    // 'rtsp://{ip}:{port}/stream2',
    // // More generic patterns
    // 'rtsp://{username}:{password}@{ip}:{port}/',
    // 'rtsp://{username}:{password}@{ip}:{port}',
    // 'rtsp://{username}:{password}@{ip}',
  ],
  
  // HTTP snapshot URLs to try (tailored for TAPO C100)
  HTTP_SNAPSHOT_URLS: [
    // Since we confirmed port 443 is open, prioritize HTTPS URLs
    // 'https://{username}:{password}@{ip}/stw-cgi/image.cgi',
    // 'https://{username}:{password}@{ip}/stw-cgi/snapshot.cgi',
    // 'https://{username}:{password}@{ip}/cgi-bin/snapshot.cgi',
    // 'https://{username}:{password}@{ip}/snapshot.jpg',
    // 'https://{username}:{password}@{ip}/image/jpeg.cgi',
    // 'https://{ip}/stw-cgi/image.cgi?loginuse={username}&loginpas={password}',
    // // Fallback to HTTP in case the camera uses unencrypted endpoints
    // 'http://{username}:{password}@{ip}/stw-cgi/image.cgi',
    // 'http://{username}:{password}@{ip}/stw-cgi/snapshot.cgi',
    // 'http://{username}:{password}@{ip}/snapshot.jpg',
  ],
  
  // Temporary file storage
  TEMP_DIR: path.join(__dirname, '../data/temp'),
  
  // Frame capture timeout (ms)
  CAPTURE_TIMEOUT: 10000,
  
  // Debug level (0=none, 1=basic, 2=verbose)
  DEBUG_LEVEL: parseInt(process.env.CAMERA_DEBUG_LEVEL || '1', 10)
};

/**
 * Ensure the temporary directory exists
 * @async
 */
async function ensureTempDir() {
  try {
    await fs.mkdir(CONFIG.TEMP_DIR, { recursive: true });
  } catch (error) {
    console.error('Error creating temp directory:', error);
  }
}

/**
 * Format an RTSP URL pattern with camera details
 * 
 * @param {string} pattern - RTSP URL pattern
 * @param {string} cameraName - Name of the camera configuration to use
 * @returns {string} Formatted RTSP URL
 */
function formatRtspUrl(pattern, cameraName) {
  // Get the camera config, fallback to default if not found
  const camera = CONFIG.cameras[cameraName] || CONFIG.cameras['default'];
  
  // Don't use encodeURIComponent for RTSP URLs as it can make them too long
  // Some cameras have a limit (around 32 characters) for authentication strings
  return pattern
    .replace('{ip}', camera.IP)
    .replace('{port}', camera.PORT)
    .replace('{username}', camera.USERNAME)
    .replace('{password}', camera.PASSWORD);
}

/**
 * Capture a frame from RTSP stream using FFmpeg
 * 
 * @param {string} rtspUrl - Full RTSP URL to the camera stream
 * @param {string} outputPath - Path to save the captured frame
 * @returns {Promise<boolean>} True if successful, false otherwise
 */
function captureFrameWithFFmpeg(rtspUrl, outputPath) {
  return new Promise((resolve) => {
    console.log(`Attempting to capture frame from: ${rtspUrl.replace(/:.+?@/, ':***@')}`);
    
    // Enhanced FFmpeg options for better compatibility with TAPO cameras
    const ffmpegProcess = spawn('ffmpeg', [
      '-y',                     // Overwrite output files without asking
      '-rtsp_transport', 'tcp', // Force TCP (more reliable than UDP)
      '-i', rtspUrl,            // Input stream URL
      '-frames:v', '1',         // Get a single frame (alternative syntax to vframes)
      '-q:v', '2',              // Quality level (lower is better)
      outputPath                // Output file path
    ]);
    
    let errorOutput = '';
    let stdoutOutput = '';
    
    ffmpegProcess.stderr.on('data', (data) => {
      const output = data.toString();
      errorOutput += output;
      // Log any connection information
      if (output.includes('Opening') || output.includes('Stream') || output.includes('Error')) {
        console.log(`FFmpeg: ${output.trim()}`);
      }
    });
    
    ffmpegProcess.stdout.on('data', (data) => {
      stdoutOutput += data.toString();
    });
    
    ffmpegProcess.on('close', (code) => {
      if (code === 0) {
        console.log('✅ Frame captured successfully');
        resolve(true);
      } else {
        console.error(`FFmpeg process exited with code ${code}`);
        // Print more detailed error info to help diagnose issues
        if (errorOutput.includes('401 Unauthorized')) {
          console.error('Authentication failed - check username/password');
        } else if (errorOutput.includes('Connection refused')) {
          console.error('Connection refused - camera may not be accepting connections on this port');
        } else if (errorOutput.includes('not found')) {
          console.error('Stream URL not found - camera may use a different path');
        } else if (errorOutput.includes('timeout')) {
          console.error('Connection timed out - camera may be unreachable');
        } else {
          console.error('FFmpeg error:', errorOutput);
        }
        resolve(false);
      }
    });
    
    // Increased timeout to prevent hanging
    setTimeout(() => {
      ffmpegProcess.kill('SIGKILL');
      console.error('FFmpeg capture timed out after ' + (CONFIG.CAPTURE_TIMEOUT/1000) + ' seconds');
      resolve(false);
    }, CONFIG.CAPTURE_TIMEOUT);
  });
}

/**
 * Download a snapshot from an HTTP URL
 * 
 * @param {string} url - The HTTP URL to download from
 * @param {string} outputPath - Path to save the snapshot
 * @returns {Promise<boolean>} True if successful, false otherwise
 */
function downloadHttpSnapshot(url, outputPath) {
  return new Promise((resolve) => {
    console.log(`Downloading HTTP snapshot from: ${url.replace(/:.+?@/, ':***@')}`);
    
    const http = require('http');
    const https = require('https');
    
    // Determine which protocol to use
    const client = url.startsWith('https') ? https : http;
    const requestOptions = { 
      timeout: 10000,
      rejectUnauthorized: false // Accept self-signed certificates
    };
    
    // Make the request
    const req = client.get(url, requestOptions, (res) => {
      if (res.statusCode !== 200) {
        console.log(`HTTP snapshot request failed with status: ${res.statusCode}`);
        return resolve(false);
      }
      
      const imageChunks = [];
      
      res.on('data', (chunk) => {
        imageChunks.push(chunk);
      });
      
      res.on('end', async () => {
        if (imageChunks.length > 0) {
          try {
            const imageBuffer = Buffer.concat(imageChunks);
            console.log(`Received ${imageBuffer.length} bytes from HTTP snapshot request`);
            
            // Verify it's likely an image (check for JPEG/PNG headers)
            const isJpeg = imageBuffer.length > 2 && 
              imageBuffer[0] === 0xFF && 
              imageBuffer[1] === 0xD8;
              
            const isPng = imageBuffer.length > 8 &&
              imageBuffer[0] === 0x89 && 
              imageBuffer[1] === 0x50 &&
              imageBuffer[2] === 0x4E &&
              imageBuffer[3] === 0x47;
              
            if (!isJpeg && !isPng) {
              console.log('HTTP response does not appear to be an image');
              return resolve(false);
            }
            
            await fs.writeFile(outputPath, imageBuffer);
            console.log('✅ HTTP snapshot downloaded and saved successfully');
            resolve(true);
          } catch (err) {
            console.error('Error saving HTTP snapshot:', err.message);
            resolve(false);
          }
        } else {
          console.log('No data received from HTTP snapshot request');
          resolve(false);
        }
      });
    });
    
    req.on('error', (err) => {
      console.log(`HTTP snapshot request error: ${err.message}`);
      resolve(false);
    });
    
    req.on('timeout', () => {
      console.log('HTTP snapshot request timed out');
      req.destroy();
      resolve(false);
    });
  });
}

/**
 * Try to get a snapshot using ONVIF protocol with configured path
 * Uses the specific PATH from configuration instead of trying multiple routes
 * 
 * @param {string} outputPath - Path to save the snapshot
 * @param {string} cameraName - Name of the camera configuration to use
 * @returns {Promise<boolean>} True if successful, false otherwise
 */
function getSnapshotWithOnvif(outputPath, cameraName) {
  const camera = CONFIG.cameras[cameraName] || CONFIG.cameras['default'];
  return new Promise(async (resolve) => {
    console.log(`Trying ONVIF connection to camera at ${camera.IP}:${camera.PORT}`);
    
    // If we have a specific PATH configured, use it directly as an HTTP snapshot URL
    if (camera.PATH) {
      console.log(`Using configured ONVIF path: ${camera.PATH}`);
      
      // Construct the full HTTP URL using the configured path
      const protocol = camera.PORT === '443' ? 'https' : 'http';
      let snapshotUrl = `${protocol}://${camera.IP}`;
      if ((protocol === 'http' && camera.PORT !== '80') || 
          (protocol === 'https' && camera.PORT !== '443')) {
        snapshotUrl += `:${camera.PORT}`;
      }
      
      // Add the configured path
      if (!camera.PATH.startsWith('/')) {
        snapshotUrl += '/';
      }
      snapshotUrl += camera.PATH;
      
      // Add authentication if not already in the path
      if (!snapshotUrl.includes('@') && camera.USERNAME && camera.PASSWORD) {
        try {
          const urlObject = new URL(snapshotUrl);
          urlObject.username = camera.USERNAME;
          urlObject.password = camera.PASSWORD;
          snapshotUrl = urlObject.toString();
        } catch (error) {
          console.error('Error formatting snapshot URL:', error.message);
        }
      }
      
      console.log(`Using direct ONVIF snapshot URL: ${snapshotUrl.replace(/:.+?@/, ':***@')}`);
      
      // Try to download the snapshot directly
      const httpSuccess = await downloadHttpSnapshot(snapshotUrl, outputPath);
      if (httpSuccess) {
        console.log(`✅ ONVIF direct snapshot captured successfully`);
        return resolve(true);
      }
    }
    
    // Fallback: Use ONVIF discovery only if no PATH is configured
    console.log('No specific path configured or direct path failed, trying ONVIF discovery...');
    
    // Use only the configured port, don't try multiple ports
    const port = parseInt(camera.PORT) || 80;
    console.log(`Attempting ONVIF discovery on configured port ${port}...`);
    
    try {
      // Create a promise that can be resolved by either success or timeout
      const connectionResult = await new Promise((resolveConnection) => {
        const cam = new Cam({
          hostname: camera.IP,
          username: camera.USERNAME,
          password: camera.PASSWORD,
          port: port,
          timeout: 5000
        }, (err) => {
          if (err) {
            console.log(`ONVIF connection error on port ${port}: ${err.message}`);
            resolveConnection({ success: false });
            return;
          }
          
          cam.getSnapshotUri((err, result) => {
            if (err || !result || !result.uri) {
              console.log(`Failed to get ONVIF snapshot URI on port ${port}: ${err ? err.message : 'No URI returned'}`);
              resolveConnection({ success: false });
              return;
            }
            
            // Format the URI, adding authentication if not included
            let snapshotUrl = result.uri;
            if (!snapshotUrl.includes('@') && camera.USERNAME) {
              try {
                const urlObject = new URL(snapshotUrl);
                urlObject.username = camera.USERNAME;
                urlObject.password = camera.PASSWORD;
                snapshotUrl = urlObject.toString();
              } catch (error) {
                console.error('Error formatting snapshot URL:', error.message);
              }
            }
            
            console.log(`✅ Got ONVIF snapshot URL on port ${port}: ${snapshotUrl.replace(/:.+?@/, ':***@')}`);
            resolveConnection({ success: true, url: snapshotUrl });
          });
        });
        
        // Handle connection timeout
        setTimeout(() => {
          console.log(`ONVIF connection timed out on port ${port}`);
          resolveConnection({ success: false });
        }, 5000);
      });
      
      // If we got a URL, try to capture the snapshot
      if (connectionResult.success && connectionResult.url) {
        let captureSuccess = false;
        
        // Check if this is an HTTP snapshot URL or RTSP stream
        if (connectionResult.url.startsWith('http://') || connectionResult.url.startsWith('https://')) {
          console.log('Detected HTTP snapshot URL, using HTTP download...');
          captureSuccess = await downloadHttpSnapshot(connectionResult.url, outputPath);
        } else {
          console.log('Detected RTSP stream URL, using FFmpeg...');
          captureSuccess = await captureFrameWithFFmpeg(connectionResult.url, outputPath);
        }
        
        if (captureSuccess) {
          console.log(`✅ ONVIF snapshot captured successfully on port ${port}`);
          return resolve(true);
        }
      }
    } catch (error) {
      console.error(`Error in ONVIF connection attempt on port ${port}:`, error.message);
    }
    
    console.log('ONVIF connection attempt failed');
    resolve(false);
  });
}

/**
 * Try to get a snapshot via direct HTTP request
 * Many IP cameras support direct HTTP access to snapshots
 * 
 * @param {string} outputPath - Path to save the snapshot
 * @param {string} cameraName - Name of the camera configuration to use
 * @returns {Promise<boolean>} True if successful, false otherwise
 */
/**
 * Try to get a snapshot via direct HTTP request
 * Many IP cameras support direct HTTP access to snapshots
 * 
 * @param {string} outputPath - Path to save the snapshot
 * @param {string} cameraName - Name of the camera configuration to use
 * @returns {Promise<boolean>} True if successful, false otherwise
 */
function getSnapshotWithHttp(outputPath, cameraName) {
  const camera = CONFIG.cameras[cameraName] || CONFIG.cameras['default'];
  return new Promise(async (resolve) => {
    console.log('Trying HTTP snapshot URLs...');
    
    const http = require('http');
    const https = require('https');
    
    for (const pattern of CONFIG.HTTP_SNAPSHOT_URLS) {
      try {
        const url = pattern
          .replace('{ip}', camera.IP)
          .replace('{username}', encodeURIComponent(camera.USERNAME))
          .replace('{password}', encodeURIComponent(camera.PASSWORD));
        
        console.log(`Trying HTTP snapshot URL: ${url.replace(/:.+?@/, ':***@')}`);
        
        // Determine which protocol to use
        const client = url.startsWith('https') ? https : http;
        const requestOptions = { 
          timeout: 5000,
          rejectUnauthorized: false // Accept self-signed certificates
        };
        
        // Make the request with a timeout
        const req = client.get(url, requestOptions, (res) => {
          if (res.statusCode !== 200) {
            console.log(`HTTP status code: ${res.statusCode} (failed)`);
            return;
          }
          
          const imageChunks = [];
          
          res.on('data', (chunk) => {
            imageChunks.push(chunk);
          });
          
          res.on('end', async () => {
            if (imageChunks.length > 0) {
              try {
                const imageBuffer = Buffer.concat(imageChunks);
                console.log(`Received ${imageBuffer.length} bytes from HTTP request`);
                
                // Verify it's likely an image (check for JPEG/PNG headers)
                const isJpeg = imageBuffer.length > 2 && 
                  imageBuffer[0] === 0xFF && 
                  imageBuffer[1] === 0xD8;
                  
                const isPng = imageBuffer.length > 8 &&
                  imageBuffer[0] === 0x89 && 
                  imageBuffer[1] === 0x50 &&
                  imageBuffer[2] === 0x4E &&
                  imageBuffer[3] === 0x47;
                  
                if (!isJpeg && !isPng) {
                  console.log('Response does not appear to be an image');
                  return;
                }
                
                await fs.writeFile(outputPath, imageBuffer);
                console.log('✅ HTTP snapshot saved successfully');
                resolve(true);
              } catch (err) {
                console.error('Error saving HTTP snapshot:', err.message);
              }
            }
          });
        });
        
        req.on('error', (err) => {
          console.log(`HTTP request error: ${err.message}`);
        });
        
        req.on('timeout', () => {
          console.log('HTTP request timed out');
          req.destroy();
        });
        
        // Wait a bit before trying the next URL
        await new Promise(r => setTimeout(r, 1000));
      } catch (error) {
        console.error('HTTP snapshot error:', error.message);
      }
    }
    
    console.log('All HTTP snapshot attempts failed');
    resolve(false);
  });
}

/**
 * Try to get a snapshot using the curl command
 * This can sometimes work when Node's built-in HTTP client fails
 * especially with cameras that have unusual authentication requirements
 * 
 * @param {string} outputPath - Path to save the snapshot
 * @param {string} cameraName - Name of the camera configuration to use
 * @returns {Promise<boolean>} True if successful, false otherwise
 */
function getSnapshotWithCurl(outputPath, cameraName) {
  const camera = CONFIG.cameras[cameraName] || CONFIG.cameras['default'];
  return new Promise(async (resolve) => {
    console.log('Trying curl for snapshot retrieval...');
    
    // HTTPS URLs to try with curl (focusing on confirmed port 443)
    const urlsToTry = [
    //   `https://${camera.IP}/stw-cgi/snapshot.cgi`,
    //   `https://${camera.IP}/image/jpeg.cgi`,
    //   `https://${camera.IP}/cgi-bin/snapshot.cgi`,
    //   `https://${camera.IP}/snapshot.jpg`,
    ];
    
    // Also try standard RTSP ports
    const rtspUrlsToTry = [
      `rtsp://${camera.IP}:${camera.PORT}/stream1`,
      `rtsp://${camera.IP}:${camera.PORT}/stream2`,
    ];
    
    // Try HTTPS URLs first
    for (const url of urlsToTry) {
      try {
        console.log(`Trying curl with URL: ${url}`);
        
        // Execute curl with various options
        const { exec } = require('child_process');
        
        const command = `curl -k -s -S --connect-timeout 5 -o "${outputPath}" -u "${camera.USERNAME}:${camera.PASSWORD}" "${url}"`;
        
        const curlProcess = exec(command);
        
        const result = await new Promise((resolve) => {
          curlProcess.on('close', (code) => {
            if (code === 0) {
              console.log('✅ curl command completed successfully');
              resolve(true);
            } else {
              console.log(`curl exited with code ${code}`);
              resolve(false);
            }
          });
          
          // Set timeout
          setTimeout(() => {
            try {
              curlProcess.kill('SIGKILL');
              console.log('curl command timed out');
            } catch (e) { /* ignore */ }
            resolve(false);
          }, 10000);
        });
        
        if (result) {
          try {
            const stats = await fs.stat(outputPath);
            if (stats.size > 100) {
              // Verify it's an image
              const data = await fs.readFile(outputPath);
              
              // Check for JPEG or PNG magic numbers
              const isJpeg = data.length > 2 && data[0] === 0xFF && data[1] === 0xD8;
              const isPng = data.length > 8 && data[0] === 0x89 && data[1] === 0x50 && data[2] === 0x4E && data[3] === 0x47;
              
              if (isJpeg || isPng) {
                console.log('✅ curl successfully captured an image!');
                return resolve(true);
              } else {
                console.log('File does not appear to be a valid image');
              }
            }
          } catch (err) {
            console.error('Error verifying curl snapshot:', err.message);
          }
        }
      } catch (error) {
        console.error('curl snapshot error:', error.message);
      }
      
      // Wait a bit before trying the next URL
      await new Promise(r => setTimeout(r, 1000));
    }
    
    // If HTTPS fails, try using ffmpeg via curl for RTSP URLs
    for (const rtspUrl of rtspUrlsToTry) {
      try {
        console.log(`Trying ffmpeg via curl with RTSP URL: ${rtspUrl}`);
        
        const { exec } = require('child_process');
        
        // Create a command that uses ffmpeg to get a frame from RTSP
        const command = `curl -s -o /dev/null -w "Starting FFmpeg\n" -k && ffmpeg -y -rtsp_transport tcp -i "${rtspUrl}" -vframes 1 -q:v 2 "${outputPath}" 2>/dev/null`;
        
        exec(command, async (error, stdout, stderr) => {
          if (!error) {
            try {
              const stats = await fs.stat(outputPath);
              if (stats.size > 100) {
                console.log('✅ ffmpeg via curl successful!');
                return resolve(true);
              }
            } catch (err) {
              console.error('Error verifying ffmpeg snapshot:', err.message);
            }
          } else {
            console.error('ffmpeg command error:', error.message);
          }
        });
        
        // Wait a bit before trying the next URL
        await new Promise(r => setTimeout(r, 5000));
      } catch (error) {
        console.error('ffmpeg via curl error:', error.message);
      }
    }
    
    console.log('All curl snapshot attempts failed');
    resolve(false);
  });
}

/**
 * Try simplified FFmpeg approach with minimal parameters
 * Sometimes the camera requires very specific options
 * 
 * @param {string} outputPath - Path to save the snapshot
 * @returns {Promise<boolean>} True if successful, false otherwise
 */
function trySimplifiedFfmpeg(outputPath, cameraName = 'default') {
  const camera = CONFIG.cameras[cameraName] || CONFIG.cameras['default'];
  return new Promise(async (resolve) => {
    // First try with auth in command line rather than URL (often more reliable)
    try {
      const rtspUrl = `rtsp://${camera.IP}:${camera.PORT}/stream1`;
      console.log(`Trying FFmpeg with auth flags: ${rtspUrl}`);
      
      const { exec } = require('child_process');
      const command = `ffmpeg -y -rtsp_transport tcp -auth_type basic -user ${camera.USERNAME} -pass ${camera.PASSWORD} -i "${rtspUrl}" -frames:v 1 -v error "${outputPath}"`;
      
      const result = await new Promise((resolveExec) => {
        exec(command, { timeout: 10000 }, (error) => {
          if (error) {
            console.log(`FFmpeg with auth flags error: ${error.message}`);
            resolveExec(false);
          } else {
            console.log('✅ FFmpeg with auth flags succeeded');
            resolveExec(true);
          }
        });
      });
      
      if (result) {
        const stats = await fs.stat(outputPath);
        if (stats.size > 100) {
          console.log('✅ FFmpeg with auth flags captured an image!');
          return resolve(true);
        }
      }
    } catch (error) {
      console.error('FFmpeg with auth flags error:', error.message);
    }
    
    // Try standard formats
    const rtspPatterns = [
      `rtsp://${camera.USERNAME}:${camera.PASSWORD}@${camera.IP}:${camera.PORT}/stream1`,
      `rtsp://${camera.IP}:${camera.PORT}/stream1`,
    ];
    
    for (const rtspUrl of rtspPatterns) {
      console.log(`Trying simplified FFmpeg with URL: ${rtspUrl.replace(/:.+?@/, ':***@')}`);
      
      try {
        const { exec } = require('child_process');
        
        // Use a much simpler FFmpeg command
        const command = `ffmpeg -y -i "${rtspUrl}" -frames:v 1 "${outputPath}"`;
        
        const result = await new Promise((resolve) => {
          const ffmpegProcess = exec(command, { timeout: 8000 }, (error) => {
            if (error) {
              console.log(`Simplified FFmpeg error: ${error.message}`);
              resolve(false);
            } else {
              console.log('✅ Simplified FFmpeg succeeded');
              resolve(true);
            }
          });
          
          setTimeout(() => {
            try {
              ffmpegProcess.kill('SIGKILL');
              console.log('Simplified FFmpeg timed out');
              resolve(false);
            } catch (e) { /* ignore */ }
          }, 8000);
        });
        
        if (result) {
          try {
            const stats = await fs.stat(outputPath);
            if (stats.size > 100) {
              console.log('✅ Simplified FFmpeg captured an image!');
              return resolve(true);
            }
          } catch (err) {
            console.error('Error verifying simplified FFmpeg result:', err.message);
          }
        }
      } catch (error) {
        console.error('Simplified FFmpeg error:', error.message);
      }
      
      // Wait a bit before trying the next URL
      await new Promise(r => setTimeout(r, 1000));
    }
    
    console.log('All simplified FFmpeg attempts failed');
    resolve(false);
  });
}

/**
 * Take a snapshot from the camera and save it to a temporary file.
 * Tries multiple RTSP URL patterns and falls back to ONVIF if needed.
 * 
 * @async
 * @param {string} [cameraName='default'] - Name identifier for the camera
 * @returns {Promise<string>} Path to the saved image file
 * @throws {Error} If fetching or saving the snapshot fails
 */
async function takeSnapshot(cameraName = 'default') {
  // Verify if the camera name exists in our config, otherwise use default
  const actualCameraName = CONFIG.cameras[cameraName] ? cameraName : 'default';
  const camera = CONFIG.cameras[actualCameraName];
  
  console.log(`Taking snapshot from camera '${actualCameraName}' at IP ${camera.IP}`);
  
  // Check if this is an MJPEG camera
  if (camera.TYPE === 'mjpeg') {
    console.log('Detected MJPEG camera, using MJPEG protocol');
    try {
      return await takeMJPEGSnapshot(actualCameraName);
    } catch (mjpegError) {
      console.error(`MJPEG camera snapshot failed: ${mjpegError.message}`);
      console.log('Trying generic camera methods as fallback...');
      // Continue with standard methods as fallback
    }
  }
  
  // Create a unique filename based on timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${actualCameraName}-${timestamp}.jpg`;
  const filePath = path.join(CONFIG.TEMP_DIR, filename);
  
  try {
    // Start with the approach that worked in testing
    console.log("Using proven FFmpeg command format");
    const rtspUrl = `rtsp://${camera.USERNAME}:${camera.PASSWORD}@${camera.IP}:${camera.PORT}/stream1`;
    
    // Use the exact command format that worked in testing
    const simpleCmd = `ffmpeg -y -rtsp_transport tcp -i "${rtspUrl}" -frames:v 1 "${filePath}"`;
    
    try {
      console.log("Trying direct FFmpeg command...");
      const { execSync } = require('child_process');
      
      // First try the direct command with credentials in URL
      try {
        console.log(`Executing: ${simpleCmd.replace(/rtsp:\/\/.*?@/, 'rtsp://[credentials]@')}`);
        execSync(simpleCmd, { timeout: 15000, stdio: 'inherit' });
        
        // Check if the file was created
        const stats = await fs.stat(filePath);
        if (stats.size > 100) {
          console.log(`✅ Snapshot successfully saved to: ${filePath} using direct FFmpeg command`);
          return filePath;
        }
      } catch (cmdError) {
        console.log(`Direct FFmpeg command failed: ${cmdError.message}`);
      }
      
      // Try without embedded credentials but with -user and -pass options
      console.log("Trying FFmpeg with separate auth parameters...");
      const authCmd = `ffmpeg -y -rtsp_transport tcp -i "rtsp://${camera.IP}:${camera.PORT}/stream1" -user ${camera.USERNAME} -pass ${camera.PASSWORD} -frames:v 1 "${filePath}"`;
      
      try {
        console.log(`Executing command with separate auth parameters`);
        execSync(authCmd, { timeout: 15000, stdio: 'inherit' });
        
        // Check if the file was created
        const stats = await fs.stat(filePath);
        if (stats.size > 100) {
          console.log(`✅ Snapshot successfully saved to: ${filePath} using separate auth params`);
          return filePath;
        }
      } catch (authError) {
        console.log(`FFmpeg with separate auth params failed: ${authError.message}`);
      }
      
      // If still failing, try with auth_type options
      console.log("Trying FFmpeg with auth_type options...");
      // Try with TCP transport and auth_type options
      const authTypeCmd = `ffmpeg -y -rtsp_transport tcp -auth_type basic -user ${camera.USERNAME} -pass ${camera.PASSWORD} -i "rtsp://${camera.IP}:${camera.PORT}/stream1" -frames:v 1 -v error "${filePath}"`;
      
      try {
        console.log(`Executing command with auth_type options`);
        execSync(authTypeCmd, { timeout: 15000, stdio: 'inherit' });
        
        // Check if the file was created
        const stats = await fs.stat(filePath);
        if (stats.size > 100) {
          console.log(`✅ Snapshot successfully saved to: ${filePath} using auth_type options`);
          return filePath;
        }
      } catch (authTypeError) {
        console.log(`FFmpeg with auth_type options failed: ${authTypeError.message}`);
      }
      
      // Try with digest auth as last direct attempt
      console.log("Trying FFmpeg with digest auth...");
      const digestAuthCmd = `ffmpeg -y -rtsp_transport tcp -auth_type digest -user ${camera.USERNAME} -pass ${camera.PASSWORD} -i "rtsp://${camera.IP}:${camera.PORT}/stream1" -frames:v 1 "${filePath}"`;
      
      try {
        console.log(`Executing command with digest auth`);
        execSync(digestAuthCmd, { timeout: 15000, stdio: 'inherit' });
        
        // Check if the file was created
        const stats = await fs.stat(filePath);
        if (stats.size > 100) {
          console.log(`✅ Snapshot successfully saved to: ${filePath} using digest auth`);
          return filePath;
        }
      } catch (digestError) {
        console.log(`FFmpeg with digest auth failed: ${digestError.message}`);
      }
    } catch (error) {
      console.log(`All direct FFmpeg commands failed: ${error.message}`);
    }
    
    // First try RTSP URL patterns
    for (const pattern of CONFIG.RTSP_URL_PATTERNS) {
      const rtspUrl = formatRtspUrl(pattern, actualCameraName);
      console.log(`Trying RTSP URL: ${rtspUrl.replace(/:.+?@/, ':***@')}`);
      
      const success = await captureFrameWithFFmpeg(rtspUrl, filePath);
      if (success) {
        // Verify file exists and has content
        const stats = await fs.stat(filePath);
        if (stats.size > 100) {
          console.log(`✅ Snapshot successfully saved to: ${filePath}`);
          return filePath;
        }
        console.log('Captured file too small, trying next URL pattern');
      }
    }
    
    // If RTSP failed, try ONVIF as fallback
    console.log('All RTSP attempts failed, trying ONVIF protocol...');
    const onvifSuccess = await getSnapshotWithOnvif(filePath, actualCameraName);
    
    if (onvifSuccess) {
      const stats = await fs.stat(filePath);
      if (stats.size > 100) {
        console.log(`✅ Snapshot successfully saved to: ${filePath}`);
        return filePath;
      }
      throw new Error('ONVIF snapshot too small or invalid');
    }
    
    // If ONVIF failed, try HTTP as last resort
    console.log('All ONVIF attempts failed, trying HTTP snapshot...');
    const httpSuccess = await getSnapshotWithHttp(filePath, actualCameraName);
    
    if (httpSuccess) {
      const stats = await fs.stat(filePath);
      if (stats.size > 100) {
        console.log(`✅ Snapshot successfully saved to: ${filePath}`);
        return filePath;
      }
      throw new Error('HTTP snapshot too small or invalid');
    }
    
    // Try using FFmpeg directly with simplified options as a backup
    console.log('Trying simplified FFmpeg approach as backup...');
    const simpleFfmpegSuccess = await trySimplifiedFfmpeg(filePath, actualCameraName);
    
    if (simpleFfmpegSuccess) {
      const stats = await fs.stat(filePath);
      if (stats.size > 100) {
        console.log(`✅ Snapshot successfully saved to: ${filePath}`);
        return filePath;
      }
    }
    
    // Last resort - try with curl command directly (which sometimes works better than Node's HTTP client)
    console.log('All HTTP attempts failed, trying curl as last resort...');
    const curlSuccess = await getSnapshotWithCurl(filePath, actualCameraName);
    
    if (curlSuccess) {
      const stats = await fs.stat(filePath);
      if (stats.size > 100) {
        console.log(`✅ Snapshot successfully saved to: ${filePath}`);
        return filePath;
      }
      throw new Error('Curl snapshot too small or invalid');
    }
    
    throw new Error('Failed to get snapshot with RTSP, ONVIF, HTTP, and curl methods');
  } catch (error) {
    console.error('Error taking camera snapshot:', error);
    throw new Error(`Could not get image from camera: ${error.message}`);
  }
}

/**
 * Handle camera command requests
 * 
 * @async
 * @param {Object} msg - WhatsApp message object
 * @param {Function} msg.reply - Function to reply to the message
 * @param {Function} msg.getContact - Function to get contact information
 * @param {string} args - Command arguments (optional camera name)
 * @returns {Promise<void>}
 */
async function handleCameraCommand(msg, args) {
  try {
    // Parse camera name from arguments
    const requestedCamera = args ? args.trim().toLowerCase() : 'default';
    
    // Check if the requested camera exists
    const availableCameras = Object.keys(CONFIG.cameras);
    const cameraName = availableCameras.includes(requestedCamera) ? requestedCamera : 'default';
    
    if (requestedCamera !== cameraName) {
      await msg.reply(formatMessage({
        title: '⚠️ Camera not found',
        body: `Camera "${requestedCamera}" is not configured. Using default camera.`,
        footer: `Available cameras: ${availableCameras.join(', ')}`
      }));
    }
    
    // Get camera configuration
    const camera = CONFIG.cameras[cameraName];
    const cameraType = camera.TYPE || 'rtsp';
    
    // Send a processing message
    await msg.reply(formatMessage({
      title: '📸 Capturing image...',
      body: `Getting image from camera "${cameraName}" (${cameraType.toUpperCase()}), please wait...`
    }));
    
    // Ensure temp directory exists
    await ensureTempDir();
    
    // Take the snapshot
    const imagePath = await takeSnapshot(cameraName);
    
    // Send the image using MessageMedia from whatsapp-web.js
    const { MessageMedia } = require('whatsapp-web.js');
    
    try {
      // Verify file exists and has content
      const stats = await fs.stat(imagePath);
      if (stats.size === 0) {
        throw new Error('The captured image is empty');
      }
      
      console.log(`Image file size: ${stats.size} bytes`);
      
      // Read file as buffer and base64 encode it manually
      const fileBuffer = await fs.readFile(imagePath);
      const base64Data = fileBuffer.toString('base64');
      
      // Create MessageMedia object manually with correct parameters
      const messageMedia = new MessageMedia('image/jpeg', base64Data, `camera_${cameraName}.jpg`);
      
      // Use client.sendMessage directly for more compatibility
      const chat = await msg.getChat();
      const cameraType = camera.TYPE || 'rtsp';
      await chat.sendMessage(messageMedia, { 
        caption: `📸 Camera image: ${cameraName} (${cameraType.toUpperCase()})\nCaptured: ${new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}` 
      });
    } catch (mediaError) {
      console.error('Error sending media:', mediaError);
      await msg.reply(formatMessage({
        title: '❌ Error sending image',
        body: `The image was captured correctly but could not be sent: ${mediaError.message}`,
        footer: 'The image is available on the server.'
      }));
    }
    
    // Clean up - remove temporary file
    setTimeout(async () => {
      try {
        await fs.unlink(imagePath);
      } catch (err) {
        console.error('Error removing temporary file:', err);
      }
    }, 60000); // Remove after 1 minute
    
  } catch (error) {
    console.error('Camera command error:', error);
    await msg.reply(formatMessage({
      title: '❌ Error',
      body: `Could not get image: ${error.message}`,
      footer: 'Check camera configuration and try again.'
    }));
  }
}

/**
 * Handle the !cameras command - captures from all available cameras
 * 
 * @async
 * @param {Object} msg - WhatsApp message object
 */
async function handleCamerasCommand(msg) {
  const cameraNames = Object.keys(CONFIG.cameras);
  
  if (cameraNames.length === 0) {
    await msg.reply(formatMessage({
      title: '❌ No cameras configured',
      body: 'No cameras are currently configured in the system.',
      footer: 'Check your environment variables for camera configurations.'
    }));
    return;
  }

  // Send initial status message
  await msg.reply(formatMessage({
    title: '📸 Capturing from all cameras',
    body: `Starting capture from ${cameraNames.length} camera(s): (${cameraNames.join(', ')})`,
    footer: 'This may take a few moments...'
  }));

  // Ensure temp directory exists
  await ensureTempDir();

  const results = [];
  const capturedImages = [];
  
  // Capture from each camera sequentially to avoid overloading
  for (const cameraName of cameraNames) {
    try {
      console.log(`Starting capture from camera: ${cameraName}`);
      
      const imagePath = await takeSnapshot(cameraName);
      
      // Verify file exists and has content
      const stats = await fs.stat(imagePath);
      if (stats.size === 0) {
        throw new Error('The captured image is empty');
      }
      
      console.log(`Image file size: ${stats.size} bytes`);
      
      // Read file as buffer and base64 encode it manually
      const fileBuffer = await fs.readFile(imagePath);
      const base64Data = fileBuffer.toString('base64');
      
      // Create MessageMedia object manually with correct parameters
      const { MessageMedia } = require('whatsapp-web.js');
      const messageMedia = new MessageMedia('image/jpeg', base64Data, `camera_${cameraName}.jpg`);
      
      capturedImages.push({
        media: messageMedia,
        cameraName,
        cameraType: CONFIG.cameras[cameraName].TYPE || 'rtsp',
        imagePath
      });
      
      results.push({ camera: cameraName, status: 'success' });
      
    } catch (error) {
      console.error(`Error capturing from camera ${cameraName}:`, error);
      results.push({ camera: cameraName, status: 'failed', error: error.message });
    }
  }
  
  // Send all captured images together if any were successful
  if (capturedImages.length > 0) {
    try {
      const chat = await msg.getChat();
      
      // Create caption with camera details
      const cameraDetails = capturedImages.map(img => 
        `📸 ${img.cameraName.charAt(0).toUpperCase() + img.cameraName.slice(1)} (${img.cameraType.toUpperCase()})`
      ).join('\n');
      
      const currentTime = new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' });
      
      if (capturedImages.length === 1) {
        // Single image - use msg.reply instead of chat.sendMessage to avoid serialization issues
        await msg.reply(capturedImages[0].media, undefined, { 
          caption: `${cameraDetails}\nCaptured: ${currentTime}` 
        });
      } else {
        // Multiple images - send them one by one with a small delay
        for (let i = 0; i < capturedImages.length; i++) {
          const imgData = capturedImages[i];
          const caption = i === 0 ? `${cameraDetails}\nCaptured: ${currentTime}` : '';
          
          try {
            await msg.reply(imgData.media, undefined, caption ? { caption } : undefined);
            // Small delay between images to avoid overwhelming WhatsApp
            if (i < capturedImages.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          } catch (sendError) {
            console.error(`Error sending image ${imgData.cameraName}:`, sendError);
            // Continue with next image
          }
        }
      }
    } catch (mediaError) {
      console.error('Error sending captured images:', mediaError);
      await msg.reply(formatMessage({
        title: '❌ Error sending images',
        body: `${capturedImages.length} image(s) were captured but could not be sent: ${mediaError.message}`,
        footer: 'The images are available on the server.'
      }));
      
      // Update results to reflect send failure
      results.forEach(result => {
        if (result.status === 'success') {
          result.status = 'capture_success_send_failed';
        }
      });
    }
    
    // Clean up - remove temporary files
    for (const imgData of capturedImages) {
      setTimeout(async () => {
        try {
          await fs.unlink(imgData.imagePath);
        } catch (err) {
          console.error('Error removing temporary file:', err);
        }
      }, 60000); // Remove after 1 minute
    }
  }
  
  // Send final summary
  const successCount = results.filter(r => r.status === 'success').length;
  const failCount = results.filter(r => r.status === 'failed').length;
  const partialCount = results.filter(r => r.status === 'capture_success_send_failed').length;
  
  await msg.reply(formatMessage({
    title: '📊 Capture Summary',
    body: `
✅ Successful: ${successCount}
${partialCount > 0 ? `⚠️ Captured but send failed: ${partialCount}\n` : ''}❌ Failed: ${failCount}
📱 Total cameras: ${results.length}`,
    footer: `Completed at ${new Date().toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires' })}`
  }));
}

/**
 * Module exports
 * @type {Object}
 */
module.exports = {
  /**
   * Register this command with the command handler
   * 
   * @param {Object} commandHandler - Command handler instance
   */
  register: (commandHandler) => {
    // Generate help text with available cameras and their types
    const availableCameras = Object.keys(CONFIG.cameras).map(name => {
      const type = CONFIG.cameras[name].TYPE || 'rtsp';
      return `${name} (${type})`;
    }).join(', ');
    
    // Register individual camera command
    commandHandler.register(
      '!camera', 
      handleCameraCommand, 
      `Take a snapshot from a specific camera: !camera [camera_name]. Available cameras: ${availableCameras}`
    );
    
    // Register all cameras command
    commandHandler.register(
      '!allcameras', 
      handleCamerasCommand, 
      `Take snapshots from all configured cameras at once. Available cameras: ${availableCameras}`
    );
  }
};

/**
 * Get a snapshot from an MJPEG camera stream
 * 
 * @param {string} outputPath - Path to save the snapshot
 * @param {string} cameraName - Name of the camera configuration to use
 * @returns {Promise<boolean>} True if successful, false otherwise
 */
function getSnapshotFromMJPEGCamera(outputPath, cameraName) {
  return new Promise(async (resolve) => {
    const camera = CONFIG.cameras[cameraName];
    
    if (!camera || camera.TYPE !== 'mjpeg') {
      console.log('Not an MJPEG camera or camera not found');
      return resolve(false);
    }
    
    console.log(`Trying to capture MJPEG stream from camera: ${cameraName}`);
    
    const http = require('http');
    const https = require('https');
    
    // Construct the URL for the MJPEG stream
    const protocol = camera.PORT === '443' ? 'https' : 'http';
    let url = `${protocol}://${camera.IP}`;
    if ((protocol === 'http' && camera.PORT !== '80') || 
        (protocol === 'https' && camera.PORT !== '443')) {
      url += `:${camera.PORT}`;
    }
    url += camera.PATH || '/video/mjpg/1';
    
    console.log(`Connecting to MJPEG stream: ${url}`);
    
    // Create request options with auth if provided
    const requestOptions = {
      timeout: 10000,
      rejectUnauthorized: false // Accept self-signed certificates
    };
    
    // Add authentication if provided
    if (camera.USERNAME && camera.PASSWORD) {
      requestOptions.auth = `${camera.USERNAME}:${camera.PASSWORD}`;
    }
    
    // Determine which protocol client to use
    const client = protocol === 'https' ? https : http;
    
    try {
      const req = client.get(url, requestOptions, (res) => {
        // Check if we got a valid response
        if (res.statusCode !== 200) {
          console.log(`MJPEG connection failed with status: ${res.statusCode}`);
          return resolve(false);
        }
        
        // Check content type to confirm it's an MJPEG stream
        const contentType = res.headers['content-type'] || '';
        if (!contentType.includes('multipart/x-mixed-replace')) {
          console.log(`Unexpected content type for MJPEG stream: ${contentType}`);
          // Some cameras might not set the correct content type, so continue anyway
        }
        
        // Variables to hold the boundary and frame data
        let boundary = '';
        let imageBuffer = Buffer.alloc(0);
        let isCollectingImage = false;
        let frameHeaderFound = false;
        
        // Extract boundary from content type
        if (contentType.includes('boundary=')) {
          boundary = contentType.split('boundary=')[1].trim();
          console.log(`MJPEG stream boundary: ${boundary}`);
        }
        
        // Handle the chunked data stream
        res.on('data', (chunk) => {
          if (!isCollectingImage) {
            // Look for JPEG start marker in the chunk (0xFF 0xD8)
            const startMarkerIndex = chunk.indexOf(Buffer.from([0xFF, 0xD8]));
            if (startMarkerIndex !== -1) {
              console.log('Found JPEG start marker');
              imageBuffer = chunk.slice(startMarkerIndex);
              isCollectingImage = true;
              frameHeaderFound = true;
            }
          } else {
            // Check if this chunk contains a boundary indicating the end of the frame
            const chunkStr = chunk.toString();
            
            // Check for a boundary if we have one, or for the start of a new frame
            const isBoundaryInChunk = boundary && chunkStr.includes(boundary);
            const hasNewJpegStart = chunk.includes(Buffer.from([0xFF, 0xD8])) && imageBuffer.length > 1000; // Only consider as a boundary if we've already collected some data
            
            if (isBoundaryInChunk || hasNewJpegStart) {
              console.log('Found frame boundary');
              
              // If we have a complete frame, save it
              if (frameHeaderFound && imageBuffer.length > 1000) { // Minimum reasonable JPEG size
                const endMarkerIndex = imageBuffer.indexOf(Buffer.from([0xFF, 0xD9]));
                if (endMarkerIndex !== -1) {
                  // We have a complete JPEG (with start and end markers)
                  const completeImage = imageBuffer.slice(0, endMarkerIndex + 2);
                  
                  // Verify the image is valid
                  if (isValidJpegImage(completeImage)) {
                    // Save the image and resolve the promise
                    fs.writeFile(outputPath, completeImage)
                      .then(() => {
                        console.log(`✅ MJPEG frame saved successfully (${completeImage.length} bytes)`);
                        req.destroy(); // Close the connection
                        resolve(true);
                      })
                      .catch((err) => {
                        console.error('Error saving MJPEG frame:', err);
                        req.destroy(); // Close the connection on error
                        resolve(false);
                      });
                  } else {
                    console.log('Invalid JPEG image received from MJPEG stream');
                    // Continue collecting frames, don't resolve yet
                  }
                  
                  return; // Exit the data handler after saving
                }
              }
              
              // Start collecting a new frame if we didn't find a complete one
              if (hasNewJpegStart) {
                const startMarkerIndex = chunk.indexOf(Buffer.from([0xFF, 0xD8]));
                imageBuffer = chunk.slice(startMarkerIndex);
                frameHeaderFound = true;
              } else {
                // Reset for next frame
                imageBuffer = Buffer.alloc(0);
                isCollectingImage = false;
                frameHeaderFound = false;
              }
            } else {
              // Continue collecting the current frame
              imageBuffer = Buffer.concat([imageBuffer, chunk]);
            }
          }
        });
        
        // Handle errors and timeout
        res.on('error', (err) => {
          console.error('MJPEG stream error:', err);
          resolve(false);
        });
        
        // Set a timeout to prevent hanging forever
        setTimeout(() => {
          console.log('MJPEG capture timed out');
          if (!req.destroyed) {
            req.destroy();
            resolve(false);
          }
        }, 15000); // 15 seconds timeout
      });
      
      req.on('error', (err) => {
        console.error('MJPEG request error:', err);
        resolve(false);
      });
      
      req.on('timeout', () => {
        console.log('MJPEG request timed out');
        req.destroy();
        resolve(false);
      });
      
    } catch (error) {
      console.error('Error in MJPEG capture:', error);
      resolve(false);
    }
  });
}

/**
 * Take a snapshot from an MJPEG camera
 * 
 * @async
 * @param {string} cameraName - Name of the camera configuration to use
 * @returns {Promise<string>} Path to the saved image file
 * @throws {Error} If fetching or saving the snapshot fails
 */
async function takeMJPEGSnapshot(cameraName) {
  console.log(`Taking MJPEG snapshot from camera '${cameraName}'`);
  
  // Create a unique filename based on timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${cameraName}-mjpeg-${timestamp}.jpg`;
  const filePath = path.join(CONFIG.TEMP_DIR, filename);
  
  try {
    // Try to get snapshot from MJPEG camera
    const success = await getSnapshotFromMJPEGCamera(filePath, cameraName);
    
    if (success) {
      // Verify file exists and has content
      const stats = await fs.stat(filePath);
      if (stats.size > 100) {
        console.log(`✅ MJPEG snapshot successfully saved to: ${filePath}`);
        return filePath;
      }
      throw new Error('MJPEG snapshot too small or invalid');
    }
    
    // Fallback method: try to get snapshot using ffmpeg which also works with some MJPEG streams
    console.log('Direct MJPEG capture failed, trying FFmpeg as fallback...');
    const camera = CONFIG.cameras[cameraName];
    
    // Construct the URL for FFmpeg
    const protocol = camera.PORT === '443' ? 'https' : 'http';
    let url = `${protocol}://${camera.IP}`;
    if ((protocol === 'http' && camera.PORT !== '80') || 
        (protocol === 'https' && camera.PORT !== '443')) {
      url += `:${camera.PORT}`;
    }
    url += camera.PATH || '/video/mjpg/1';
    
    // Add authentication if provided
    if (camera.USERNAME && camera.PASSWORD) {
      // Insert credentials into the URL
      url = url.replace('://', `://${encodeURIComponent(camera.USERNAME)}:${encodeURIComponent(camera.PASSWORD)}@`);
    }
    
    console.log(`Trying FFmpeg with MJPEG URL: ${url.replace(/:.+?@/, ':***@')}`);
    
    // Use FFmpeg to capture a frame from the MJPEG stream
    const ffmpegProcess = spawn('ffmpeg', [
      '-y',                // Overwrite output files without asking
      '-i', url,           // Input stream URL
      '-frames:v', '1',    // Get a single frame
      '-q:v', '2',         // Quality level (lower is better)
      filePath             // Output file path
    ]);
    
    const ffmpegResult = await new Promise((resolveFFmpeg) => {
      ffmpegProcess.on('close', (code) => {
        if (code === 0) {
          resolveFFmpeg(true);
        } else {
          console.error(`FFmpeg process exited with code ${code}`);
          resolveFFmpeg(false);
        }
      });
      
      // Set timeout to prevent hanging
      setTimeout(() => {
        try {
          ffmpegProcess.kill('SIGKILL');
          console.log('FFmpeg MJPEG capture timed out');
          resolveFFmpeg(false);
        } catch (e) { /* ignore */ }
      }, 10000);
    });
    
    if (ffmpegResult) {
      // Verify file exists and has content
      const stats = await fs.stat(filePath);
      if (stats.size > 100) {
        console.log(`✅ MJPEG snapshot (via FFmpeg) successfully saved to: ${filePath}`);
        return filePath;
      }
    }
    
    // Try the curl method as a last resort
    console.log('Trying curl as a last resort for MJPEG camera...');
    const curlSuccess = await getSnapshotFromMJPEGCameraWithCurl(filePath, cameraName);
    
    if (curlSuccess) {
      // Verify file exists and has content
      const stats = await fs.stat(filePath);
      if (stats.size > 100) {
        console.log(`✅ MJPEG snapshot (via curl) successfully saved to: ${filePath}`);
        return filePath;
      }
    }
    
    throw new Error('Failed to get snapshot from MJPEG camera after trying all methods');
  } catch (error) {
    console.error('Error taking MJPEG camera snapshot:', error);
    throw new Error(`Could not get image from MJPEG camera: ${error.message}`);
  }
}

/**
 * Verify if a buffer contains a valid JPEG image
 * 
 * @param {Buffer} buffer - The buffer to check
 * @returns {boolean} True if the buffer appears to be a valid JPEG
 */
function isValidJpegImage(buffer) {
  // Check minimum size
  if (!buffer || buffer.length < 100) {
    return false;
  }

  // Check for JPEG SOI marker (Start Of Image)
  if (buffer[0] !== 0xFF || buffer[1] !== 0xD8) {
    return false;
  }

  // Check for JPEG EOI marker (End Of Image)
  // This should be at the end of the buffer
  const hasEndMarker = buffer.includes(Buffer.from([0xFF, 0xD9]));
  if (!hasEndMarker) {
    return false;
  }

  // Additional sanity checks could be added here
  // For example, checking for valid JPEG structure, minimum dimensions, etc.

  return true;
}

/**
 * Try to capture a snapshot from an MJPEG stream using curl
 * Sometimes curl handles auth and streaming better than Node.js
 * 
 * @param {string} outputPath - Path to save the snapshot
 * @param {string} cameraName - Name of the camera configuration to use
 * @returns {Promise<boolean>} True if successful, false otherwise
 */
function getSnapshotFromMJPEGCameraWithCurl(outputPath, cameraName) {
  return new Promise((resolve) => {
    const camera = CONFIG.cameras[cameraName];
    
    if (!camera || camera.TYPE !== 'mjpeg') {
      console.log('Not an MJPEG camera or camera not found');
      return resolve(false);
    }
    
    // Construct the URL for the MJPEG stream
    const protocol = camera.PORT === '443' ? 'https' : 'http';
    let url = `${protocol}://${camera.IP}`;
    if ((protocol === 'http' && camera.PORT !== '80') || 
        (protocol === 'https' && camera.PORT !== '443')) {
      url += `:${camera.PORT}`;
    }
    url += camera.PATH || '/video/mjpg/1';
    
    console.log(`Trying curl with MJPEG URL: ${url.replace(/:.+?@/, ':***@')}`);
    
    // Prepare the curl command with proper authentication
    let curlCmd = `curl -s -k`;
    
    // Add auth if provided
    if (camera.USERNAME && camera.PASSWORD) {
      curlCmd += ` -u "${camera.USERNAME}:${camera.PASSWORD}"`;
    }
    
    // Add options to handle the MJPEG stream and timeout
    curlCmd += ` --max-time 10`;
    curlCmd += ` --connect-timeout 5`;
    curlCmd += ` -H "Accept: image/jpeg"`;
    
    // Complete the command with the URL and output processing
    curlCmd += ` "${url}" | dd bs=1M count=1 of="${outputPath}" 2>/dev/null`;
    
    console.log(`Executing curl command for MJPEG stream`);
    
    // Execute the curl command
    const { exec } = require('child_process');
    exec(curlCmd, async (error, stdout, stderr) => {
      if (error) {
        console.error(`curl error: ${error.message}`);
        return resolve(false);
      }
      
      try {
        // Check if file exists and is valid
        const stats = await fs.stat(outputPath);
        if (stats.size > 1000) { // Reasonable minimum size for a JPEG
          // Read the file to validate it's a JPEG
          const buffer = await fs.readFile(outputPath);
          if (isValidJpegImage(buffer)) {
            console.log(`✅ MJPEG snapshot captured with curl (${stats.size} bytes)`);
            return resolve(true);
          }
        }
        console.log(`Invalid or empty image captured with curl`);
        return resolve(false);
      } catch (err) {
        console.error(`Error verifying curl output: ${err.message}`);
        return resolve(false);
      }
    });
  });
}
