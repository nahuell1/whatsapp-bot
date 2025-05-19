/**
 * @module commands/cameraCommand
 * @description Camera snapshot command implementation for the WhatsApp bot
 * 
 * This module provides the !camera command that takes a snapshot from a
 * TAPO C100 camera and sends it to the user via WhatsApp. I                const imageBuffer = Buffer.concat(imageChunks);
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
                }and ONVIF protocols to communicate with the camera.
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
 * Configuration from environment variables with sensible defaults
 * @constant {Object}
 */
const CONFIG = {
  // Camera settings with default values
  CAMERA_IP: process.env.CAMERA_IP || '192.168.0.43',
  CAMERA_PORT: process.env.CAMERA_PORT || '554',
  CAMERA_USERNAME: process.env.CAMERA_USERNAME || 'admin',
  CAMERA_PASSWORD: process.env.CAMERA_PASSWORD || '',
  
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
 * @returns {string} Formatted RTSP URL
 */
function formatRtspUrl(pattern) {
  // Don't use encodeURIComponent for RTSP URLs as it can make them too long
  // Some cameras have a limit (around 32 characters) for authentication strings
  return pattern
    .replace('{ip}', CONFIG.CAMERA_IP)
    .replace('{port}', CONFIG.CAMERA_PORT)
    .replace('{username}', CONFIG.CAMERA_USERNAME)
    .replace('{password}', CONFIG.CAMERA_PASSWORD);
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
 * Try to get a snapshot using ONVIF protocol
 * 
 * @param {string} outputPath - Path to save the snapshot
 * @returns {Promise<boolean>} True if successful, false otherwise
 */
function getSnapshotWithOnvif(outputPath) {
  return new Promise(async (resolve) => {
    console.log(`Trying ONVIF connection to camera at ${CONFIG.CAMERA_IP}`);
    
    // Common ONVIF ports to try
    const portsToTry = [80, 443, 8000, 8080, 8081, 2020];
    
    for (const port of portsToTry) {
      console.log(`Attempting ONVIF connection on port ${port}...`);
      
      try {
        // Create a promise that can be resolved by either success or timeout
        const connectionResult = await new Promise((resolveConnection) => {
          const cam = new Cam({
            hostname: CONFIG.CAMERA_IP,
            username: CONFIG.CAMERA_USERNAME,
            password: CONFIG.CAMERA_PASSWORD,
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
              if (!snapshotUrl.includes('@') && CONFIG.CAMERA_USERNAME) {
                try {
                  const urlObject = new URL(snapshotUrl);
                  urlObject.username = CONFIG.CAMERA_USERNAME;
                  urlObject.password = CONFIG.CAMERA_PASSWORD;
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
          const captureSuccess = await captureFrameWithFFmpeg(connectionResult.url, outputPath);
          
          if (captureSuccess) {
            console.log(`✅ ONVIF snapshot captured successfully on port ${port}`);
            return resolve(true);
          }
        }
      } catch (error) {
        console.error(`Error in ONVIF connection attempt on port ${port}:`, error.message);
      }
      
      // Wait a bit before trying the next port
      await new Promise(r => setTimeout(r, 1000));
    }
    
    console.log('All ONVIF connection attempts failed');
    resolve(false);
  });
}

/**
 * Try to get a snapshot via direct HTTP request
 * Many IP cameras support direct HTTP access to snapshots
 * 
 * @param {string} outputPath - Path to save the snapshot
 * @returns {Promise<boolean>} True if successful, false otherwise
 */
/**
 * Try to get a snapshot via direct HTTP request
 * Many IP cameras support direct HTTP access to snapshots
 * 
 * @param {string} outputPath - Path to save the snapshot
 * @returns {Promise<boolean>} True if successful, false otherwise
 */
function getSnapshotWithHttp(outputPath) {
  return new Promise(async (resolve) => {
    console.log('Trying HTTP snapshot URLs...');
    
    const http = require('http');
    const https = require('https');
    
    for (const pattern of CONFIG.HTTP_SNAPSHOT_URLS) {
      try {
        const url = pattern
          .replace('{ip}', CONFIG.CAMERA_IP)
          .replace('{username}', encodeURIComponent(CONFIG.CAMERA_USERNAME))
          .replace('{password}', encodeURIComponent(CONFIG.CAMERA_PASSWORD));
        
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
 * @returns {Promise<boolean>} True if successful, false otherwise
 */
function getSnapshotWithCurl(outputPath) {
  return new Promise(async (resolve) => {
    console.log('Trying curl for snapshot retrieval...');
    
    // HTTPS URLs to try with curl (focusing on confirmed port 443)
    const urlsToTry = [
    //   `https://${CONFIG.CAMERA_IP}/stw-cgi/snapshot.cgi`,
    //   `https://${CONFIG.CAMERA_IP}/image/jpeg.cgi`,
    //   `https://${CONFIG.CAMERA_IP}/cgi-bin/snapshot.cgi`,
    //   `https://${CONFIG.CAMERA_IP}/snapshot.jpg`,
    ];
    
    // Also try standard RTSP ports
    const rtspUrlsToTry = [
      `rtsp://${CONFIG.CAMERA_IP}:${CONFIG.CAMERA_PORT}/stream1`,
      `rtsp://${CONFIG.CAMERA_IP}:${CONFIG.CAMERA_PORT}/stream2`,
    ];
    
    // Try HTTPS URLs first
    for (const url of urlsToTry) {
      try {
        console.log(`Trying curl with URL: ${url}`);
        
        // Execute curl with various options
        const { exec } = require('child_process');
        
        const command = `curl -k -s -S --connect-timeout 5 -o "${outputPath}" -u "${CONFIG.CAMERA_USERNAME}:${CONFIG.CAMERA_PASSWORD}" "${url}"`;
        
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
function trySimplifiedFfmpeg(outputPath) {
  return new Promise(async (resolve) => {
    // First try with auth in command line rather than URL (often more reliable)
    try {
      const rtspUrl = `rtsp://${CONFIG.CAMERA_IP}:${CONFIG.CAMERA_PORT}/stream1`;
      console.log(`Trying FFmpeg with auth flags: ${rtspUrl}`);
      
      const { exec } = require('child_process');
      const command = `ffmpeg -y -rtsp_transport tcp -auth_type basic -user ${CONFIG.CAMERA_USERNAME} -pass ${CONFIG.CAMERA_PASSWORD} -i "${rtspUrl}" -frames:v 1 -v error "${outputPath}"`;
      
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
      `rtsp://${CONFIG.CAMERA_USERNAME}:${CONFIG.CAMERA_PASSWORD}@${CONFIG.CAMERA_IP}:${CONFIG.CAMERA_PORT}/stream1`,
      `rtsp://${CONFIG.CAMERA_IP}:${CONFIG.CAMERA_PORT}/stream1`,
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
  console.log(`Taking snapshot from camera at IP ${CONFIG.CAMERA_IP}`);
  
  // Create a unique filename based on timestamp
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `${cameraName}-${timestamp}.jpg`;
  const filePath = path.join(CONFIG.TEMP_DIR, filename);
  
  try {
    // Start with the approach that worked in testing
    console.log("Using proven FFmpeg command format");
    const rtspUrl = `rtsp://${CONFIG.CAMERA_USERNAME}:${CONFIG.CAMERA_PASSWORD}@${CONFIG.CAMERA_IP}:${CONFIG.CAMERA_PORT}/stream1`;
    
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
      const authCmd = `ffmpeg -y -rtsp_transport tcp -i "rtsp://${CONFIG.CAMERA_IP}:${CONFIG.CAMERA_PORT}/stream1" -user ${CONFIG.CAMERA_USERNAME} -pass ${CONFIG.CAMERA_PASSWORD} -frames:v 1 "${filePath}"`;
      
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
      const authTypeCmd = `ffmpeg -y -rtsp_transport tcp -auth_type basic -user ${CONFIG.CAMERA_USERNAME} -pass ${CONFIG.CAMERA_PASSWORD} -i "rtsp://${CONFIG.CAMERA_IP}:${CONFIG.CAMERA_PORT}/stream1" -frames:v 1 -v error "${filePath}"`;
      
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
      const digestAuthCmd = `ffmpeg -y -rtsp_transport tcp -auth_type digest -user ${CONFIG.CAMERA_USERNAME} -pass ${CONFIG.CAMERA_PASSWORD} -i "rtsp://${CONFIG.CAMERA_IP}:${CONFIG.CAMERA_PORT}/stream1" -frames:v 1 "${filePath}"`;
      
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
      const rtspUrl = formatRtspUrl(pattern);
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
    const onvifSuccess = await getSnapshotWithOnvif(filePath);
    
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
    const httpSuccess = await getSnapshotWithHttp(filePath);
    
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
    const simpleFfmpegSuccess = await trySimplifiedFfmpeg(filePath);
    
    if (simpleFfmpegSuccess) {
      const stats = await fs.stat(filePath);
      if (stats.size > 100) {
        console.log(`✅ Snapshot successfully saved to: ${filePath}`);
        return filePath;
      }
    }
    
    // Last resort - try with curl command directly (which sometimes works better than Node's HTTP client)
    console.log('All HTTP attempts failed, trying curl as last resort...');
    const curlSuccess = await getSnapshotWithCurl(filePath);
    
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
    // Send a processing message
    await msg.reply(formatMessage({
      title: '📸 Capturando imagen...',
      body: 'Obteniendo imagen de la cámara, por favor espere...'
    }));
    
    // Ensure temp directory exists
    await ensureTempDir();
    
    // Parse camera name from arguments
    const cameraName = args ? args.trim() : 'default';
    
    // Take the snapshot
    const imagePath = await takeSnapshot(cameraName);
    
    // Send the image using MessageMedia from whatsapp-web.js
    const { MessageMedia } = require('whatsapp-web.js');
    
    try {
      // Verify file exists and has content
      const stats = await fs.stat(imagePath);
      if (stats.size === 0) {
        throw new Error('La imagen capturada está vacía');
      }
      
      console.log(`Image file size: ${stats.size} bytes`);
      
      // Read file as buffer and base64 encode it manually
      const fileBuffer = await fs.readFile(imagePath);
      const base64Data = fileBuffer.toString('base64');
      
      // Create MessageMedia object manually with correct parameters
      const messageMedia = new MessageMedia('image/jpeg', base64Data, `camera_${cameraName}.jpg`);
      
      // Use client.sendMessage directly for more compatibility
      const chat = await msg.getChat();
      await chat.sendMessage(messageMedia, { 
        caption: `📸 Imagen de cámara: ${cameraName}\nCapturada: ${new Date().toLocaleString()}` 
      });
    } catch (mediaError) {
      console.error('Error sending media:', mediaError);
      await msg.reply(formatMessage({
        title: '❌ Error al enviar imagen',
        body: `La imagen se capturó correctamente pero no se pudo enviar: ${mediaError.message}`,
        footer: 'La imagen está disponible en el servidor.'
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
      body: `No se pudo obtener la imagen: ${error.message}`,
      footer: 'Verifique la configuración de la cámara y vuelva a intentarlo.'
    }));
  }
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
    commandHandler.register(
      '!camera', 
      handleCameraCommand, 
      'Toma una captura de la cámara y la envía: !camera [nombre_camara]'
    );
  }
};
