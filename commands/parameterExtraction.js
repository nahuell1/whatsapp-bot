/**
 * Parameter extraction utilities for the WhatsApp bot
 * This module provides functions to extract parameters from user messages
 * and validate them according to webhook-specific rules
 */

/**
 * Parameter type definitions and extraction patterns
 * @type {Object}
 */
const PARAMETER_TYPES = {
  // Areas that can be controlled (e.g., "office", "room")
  AREA: {
    values: ['office', 'room'],
    synonyms: {
      'office': ['oficina', 'estudio', 'despacho', 'trabajo'],
      'room': ['habitación', 'habitacion', 'cuarto', 'dormitorio', 'recámara', 'recamara']
    },
    extractPattern: /\b(office|oficina|estudio|despacho|trabajo|room|habitaci[oó]n|cuarto|dormitorio|rec[aá]mara)\b/i
  },

  // On/Off states
  TOGGLE_STATE: {
    values: ['on', 'off'],
    synonyms: {
      'on': ['encender', 'encendido', 'activar', 'activado', 'prender', 'activa'],
      'off': ['apagar', 'apagado', 'desactivar', 'desactivado', 'desactiva']
    },
    extractPattern: /\b(on|off|encend|prender|prend|activ|apag|desactiv)\b/i
  },

  // Device types
  DEVICE_TYPE: {
    values: ['light', 'fan', 'ac', 'tv', 'speaker'],
    synonyms: {
      'light': ['luz', 'luces', 'lámpara', 'lampara', 'iluminación', 'iluminacion'],
      'fan': ['ventilador', 'abanico'],
      'ac': ['aire', 'aire acondicionado', 'a/c', 'clima', 'climatizador'],
      'tv': ['tele', 'televisión', 'television', 'televisor'],
      'speaker': ['altavoz', 'parlante', 'bocina']
    }
  },

  // Scene types
  SCENE: {
    values: ['movie', 'reading', 'sleep', 'morning'],
    synonyms: {
      'movie': ['película', 'pelicula', 'cine', 'netflix'],
      'reading': ['lectura', 'leer', 'libro'],
      'sleep': ['dormir', 'noche', 'descanso'],
      'morning': ['mañana', 'despertar', 'amanecer']
    }
  }
};

// Map of webhook names to their parameter extraction rules
const parameterExtractionRules = {
  'area_control': {
    'area': {
      type: 'AREA',
      keywords: {
        'office': ['office', 'oficina', 'despacho'],
        'room': ['room', 'habitación', 'habitacion', 'cuarto', 'dormitorio']
      },
      validValues: ['office', 'room'],
      required: true
    },
    'turn': {
      type: 'TOGGLE_STATE',
      keywords: {
        'on': ['on', 'encend', 'prend', 'activ', 'prender', 'encender', 'activar'],
        'off': ['off', 'apag', 'desactiv', 'apagar', 'desactivar']
      },
      validValues: ['on', 'off'],
      required: true
    }
  },
  'device_control': {
    'device': {
      // Device parameter has no fixed values, extracted from message
      extractPattern: /(lámpara|lampara|luz|light|bombilla|foco|tv|televisión|television|television)/i
    },
    'action': {
      keywords: {
        'on': ['on', 'encend', 'prend', 'activ'],
        'off': ['off', 'apag', 'desactiv'],
        'toggle': ['toggle', 'altern', 'cambiar']
      },
      validValues: ['on', 'off', 'toggle']
    }
  },
  'device_control': {
    'device': {
      type: 'DEVICE_TYPE',
      // Device parameter has no fixed values, extracted from message
      extractPattern: /(lámpara|lampara|luz|light|bombilla|foco|tv|televisión|television|ventilador|fan|aire|ac|speaker|altavoz)/i,
      required: true
    },
    'action': {
      type: 'TOGGLE_STATE',
      keywords: {
        'on': ['on', 'encend', 'prend', 'activ'],
        'off': ['off', 'apag', 'desactiv'],
        'toggle': ['toggle', 'altern', 'cambiar']
      },
      validValues: ['on', 'off', 'toggle'],
      required: true
    }
  },
  'scene': {
    'scene': {
      type: 'SCENE',
      // Scene parameter requires specific scene names
      keywords: {
        'movie': ['movie', 'película', 'pelicula', 'cine', 'netflix'],
        'reading': ['reading', 'lectura', 'leer', 'libro'],
        'sleep': ['sleep', 'dormir', 'noche', 'descanso'],
        'morning': ['morning', 'mañana', 'despertar', 'amanecer']
      },
      validValues: ['movie', 'reading', 'sleep', 'morning'],
      required: true
    }
  },
  'send_notification': {
    'message': {
      // Message parameter needs to be extracted from the text
      // Often comes after "saying", "send", "message", "text"
      extractPattern: /(mensaje|message|send|enviar|diciendo|saying|text|texto) ["']?([^"']+)["']?/i,
      extractGroup: 2,
      required: true
    },
    'to': {
      // Recipient parameter - could be "admin" or specific names
      keywords: {
        'admin': ['admin', 'administrator', 'administrador']
      },
      defaultValue: 'admin',
      required: true
    }
  },
  'sensor_report': {
    'sensor': {
      keywords: {
        'temperature': ['temperatura', 'termometro', 'termómetro', 'calor', 'frío', 'frio'],
        'humidity': ['humedad', 'humidity'],
        'motion': ['movimiento', 'motion', 'presencia', 'presence'],
        'light': ['light', 'luz', 'iluminacion', 'iluminación', 'brillo'],
      },
      validValues: ['temperature', 'humidity', 'motion', 'light', 'all'],
      required: true
    },
    'location': {
      keywords: {
        'living': ['living', 'sala', 'salón', 'salon'],
        'bedroom': ['bedroom', 'dormitorio', 'habitación', 'habitacion', 'cuarto'],
        'kitchen': ['kitchen', 'cocina'],
        'office': ['office', 'oficina', 'despacho'],
      },
      defaultValue: 'all',
      required: false
    }
  }
};

