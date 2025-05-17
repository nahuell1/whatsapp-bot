# Guía para Webhooks en Home Assistant

Esta guía explica cómo configurar y usar los webhooks del bot de WhatsApp con Home Assistant.

## 1. Autenticación de Webhooks

El sistema de webhooks puede configurarse para requerir autenticación mediante API key. Para activar esta funcionalidad:

1. Configura las variables de entorno en tu archivo `.env`:
   ```
   WEBHOOK_API_KEY=tu-clave-secreta-aquí
   REQUIRE_WEBHOOK_AUTH=true
   ```

2. Al hacer llamadas a los webhooks, incluye la API key en el header `X-API-Key`:
   ```
   X-API-Key: tu-clave-secreta-aquí
   ```

Si no usas estas variables, los webhooks funcionarán sin autenticación (no recomendado para entornos de producción).

## 2. Identificadores de Webhook (IDs)

El sistema soporta dos tipos de identificadores para los webhooks:

1. **Nombre interno**: Identificador utilizado en el código (ej: `area_control`, `send_notification`).
2. **ID externo**: Identificador que se usa en las URLs y puede configurarse con variables de entorno.

Para configurar IDs externos personalizados, añade las siguientes variables a tu archivo `.env`:

```
# Formato: NOMBRE_WEBHOOK_WEBHOOK_ID
AREA_CONTROL_WEBHOOK_ID=tu-id-personalizado
SEND_NOTIFICATION_WEBHOOK_ID=otro-id-personalizado
DEVICE_CONTROL_WEBHOOK_ID=id-para-control-dispositivos
SCENE_WEBHOOK_ID=id-para-escenas
SENSOR_REPORT_WEBHOOK_ID=id-para-sensores
```

Si no configuras estas variables, el sistema utilizará el nombre interno como ID externo.

## 3. Webhooks disponibles

El bot ofrece los siguientes webhooks:

### 3.1. Control de áreas (`area_control`)

Este webhook permite activar escenas en Home Assistant basadas en un área y un estado.

**URL**: `http://tu-servidor:3000/webhook/area_control` o `http://tu-servidor:3000/webhook/{ID_externo}`

**Parámetros**:
- `area`: Nombre del área (ej: "office", "room")
- `turn`: Estado a aplicar ("on" u "off")

**Ejemplo de datos JSON**:
```json
{
  "area": "office",
  "turn": "on"
}
```

### 3.2. Envío de notificaciones (`send_notification`)

Este webhook permite enviar mensajes de WhatsApp a usuarios específicos desde Home Assistant.

**URL**: `http://tu-servidor:3000/webhook/send_notification` o `http://tu-servidor:3000/webhook/{ID_externo}`

**Parámetros**:
- `message`: El mensaje a enviar (obligatorio)
- `to`: Destinatarios - puede ser un número, un array de números, o "admin" para enviar a los administradores
- `title`: Título opcional para el mensaje

**Ejemplo de datos JSON**:
```json
{
  "message": "¡Se ha detectado movimiento en la entrada!",
  "to": "admin",
  "title": "⚠️ Alerta de seguridad"
}
```

### 3.3. Control de dispositivos (`device_control`)

Este webhook permite controlar dispositivos individuales en Home Assistant utilizando llamadas de dominio/servicio.

**URL**: `http://tu-servidor:3000/webhook/device_control` o `http://tu-servidor:3000/webhook/{ID_externo}`

**Parámetros**:
- `entity_id`: ID de la entidad a controlar (ej: "light.kitchen", "switch.tv")
- `domain`: Dominio de la entidad (ej: "light", "switch", "media_player")
- `service`: Servicio a llamar (ej: "turn_on", "turn_off", "toggle")
- `service_data`: (Opcional) Datos adicionales para el servicio
- `notify`: (Opcional) Booleano para enviar notificación a suscriptores

**Ejemplo de datos JSON**:
```json
{
  "entity_id": "light.living_room",
  "domain": "light",
  "service": "turn_on",
  "service_data": {
    "brightness_pct": 75,
    "color_name": "blue"
  }
}
```

