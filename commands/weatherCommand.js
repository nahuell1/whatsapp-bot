/**
 * @module commands/weatherCommand
 * @description Weather command implementation for the WhatsApp bot
 * 
 * This module provides the !clima command for fetching weather information
 * from the Open-Meteo API. It supports querying by location name and displays
 * current weather conditions and forecasts.
 * 
 * API Documentation: https://open-meteo.com/
 * 
 * @requires ./utils
 */
const { safeApiRequest, formatMessage } = require('./utils');

/**
 * Default location configuration from environment variables with sensible defaults
 * @constant {Object}
 */
const DEFAULT_CITY = process.env.DEFAULT_CITY || 'Buenos Aires';
const DEFAULT_LATITUDE = process.env.DEFAULT_LATITUDE || '-34.6118';
const DEFAULT_LONGITUDE = process.env.DEFAULT_LONGITUDE || '-58.4173';

/**
 * Get appropriate weather emoji based on weather code and time of day
 * 
 * @param {number} code - Open-Meteo WMO weather code
 * @param {boolean} [isDay=true] - Whether it's currently daytime
 * @returns {string} - Weather emoji representation
 * @see https://open-meteo.com/en/docs - WMO Weather interpretation codes
 * @private
 */
function getWeatherEmoji(code, isDay = true) {
  // WMO Weather interpretation codes (WW)
  // https://open-meteo.com/en/docs
  switch (code) {
    case 0: return isDay ? '☀️' : '🌙'; // Clear sky
    case 1: return isDay ? '🌤️' : '🌙'; // Mainly clear
    case 2: return isDay ? '⛅' : '☁️'; // Partly cloudy
    case 3: return '☁️'; // Overcast
    case 45: case 48: return '🌫️'; // Fog
    case 51: case 53: case 55: return '🌦️'; // Drizzle
    case 56: case 57: return '❄️'; // Freezing Drizzle
    case 61: case 63: case 65: return '🌧️'; // Rain
    case 66: case 67: return '🌨️'; // Freezing Rain
    case 71: case 73: case 75: return '❄️'; // Snow fall
    case 77: return '❄️'; // Snow grains
    case 80: case 81: case 82: return '🌧️'; // Rain showers
    case 85: case 86: return '🌨️'; // Snow showers
    case 95: return '⛈️'; // Thunderstorm
    case 96: case 99: return '⛈️'; // Thunderstorm with hail
    default: return '🌡️'; // Default
  }
}

/**
 * Get weather description in Spanish based on weather code
 * @param {number} code - Open-Meteo WMO weather code
 * @returns {string} - Weather description in Spanish
 */
function getWeatherDescription(code) {
  switch (code) {
    case 0: return 'Cielo despejado';
    case 1: return 'Mayormente despejado';
    case 2: return 'Parcialmente nublado';
    case 3: return 'Nublado';
    case 45: return 'Niebla';
    case 48: return 'Niebla con escarcha';
    case 51: return 'Llovizna ligera';
    case 53: return 'Llovizna moderada';
    case 55: return 'Llovizna intensa';
    case 56: return 'Llovizna helada ligera';
    case 57: return 'Llovizna helada intensa';
    case 61: return 'Lluvia ligera';
    case 63: return 'Lluvia moderada';
    case 65: return 'Lluvia intensa';
    case 66: return 'Lluvia helada ligera';
    case 67: return 'Lluvia helada intensa';
    case 71: return 'Nevada ligera';
    case 73: return 'Nevada moderada';
    case 75: return 'Nevada intensa';
    case 77: return 'Granos de nieve';
    case 80: return 'Chubascos ligeros';
    case 81: return 'Chubascos moderados';
    case 82: return 'Chubascos intensos';
    case 85: return 'Chubascos de nieve ligeros';
    case 86: return 'Chubascos de nieve intensos';
    case 95: return 'Tormenta eléctrica';
    case 96: return 'Tormenta con granizo ligero';
    case 99: return 'Tormenta con granizo intenso';
    default: return 'Condición desconocida';
  }
}

