/**
 * Utility functions for WhatsApp Bot Commands
 * Shared helper functions used across multiple commands
 */
const fetch = require('node-fetch');

/**
 * Safely make an API request with timeout
 * 
 * @param {string} url - URL to fetch
 * @param {Object} options - Fetch options
 * @param {number} timeoutMs - Timeout in milliseconds
 * @returns {Promise<Object>} - Response data
 */
async function safeApiRequest(url, options = {}, timeoutMs = 5000) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    
    const response = await fetch(url, { 
      ...options,
      signal: controller.signal
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      throw new Error(`API responded with status ${response.status}`);
    }
    
    // Check content type to determine how to parse the response
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      return await response.json();
    } else {
      return await response.text();
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`Request to ${url} timed out after ${timeoutMs}ms`);
    }
    throw error;
  }
}

/**
 * Format message with markdown-like syntax for WhatsApp
 * 
 * @param {Object} sections - Object with sections to format
 * @returns {string} - Formatted message
 */
function formatMessage(sections) {
  let message = '';
  
  if (sections.title) {
    message += `*${sections.title}*\n\n`;
  }
  
  if (sections.body) {
    message += `${sections.body}\n\n`;
  }
  
  if (sections.items && Array.isArray(sections.items)) {
    sections.items.forEach(item => {
      message += `• ${item}\n`;
    });
    message += '\n';
  }
  
  if (sections.footer) {
    message += `_${sections.footer}_`;
  }
  
  return message.trim();
}

/**
 * Check if a user has admin privileges
 * 
 * @param {string} number - User's phone number
 * @returns {boolean} - Whether the user is an admin
 */
function isAdmin(number) {
  const adminNumbers = (process.env.ADMIN_NUMBERS || '')
    .split(',')
    .map(num => num.trim())
    .filter(Boolean);
  
  return adminNumbers.includes(number);
}

module.exports = {
  safeApiRequest,
  formatMessage,
  isAdmin
};
