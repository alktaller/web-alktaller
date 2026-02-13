import fs from 'fs';
import { google } from 'googleapis';

if (!process.env.GOOGLE_CALENDAR_CREDENTIALS) {
  console.log("Salatando ejecución: No hay credenciales de Google Calendar configuradas.");
  process.exit(0);
}

const credentials = JSON.parse(process.env.GOOGLE_CALENDAR_CREDENTIALS);
const calendarId = process.env.CALENDAR_ID || 'primary';

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/calendar']
});

const calendar = google.calendar({ version: 'v3', auth });

if (!fs.existsSync('data/car-data.json')) {
  console.log("No existe data/car-data.json, saliendo.");
  process.exit(0);
}

const rawData = fs.readFileSync('data/car-data.json', 'utf-8');
const data = JSON.parse(rawData);

async function getExistingEvents() {
  try {
    const res = await calendar.events.list({ calendarId, timeMin: (new Date()).toISOString(), maxResults: 2500 });
    const map = {};
    if (res.data.items) {
      res.data.items.forEach(e => { 
        if(e.start && e.start.dateTime) map[e.summary+e.start.dateTime]=true; 
      });
    }
    return map;
  } catch(e) {
    console.warn("No se pudieron leer eventos existentes:", e.message);
    return {};
  }
}