/**
 * Format weather data into a readable message
 * @param {Object} data - Weather data from Open-Meteo API
 * @param {string} cityName - Name of the city/location
 * @returns {string} - Formatted message
 */
function formatWeatherMessage(data, cityName) {
  if (!data || !data.current) {
    return 'No se pudo obtener la información del clima.';
  }

  const current = data.current;
  
  // Determine if it's day or night
  const isDay = current.is_day === 1;
  
  // Get weather conditions
  const weatherCode = current.weather_code;
  const emoji = getWeatherEmoji(weatherCode, isDay);
  const description = getWeatherDescription(weatherCode);
  
  // Temperature and other metrics
  const temp = Math.round(current.temperature_2m);
  const feelsLike = Math.round(current.apparent_temperature);
  const humidity = current.relative_humidity_2m;
  const windSpeed = current.wind_speed_10m;
  const windDirection = current.wind_direction_10m;
  
  // Get wind direction as cardinal points
  const windCardinal = getWindDirection(windDirection);
  
  return formatMessage({
    title: `${emoji} Clima en ${cityName}`,
    body: `${description}\nTemperatura: ${temp}°C\nSensación térmica: ${feelsLike}°C\nHumedad: ${humidity}%\nViento: ${windSpeed} km/h ${windCardinal}`,
    footer: `Última actualización: ${new Date().toLocaleTimeString()}`
  });
}

/**
 * Convert wind direction in degrees to cardinal direction
 * @param {number} degrees - Wind direction in degrees
 * @returns {string} - Cardinal direction
 */
function getWindDirection(degrees) {
  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SO', 'O', 'NO'];
  const index = Math.round(degrees / 45) % 8;
  return directions[index];
}

/**
 * Simple geocoding function to get coordinates from city name
 * @param {string} cityName - Name of the city
 * @returns {Promise<Object>} - Object with lat, lon and display_name
 */
async function geocodeCity(cityName) {
  try {
    // Using Nominatim service for geocoding (free, no API key required)
    const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(cityName)}`;
    
    const data = await safeApiRequest(url);
    
    if (!data || data.length === 0) {
      throw new Error('No se encontró la ubicación');
    }
    
    // Get first result
    const result = data[0];
    
    return {
      latitude: parseFloat(result.lat),
      longitude: parseFloat(result.lon),
      display_name: result.display_name.split(',').slice(0, 2).join(', ') // Simplify location name
    };
  } catch (error) {
    throw new Error(`Error en la geocodificación: ${error.message}`);
  }
}

/**
 * Handle weather command
 * @param {object} msg - WhatsApp message object
 * @param {string} args - Command arguments (city name)
 */
async function handleWeatherCommand(msg, args) {
  const city = args.trim() || DEFAULT_CITY;
  let latitude = DEFAULT_LATITUDE;
  let longitude = DEFAULT_LONGITUDE;
  let locationName = city;
  
  try {
    msg.reply(`🔍 Buscando información del clima para ${city}...`);
    
    // If user provided a city name, geocode it to get coordinates
    if (args.trim()) {
      const geoData = await geocodeCity(city);
      latitude = geoData.latitude;
      longitude = geoData.longitude;
      locationName = geoData.display_name;
    }
    
    // Call Open-Meteo API (no API key needed)
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,apparent_temperature,is_day,weather_code,wind_speed_10m,wind_direction_10m&timezone=auto`;
    
    const data = await safeApiRequest(url);
    const response = formatWeatherMessage(data, locationName);
    
    msg.reply(response);
  } catch (error) {
    console.error('Weather API error:', error);
    msg.reply(`Error al obtener el clima: ${error.message}`);
  }
}

module.exports = {
  register: (commandHandler) => {
    commandHandler.register('!clima', handleWeatherCommand, 'Obtener información del clima: !clima [ciudad]');
  }
};