/**
 * Extract a parameter by its type definition
 * @param {string} paramType - Type of parameter (key in PARAMETER_TYPES)
 * @param {string} text - Text to extract from
 * @returns {string|null} - Extracted parameter value or null if not found
 */
function extractParameterByType(paramType, text) {
  const typeDefinition = PARAMETER_TYPES[paramType];
  if (!typeDefinition) return null;
  
  // Try pattern extraction if available
  if (typeDefinition.extractPattern) {
    const match = text.match(typeDefinition.extractPattern);
    if (match) {
      const matched = match[1].toLowerCase();
      
      // Direct match to values
      if (typeDefinition.values.includes(matched)) {
        return matched;
      }
      
      // Check synonyms
      for (const [value, synonyms] of Object.entries(typeDefinition.synonyms)) {
        // Exact synonym match
        if (synonyms.includes(matched)) {
          return value;
        }
        
        // Partial synonym match (for stem words like "encend" matching "encender")
        for (const synonym of synonyms) {
          if (synonym.startsWith(matched) || matched.startsWith(synonym)) {
            return value;
          }
        }
      }
    }
  }
  
  // Try each exact value
  for (const value of typeDefinition.values || []) {
    if (text.includes(value)) {
      return value;
    }
  }
  
  // Try synonyms
  for (const [value, synonyms] of Object.entries(typeDefinition.synonyms || {})) {
    for (const synonym of synonyms) {
      if (text.includes(synonym)) {
        return value;
      }
    }
  }
  
  return null;
}

/**
 * Extract parameters for a specific webhook from user message
 * @param {string} userMessage - The user's message
 * @param {string} webhookName - The webhook name
 * @param {object} existingParams - Any parameters already extracted (optional)
 * @returns {object} - Extracted parameters
 */
function extractParametersFromMessage(userMessage, webhookName, existingParams = {}) {
  const extractedParams = { ...existingParams };
  const userMessageLower = userMessage.toLowerCase();
  const rules = parameterExtractionRules[webhookName] || {};
  
  // For each parameter defined in the rules for this webhook
  for (const [paramName, rule] of Object.entries(rules)) {
    // Skip if parameter is already set
    if (extractedParams[paramName]) continue;
    
    // Try type-based extraction if defined
    if (rule.type && PARAMETER_TYPES[rule.type]) {
      const typeValue = extractParameterByType(rule.type, userMessageLower);
      if (typeValue) {
        extractedParams[paramName] = typeValue;
        continue;
      }
    }
    
    // Try keyword-based extraction
    if (rule.keywords) {
      for (const [value, keywords] of Object.entries(rule.keywords)) {
        // If any of the keywords for this value are in the message
        if (keywords.some(keyword => userMessageLower.includes(keyword))) {
          extractedParams[paramName] = value;
          break;
        }
      }
    }
    
    // Try pattern-based extraction if parameter isn't set yet
    if (rule.extractPattern && !extractedParams[paramName]) {
      const match = userMessage.match(rule.extractPattern);
      if (match) {
        // If a specific group is specified, use that, otherwise use the first capturing group
        const groupIndex = rule.extractGroup || 1;
        if (match[groupIndex]) {
          extractedParams[paramName] = match[groupIndex].trim();
        }
      }
    }
    
    // Special case for message parameter in send_notification
    if (paramName === 'message' && webhookName === 'send_notification' && !extractedParams[paramName]) {
      const messagePhrases = ['diciendo que', 'que diga', 'con el mensaje', 'enviando', 'send'];
      for (const phrase of messagePhrases) {
        const index = userMessageLower.indexOf(phrase);
        if (index !== -1) {
          // Extract the text after the phrase
          extractedParams[paramName] = userMessage.substring(index + phrase.length).trim();
          break;
        }
      }
    }
    
    // Apply default value if available and parameter wasn't set
    if (!extractedParams[paramName] && rule.defaultValue !== undefined) {
      extractedParams[paramName] = rule.defaultValue;
    }
  }
  
  return extractedParams;
}

