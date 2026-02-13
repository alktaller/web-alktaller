import fs from 'fs';
import { google } from 'googleapis';

const credentials = JSON.parse(process.env.GOOGLE_CALENDAR_CREDENTIALS);
const calendarId = process.env.CALENDAR_ID;

const auth = new google.auth.GoogleAuth({
  credentials,
  scopes: ['https://www.googleapis.com/auth/calendar']
});

const calendar = google.calendar({ version: 'v3', auth });
const data = JSON.parse(fs.readFileSync('data/car-data.json', 'utf-8'));

async function getExistingEvents() {
  const res = await calendar.events.list({ calendarId, timeMin: (new Date()).toISOString(), maxResults: 2500 });
  const map = {};
  res.data.items.forEach(e => { map[e.summary+e.start.dateTime]=true; });
  return map;
}

async function main() {
  const existing = await getExistingEvents();
  const today = new Date();

  for(const vehicle of data.vehicles){
    const lastFuel = vehicle.fuelEntries.sort((a,b)=>b.odometer-a.odometer)[0] || { odometer:0, date:new Date().toISOString() };
    const currentKm = lastFuel.odometer;

    for(const r of vehicle.reminders){
      let trigger=false;
      let eventDate = new Date();

      // Trigger por km
      if(r.intervalKm && (r.intervalKm-(currentKm-r.lastOdometer))<=500){
        trigger=true; eventDate.setDate(today.getDate()+1);
      }

      // Trigger por fecha
      if(r.intervalDays && r.lastDate){
        const lastDate = new Date(r.lastDate);
        const diffDays = Math.floor((today-lastDate)/(1000*60*60*24));
        if(diffDays>=r.intervalDays){ trigger=true; eventDate=today; }
      }

      if(!trigger) continue;

      const summary = `${vehicle.name} — ${r.title}`;
      const key = summary+eventDate.toISOString();
      if(existing[key]) continue;

      await calendar.events.insert({
        calendarId,
        requestBody:{
          summary,
          description:`Recordatorio: ${r.title}`,
          start:{ dateTime:eventDate.toISOString() },
          end:{ dateTime:eventDate.toISOString() },
          reminders:{ useDefault:true }
        }
      });

      // Actualizamos JSON para evitar que vuelva a dispararse
      if(r.intervalKm) r.lastOdometer=currentKm;
      if(r.intervalDays) r.lastDate=today.toISOString();

      console.log(`Evento creado: ${summary}`);
    }
  }

  fs.writeFileSync('data/car-data.json', JSON.stringify(data,null,2));
}

main().catch(console.error);
