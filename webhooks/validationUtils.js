/**
 * Webhook Validation Utilities
 * Provides consistent validation for webhook parameters
 * 
 * @module webhooks/validationUtils
 */

/**
 * Validate required parameters in webhook data
 * Returns error message if validation fails, null if successful
 * 
 * @param {Object} data - The webhook payload data
 * @param {string[]} requiredParams - Array of required parameter names
 * @returns {string|null} Error message or null if validation passes
 */
function validateRequiredParams(data, requiredParams) {
  // Check if data is valid
  if (!data || typeof data !== 'object') {
    return 'Invalid request data format';
  }
  
  // Find missing parameters
  const missingParams = requiredParams.filter(param => 
    !Object.prototype.hasOwnProperty.call(data, param) || 
    data[param] === undefined || 
    data[param] === null
  );
  
  // Return error message if any parameters are missing
  if (missingParams.length > 0) {
    return `Missing required parameter${missingParams.length > 1 ? 's' : ''}: ${missingParams.join(', ')}`;
  }
  
  return null;
}

/**
 * Validate that a parameter is one of an allowed set of values
 * 
 * @param {any} value - The value to validate
 * @param {any[]} allowedValues - Array of allowed values
 * @param {string} paramName - Name of the parameter for the error message
 * @returns {string|null} Error message or null if validation passes
 */
function validateAllowedValues(value, allowedValues, paramName) {
  if (!Array.isArray(allowedValues)) {
    throw new TypeError('allowedValues must be an array');
  }
  
  if (!allowedValues.includes(value)) {
    return `Invalid ${paramName}: '${value}'. Allowed values: ${allowedValues.join(', ')}`;
  }
  
  return null;
}

/**
 * Validate that a parameter is of the expected type
 * 
 * @param {any} value - The value to validate
 * @param {string|string[]} expectedType - Expected type(s) as string(s)
 * @param {string} paramName - Name of the parameter
 * @returns {string|null} Error message or null if validation passes
 * @throws {TypeError} If expectedType is invalid
 */
function validateType(value, expectedType, paramName) {
  if (!expectedType) {
    throw new TypeError('expectedType must be provided');
  }
  
  // Convert to array if single type
  const types = Array.isArray(expectedType) ? expectedType : [expectedType];
  
  // Special case for arrays since typeof [] is 'object'
  if (types.includes('array') && Array.isArray(value)) {
    return null;
  }
  
  // Check if type matches any of the expected types
  if (!types.includes(typeof value)) {
    return `Parameter '${paramName}' must be of type ${types.join(' or ')}, but got ${typeof value}`;
  }
  
  return null;
}

/**
 * Check if a value is "truthy" in the Boolean sense
 * Useful for converting string parameters to boolean
 * 
 * @param {any} value - The value to check
 * @returns {boolean} Whether the value is truthy
 */
function isTruthy(value) {
  // Handle string values specially
  if (typeof value === 'string') {
    const lowercased = value.toLowerCase().trim();
    const falseValues = ['', 'false', '0', 'no', 'off', 'undefined', 'null'];
    return !falseValues.includes(lowercased);
  }
  
  // Use standard JavaScript truthiness for other types
  return Boolean(value);
}

module.exports = {
  validateRequiredParams,
  validateAllowedValues,
  validateType,
  isTruthy
};