/**
 * Validate extracted parameters against webhook rules
 * @param {string} webhookName - The name of the webhook
 * @param {object} params - The extracted parameters to validate
 * @returns {object} - Validation result with isValid, missingParams, and invalidParams
 */
function validateParameters(webhookName, params) {
  const rules = parameterExtractionRules[webhookName] || {};
  const result = {
    isValid: true,
    missingParams: [],
    invalidParams: []
  };
  
  // Check each parameter against its rules
  for (const [paramName, rule] of Object.entries(rules)) {
    // Check if required parameter is missing
    if (rule.required && (!params.hasOwnProperty(paramName) || params[paramName] === null || params[paramName] === undefined)) {
      result.isValid = false;
      result.missingParams.push({
        name: paramName,
        validValues: rule.validValues || []
      });
      continue;
    }
    
    // Skip validation if parameter is not provided and not required
    if (!params.hasOwnProperty(paramName)) continue;
    
    // Check if parameter value is valid (if validValues is defined)
    if (rule.validValues && rule.validValues.length > 0 && !rule.validValues.includes(params[paramName])) {
      result.isValid = false;
      result.invalidParams.push({
        name: paramName,
        value: params[paramName],
        validValues: rule.validValues
      });
    }
  }
  
  return result;
}

/**
 * Generate an error message for invalid or missing parameters
 * @param {string} webhookName - The name of the webhook
 * @param {object} validationResult - The result from validateParameters()
 * @returns {string} - Formatted error message
 */
function generateErrorMessage(webhookName, validationResult) {
  let message = `❌ No se pudieron validar los parámetros para ${webhookName}:\n\n`;
  
  if (validationResult.missingParams.length > 0) {
    message += "Parámetros faltantes:\n";
    validationResult.missingParams.forEach(param => {
      if (param.validValues && param.validValues.length > 0) {
        message += `- ${param.name}: debe ser uno de [${param.validValues.join(', ')}]\n`;
      } else {
        message += `- ${param.name}\n`;
      }
    });
  }
  
  if (validationResult.invalidParams.length > 0) {
    message += "\nParámetros inválidos:\n";
    validationResult.invalidParams.forEach(param => {
      message += `- ${param.name}: '${param.value}' no es válido. Valores permitidos: [${param.validValues.join(', ')}]\n`;
    });
  }
  
  message += "\nPor favor intenta nuevamente con los parámetros correctos.";
  return message;
}

/**
 * Get parameter requirements for a webhook
 * @param {string} webhookName - The webhook name
 * @returns {object} - Parameter requirements information
 */
function getWebhookParameterInfo(webhookName) {
  const rules = parameterExtractionRules[webhookName] || {};
  const paramInfo = {
    required: [],
    optional: [],
    validations: {}
  };
  
  for (const [paramName, rule] of Object.entries(rules)) {
    if (rule.required) {
      paramInfo.required.push(paramName);
    } else {
      paramInfo.optional.push(paramName);
    }
    
    if (rule.validValues) {
      paramInfo.validations[paramName] = rule.validValues;
    }
  }
  
  return paramInfo;
}

/**
 * Get a list of parameters that can be extracted for a webhook
 * @param {string} webhookName - Name of the webhook
 * @returns {object} - Structured parameter information with examples
 */
function getParameterDefinitions(webhookName) {
  const rules = parameterExtractionRules[webhookName] || {};
  const result = {
    parameters: {},
    examples: []
  };
  
  // Extract parameter definitions
  for (const [paramName, rule] of Object.entries(rules)) {
    result.parameters[paramName] = {
      type: rule.type || 'string',
      required: !!rule.required,
      validValues: rule.validValues || [],
      description: `Parameter ${paramName} for webhook ${webhookName}`
    };
  }
  
  // Add example parameters based on webhook type
  switch (webhookName) {
    case 'area_control':
      result.examples.push({ area: 'office', turn: 'on' });
      result.examples.push({ area: 'room', turn: 'off' });
      break;
    case 'device_control':
      result.examples.push({ device: 'light', action: 'on' });
      result.examples.push({ device: 'fan', action: 'off' });
      break;
    case 'scene':
      result.examples.push({ scene: 'movie' });
      result.examples.push({ scene: 'reading' });
      break;
    case 'send_notification':
      result.examples.push({ message: 'Hola, este es un mensaje de prueba', to: 'admin' });
      break;
  }
  
  return result;
}

module.exports = {
  extractParametersFromMessage,
  validateParameters,
  generateErrorMessage,
  getWebhookParameterInfo,
  getParameterDefinitions,
  PARAMETER_TYPES
};