async function main() {
  if (!data.vehicles) return;

  const existing = await getExistingEvents();
  const today = new Date();
  let fileChanged = false;

  for(const vehicle of data.vehicles){
    // Asegurar que hay datos de vehiculo
    if(!vehicle.fuelEntries) vehicle.fuelEntries = [];
    if(!vehicle.reminders) vehicle.reminders = [];

    const lastFuel = vehicle.fuelEntries.sort((a,b)=>b.odometer-a.odometer)[0] || { odometer:0, date:new Date().toISOString() };
    const currentKm = lastFuel.odometer;

    for(const r of vehicle.reminders){
      let trigger=false;
      let eventDate = new Date(); // Mañana por defecto o hoy

      // Inicializar valores si son nuevos
      if(!r.lastOdometer) r.lastOdometer = 0;
      if(!r.lastDate && r.intervalDays) r.lastDate = new Date().toISOString(); 

      // Buscar mantenimiento realizado más reciente que coincida con el título (case insensitive)
      let lastMaintenanceKm = 0;
      let lastMaintenanceDate = null;
      
      const maintenanceMatches = (vehicle.maintenanceEntries || []).filter(m => 
          m.maintType && m.maintType.trim().toLowerCase() === r.title.trim().toLowerCase()
      );

      if (maintenanceMatches.length > 0) {
          // Ordenar para encontrar el último
          maintenanceMatches.sort((a,b) => b.odometer - a.odometer);
          lastMaintenanceKm = maintenanceMatches[0].odometer; // Ultimo KM
          
          const sortedByDate = [...maintenanceMatches].sort((a,b) => new Date(b.date) - new Date(a.date));
          lastMaintenanceDate = new Date(sortedByDate[0].date); // Ultima Fecha
      } else {
          // Si nunca se ha hecho mantenimiento, usamos valores base del vehículo o fecha creación si existiera
          // Para simplificar, si no hay histórico, asumimos que urge.
      }

      // --- CÁLCULO FECHA ESTIMADA & TRIGGER (Lógica Híbrida Usuario) ---
      let targetDateForEvent = null;
      let shouldSchedule = false;

      // 1. CÁLCULO POR TIEMPO (Previsión Fecha Exacta)
      let dateByTime = null;
      if (lastMaintenanceDate) {
         let monthsToAdd = 0;
         if (r.intervalYears) monthsToAdd = r.intervalYears * 12;
         else if (r.intervalMonths) monthsToAdd = r.intervalMonths;
         else if (r.intervalDays) monthsToAdd = r.intervalDays / 30;

         if (monthsToAdd > 0) {
             dateByTime = new Date(lastMaintenanceDate);
             dateByTime.setMonth(dateByTime.getMonth() + monthsToAdd);
         }
      }

      // 2. CÁLCULO POR KM (Solo Alerta Naranja < 1000km)
      let isKmWarning = false;
      if (r.intervalKm && r.intervalKm > 0) {
          const currentRealKm = vehicle.currentOdometer || currentKm;
          const nextKm = lastMaintenanceKm + r.intervalKm;
          const remainingKm = nextKm - currentRealKm;
          
          if (remainingKm < 1000) {
              isKmWarning = true; // Entramos en zona naranja
          }
      }

      // 3. DECISIÓN FINAL
      if (dateByTime && r.intervalKm) {
          // CASO MIXTO: "Lo que ocurra antes"
          if (isKmWarning) {
              // Si ya estamos en alerta por KM, ignoramos la fecha futura y avisamos YA
              shouldSchedule = true;
              targetDateForEvent = new Date(); // Aviso inmediato (Mañana)
              targetDateForEvent.setDate(targetDateForEvent.getDate() + 1);
          } else {
              // Si de KM vamos bien, programamos para la fecha límite de tiempo
              shouldSchedule = true;
              targetDateForEvent = dateByTime;
          }
      } 
      else if (dateByTime) {
          // CASO SOLO TIEMPO
          shouldSchedule = true;
          targetDateForEvent = dateByTime;
      } 
      else if (r.intervalKm) {
          // CASO SOLO KM
          if (isKmWarning) {
              shouldSchedule = true;
              targetDateForEvent = new Date(); // Aviso inmediato
              targetDateForEvent.setDate(targetDateForEvent.getDate() + 1);
          }
          // Si no está en warning, no programamos nada (silencio en zona verde)
      }

      if (shouldSchedule && targetDateForEvent) {
          // Si la fecha ya pasó (vencido), ponemos MAÑANA para asegurar que salte la notificación
          if (targetDateForEvent < today) {
              targetDateForEvent = new Date();
              targetDateForEvent.setDate(targetDateForEvent.getDate() + 1);
          }

          const eventTitle = `[AlkTaller] ${r.title} (${vehicle.name})`;
          
          // Verificar si ya existe evento similar en esa fecha (simplificado)
          const key = eventTitle + targetDateForEvent.toISOString().split('T')[0]; // Key rudimentaria
          /* 
            Aquí iría la lógica real de inserción en Google Calendar
            Calendar.events.insert(...) 
          */
          console.log(`Planificando ${eventTitle} para ${targetDateForEvent.toISOString().split('T')[0]}`);
          
          // Marcamos para bucles externos si es necesario
          trigger = true; 
          eventDate = targetDateForEvent;
      } 
          eventDate=today; 
        }
      }

      if(!trigger) continue;

      const summary = `${vehicle.name} — ${r.title}`;
      // Usamos solo fecha YYYY-MM-DD para evitar duplicados en el mismo dia
      const dateKey = eventDate.toISOString().split('T')[0];
      const key = summary + dateKey;
      
      // Chequeo simple si ya existe (aproximado)
      let alreadyExists = false;
      for(const k in existing) {
         if(k.includes(summary) && k.includes(dateKey)) alreadyExists = true;
      }
      
      if(alreadyExists) {
        console.log(`Evento ya existe hoy: ${summary}`);
        continue;
      }

      console.log(`Creando evento: ${summary}`);
      await calendar.events.insert({
        calendarId,
        requestBody:{
          summary,
          description:`Recordatorio de mantenimiento generado por AlkTaller.\nKms actuales: ${currentKm}`,
          start:{ dateTime:eventDate.toISOString() },
          end:{ dateTime:eventDate.toISOString() },
          reminders:{ useDefault:true }
        }
      });

      // Actualizamos JSON para evitar que vuelva a dispararse mañana mismo
      // Reseteamos el contador "last" al estado actual
      if(r.intervalKm) r.lastOdometer = vehicle.currentOdometer || currentKm;
      if(r.intervalDays || r.intervalMonths || r.intervalYears) r.lastDate = today.toISOString();
      
      fileChanged = true;
    }
  }

  if (fileChanged) {
    fs.writeFileSync('data/car-data.json', JSON.stringify(data,null,2));
    console.log("Datos actualizados guardados en disco.");
  }
}

main().catch(console.error);
