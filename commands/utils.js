/**
 * @module commands/utils
 * @description Utility functions for WhatsApp Bot Commands
 * 
 * This module provides shared helper functions used across multiple command modules.
 * Functions include API request helpers, message formatters, and permission checks.
 * 
 * @requires node-fetch
 */
const fetch = require('node-fetch');

/**
 * Make an API request with timeout protection and error handling
 * 
 * @async
 * @param {string} url - URL to fetch
 * @param {Object} [options={}] - Fetch options
 * @param {Object} [options.headers] - HTTP headers
 * @param {string} [options.method] - HTTP method
 * @param {Object|string} [options.body] - Request body
 * @param {number} [timeoutMs=5000] - Timeout in milliseconds
 * @returns {Promise<Object|string>} - Parsed response data
 * @throws {Error} If the request fails or times out
 */
async function safeApiRequest(url, options = {}, timeoutMs = 5000) {
  if (!url) {
    throw new Error('URL is required for API requests');
  }

  try {
    // Set up abort controller for timeout handling
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    // Make the request with timeout control
    const response = await fetch(url, { 
      ...options,
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    // Check for HTTP errors
    if (!response.ok) {
      const errorText = await response.text().catch(() => 'No error details available');
      throw new Error(`API request failed with status ${response.status}: ${errorText}`);
    }
    
    // Parse response based on content type
    const contentType = response.headers.get('content-type') || '';
    if (contentType.includes('application/json')) {
      return await response.json();
    } else {
      return await response.text();
    }
  } catch (error) {
    // Enhance error messages for common cases
    if (error.name === 'AbortError') {
      throw new Error(`Request to ${url} timed out after ${timeoutMs}ms`);
    } else if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
      throw new Error(`Cannot connect to ${url}: ${error.message}`);
    }
    throw error;
  }
}

/**
 * Format message with markdown-like syntax for WhatsApp
 * Structures text with title, body, bullet items, and footer
 * 
 * @param {Object} sections - Object with sections to format
 * @param {string} [sections.title] - Bold title text
 * @param {string} [sections.body] - Main message body
 * @param {string[]} [sections.items] - Array of bullet items
 * @param {string} [sections.footer] - Italicized footer text
 * @returns {string} - Formatted message ready for WhatsApp
 */
function formatMessage(sections) {
  if (!sections || typeof sections !== 'object') {
    return '';
  }
  
  const parts = [];
  
  // Add title in bold
  if (sections.title) {
    parts.push(`*${sections.title}*\n`);
  }
  
  // Add body text
  if (sections.body) {
    parts.push(`${sections.body}`);
  }
  
  // Add bullet items
  if (sections.items && Array.isArray(sections.items) && sections.items.length > 0) {
    const formattedItems = sections.items
      .filter(item => item) // Filter out empty items
      .map(item => `• ${item}`)
      .join('\n');
    
    if (formattedItems) {
      parts.push(formattedItems);
    }
  }
  
  // Add footer in italics
  if (sections.footer) {
    parts.push(`_${sections.footer}_`);
  }
  
  return parts.join('\n\n').trim();
}

/**
 * Check if a user has admin privileges
 * Uses comma-separated list of admin phone numbers from environment variable
 * 
 * @param {string} number - User's phone number
 * @returns {boolean} - Whether the user is an admin
 */
function isAdmin(number) {
  if (!number) {
    return false;
  }
  
  // Get admin numbers from environment variable
  const adminNumbers = (process.env.ADMIN_NUMBERS || '')
    .split(',')
    .map(num => num.trim())
    .filter(Boolean);
  
  // Normalize the phone number format for comparison
  const normalizedNumber = number.replace(/[^0-9]/g, '');
  
  // Check if the normalized number is in the admin list
  return adminNumbers.some(admin => normalizedNumber.endsWith(admin.replace(/[^0-9]/g, '')));
}

/**
 * Module exports
 * @type {Object}
 */
module.exports = {
  safeApiRequest,
  formatMessage,
  isAdmin
};
