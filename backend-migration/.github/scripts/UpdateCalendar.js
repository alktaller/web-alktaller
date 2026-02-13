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

      // 1. Trigger por km (si se ha configurado intervalo y hemos recorrido suficiente desde la ultima vez)
      if(r.intervalKm && r.intervalKm > 0){
        // Distancia recorrida desde el último mantenimiento/aviso
        const distRecorrida = currentKm - r.lastOdometer;
        // Si falta poco para llegar al intervalo (ej: aviso 500km antes) o nos hemos pasado
        const margenAviso = 500; 
        
        // Logica simplificada: Si estamos cerca del target
        if (distRecorrida >= (r.intervalKm - margenAviso)) {
           trigger = true;
           // Fecha estimada: mañana
           eventDate.setDate(today.getDate()+1);
        }
      }

      // 2. Trigger por fecha (dias)
      if(r.intervalDays && r.intervalDays > 0 && r.lastDate){
        const lastDate = new Date(r.lastDate);
        const diffDays = Math.floor((today.getTime() - lastDate.getTime())/(1000*60*60*24));
        
        if(diffDays >= r.intervalDays){ 
          trigger=true; 
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
      if(r.intervalKm) r.lastOdometer = currentKm;
      if(r.intervalDays) r.lastDate = today.toISOString();
      
      fileChanged = true;
    }
  }

  if (fileChanged) {
    fs.writeFileSync('data/car-data.json', JSON.stringify(data,null,2));
    console.log("Datos actualizados guardados en disco.");
  }
}

main().catch(console.error);