### 3.4. Activación de escenas (`scene`)

Este webhook permite activar escenas directamente por su nombre o ID.

**URL**: `http://tu-servidor:3000/webhook/scene` o `http://tu-servidor:3000/webhook/{ID_externo}`

**Parámetros**:
- `scene`: Nombre o ID de la escena (ej: "movie_night" o "scene.movie_night")
- `notify`: (Opcional) Booleano para enviar notificación a suscriptores
- `channel`: (Opcional) Canal de notificación a utilizar (default: "home")

**Ejemplo de datos JSON**:
```json
{
  "scene": "movie_night",
  "notify": true
}
```

### 3.5. Informes de sensores (`sensor_report`)

Este webhook permite enviar datos de sensores desde Home Assistant a WhatsApp.

**URL**: `http://tu-servidor:3000/webhook/sensor_report` o `http://tu-servidor:3000/webhook/{ID_externo}`

**Parámetros**:
- `sensor`: Datos del sensor (un valor simple o un objeto con múltiples sensores)
- `to`: (Opcional) Destinatarios directos del mensaje
- `title`: (Opcional) Título para el informe
- `notify_subscribers`: (Opcional) Booleano para notificar a suscriptores
- `channel`: (Opcional) Canal de suscripción a utilizar

**Ejemplo de datos JSON**:
```json
{
  "title": "Estado de la casa",
  "sensor": {
    "temperatura": "22°C",
    "humedad": "45%",
    "presencia": "Detectada"
  },
  "to": "admin",
  "notify_subscribers": true
}
```

## 3. Configuración en Home Assistant

### 3.1. Configuración de autenticación

Si has habilitado la autenticación por API key, necesitas incluir el header en todas las llamadas webhook:

```yaml
# Configuración para webhook con autenticación
# Puedes usar el nombre interno o el ID externo en la URL
rest_command:
  whatsapp_notification:
    url: "http://tu-servidor:3000/webhook/send_notification"  # O usar tu ID externo personalizado
    method: POST
    headers:
      Content-Type: "application/json"
      X-API-Key: "tu-clave-secreta-aquí"
    payload: '{"message": "{{ message }}", "to": "admin", "title": "{{ title | default("Notificación") }}"}'
```

### 3.2. Automatización para control de áreas

```yaml
id: area_light_webhook
alias: "Control de áreas por webhook"
description: "Controla áreas mediante webhook con selección dinámica de escenas"
trigger:
  - platform: webhook
    webhook_id: area_control  # Usa un ID personalizado en Home Assistant
action:
  - variables:
      turn: "{{ trigger.json.turn | default('off') }}"
      area: "{{ trigger.json.area | default('none') }}"
      scene_name: >-
        {% if area in ['office', 'room'] and turn in ['on', 'off'] %}
          scene.{{ area }}_{{ turn }}
        {% else %}
          none
        {% endif %}
  - choose:
      - conditions:
          - condition: template
            value_template: "{{ scene_name != 'none' }}"
        sequence:
          - service: scene.turn_on
            target:
              entity_id: "{{ scene_name }}"
    default:
      - service: system_log.write
        data:
          message: >-
            Webhook recibió parámetros no válidos: area={{ area }}, turn={{ turn }}
          level: warning
```

### 3.3. Automatización para enviar notificaciones

```yaml
id: motion_notification_webhook
alias: "Notificación por movimiento"
description: "Envía notificación por WhatsApp cuando se detecta movimiento"
trigger:
  - platform: state
    entity_id: binary_sensor.motion_sensor
    to: "on"
action:
  - service: rest.command
    target:
      entity_id: rest_command.whatsapp_notification
    data:
      message: >-
        Se ha detectado movimiento en {{ states('sensor.last_motion_area') }}.
        Hora: {{ now().strftime('%H:%M:%S') }}
      title: "🚨 Alerta de movimiento"
```

### 3.4. Control de dispositivos individuales

