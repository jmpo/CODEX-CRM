Guía de instrucciones
La integración de los clientes potenciales de conversión usa la API de conversiones de Meta para conectar los datos de estos clientes a nuestro sistema. Los eventos de CRM cargados se vinculan a un identificador de conjunto de datos de Meta y aparecerán en el administrador de eventos. Más información sobre la API de conversiones.

1. Comprueba los parámetros requeridos
Tendrás que pasar estos parámetros a la API de conversiones.
Asegúrate de que puedas obtener estos campos de tu CRM. Más información.
Evento del servidor
event_name
El nombre de una etapa crítica en tu CRM a la que un cliente potencial está cambiando.
event_time
La marca de tiempo UNIX para el momento en que un cliente potencial cambia a una nueva etapa.
action_source
El campo "action_source" debe ser siempre "system_generated".
Evento personalizado
lead_event_source
"Lead_event_source" es el mismo de tu CRM (HubSpot, Salesforce, SAP, Oracle, etc.).
event_source
El campo "event_source" debe ser siempre "crm".
Parámetros de información de cliente
La información de cliente ayuda a Meta a hacer coincidir los eventos de tu servidor con las cuentas de Meta. Enviar la mayor cantidad posible de los siguientes parámetros puede generar datos de eventos más precisos y un mejor rendimiento de los anuncios.
Parámetro
Prioridad
Identificador de cliente potencial (recomendado) ¿Cómo encontrar el identificador de cliente potencial?
"Lead ID" es un identificador de entre 15 y 17 dígitos que Meta genera para hacer un seguimiento de los clientes potenciales. Tu lead_id debe coincidir con el nuestro. Este parámetro es opcional, pero se recomienda para mejorar la precisión.
Más alta
Identificador de clic
Más alta
Correo electrónico en formato hash
Más alta
Número de teléfono en formato hash
Alta
Otra información de contacto en formato hash
Además del correo electrónico y el número de teléfono, puedes enviar a Meta otra información en formato hash, como el sexo, la fecha de nacimiento, el nombre, los apellidos, la ciudad, el estado o provincia, el código postal y más.
Media

Ejemplo de carga
{
    "data": [
        {
            "action_source": "system_generated",
            "custom_data": {
                "event_source": "crm",
                "lead_event_source": "Your CRM"
            },
            "event_name": "Lead",
            "event_time": 1673035686,
            "user_data": {
                "em": [
                    "7b17fb0bd173f625b58636fb796407c22b3d16fc78302d79f0fd30c2fc2fc068"
                ],
                "lead_id": 1234567890123456,
                "ph": [
                    "6069d14bf122fdfd931dc7beb58e5dfbba395b1faf05bdcd42d12358d63d8599"
                ]
            }
        }
    ]
}


2. Estructura tu carga
Usa el asistente de carga para formar tu carga con todos los parámetros necesarios.
Haz clic en el botón "Obtener código" dentro del asistente de carga para generar una plantilla de código para el lenguaje de programación.

Envía la información de cliente y el identificador de cliente potencial
Al enviar el identificador de cliente potencial y la información de cliente de tus eventos nos ayudarás a buscar coincidencias entre dichos eventos de forma más precisa y a mejorar el rendimiento de tus anuncios.
Documentación para desarrolladores
Este es un ejemplo de cómo debería ser tu carga.


3. Crea el punto de conexión
Crea un token de acceso para tu conjunto de datos (conocido anteriormente como píxel).
Usa el siguiente punto de conexión de la API para publicar eventos de estados de clientes potenciales desde tu CRM a Meta.
Si estás usando el SDK de Meta para empresas, copia el token de acceso directamente y agrégalo al parámetro "access_token" de la solicitud.

Token de acceso (no lo guardes en el repo):
https://graph.facebook.com/v24.0/1261294122522559/events?access_token=<ACCESS_TOKEN>

Configuración segura en .env (backend/.env)
- META_DATASET_ID=1261294122522559
- META_ACCESS_TOKEN=<ACCESS_TOKEN>
- CRM_NAME=Codex CRM


API_VERSION más reciente: v24.0
Dataset_ID: 1261294122522559


4. Envía el evento a Meta
Ya puedes empezar a subir eventos a tu conjunto de datos.
Puedes enviar un evento de prueba o empezar a enviar datos de producción inmediatamente.
Envía los datos de producción
Obtén datos de tu CRM
Comprueba la API de tu CRM y asegúrate de que los datos de tu CRM coincidan con los parámetros requeridos y que tu lead_id coincida con el generado por Meta y esté presente en la carga.
Activa eventos para los cambios de estado de los clientes potenciales
Cada vez que el estado de un cliente potencial cambie, se debe activar una llamada a tu código. Debe activarse un disparador para cada etapa del embudo, incluida la etapa inicial de los clientes potenciales sin procesar. Esta lógica puede integrarse en el paso 1 del envío de tus datos de producción.
Envía eventos a Meta
Escribe una función desde cero o usa el SDK de Meta para empresas para enviar la carga al punto de conexión de tu conjunto de datos. Para obtener instrucciones completas, ve a la sección "Paso 4: Enviar datos de producción" de la CRM integration guide.
Evento de prueba (opcional)
Enviar primero un evento de prueba para verificar la carga y la conexión a la API puede ser útil para evitar que los datos reales de tu conjunto de datos se vean afectados.
Los eventos de prueba se pueden enviar directamente desde el servidor o el explorador de la API Graph de Meta al incluir un parámetro "test_event_code" en la carga.
Los eventos de prueba aparecerán casi inmediatamente en la pestaña "Eventos de prueba" en el administrador de eventos.
Ten en cuenta que el evento de prueba solo confirma que se estableció la comunicación, pero no valida la exactitud de los datos. Para obtener instrucciones completas, ve a la sección "Paso 3: Probar una carga" de la CRM integration guide.


Próximos pasos:
Asegúrate de que la integración esté subiendo datos al menos una vez al día.
Los eventos generalmente aparecen en el administrador de eventos de tu píxel en menos de una hora si la integración está funcionando correctamente.
Una vez que la integración esté en funcionamiento, Meta validará los datos. Los errores aparecerán en "Diagnósticos".
