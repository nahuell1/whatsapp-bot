# Guía de Usuario: WhatsApp Bot

## ¿Qué es?

Este es un bot de WhatsApp con múltiples funciones que te permite:

- Consultar información del clima
- Controlar dispositivos de tu casa inteligente (Home Assistant)
- Hablar con una IA
- Recibir notificaciones sobre temas de interés

## Cómo Usar el Bot

### Primeros Pasos

1. Agrega el número del bot a tus contactos de WhatsApp
2. Envía un mensaje con `!help` para ver todos los comandos disponibles

### Comandos Principales

#### 1. Ayuda
Muestra todos los comandos disponibles:
```
!help
```

#### 2. Hablar con la IA
Para hacer preguntas o chatear con la inteligencia artificial:
```
!ia ¿Cuál es la capital de Francia?
!ia Cuéntame un chiste
!ia Recomiéndame una película
```

#### 3. Consultar el Clima
Para saber el clima actual de cualquier ciudad:
```
!clima Buenos Aires
!clima Nueva York
!clima Madrid
```

#### 4. Controlar luces y escenas de tu casa
Para controlar áreas de tu casa inteligente:
```
!area office on    (enciende las luces de la oficina)
!area room off     (apaga las luces de la habitación)
```

#### 5. Obtener imágenes de cámaras
Para tomar una captura de la cámara y recibirla por WhatsApp:
```
!camera           (toma una captura de la cámara predeterminada)
```
Para controlar áreas de tu casa inteligente:
```
!area office on    (enciende las luces de la oficina)
!area room off     (apaga las luces de la habitación)
```

#### 5. Obtener imágenes de cámaras
Para tomar una captura de la cámara y recibirla por WhatsApp:
```
!camera           (toma una captura de la cámara predeterminada)
!camera cocina    (toma una captura de una cámara específica)
```

#### 6. Suscribirte a notificaciones
Para recibir alertas sobre diferentes temas:
```
!suscribir list               (ver tus suscripciones)
!suscribir add weather        (suscribirte a alertas del clima)
!suscribir add home           (suscribirte a alertas del hogar)
!suscribir remove weather     (eliminar una suscripción)
```

### Para Administradores

Si eres administrador, también puedes usar:

```
!status       (ver el estado del sistema)
!restart      (reiniciar el bot)
```

## Ejemplos de Uso

### Ejemplo 1: Consulta del clima
```
Tú: !clima Barcelona
Bot: 🌤️ Clima en Barcelona
     Mayormente despejado
     Temperatura: 22°C
     Sensación térmica: 23°C
     Humedad: 65%
     Viento: 12 km/h NE
```

### Ejemplo 2: Control del hogar
```
Tú: !area office on
Bot: ✅ Se ha encendido el área: office
```

### Ejemplo 3: Consulta a la IA
```
Tú: !ia ¿Cómo funciona la fotosíntesis?
Bot: La fotosíntesis es el proceso por el cual las plantas...
```

## Solución de Problemas

1. Si el bot no responde, envía `!status` para comprobar si está funcionando.
2. Si recibes un error al usar un comando, asegúrate de escribirlo correctamente.
3. Si necesitas reiniciar tu conexión, elimina el chat con el bot y vuelve a escribir.

¡Disfruta usando el bot!
