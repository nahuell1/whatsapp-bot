#!/bin/bash

# Diagnóstico de variables de entorno para el bot de WhatsApp
echo "=== Diagnóstico de Variables de Entorno ==="
echo

# Comprobar si el archivo .env existe
if [ -f .env ]; then
    echo "✅ Archivo .env encontrado"
    
    # Mostrar variables de Home Assistant
    HA_URL=$(grep HOMEASSISTANT_URL .env | cut -d '=' -f2)
    AREA_WEBHOOK=$(grep AREA_CONTROL_WEBHOOK_ID .env | cut -d '=' -f2)
    # Búsqueda con fallback para compatibilidad con versiones anteriores
    if [ -z "$AREA_WEBHOOK" ]; then
        AREA_WEBHOOK=$(grep WEBHOOK_ID .env | cut -d '=' -f2)
    fi
    
    echo "Variables en .env:"
    echo "- HOMEASSISTANT_URL = $HA_URL"
    echo "- AREA_CONTROL_WEBHOOK_ID = $AREA_WEBHOOK"
else
    echo "❌ Archivo .env no encontrado"
fi

echo
echo "=== Comprobando variables en el contenedor Docker ==="

# Verificar si el contenedor existe y está en ejecución
if docker ps | grep -q whatsapp-bot; then
    echo "✅ Contenedor whatsapp-bot en ejecución"
    
    echo "Variables en el contenedor:"
    docker exec whatsapp-bot env | grep HOMEASSISTANT_URL
    docker exec whatsapp-bot env | grep AREA_CONTROL_WEBHOOK_ID || docker exec whatsapp-bot env | grep WEBHOOK_ID
    
    echo
    echo "=== Prueba de conectividad ==="
    
    # Extraer solo el host (sin http:// y sin puerto)
    if [[ "$HA_URL" =~ ^http://([^:/]+) ]]; then
        HA_HOST="${BASH_REMATCH[1]}"
        echo "Probando conexión a $HA_HOST..."
        
        # Prueba desde la máquina host
        echo "Desde la máquina host:"
        ping -c 1 "$HA_HOST" || echo "❌ No se pudo conectar a $HA_HOST desde la máquina host"
        
        # Prueba desde el contenedor
        echo "Desde el contenedor Docker:"
        docker exec whatsapp-bot ping -c 1 "$HA_HOST" || echo "❌ No se pudo conectar a $HA_HOST desde el contenedor"
    else
        echo "❌ No se pudo extraer el host de $HA_URL"
    fi
else
    echo "❌ El contenedor whatsapp-bot no está en ejecución"
fi

echo
echo "=== Finalizado ==="