```yaml
# Configuración en configuration.yaml
rest_command:
  whatsapp_control_light:
    url: "http://tu-servidor:3000/webhook/device_control"  # O tu ID externo personalizado
    method: POST
    headers:
      Content-Type: "application/json"
      X-API-Key: "tu-clave-secreta-aquí"
    payload: >-
      {
        "entity_id": "{{ entity_id }}",
        "domain": "light",
        "service": "{{ service }}",
        "service_data": {{ service_data | default({}) | to_json }}
      }
```

```yaml
# Ejemplo en una automatización
- service: rest_command.whatsapp_control_light
  data:
    entity_id: light.living_room
    service: turn_on
    service_data:
      brightness_pct: 75
      color_name: "blue"
```

### 3.5. Activación de escenas

```yaml
# Botón en la interfaz de Home Assistant
type: button
tap_action:
  action: call-service
  service: rest.command
  service_data:
    url: "http://tu-servidor:3000/webhook/scene"  # O tu ID externo personalizado
    method: POST
    headers:
      Content-Type: "application/json"
      X-API-Key: "tu-clave-secreta-aquí"
    content_type: "application/json"
    payload: '{"scene": "movie_night", "notify": true}'
icon: mdi:movie
name: Modo Película
```

### 3.6. Informe automático de sensores

```yaml
# Automatización para enviar reporte diario
id: daily_home_report
alias: "Informe diario de la casa"
description: "Envía un informe diario de los sensores principales"
trigger:
  - platform: time
    at: "08:00:00"
action:
  - service: rest.command
    data:
      url: "http://tu-servidor:3000/webhook/sensor_report"  # O tu ID externo personalizado
      method: POST
      headers:
        Content-Type: "application/json"
        X-API-Key: "tu-clave-secreta-aquí"
      content_type: "application/json"
      payload: >-
        {
          "title": "📊 Informe matutino",
          "sensor": {
            "temperatura": "{{ states('sensor.temperature') }}°C",
            "humedad": "{{ states('sensor.humidity') }}%",
            "previsión": "{{ states('sensor.weather_forecast') }}",
            "calidad_aire": "{{ states('sensor.air_quality') }}"
          },
          "to": "admin",
          "notify_subscribers": true
        }
```

## 4. Creación de nuevos webhooks

Puedes crear tus propios webhooks personalizados:

1. Crea un nuevo archivo en la carpeta `webhooks` (ej: `miWebhook.js`)
2. Usa la plantilla existente (`templateWebhook.js`) como base
3. Define tu lógica personalizada
4. Registra tu webhook con un nombre interno:
   ```javascript
   register: (webhookHandler) => {
     // Opcional: usa un ID externo personalizado desde una variable de entorno
     const externalId = process.env.MI_WEBHOOK_WEBHOOK_ID || null;
     
     webhookHandler.register(
       'mi_webhook',           // nombre interno
       handleMiWebhook,        // función manejadora 
       'Descripción del webhook',
       externalId              // ID externo (opcional)
     );
   }
   ```
5. El webhook estará disponible en: `http://tu-servidor:3000/webhook/mi_webhook` o con tu ID externo si lo configuraste

## 5. Solución de problemas

- Verifica la URL y puerto del servidor del bot
- Revisa los logs del bot cuando se activa el webhook
- Comprueba que estés usando el nombre interno correcto o el ID externo configurado
- Prueba los webhooks manualmente usando herramientas como curl o Postman:
  ```bash
  # Usando nombre interno
  curl -X POST http://localhost:3000/webhook/area_control -H "Content-Type: application/json" -d '{"area":"office","turn":"on"}'
  
  # O usando ID externo (si está configurado)
  curl -X POST http://localhost:3000/webhook/tu-id-personalizado -H "Content-Type: application/json" -d '{"area":"office","turn":"on"}'
  ```
- Verifica que las escenas existen en Home Assistant con los nombres correctos
- Confirma que las variables de entorno para los IDs externos están correctamente configuradas
